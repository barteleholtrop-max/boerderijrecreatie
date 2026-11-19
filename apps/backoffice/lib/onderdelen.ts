// Rechten per onderdeel (besluit eigenaar 6 november 2026: „mensen toevoegen voor specifieke gedeelten, bijvoorbeeld voor
// de planning”). Een eigenaar mag alles. Een medewerker mag alleen de onderdelen die de eigenaar heeft aangevinkt; al het
// andere is dicht (standaard dicht), ook als iemand het adres zelf intypt. De controle zit in proxy.ts; het menu verbergt
// wat iemand niet mag. Geen database of netwerk: ook bruikbaar in de proxy en in de browser.
//
// Beheer (Bedrijfsgegevens, Systeem & koppelingen, Toegang) is altijd alleen voor eigenaren.

export type Onderdeel={key:string;label:string;uitleg:string;pages:string[];
 /** API-adressen (prefix) die dit onderdeel nodig heeft: lezen (GET/HEAD) of ook wijzigen (alle methodes). */
 lezen:string[];schrijven:string[]};

// Gedeelde gegevens die meerdere schermen lezen (producten, bestellingen, voorraad en recepten).
const BASIS=['/api/products','/api/orders','/api/operations'];

export const ONDERDELEN:Onderdeel[]=[
 {key:'overzicht',label:'Overzicht',uitleg:'Managementdashboard, Weekassistent, Goedkeuringen en Vandaag & taken.',
  pages:['/','/assistent','/goedkeuringen','/taken'],lezen:[...BASIS,'/api/gasten'],schrijven:['/api/assistent','/api/voorstellen']},
 {key:'planning',label:'Planning',uitleg:'Agenda & reserveringen en openingstijden.',
  pages:['/planning','/reserveringen','/openingstijden'],lezen:['/api/media','/api/products'],schrijven:['/api/gasten','/api/voorspelling','/api/google-profiel']},
 {key:'gasten',label:'Gasten',uitleg:'Gesprekken & klanten en offertes & groepen.',
  pages:['/gesprekken','/klanten','/offertes'],lezen:[...BASIS,'/api/bedrijfsgegevens','/api/gesprekken/teller'],schrijven:['/api/gasten','/api/mail','/api/meta']},
 {key:'verkoop',label:'Verkoop',uitleg:'Bestellingen & uitgifte, kassa, gerechten & prijzen, en de winkel.',
  pages:['/werkplekken','/kassa','/bestelopties','/producten','/prijsanalyse','/winkel','/opnemen','/werkplek'],lezen:[],
  schrijven:[...BASIS,'/api/workplaces','/api/werkplek','/api/kassa','/api/media','/api/bestelopties','/api/rekeningen']},
 {key:'inkoop',label:'Inkoop & voorraad',uitleg:'Inkoop, facturen, voorraad en recepten.',
  pages:['/inkoop'],lezen:['/api/orders'],schrijven:['/api/inkoop','/api/operations','/api/products','/api/recipe-suggestion']},
 {key:'financien',label:'Financiën & betalingen',uitleg:'Financiën en rekeningen.',
  pages:['/financien'],lezen:[...BASIS,'/api/bedrijfsgegevens'],schrijven:['/api/rekeningen']},
 // Managerapp (wens eigenaar 10 november 2026: „specifieke leden die toegang hebben; dat kunnen we ergens aanvinken”):
 // de app Gesprekken op de telefoon met gesprekken, Weekassistent, boodschappen en agenda. Alleen met dit vinkje, ook als
 // iemand Gasten, Overzicht of Planning wel heeft; een werkplekaccount (barista, kok, winkel) komt er dus niet in.
 {key:'managerapp',label:'Managerapp (telefoon)',uitleg:'De managementapp op de telefoon: gesprekken, vandaag & taken, Weekassistent, boodschappenlijst en agenda.',
  pages:['/management','/gesprekken/telefoon','/taken/telefoon','/assistent/telefoon','/planning/telefoon','/apps'],lezen:[...BASIS,'/api/bedrijfsgegevens','/api/gesprekken/teller'],schrijven:['/api/gasten','/api/mail','/api/meta','/api/assistent','/api/voorstellen','/api/meldingen','/api/telefoon']},
 {key:'marketing',label:'Marketing & website',uitleg:'Marketing & AI, Inhoud (blogs, nieuws en filmpjes), Website & uitstraling en Privacy · alle sites.',
  // Privacy · alle sites (wens eigenaar 15 november 2026): het ene privacybeleid dat alle sites ophalen.
  pages:['/marketing','/inhoud','/website','/privacy'],lezen:[...BASIS],schrijven:['/api/media','/api/inhoud','/api/privacy']},
];
export const KEYS=ONDERDELEN.map(o=>o.key);
/** Schermen van de managerapp (onderdeel managerapp). */
// /management/… is de managementapp (12 november 2026, eigen werkgebied); de oude adressen sturen daarheen door.
export const APP_PAGES=['/management','/gesprekken/telefoon','/taken/telefoon','/assistent/telefoon','/planning/telefoon','/apps'];
/** Beheer: alleen eigenaren. */
export const OWNER_ONLY_PAGES=['/bedrijfsgegevens','/koppeling','/toegang'];
/** Voor iedereen die is ingelogd: de hulpbalk (die zelf per rol controleert) en het ontwikkelpaneel (alleen in de ontwikkelmodus). */
const ALWAYS_API=['/api/hulp','/api/improvements','/api/omgeving'];

const under=(path:string,prefix:string)=>prefix==='/'?path==='/':path===prefix||path.startsWith(prefix+'/');
export const validModules=(v:unknown):string[]=>Array.isArray(v)?[...new Set(v.filter((k):k is string=>typeof k==='string'&&KEYS.includes(k)))]:[];

/** Mag deze persoon dit adres openen? Eigenaar: alles. Medewerker: alleen via de aangevinkte onderdelen. */
export function allowed(role:string,modules:readonly string[],path:string,method:string){
 if(role==='eigenaar')return true;
 if(role!=='medewerker')return false;
 // Bestanden van Next en uit public/ (scripts, pictogrammen, de pdf-lezer) zijn geen onderdeel en geven geen gegevens.
 if(path.startsWith('/_next/')||!path.startsWith('/api/')&&/\.[a-z0-9]{1,8}$/i.test(path))return true;
 const mine=ONDERDELEN.filter(o=>modules.includes(o.key));
 if(path.startsWith('/api/')){
  if(ALWAYS_API.some(p=>under(path,p)))return true;
  const read=method==='GET'||method==='HEAD';
  return mine.some(o=>o.schrijven.some(p=>under(path,p))||read&&o.lezen.some(p=>under(path,p)));
 }
 if(OWNER_ONLY_PAGES.some(p=>under(path,p)))return false;
 // De managerapp alleen met het eigen vinkje, niet via Gasten, Overzicht of Planning.
 if(APP_PAGES.some(p=>under(path,p)))return modules.includes('managerapp');
 return mine.some(o=>o.pages.some(p=>under(path,p)));
}
/** De eerste pagina die iemand mag openen (na inloggen of als het dashboard niet mag). */
export function firstPage(role:string,modules:readonly string[]){
 if(role==='eigenaar')return '/';
 return ONDERDELEN.find(o=>modules.includes(o.key))?.pages[0]||'';
}

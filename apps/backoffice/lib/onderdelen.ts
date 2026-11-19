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
  pages:['/','/assistent','/goedkeuringen','/taken'],lezen:[...BASIS,'/api/gasten','/api/cooperatie','/api/pot-planning','/api/overleg','/api/ledenevenementen'],schrijven:['/api/assistent','/api/voorstellen']},
 {key:'planning',label:'Planning',uitleg:'Agenda & reserveringen, ledenplanning (met winkeldiensten) en openingstijden.',
  pages:['/planning','/reserveringen','/personeelsplanning','/openingstijden'],lezen:['/api/media','/api/products'],schrijven:['/api/gasten','/api/pot-planning','/api/voorspelling','/api/google-profiel','/api/leden/winkeldiensten']},
 // /deelnemer/demo: de demo ledenomgeving met een verzonnen lid (akkoord eigenaar 8 november 2026); geen echte ledenpagina's.
 {key:'personeel',label:'ABC-leden',uitleg:'Leden & winstdeling en ledenplanning (met ledenkaarten en pot-afspraken).',
  pages:['/leden','/beloning','/personeelsplanning','/deelnemer/demo','/financien/weekafsluiting'],lezen:['/api/products','/api/gasten'],schrijven:['/api/leden','/api/cooperatie','/api/onderdeelpotten','/api/rollen','/api/pot-afspraken','/api/pot-weken','/api/pot-planning','/api/voorspelling']},
 {key:'gasten',label:'Gasten',uitleg:'Gesprekken & klanten, offertes & groepen en Ite by Boer Bart & tafels.',
  pages:['/gesprekken','/klanten','/offertes','/yte'],lezen:[...BASIS,'/api/bedrijfsgegevens','/api/gesprekken/teller'],schrijven:['/api/gasten','/api/mail','/api/meta','/api/gesprek-lid','/api/tafels']},
 {key:'verkoop',label:'Verkoop',uitleg:'Bestellingen & uitgifte, kassa, gerechten & prijzen, boerderijwinkel en abonnementen.',
  pages:['/werkplekken','/kassa','/bestelopties','/producten','/prijsanalyse','/winkel','/abonnementen','/opnemen','/werkplek'],lezen:['/api/cooperatie','/api/pot-planning'],
  schrijven:[...BASIS,'/api/workplaces','/api/werkplek','/api/kassa','/api/media','/api/bestelopties','/api/abonnementen','/api/tafels','/api/rekeningen']},
 {key:'inkoop',label:'Inkoop & voorraad',uitleg:'Inkoop, facturen, voorraad en recepten.',
  pages:['/inkoop'],lezen:['/api/orders'],schrijven:['/api/inkoop','/api/operations','/api/products','/api/recipe-suggestion']},
 {key:'overleg',label:'Overleg',uitleg:'Voorstellen, vergaderingen en actiepunten.',
  pages:['/overleg'],lezen:['/api/leden'],schrijven:['/api/overleg']},
 {key:'financien',label:'Financiën & betalingen',uitleg:'Financiën, bankverdeling, rekeningen en dividend.',
  pages:['/financien'],lezen:[...BASIS,'/api/bedrijfsgegevens'],schrijven:['/api/bank','/api/rekeningen']},
 {key:'bloei',label:'Bloei · houders & kapitaal',uitleg:'Kapitaaladministratie: houders van obligaties en participaties, de Bloeimarkt en officiële documenten.',
  pages:['/bloei'],lezen:[],schrijven:['/api/bloei','/api/bloei-proef']},
 // Managerapp (wens eigenaar 10 november 2026: „specifieke leden die toegang hebben; dat kunnen we ergens aanvinken”):
 // de app Gesprekken op de telefoon met gesprekken, Weekassistent, boodschappen en agenda. Alleen met dit vinkje, ook als
 // iemand Gasten, Overzicht of Planning wel heeft; een werkplekaccount (barista, kok, winkel) komt er dus niet in.
 {key:'managerapp',label:'Managerapp (telefoon)',uitleg:'De managementapp op de telefoon: gesprekken, vandaag & taken, Weekassistent, boodschappenlijst en agenda.',
  // Vandaag & taken (wens eigenaar 11 november 2026): alleen lezen (signalen, overleg, magazijn).
  pages:['/management','/gesprekken/telefoon','/taken/telefoon','/assistent/telefoon','/planning/telefoon','/apps'],lezen:[...BASIS,'/api/bedrijfsgegevens','/api/overleg','/api/pot-planning','/api/gesprekken/teller'],schrijven:['/api/gasten','/api/mail','/api/meta','/api/gesprek-lid','/api/assistent','/api/voorstellen','/api/meldingen','/api/telefoon']},
 {key:'marketing',label:'Marketing & website',uitleg:'Marketing & AI, Inhoud (blogs, nieuws en filmpjes), Website & uitstraling en Privacy · alle sites.',
  // Privacy · alle sites (wens eigenaar 15 november 2026): het ene privacybeleid dat alle sites ophalen.
  pages:['/marketing','/inhoud','/website','/privacy'],lezen:[...BASIS,'/api/ledenevenementen'],schrijven:['/api/media','/api/inhoud','/api/privacy']},
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

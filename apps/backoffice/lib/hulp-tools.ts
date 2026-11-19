// Hulpmiddelen van de Backoffice-assistent (opdracht eigenaar 6 november 2026): een typbalk onderaan elk scherm die helpt met
// alles in de backoffice. Leeshulpmiddelen geven feiten; een schrijfhulpmiddel legt een ACTIE vast en die wordt meteen uitgevoerd
// (wens eigenaar 13 november 2026: „De assistent moet Sanne volledig helpen en heeft alle rechten”). lib/hulp-actions.ts voert hem
// uit via de bestaande backoffice-routes, met dezelfde controles als de knoppen op het scherm; de actie blijft als kaart in het gesprek.
// Ook gebruikt door de Weekassistent (lib/assistant-store.ts). Zonder hulpmiddel (en dus niet mogelijk): kassa, bestellingen,
// betalingen uitvoeren, percentages en IBAN's. Rekeningen van gasten inzien en een factuur mailen kan wel.
import {z} from 'zod';

export const WEEKDAYS=['maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag','zondag'] as const;

export type ProductLite={id:string;name:string;department:string;priceCents:number;vat:string;published:boolean;available:boolean;note:string;deleted:boolean;photo?:string};
/** Een beeld uit de beeldbibliotheek (alleen afbeeldingen). */
export type MediaLite={id:string;name:string};
export const FINANCE_PARTS=['open_rekeningen','achterstallig','facturen'] as const;
export type FinancePart=typeof FINANCE_PARTS[number];
/** Waar een foto in het gesprek te zien is: alleen de beeldbibliotheek of de oude Wix-foto's (app/chat-text.tsx toont niets anders). */
export function photoAddress(photo:unknown):string|null{
 const s=typeof photo==='string'?photo.trim():'';
 if(/^\/api\/media\/[a-f0-9-]{36}$/.test(s))return s;
 const pub=/^\/api\/public\/media\/([a-f0-9-]{36})$/.exec(s);if(pub)return '/api/media/'+pub[1];
 return /^https:\/\/static\.wixstatic\.com\/[^\s()]+$/.test(s)?s:null;
}
const showPhoto=(name:string,url:string)=>`![${name.replace(/[\[\]]/g,'')}](${url})`;
export type HoursView={weekly:{dag:string;open:boolean;van:string;tot:string}[];exceptions:{datum:string;open:boolean;van:string;tot:string;notitie:string}[]};

/** De acties die de assistent mag uitvoeren. Elke soort heeft een vaste uitvoering in lib/hulp-actions.ts. */
export const ACTION_TYPES=['product_aanmaken','product_tekst_wijzigen','openingstijden_wijzigen','afwijkende_dag','klant_aanmaken','klantgesprek_inplannen','optie_zetten','product_wijzigen','product_publiceren','groepsdag_instellen','boeking_bevestigen','factuur_mailen'] as const;
export type ActionType=typeof ACTION_TYPES[number];
export type Action={type:ActionType;input:Record<string,unknown>;title:string;details:string[]};

// Gasten (wens eigenaar 9 november 2026): klanten, afspraken en opties. Alleen lezen hier; schrijven gaat via een actie.
export type GuestCustomer={id:string;name:string;email:string;phone:string;company:string;address:string;notes:string;bookings:number;conversations:number};
export type GuestAgendaDay={dag:string;open:boolean;openingstijden:string;notitie:string;feestdagen:string[];
 boekingen:{id?:string;soort:string;van:string;tot:string;naam:string;personen:number;status:string;optie_geldig_tot?:string;uitzondering?:string}[];
 groepsdag?:string;
 afspraken:{van:string;tot:string;onderwerp:string;klant:string}[];evenementen:{van:string;tot:string;titel:string}[];
 dagdelen:{naam:string;van:string;tot:string;groep:string;daggasten:string}[]};
export type OptionCheck={date:string;from:string;to:string;activity:'groep'|'bezoek';people:number;exception?:string;status?:'optie'|'bevestigd';id?:string};

export type HulpContext={
 today:string; // YYYY-MM-DD, Europe/Amsterdam
 products():Promise<ProductLite[]>;
 /** Beeldbibliotheek (wens eigenaar 15 november 2026: „hij kan mij de foto's niet laten zien”). */
 media?():Promise<MediaLite[]>;
 /** Rekeningen van gasten, alleen lezen. */
 finance?(onderdeel:FinancePart):Promise<unknown>;
 hours():Promise<HoursView>;
 /** Klantenkaarten (Gesprekken & klanten), zonder gesprekteksten. */
 customers():Promise<GuestCustomer[]>;
 /** Agenda per dag: boekingen, geldige opties, aanvragen, afspraken, evenementen en de bezetting per dagdeel. */
 agenda(from:string,days:number):Promise<GuestAgendaDay[]>;
 /** Past een optie nog binnen openingstijden en capaciteit? null = ja, anders de reden van de planning. */
 checkOption(o:OptionCheck):Promise<string|null>;
 /** Legt de actie vast en voert hem meteen uit. status/result: uitkomst van de backoffice (zonder status: alleen klaargezet). */
 propose(a:Action):Promise<{id:string;status?:string;result?:string}>;
};
export type ToolOutcome={content:string;isError:boolean;source:string};

const DAY=/^\d{4}-\d{2}-\d{2}$/,TIME=/^([01]\d|2[0-3]):[0-5]\d$/;
const validDay=(v:string)=>DAY.test(v)&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const day=z.string().refine(validDay,'gebruik een datum als JJJJ-MM-DD');
const time=z.string().regex(TIME,'gebruik een tijd als UU:MM');
const nullableText=(max:number)=>z.string().max(max).nullable();
const euro=(c:number)=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(c/100);
export const dutchDate=(d:string)=>new Intl.DateTimeFormat('nl-NL',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));
const S=(description:string)=>({type:'string',description});
const NS=(description:string)=>({type:['string','null'],description});
const obj=(properties:Record<string,unknown>)=>({type:'object' as const,properties,required:Object.keys(properties),additionalProperties:false});

// Geen strikte hulpmiddelen meer (8 november 2026): samen werden de strikte schema's te groot en weigerde Claude elk verzoek
// ("The compiled grammar is too large"). runTool controleert elke invoer met zod en geeft bij een fout de reden terug, zodat Claude
// het opnieuw probeert; een schrijfhulpmiddel gaat bovendien via dezelfde backoffice-route en controles als de knop op het scherm.
// tests/hulp.test.mjs bewaakt dat er geen strikte hulpmiddelen terugkomen.
export const TOOL_DEFINITIONS=[
 // ---- Lezen
 {name:'betalingen_bekijken',description:'Rekeningen van gasten inzien (alleen lezen): open_rekeningen, achterstallig en facturen.',
  input_schema:obj({onderdeel:{type:'string',enum:['overzicht','bankverdeling','maandagvraag','rente','open_rekeningen','achterstallig','facturen','dividend']},week:S('Maandag van de week als JJJJ-MM-DD, of leeg.'),jaar:{type:'integer',description:'Jaar voor rente, of 0.'}})},
 {name:'factuur_mailen',description:'Voert direct uit: de factuur of rekening (opnieuw) mailen aan de rekeninghouder, vanaf de mailbox van Gesprekken. Id uit betalingen_bekijken (open_rekeningen, achterstallig of facturen).',
  input_schema:obj({rekening_id:S('Id van de rekening.')})},
 {name:'fotos_zoeken',description:'Zoek foto\'s om te laten zien: productfoto\'s en beelden uit de beeldbibliotheek (Producten → Beelden). Geeft per foto een regel „toon” die je letterlijk op een eigen regel in je antwoord zet; dan ziet de beheerder de foto in het gesprek.',
  input_schema:obj({zoekterm:S('Deel van de naam van het product of de foto, bijvoorbeeld "boerenkool" of "kippen". Leeg voor de nieuwste foto\'s.')})},
 {name:'producten_zoeken',description:'Zoek producten en gerechten in de centrale productlijst: id, naam, afdeling, prijs, btw, gepubliceerd, beschikbaar en de foto (regel „toon” om hem te laten zien).',
  input_schema:obj({zoekterm:S('Deel van de naam. Leeg voor de eerste resultaten.'),afdeling:S('Leeg voor alle afdelingen, of bijvoorbeeld "Restaurant" of "Winkel".')})},
 {name:'openingstijden_bekijken',description:'Bekijk de vaste openingstijden per weekdag en de afwijkende dagen (gesloten of andere tijden) vanaf vandaag.',
  input_schema:obj({})},
 // ---- Acties (worden direct uitgevoerd, wens eigenaar 13 november 2026)
 {name:'product_aanmaken',description:'Voert direct uit: een nieuw product aanmaken in de centrale productlijst. Met publiceren=true staat het meteen voor gasten online (btw-tarief verplicht); anders als concept. Zoek eerst of het product al bestaat. Wordt direct uitgevoerd.',
  input_schema:obj({naam:S('Naam van het product.'),afdeling:{type:'string',enum:['Restaurant','Winkel'],description:'Afdeling.'},prijs_cent:{type:'integer',description:'Voorgestelde verkoopprijs in centen, inclusief btw. Vraag de prijs na; verzin hem niet.'},btw:{type:'string',enum:['9','21',''],description:'Btw-tarief, of leeg als onbekend.'},notitie:S('Interne notitie, of leeg.'),publiceren:{type:'boolean',description:'true = meteen publiceren (zichtbaar voor gasten), false = concept.'}})},
 {name:'product_tekst_wijzigen',description:'Voert direct uit: de naam of interne notitie van een bestaand product wijzigen. Is het product gepubliceerd, dan wordt de nieuwe versie ook meteen gepubliceerd. Wordt direct uitgevoerd.',
  input_schema:obj({product_id:S('Id uit producten_zoeken.'),naam:NS('Nieuwe naam, of null.'),notitie:NS('Nieuwe notitie, of null.')})},
 {name:'product_wijzigen',description:'Voert direct uit: verkoopprijs, btw-tarief of beschikbaarheid (uitverkocht of weer leverbaar) van een bestaand product wijzigen. null = niet wijzigen. Is het product gepubliceerd, dan geldt de wijziging meteen voor gasten. Wordt direct uitgevoerd.',
  input_schema:obj({product_id:S('Id uit producten_zoeken.'),prijs_cent:{type:['integer','null'],description:'Nieuwe verkoopprijs in centen inclusief btw, of null.'},btw:{anyOf:[{type:'string',enum:['9','21']},{type:'null'}],description:'9 of 21, of null.'},beschikbaar:{type:['boolean','null'],description:'true = leverbaar, false = uitverkocht/niet beschikbaar, of null.'}})},
 {name:'product_publiceren',description:'Voert direct uit: een product publiceren (zichtbaar voor gasten, met de laatste conceptversie) of offline halen. Publiceren kan alleen met een btw-tarief. Wordt direct uitgevoerd.',
  input_schema:obj({product_id:S('Id uit producten_zoeken.'),publiceren:{type:'boolean',description:'true = publiceren, false = offline halen.'}})},
 {name:'openingstijden_wijzigen',description:'Voert direct uit: de vaste openingstijden van één weekdag wijzigen. Wordt direct uitgevoerd; bestaande boekingen die niet meer passen houden de wijziging tegen.',
  input_schema:obj({weekdag:{type:'string',enum:[...WEEKDAYS]},open:{type:'boolean'},van:S('UU:MM'),tot:S('UU:MM')})},
 {name:'afwijkende_dag',description:'Voert direct uit: één datum gesloten of met andere openingstijden. Wordt direct uitgevoerd.',
  input_schema:obj({datum:S('JJJJ-MM-DD'),open:{type:'boolean'},van:S('UU:MM (bij gesloten: 10:00)'),tot:S('UU:MM (bij gesloten: 18:00)'),notitie:S('Bijvoorbeeld "Kerst". Of leeg.')})},
 // ---- Gasten (wens eigenaar 9 november 2026): klanten, afspraken en opties. Nooit offertes versturen, boekingen bevestigen,
 // aanbetalingen of facturen maken, of prijzen noemen.
 {name:'klanten_zoeken',description:'Zoek klantenkaarten (Gesprekken & klanten) op naam, e-mail, telefoon of bedrijf. Geeft klant_id, naam, e-mail, telefoon, bedrijf, adres, notitie en hoeveel boekingen en gesprekken er bij de kaart horen. Zoek altijd eerst voordat je een klant aanmaakt.',
  input_schema:obj({zoekterm:S('Deel van naam, e-mail, telefoonnummer of bedrijf.')})},
 {name:'agenda_bekijken',description:'Bekijk de agenda van Planning per dag: openingstijden, boekingen (bevestigd, optie met geldig-tot, aanvraag), afspraken, evenementen en per dagdeel hoeveel plek er nog is voor groepen en daggasten. Gebruik dit om te zien of een datum vrij is.',
  input_schema:obj({van:S('Eerste dag, JJJJ-MM-DD.'),dagen:{type:'integer',description:'Aantal dagen, 1 tot 31.'}})},
 {name:'klant_aanmaken',description:'Voert direct uit: een nieuwe klantenkaart met naam, e-mail, telefoon, adres, bedrijf en notitie. Zoek eerst met klanten_zoeken; bestaat de klant al, maak dan geen tweede kaart. Wordt direct uitgevoerd.',
  input_schema:obj({naam:S('Naam van de klant.'),email:S('E-mailadres, of leeg.'),telefoon:S('Telefoonnummer, of leeg.'),adres:S('Adres, of leeg.'),bedrijf:S('Bedrijf of vereniging, of leeg.'),notitie:S('Korte notitie, of leeg.')})},
 {name:'klantgesprek_inplannen',description:'Voert direct uit: een afspraak in de agenda, zoals een kennismakingsgesprek. Geen boeking: houdt geen plaats vast. Kijk eerst met agenda_bekijken of het tijdstip past. Wordt direct uitgevoerd.',
  input_schema:obj({datum:S('JJJJ-MM-DD'),van:S('Begintijd UU:MM'),duur_minuten:{type:'integer',description:'Duur in minuten, 15 tot 480.'},klant_id:S('klant_id uit klanten_zoeken, of leeg als er (nog) geen kaart is.'),onderwerp:S('Bijvoorbeeld "Kennismakingsgesprek bruiloft".'),notitie:S('Korte notitie, of leeg.')})},
 {name:'optie_zetten',description:'Voert direct uit: een OPTIE of meteen een BEVESTIGDE boeking voor een groep, feest of bezoek, gekoppeld aan een klantenkaart. Inboeken mag ALTIJD (wens eigenaar 13 november 2026), ook buiten de openingstijden, in een gesloten periode, buiten een tijdblok of boven de capaciteit: dan gaat het als boeking met voorrang, met de reden in de agenda, en krijg je terug welke regel er normaal tegenhield. De openingstijden voor daggasten en online reserveringen veranderen niet. Wordt direct uitgevoerd.',
  input_schema:obj({klant_id:S('klant_id uit klanten_zoeken (verplicht; maak zo nodig eerst een kaart).'),datum:S('JJJJ-MM-DD'),van:S('UU:MM'),tot:S('UU:MM'),soort:{type:'string',enum:['groep','bezoek'],description:'groep = groep of feest; bezoek = daggasten speelboerderij.'},soort_evenement:S('Bijvoorbeeld "kinderfeest", "bedrijfsuitje", "bruiloft".'),aantal_gasten:{type:['integer','null'],description:'Verwacht aantal gasten, of null als het nog niet bekend is.'},geldig_tot:S('Laatste dag dat de optie geldt, JJJJ-MM-DD (meestal 1 à 2 weken). Bij een bevestigde boeking: de datum zelf.'),notitie:S('Korte notitie, of leeg.'),status:{type:'string',enum:['optie','bevestigd'],description:'optie = voorlopig tot geldig_tot; bevestigd = definitieve boeking (alleen als de afspraak met de gast vaststaat).'},uitzondering_reden:S('Waarom dit buiten de gewone regels toch geboekt wordt (bijvoorbeeld "toegezegd door Sanne"). Staat in de agenda. Leeg = de assistent noteert zelf dat het op verzoek is ingeboekt.')})},
 {name:'groepsdag_instellen',description:'Voert direct uit: groepen welkom op één datum (van–tot) terwijl het onderdeel uit staat of de dag gesloten is. De dag blijft dicht voor daggasten en online reserveringen; de rest van de gesloten periode verandert niet. Met een reden die in de agenda staat. Wordt direct uitgevoerd.',
  input_schema:obj({datum:S('JJJJ-MM-DD'),van:S('UU:MM'),tot:S('UU:MM'),notitie:S('Waarom groepen op deze dag welkom zijn, bijvoorbeeld "Besloten groep Erna: koffie, taart en borrel".')})},
 {name:'boeking_bevestigen',description:'Voert direct uit: een optie of aanvraag in Planning omzetten naar een bevestigde boeking, met dezelfde controles als de knop. Zoek de boeking-id op met agenda_bekijken. Geen offerte of factuur. Wordt direct uitgevoerd.',
  input_schema:obj({boeking_id:S('id van de boeking uit agenda_bekijken.'),notitie:S('Korte notitie bij het bevestigen, of leeg.')})},
];
export const TOOL_LABELS:Record<string,string>={betalingen_bekijken:'Financiën',factuur_mailen:'actie uitgevoerd',fotos_zoeken:'foto\'s',klanten_zoeken:'klantenkaarten',agenda_bekijken:'agenda van Planning',klant_aanmaken:'actie uitgevoerd',klantgesprek_inplannen:'actie uitgevoerd',optie_zetten:'actie uitgevoerd',groepsdag_instellen:'actie uitgevoerd',boeking_bevestigen:'actie uitgevoerd',producten_zoeken:'productlijst',openingstijden_bekijken:'openingstijden',
 product_aanmaken:'actie uitgevoerd',product_tekst_wijzigen:'actie uitgevoerd',product_wijzigen:'actie uitgevoerd',product_publiceren:'actie uitgevoerd',openingstijden_wijzigen:'actie uitgevoerd',afwijkende_dag:'actie uitgevoerd'};

const email=z.string().max(200).refine(v=>v===''||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),'ongeldig e-mailadres');
export const inputs={
 producten_zoeken:z.object({zoekterm:z.string().max(100),afdeling:z.string().max(100)}),
 fotos_zoeken:z.object({zoekterm:z.string().max(100)}),
 betalingen_bekijken:z.object({onderdeel:z.enum(FINANCE_PARTS),week:z.string().max(10),jaar:z.number().int().min(0).max(2100)}),
 factuur_mailen:z.object({rekening_id:z.string().min(1).max(100)}),
 openingstijden_bekijken:z.object({}),
 product_aanmaken:z.object({naam:z.string().trim().min(1).max(180),afdeling:z.enum(['Restaurant','Winkel']),prijs_cent:z.number().int().min(0).max(10000000),btw:z.enum(['9','21','']),notitie:z.string().max(2000),publiceren:z.boolean().default(false)}).refine(v=>!v.publiceren||v.btw!=='','publiceren kan alleen met een btw-tarief'),
 product_tekst_wijzigen:z.object({product_id:z.string().min(1).max(100),naam:z.string().trim().min(1).max(180).nullable(),notitie:nullableText(2000)}),
 product_wijzigen:z.object({product_id:z.string().min(1).max(100),prijs_cent:z.number().int().min(0).max(10000000).nullable(),btw:z.enum(['9','21']).nullable(),beschikbaar:z.boolean().nullable()}).refine(v=>v.prijs_cent!==null||v.btw!==null||v.beschikbaar!==null,'geef minstens één wijziging'),
 product_publiceren:z.object({product_id:z.string().min(1).max(100),publiceren:z.boolean()}),
 openingstijden_wijzigen:z.object({weekdag:z.enum(WEEKDAYS),open:z.boolean(),van:time,tot:time}).refine(v=>!v.open||v.van<v.tot,'de eindtijd moet na de begintijd liggen'),
 afwijkende_dag:z.object({datum:day,open:z.boolean(),van:time,tot:time,notitie:z.string().max(300)}).refine(v=>!v.open||v.van<v.tot,'de eindtijd moet na de begintijd liggen'),
 klanten_zoeken:z.object({zoekterm:z.string().trim().min(2,'geef minstens twee tekens').max(100)}),
 agenda_bekijken:z.object({van:day,dagen:z.number().int().min(1).max(31)}),
 klant_aanmaken:z.object({naam:z.string().trim().min(1).max(300),email,telefoon:z.string().trim().max(100),adres:z.string().trim().max(1000),bedrijf:z.string().trim().max(300),notitie:z.string().max(2000)}),
 klantgesprek_inplannen:z.object({datum:day,van:time,duur_minuten:z.number().int().min(15).max(480),klant_id:z.string().max(400),onderwerp:z.string().trim().min(1).max(200),notitie:z.string().max(2000)}),
 optie_zetten:z.object({klant_id:z.string().min(1).max(400),datum:day,van:time,tot:time,soort:z.enum(['groep','bezoek']),soort_evenement:z.string().trim().min(1).max(100),aantal_gasten:z.number().int().min(1).max(1000).nullable(),geldig_tot:day,notitie:z.string().max(2000),status:z.enum(['optie','bevestigd']).default('optie'),uitzondering_reden:z.string().trim().max(500).default('')}).refine(v=>v.van<v.tot,'de eindtijd moet na de begintijd liggen'),
 groepsdag_instellen:z.object({datum:day,van:time,tot:time,notitie:z.string().trim().min(3,'schrijf erbij waarom').max(500)}).refine(v=>v.van<v.tot,'de eindtijd moet na de begintijd liggen'),
 boeking_bevestigen:z.object({boeking_id:z.string().min(1).max(100),notitie:z.string().max(500)}),
};
const digits=(v:string)=>v.replace(/\D/g,'');
const plusMinutes=(t:string,m:number)=>{const n=Number(t.slice(0,2))*60+Number(t.slice(3))+m;return n>=24*60?null:String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')};

class Refuse extends Error{}
const refuse=(m:string):never=>{throw new Refuse(m)};
/** Uitkomst voor Claude: uitgevoerd (met het antwoord van de backoffice), geweigerd (met de reden), of alleen vastgelegd. */
const ready=(a:Action,r:{id:string;status?:string;result?:string})=>r.status==='uitgevoerd'
 ?JSON.stringify({uitgevoerd:true,actie_id:r.id,titel:a.title,uitkomst:r.result||'',uitleg:'De wijziging is doorgevoerd in de backoffice. Zeg kort wat er is gedaan.'})
 :r.status==='mislukt'
 ?JSON.stringify({uitgevoerd:false,actie_id:r.id,titel:a.title,reden_van_de_backoffice:r.result||'onbekend',uitleg:'Er is NIETS gewijzigd. Leg de reden in gewone woorden uit en los het zo mogelijk op.'})
 :JSON.stringify({klaargezet:true,actie_id:r.id,titel:a.title,uitleg:'De actie staat in het gesprek met de knop Uitvoeren. Er is nog NIETS gewijzigd. Zeg dat de beheerder kan controleren en op Uitvoeren kan klikken.'});

export async function runTool(name:string,raw:unknown,ctx:HulpContext):Promise<ToolOutcome>{
 const schema=inputs[name as keyof typeof inputs],source=TOOL_LABELS[name]||name;
 if(!schema)return {content:'Onbekend hulpmiddel. Dit kan de assistent niet.',isError:true,source};
 const parsed=schema.safeParse(raw);
 if(!parsed.success)return {content:'Ongeldige invoer: '+parsed.error.issues.map(i=>i.path.join('.')+' '+i.message).join('; '),isError:true,source};
 const v=parsed.data as Record<string,any>;
 const propose=async(a:Action)=>{const r=await ctx.propose(a);return {content:ready(a,r),isError:r.status==='mislukt',source}};
 try{
  switch(name){
  case 'producten_zoeken':{
   const term=String(v.zoekterm).trim().toLowerCase(),dep=String(v.afdeling).trim().toLowerCase();
   const found=(await ctx.products()).filter(p=>!p.deleted&&(!term||p.name.toLowerCase().includes(term))&&(!dep||p.department.toLowerCase().includes(dep)));
   return ok({aantal_gevonden:found.length,producten:found.slice(0,25).map(p=>({product_id:p.id,naam:p.name,afdeling:p.department,prijs:euro(p.priceCents),btw:p.vat||'onbekend',gepubliceerd:p.published,beschikbaar:p.available,notitie:p.note,...(()=>{const u=photoAddress(p.photo);return u?{toon:showPhoto(p.name,u)}:{foto:'geen'}})()}))},source);}
  case 'betalingen_bekijken':{
   if(!ctx.finance)refuse('Financiën is hier niet beschikbaar.');
     const data=await ctx.finance!(v.onderdeel);
   const text=JSON.stringify(data);return {content:text.length>14000?text.slice(0,14000)+' …(afgekapt; vraag een kleiner onderdeel of een andere week)':text,isError:false,source};}
  case 'factuur_mailen':return await propose({type:name,input:{id:v.rekening_id},title:'Factuur mailen aan de rekeninghouder',details:['Vanaf de mailbox van Gesprekken.']});
  case 'fotos_zoeken':{
   const term=String(v.zoekterm).trim().toLowerCase(),hit=(n:string)=>!term||n.toLowerCase().includes(term);
   const products=(await ctx.products()).filter(p=>!p.deleted&&hit(p.name)).map(p=>({p,u:photoAddress(p.photo)})).filter(x=>x.u);
   const used=new Set(products.map(x=>x.u));
   const media=(ctx.media?await ctx.media():[]).filter(m=>hit(m.name)&&!used.has('/api/media/'+m.id));
   const list=[...products.map(x=>({soort:'productfoto',naam:x.p.name,product_id:x.p.id,toon:showPhoto(x.p.name,x.u!)})),...media.map(m=>({soort:'beeldbibliotheek',naam:m.name,toon:showPhoto(m.name,'/api/media/'+m.id)}))];
   return ok({aantal_gevonden:list.length,uitleg:'Zet de regel „toon” van elke foto die je wilt laten zien letterlijk op een eigen regel in je antwoord. Hooguit 6 tegelijk.',fotos:list.slice(0,12)},source);}
  case 'openingstijden_bekijken':{const h=await ctx.hours();return ok({vandaag:ctx.today,vast:h.weekly,afwijkend:h.exceptions.filter(e=>e.datum>=ctx.today)},source);}

  case 'product_aanmaken':{
   const same=(await ctx.products()).find(p=>!p.deleted&&p.name.trim().toLowerCase()===v.naam.toLowerCase());
   if(same)refuse(`Er bestaat al een product ${same.name} (id ${same.id}). Vraag of het om hetzelfde product gaat.`);
   return await propose({type:name,input:{name:v.naam,department:v.afdeling,priceCents:v.prijs_cent,vat:v.btw,note:v.notitie,publish:v.publiceren===true},title:`Nieuw product ${v.naam}${v.publiceren?'':' (concept)'}`,details:[`${v.afdeling}, ${euro(v.prijs_cent)}, btw ${v.btw?v.btw+'%':'nog invullen'}`,v.publiceren?'Meteen gepubliceerd: zichtbaar voor gasten.':'Concept: nog niet zichtbaar voor gasten.']});}
  case 'product_tekst_wijzigen':{
   const p=(await ctx.products()).find(p=>p.id===v.product_id&&!p.deleted)||refuse(`Product-id ${v.product_id} bestaat niet. Zoek het eerst op met producten_zoeken.`);
   if(v.naam===null&&v.notitie===null)refuse('Er staat geen wijziging in.');
   return await propose({type:name,input:{productId:p.id,name:v.naam,note:v.notitie},title:`Product ${p.name} aanpassen`,details:[v.naam!==null&&`naam: ${p.name} → ${v.naam}`,v.notitie!==null&&`notitie: ${v.notitie||'(leeg)'}`,p.published&&'Ook meteen gepubliceerd.'].filter(Boolean) as string[]});}
  case 'product_wijzigen':{
   const p=(await ctx.products()).find(p=>p.id===v.product_id&&!p.deleted)||refuse(`Product-id ${v.product_id} bestaat niet. Zoek het eerst op met producten_zoeken.`);
   return await propose({type:name,input:{productId:p.id,priceCents:v.prijs_cent,vat:v.btw,available:v.beschikbaar},title:`Product ${p.name} wijzigen`,details:[v.prijs_cent!==null&&`prijs: ${euro(p.priceCents)} → ${euro(v.prijs_cent)}`,v.btw!==null&&`btw: ${p.vat||'leeg'} → ${v.btw}%`,v.beschikbaar!==null&&(v.beschikbaar?'weer beschikbaar':'niet beschikbaar (uitverkocht)'),p.published&&'Geldt meteen voor gasten.'].filter(Boolean) as string[]});}
  case 'product_publiceren':{
   const p=(await ctx.products()).find(p=>p.id===v.product_id&&!p.deleted)||refuse(`Product-id ${v.product_id} bestaat niet. Zoek het eerst op met producten_zoeken.`);
   if(v.publiceren&&!p.vat)refuse(`${p.name} heeft nog geen btw-tarief. Zet dat eerst met product_wijzigen.`);
   return await propose({type:name,input:{productId:p.id,publish:v.publiceren},title:`${p.name} ${v.publiceren?'publiceren':'offline halen'}`,details:[v.publiceren?'Zichtbaar voor gasten, met de laatste versie.':'Niet meer zichtbaar voor gasten; het concept blijft bewaard.']});}
  case 'klanten_zoeken':{
   const term=v.zoekterm.toLowerCase(),tel=digits(v.zoekterm),all=await ctx.customers();
   const found=all.filter(c=>[c.name,c.email,c.company].some(x=>x.toLowerCase().includes(term))||(tel.length>=6&&digits(c.phone).includes(tel)));
   return ok({aantal_gevonden:found.length,klanten:found.slice(0,20).map(c=>({klant_id:c.id,naam:c.name,email:c.email,telefoon:c.phone,bedrijf:c.company,adres:c.address,notitie:c.notes.slice(0,300),boekingen:c.bookings,gesprekken:c.conversations}))},source);}
  case 'agenda_bekijken':return ok({vandaag:ctx.today,dagen:await ctx.agenda(v.van,v.dagen)},source);
  case 'klant_aanmaken':{
   const all=await ctx.customers(),mail=v.email.toLowerCase(),tel=digits(v.telefoon);
   const same=all.find(c=>(mail&&c.email.toLowerCase()===mail)||(tel.length>=8&&digits(c.phone)===tel)||c.name.trim().toLowerCase()===v.naam.toLowerCase());
   if(same)refuse(`Er bestaat al een klantenkaart ${same.name} (${same.email||same.phone||'zonder contactgegevens'}), klant_id ${same.id}. Vraag of het om dezelfde klant gaat; maak dan geen tweede kaart.`);
   return await propose({type:name,input:{name:v.naam,email:mail,phone:v.telefoon,address:v.adres,company:v.bedrijf,notes:v.notitie},title:`Nieuwe klantenkaart ${v.naam}`,
    details:[v.bedrijf&&`bedrijf ${v.bedrijf}`,v.email&&`e-mail ${mail}`,v.telefoon&&`telefoon ${v.telefoon}`,v.adres&&`adres ${v.adres}`,v.notitie&&`notitie: ${v.notitie}`].filter(Boolean) as string[]});}
  case 'klantgesprek_inplannen':{
   if(v.datum<ctx.today)refuse('Deze dag is al voorbij. Kies een dag vanaf vandaag.');
   const tot=plusMinutes(v.van,v.duur_minuten)||refuse('De afspraak loopt over middernacht. Kies een eerder tijdstip of een kortere duur.');
   const klant=v.klant_id?((await ctx.customers()).find(c=>c.id===v.klant_id)||refuse(`klant_id ${v.klant_id} bestaat niet. Zoek de klant eerst op met klanten_zoeken.`)):null;
   const dag=(await ctx.agenda(v.datum,1))[0],overlap=dag?.afspraken.filter(a=>a.van<tot!&&v.van<a.tot)||[];
   return await propose({type:name,input:{date:v.datum,from:v.van,to:tot,subject:v.onderwerp,customerId:klant?.id||'',customerName:klant?.name||'',notes:v.notitie},title:`Afspraak: ${v.onderwerp}`,
    details:[`${dutchDate(v.datum)}, ${v.van}–${tot}`,klant?`met ${klant.name}`:'zonder klantenkaart',v.notitie,overlap.length?`Let op: tegelijk met ${overlap.map(a=>a.onderwerp+' ('+a.van+'–'+a.tot+')').join(', ')}`:'','Geen boeking: houdt geen plaats vast.'].filter(Boolean)});}
  case 'optie_zetten':{
   const confirmed=v.status==='bevestigd';
   if(v.datum<ctx.today)refuse('Deze dag is al voorbij. Kies een dag vanaf vandaag.');
   if(!confirmed&&v.geldig_tot<ctx.today)refuse('De optie moet tot vandaag of later gelden.');
   if(!confirmed&&v.geldig_tot>v.datum)refuse('Een optie kan niet langer gelden dan tot de dag zelf.');
   const klant=(await ctx.customers()).find(c=>c.id===v.klant_id)||refuse(`klant_id ${v.klant_id} bestaat niet. Zoek de klant op met klanten_zoeken of maak eerst een kaart met klant_aanmaken.`);
   const people=v.aantal_gasten??1,given=String(v.uitzondering_reden||'').trim();
   // Inboeken mag altijd (wens eigenaar 13 november 2026). Past het niet in de gewone regels, dan met voorrang en een reden.
   const why=await ctx.checkOption({date:v.datum,from:v.van,to:v.tot,activity:v.soort,people,status:v.status});
   const reden=why?(given||'Op verzoek ingeboekt via de assistent'):given;
   const notes=[v.soort_evenement,v.aantal_gasten===null?'Aantal gasten nog onbekend.':'',v.notitie].filter(Boolean).join('\n');
   const out=await propose({type:name,input:{customerId:klant.id,name:klant.name,email:klant.email,phone:klant.phone,activity:v.soort,date:v.datum,from:v.van,to:v.tot,people,expiresDay:v.geldig_tot,notes,status:v.status,exception:reden,override:!!why},title:`${confirmed?'Boeking':'Optie'} ${v.soort_evenement} · ${klant.name}`,
    details:[`${dutchDate(v.datum)}, ${v.van}–${v.tot}`,v.aantal_gasten===null?'aantal gasten nog onbekend (telt als 1 tot het bekend is)':`${v.aantal_gasten} gasten`,confirmed?'bevestigde boeking':`optie geldig tot en met ${dutchDate(v.geldig_tot)}`,why&&`met voorrang, buiten de gewone regels: ${why}`,reden&&`reden in de agenda: ${reden}`,v.notitie,'Geen offerte en geen factuur.'].filter(Boolean) as string[]});
   if(out.isError)return out;
   const extra={...(why?{buiten_de_gewone_regels:why,uitleg_voorrang:'Toch ingeboekt met voorrang (de agenda toont de reden). Zeg dit kort, zodat de beheerder het weet. Daggasten en online reserveringen zijn NIET opengezet.'}:{}),
    vervolgvragen:'Stel nu kort ondersteunende vragen, één of twee tegelijk: Moet ik diensten in de ledenplanning zetten (welke rol, hoeveel mensen; bezetting_instellen) en de leden direct laten weten? Zijn er wensen voor eten en drinken (bijvoorbeeld op de boodschappenlijst of als product)? Moet de gast een bevestiging of offerte krijgen?'};
   return {...out,content:JSON.stringify({...JSON.parse(out.content),...extra})};}
  case 'groepsdag_instellen':{
   if(v.datum<ctx.today)refuse('Deze dag is al voorbij. Kies een dag vanaf vandaag.');
   return await propose({type:name,input:{date:v.datum,from:v.van,to:v.tot,note:v.notitie},title:`Groepsdag ${dutchDate(v.datum)}`,details:[`groepen welkom van ${v.van} tot ${v.tot}`,v.notitie,'Dicht voor daggasten en online reserveringen; de gesloten periode verandert niet.']});}
  case 'boeking_bevestigen':
   return await propose({type:name,input:{reservationId:v.boeking_id,note:v.notitie},title:'Boeking bevestigen',details:[v.notitie||'optie of aanvraag wordt een bevestigde boeking']});
  case 'openingstijden_wijzigen':
   return await propose({type:name,input:{weekday:v.weekdag,open:v.open,from:v.van,to:v.tot},title:`Openingstijden op ${v.weekdag}`,details:[v.open?`elke ${v.weekdag} open van ${v.van} tot ${v.tot}`:`elke ${v.weekdag} gesloten`]});
  case 'afwijkende_dag':
   if(v.datum<ctx.today)refuse('Deze datum is al voorbij.');
   return await propose({type:name,input:{date:v.datum,open:v.open,from:v.van,to:v.tot,note:v.notitie.trim()},title:`Afwijkende dag ${dutchDate(v.datum)}`,details:[v.open?`open van ${v.van} tot ${v.tot}`:'gesloten',v.notitie.trim()].filter(Boolean)});
  }
  return {content:'Onbekend hulpmiddel.',isError:true,source};
 }catch(e){
  if(e instanceof Refuse)return {content:e.message,isError:true,source};
  return {content:'Het ophalen lukte niet: '+(e instanceof Error?e.message:'onbekende fout')+'. Zeg eerlijk dat deze gegevens nu niet beschikbaar zijn.',isError:true,source};
 }
}
function ok(v:unknown,source:string):ToolOutcome{return {content:JSON.stringify(v),isError:false,source}}

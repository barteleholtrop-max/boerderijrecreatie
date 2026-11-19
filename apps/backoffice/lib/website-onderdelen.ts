// Onderdelen van de hoofdsite: open of in ontwikkeling (wens eigenaar 15 november 2026: „bouw de schakelaar per onderdeel
// in de backoffice”). De eigenaar kiest per onderdeel bij Website & uitstraling; de hoofdsite (apps/website-fab) leest de
// keuze via GET /api/public/availability (veld `website`) en toont een pagina „in ontwikkeling” voor wat nog niet open is.
// Zie docs/SITES.md. Bewaard in website_settings.onderdelen (JSON), met dezelfde versie als de uitstraling: wie tegelijk
// iets anders opslaat, krijgt een melding in plaats van stil overschrijven.
import {getDb} from '@/db';
import {websiteSettings} from '@/db/schema';
import {and,eq} from 'drizzle-orm';

/** Vaste sleutels: worden nooit hernoemd (de hoofdsite gebruikt ze); er kunnen er alleen bij komen. */
export const ONDERDELEN=[
 {id:'start',label:'Startpagina',description:'Open: de gewone voorpagina met menu. In ontwikkeling: „We werken aan het nieuwe Boer Bart”.'},
 {id:'speelboerderij',label:'Speelboerderij',description:'/speelboerderij/ met bezoek plannen.'},
 {id:'yte',label:'Ite by Boer Bart',description:'/yte/ met de avonden en aanvragen.'},
 {id:'winkel',label:'Boerderijwinkel',description:'/boerderijwinkel/ met de webshop.'},
 {id:'agenda',label:'Agenda',description:'/agenda/ met evenementen, aanmelden en betalen (uit Planning).'},
 {id:'groepen',label:'Groepen en schoolreisjes',description:'/groepen/.'},
 {id:'over',label:'Ons verhaal',description:'/over-ons/.'},
 {id:'nieuws',label:'Nieuws en blog',description:'/nieuws/ met de gepubliceerde stukken uit Inhoud.'},
 {id:'vragen',label:'Veelgestelde vragen',description:'/vragen/.'},
 {id:'contact',label:'Contact en aanvragen',description:'/contact/ met het aanvraagformulier.'},
 {id:'bestellen',label:'Bestellen (in het menu)',description:'De link naar de bestelapp in het menu. De bestelapp zelf blijft werken.'},
] as const;
export type OnderdeelId=typeof ONDERDELEN[number]['id'];
export type Stand='open'|'ontwikkeling';
export type Onderdelen=Record<OnderdeelId,Stand>;

/** Zonder keuze is alles in ontwikkeling: zo stond de site op 15 november 2026 (opbouwstand). */
export const STANDAARD:Onderdelen=Object.fromEntries(ONDERDELEN.map(o=>[o.id,'ontwikkeling'])) as Onderdelen;

export class OnderdelenError extends Error{status:number;constructor(message:string,status=400){super(message);this.status=status}}

/** Leest opgeslagen JSON; onbekende sleutels en waarden vallen weg, ontbrekende krijgen de standaard. */
export function normalize(raw:unknown):Onderdelen{
 let v:unknown=raw;
 if(typeof v==='string'){try{v=JSON.parse(v)}catch{v={}}}
 const o=v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
 return Object.fromEntries(ONDERDELEN.map(d=>[d.id,o[d.id]==='open'?'open':'ontwikkeling'])) as Onderdelen;
}

/** Strikt voor opslaan: alleen bekende onderdelen, alleen „open” of „ontwikkeling”. */
export function parseKeuze(v:unknown):Onderdelen{
 if(!v||typeof v!=='object'||Array.isArray(v))throw new OnderdelenError('Ongeldige aanvraag.');
 const o=v as Record<string,unknown>;
 for(const k of Object.keys(o))if(!ONDERDELEN.some(d=>d.id===k))throw new OnderdelenError('Onbekend onderdeel.');
 for(const d of ONDERDELEN)if(o[d.id]!=='open'&&o[d.id]!=='ontwikkeling')throw new OnderdelenError(`Kies open of in ontwikkeling bij ${d.label}.`);
 return normalize(o);
}

/** Voor de hoofdsite: alleen de lijst met wat in ontwikkeling is. */
export const publicView=(o:Onderdelen)=>({inOntwikkeling:ONDERDELEN.filter(d=>o[d.id]!=='open').map(d=>d.id)});

export async function getOnderdelen():Promise<{onderdelen:Onderdelen;version:number;updated:string;updatedBy:string}>{
 const [row]=await getDb().select().from(websiteSettings).where(eq(websiteSettings.id,'main'));
 if(!row)return {onderdelen:{...STANDAARD},version:0,updated:'',updatedBy:''};
 return {onderdelen:normalize(row.onderdelen),version:row.version,updated:row.updated,updatedBy:row.updatedBy};
}
/** Voor gasten: faalt nooit; bij een storing blijft alles in ontwikkeling (niets beloven wat niet klopt). */
export const publicOnderdelen=()=>getOnderdelen().then(r=>publicView(r.onderdelen)).catch(()=>publicView(STANDAARD));

/** Slaat de keuze op als niemand intussen iets aan de website-instellingen veranderde (versie). */
export async function saveOnderdelen(keuze:unknown,version:number,by:string){
 const onderdelen=parseKeuze(keuze);
 if(!Number.isInteger(version)||version<0)throw new OnderdelenError('Ongeldige aanvraag.');
 const db=getDb(),updated=new Date().toISOString(),value=JSON.stringify(onderdelen);
 if(version===0){
  const r=await db.insert(websiteSettings).values({id:'main',onderdelen:value,version:1,updated,updatedBy:by}).onConflictDoNothing().returning({id:websiteSettings.id});
  if(!r.length)throw new OnderdelenError('Iemand anders heeft dit net gewijzigd. Ververs en probeer opnieuw.',409);
  return 1;
 }
 const r=await db.update(websiteSettings).set({onderdelen:value,version:version+1,updated,updatedBy:by}).where(and(eq(websiteSettings.id,'main'),eq(websiteSettings.version,version))).returning({id:websiteSettings.id});
 if(!r.length)throw new OnderdelenError('Iemand anders heeft dit net gewijzigd. Ververs en probeer opnieuw.',409);
 return version+1;
}

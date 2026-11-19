// Uitstraling van de bestelapp (wens eigenaar 9 november 2026): één bestelapp, meerdere uitstralingen. De eigenaar kiest er één
// bij Website & uitstraling; alle gasten zien die. De bestelapp leest de keuze via GET /api/public/order-options (veld uitstraling)
// en laadt het bijbehorende themabestand. Een nieuwe uitstraling = een id hieronder + een themabestand in apps/website.
import {getDb} from '@/db';
import {websiteSettings} from '@/db/schema';
import {and,eq} from 'drizzle-orm';

export const UITSTRALINGEN=[
 {id:'klassiek',label:'Klassiek',description:'De huidige bestelapp: kaarten met een ronde afbeelding, crème en bosgroen.'},
 {id:'d',label:'D · Combinatie',description:'Hoge kop met lucht en wei, producten als tegels in twee kolommen met de plusknop op de tegel.'},
 {id:'e',label:'E · Lijst',description:'Lucht en wei bovenaan, producten als lijst met een gekleurde tegel, het mandje als balk onderaan.'},
] as const;
export type UitstralingId=typeof UITSTRALINGEN[number]['id'];
export const DEFAULT_UITSTRALING:UitstralingId='klassiek';
export const isUitstraling=(v:unknown):v is UitstralingId=>typeof v==='string'&&UITSTRALINGEN.some(u=>u.id===v);

export class UitstralingError extends Error{status:number;constructor(message:string,status=400){super(message);this.status=status}}

export async function getUitstraling():Promise<{uitstraling:UitstralingId;version:number;updated:string;updatedBy:string}>{
 const [row]=await getDb().select().from(websiteSettings).where(eq(websiteSettings.id,'main'));
 if(!row)return {uitstraling:DEFAULT_UITSTRALING,version:0,updated:'',updatedBy:''};
 return {uitstraling:isUitstraling(row.uitstraling)?row.uitstraling:DEFAULT_UITSTRALING,version:row.version,updated:row.updated,updatedBy:row.updatedBy};
}
/** For guests: never fails; on any problem the classic look. */
export const publicUitstraling=()=>getUitstraling().then(r=>r.uitstraling).catch(()=>DEFAULT_UITSTRALING);

/** Saves the choice if nobody changed it in the meantime (version). */
export async function saveUitstraling(uitstraling:unknown,version:number,by:string){
 if(!isUitstraling(uitstraling))throw new UitstralingError('Kies een bestaande uitstraling.');
 if(!Number.isInteger(version)||version<0)throw new UitstralingError('Ongeldige aanvraag.');
 const db=getDb(),updated=new Date().toISOString();
 if(version===0){
  const r=await db.insert(websiteSettings).values({id:'main',uitstraling,version:1,updated,updatedBy:by}).onConflictDoNothing().returning({id:websiteSettings.id});
  if(!r.length)throw new UitstralingError('Iemand anders heeft dit net gewijzigd. Ververs en probeer opnieuw.',409);
  return 1;
 }
 const r=await db.update(websiteSettings).set({uitstraling,version:version+1,updated,updatedBy:by}).where(and(eq(websiteSettings.id,'main'),eq(websiteSettings.version,version))).returning({id:websiteSettings.id});
 if(!r.length)throw new UitstralingError('Iemand anders heeft dit net gewijzigd. Ververs en probeer opnieuw.',409);
 return version+1;
}

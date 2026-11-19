// Werkplek open of dicht (wens eigenaar 14 november 2026): opslag en stand. Regels in lib/station-open-core.ts.
// Eén rij in station_settings. De eigenaar stelt per werkplek in wanneer hij open is (Bestelopties); op de werkplek zelf
// zet een medewerker hem met één tik op „Nu niet beschikbaar” en weer terug.
import {getDb} from '@/db';
import {stationSettings} from '@/db/schema';
import {and,eq} from 'drizzle-orm';
import {loadGuest} from './guest-store';
import {readSettings,checkSettings,allStatuses,StationError,STATION_IDS,type StationId,type StationSettings,type StationStatus} from './station-open-core';

export async function getStationSettings():Promise<{settings:StationSettings;version:number;updated:string;updatedBy:string}>{
 const [row]=await getDb().select().from(stationSettings).where(eq(stationSettings.id,'main'));
 return row?{settings:readSettings(row.data),version:row.version,updated:row.updated,updatedBy:row.updatedBy}:{settings:readSettings(null),version:0,updated:'',updatedBy:''};
}
// Kort bewaard voor de openbare productlijst (veel gasten tegelijk); elke wijziging hier wist hem meteen.
const STATUS_TTL=15000;const shared=globalThis as typeof globalThis&{__boerBartStationStatus?:{at:number;status:Record<StationId,StationStatus>}|null};
export async function cachedStationStatuses(){
 const c=shared.__boerBartStationStatus;if(c&&Date.now()-c.at<STATUS_TTL)return c.status;
 const status=await stationStatuses();shared.__boerBartStationStatus={at:Date.now(),status};return status;
}
async function write(settings:StationSettings,version:number,by:string){
 shared.__boerBartStationStatus=null;
 const db=getDb(),updated=new Date().toISOString(),data=JSON.stringify(settings);
 const r=version===0
  ?await db.insert(stationSettings).values({id:'main',data,version:1,updated,updatedBy:by}).onConflictDoNothing().returning({id:stationSettings.id})
  :await db.update(stationSettings).set({data,version:version+1,updated,updatedBy:by}).where(and(eq(stationSettings.id,'main'),eq(stationSettings.version,version))).returning({id:stationSettings.id});
 if(!r.length)throw new StationError('Iemand anders heeft dit net gewijzigd. Ververs en probeer opnieuw.',409);
 shared.__boerBartStationStatus=null;
 return version+1;
}
/** De eigenaar stelt de tijden in (de pauze van elke werkplek blijft staan). */
export async function saveStationSettings(raw:unknown,version:number,by:string){
 if(!Number.isInteger(version)||version<0)throw new StationError('Ongeldige aanvraag.');
 const now=await getStationSettings();
 if(now.version!==version)throw new StationError('Iemand anders heeft dit net gewijzigd. Ververs en probeer opnieuw.',409);
 return write(checkSettings(raw,now.settings),version,by);
}
/** Eén werkplek stelt zijn eigen tijden in (wens eigenaar 15 november 2026: „wel mooi als de werkplek ook tijden kan invullen”).
 *  Alleen deze werkplek verandert; de andere en de pauze blijven zoals ze zijn. */
export async function saveStationRule(station:StationId,rule:unknown,version:number,by:string){
 if(!Number.isInteger(version)||version<0)throw new StationError('Ongeldige aanvraag.');
 const now=await getStationSettings();
 if(now.version!==version)throw new StationError('Iemand anders heeft dit net gewijzigd. Ververs en probeer opnieuw.',409);
 const checked=checkSettings({...now.settings,[station]:rule},now.settings);
 return write({...now.settings,[station]:checked[station]},version,by);
}
/** „Nu niet beschikbaar” aan (tot until, of tot iemand hem weer aanzet) of uit. Bij een gelijktijdige wijziging één keer opnieuw. */
export async function setPaused(station:StationId,paused:boolean,until:string|null,by:string){
 if(until!==null&&Number.isNaN(Date.parse(until)))throw new StationError('Ongeldige tijd.');
 for(let i=0;i<3;i++){
  const now=await getStationSettings();
  const settings={...now.settings,[station]:{...now.settings[station],paused:paused?{until,at:new Date().toISOString(),by:by.slice(0,80)}:null}};
  try{return await write(settings,now.version,by)}catch(e){if(!(e instanceof StationError&&e.status===409)||i===2)throw e}
 }
 throw new StationError('Probeer het opnieuw.',409);
}
/** De stand van elke werkplek nu. Voor gasten: nooit een fout; bij een storing staat alles open (zoals voorheen). */
export async function stationStatuses(now=new Date()):Promise<Record<StationId,StationStatus>>{
 try{const [{settings},guest]=await Promise.all([getStationSettings(),loadGuest()]);return allStatuses(settings,guest.state,now)}
 catch{return Object.fromEntries(STATION_IDS.map(id=>[id,{open:true,reason:''}])) as Record<StationId,StationStatus>}
}

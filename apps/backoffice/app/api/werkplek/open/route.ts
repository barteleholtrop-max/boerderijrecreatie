import {isSameOrigin} from '@/lib/portable/origin';
import {isOwnerRequest} from '@/lib/owner';
import {getStationSettings,saveStationSettings,saveStationRule,setPaused,stationStatuses} from '@/lib/station-open';
import {isStationId,StationError} from '@/lib/station-open-core';
export const dynamic='force-dynamic';
// Werkplek open of dicht (wens eigenaar 14 november 2026). Voor medewerkers en gekoppelde werkplektablets (niet openbaar).
// GET: instellingen en de stand van elke werkplek nu.
// POST {action:'pauze', station, paused, until?}: „Nu niet beschikbaar” aan of uit (tablet, medewerker of eigenaar).
// POST {action:'werkplek', station, rule, version}: de tijden van één werkplek, vanaf het werkplekscherm (wens eigenaar 15 november 2026).
// POST {action:'instellen', settings, version}: wanneer elke werkplek open is (alleen de eigenaar, bij Bestelopties).
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(){
 try{const [s,status]=await Promise.all([getStationSettings(),stationStatuses()]);return json({...s,status})}
 catch{return json({error:'De werkplekken konden niet worden geladen.'},500)}
}
export async function POST(req:Request){
 if(!isSameOrigin(req))return json({error:'Ongeldige herkomst.'},403);
 const text=await req.text().catch(()=>'');if(text.length>20000)return json({error:'Aanvraag te groot.'},413);
 let b:{action?:unknown;station?:unknown;paused?:unknown;until?:unknown;settings?:unknown;version?:unknown;rule?:unknown};
 try{b=JSON.parse(text)}catch{return json({error:'Ongeldige aanvraag.'},400)}
 const by=req.headers.get('x-boer-bart-account')||'medewerker';
 try{
  if(b.action==='pauze'){
   if(!isStationId(b.station)||typeof b.paused!=='boolean'||(b.until!==undefined&&b.until!==null&&typeof b.until!=='string'))return json({error:'Ongeldige aanvraag.'},400);
   const version=await setPaused(b.station,b.paused,(b.until as string|null|undefined)??null,by);
   return json({ok:true,version,status:await stationStatuses()});
  }
  if(b.action==='werkplek'){
   const r=b as {station?:unknown;rule?:unknown;version?:unknown};
   if(!isStationId(r.station))return json({error:'Ongeldige aanvraag.'},400);
   const version=await saveStationRule(r.station,r.rule,Number(r.version),by);
   return json({ok:true,version,status:await stationStatuses()});
  }
  if(b.action==='instellen'){
   if(!isOwnerRequest(req))return json({error:'Alleen de eigenaar stelt de tijden van de werkplekken in.'},403);
   const version=await saveStationSettings(b.settings,Number(b.version),by);
   return json({ok:true,version,status:await stationStatuses()});
  }
  return json({error:'Onbekende actie.'},400);
 }catch(e){return e instanceof StationError?json({error:e.message},e.status):json({error:'Opslaan lukte niet. Probeer het opnieuw.'},500)}
}

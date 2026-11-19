// Totale stroom (wens eigenaar 5 november 2026): op „Bestellingen & uitgifte” ziet de eigenaar alle werkplekken samen.
// De werkplekken geven elk hun eigen deel van een bestelling (GET /api/workplaces?station=…); hier worden die delen per
// bestelling samengevoegd. Pure regels, zonder database of netwerk.
import type {WorkState} from './work-status';
export const FLOW_STATIONS=['kok','barista','winkel'] as const;
export type FlowStation=typeof FLOW_STATIONS[number];
type Line={name:string;quantity:number;choices?:string[];note?:string};
export type StationOrder={id:number;number:string;reference:string;mode:string;created:string;status:WorkState;updated:string;test:boolean;lines:Line[]};
export type FlowPart={station:FlowStation;status:WorkState;updated:string;lines:Line[]};
export type FlowOrder={id:number;number:string;reference:string;mode:string;created:string;test:boolean;parts:FlowPart[];state:'nieuw'|'bezig'|'klaar';finished:string|null};

/** Eén bestelling met per werkplek zijn deel. Klaar = alle werkplekken klaar; bezig = er is er één begonnen of klaar. */
export function mergeFlow(byStation:Partial<Record<FlowStation,StationOrder[]>>):FlowOrder[]{
 const map=new Map<number,FlowOrder>();
 for(const station of FLOW_STATIONS)for(const o of byStation[station]||[]){
  const f=map.get(o.id)??{id:o.id,number:o.number,reference:o.reference,mode:o.mode,created:o.created,test:o.test,parts:[],state:'nieuw' as const,finished:null};
  f.parts.push({station,status:o.status,updated:o.updated,lines:o.lines});map.set(o.id,f);
 }
 for(const f of map.values()){
  const done=f.parts.every(p=>p.status==='gereed');
  f.state=done?'klaar':f.parts.some(p=>p.status!=='nieuw')?'bezig':'nieuw';
  f.finished=done?f.parts.map(p=>p.updated).sort().at(-1)||null:null;
 }
 return [...map.values()];
}
/** Onderweg: wie het langst wacht bovenaan. Klaar: het laatst afgeronde bovenaan. */
export function splitFlow(list:FlowOrder[]){
 const open=list.filter(f=>f.state!=='klaar').sort((a,b)=>a.created.localeCompare(b.created));
 const done=list.filter(f=>f.state==='klaar').sort((a,b)=>(b.finished||'').localeCompare(a.finished||''));
 return {open,done};
}
/** Per werkplek: hoeveel nieuw, bezig en klaar (laatste 24 uur), en sinds wanneer de oudste open bestelling wacht. */
export function stationStats(byStation:Partial<Record<FlowStation,StationOrder[]>>){
 return FLOW_STATIONS.map(station=>{const l=byStation[station]||[];const open=l.filter(o=>o.status!=='gereed');
  return {station,nieuw:l.filter(o=>o.status==='nieuw').length,bezig:l.filter(o=>o.status==='behandeling').length,klaar:l.filter(o=>o.status==='gereed').length,
   oldest:open.map(o=>o.created).sort()[0]||null}});
}

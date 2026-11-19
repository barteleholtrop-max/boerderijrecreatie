'use client';
// De instelling van één werkplek (open of dicht): gedeeld door Bestelopties (eigenaar) en het werkplekscherm zelf
// (wens eigenaar 15 november 2026: „wel mooi als de werkplek ook tijden kan invullen”). Regels in lib/station-open-core.ts.
import {STATION_NAMES,MODES,SOURCES,type StationId,type StationRule} from '@/lib/station-open-core';
const DAYS=['Zondag','Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag'],ORDER=[1,2,3,4,5,6,0];
export function StationRuleFields({id,rule,onChange}:{id:StationId;rule:StationRule;onChange:(patch:Partial<StationRule>)=>void}){
 const name=STATION_NAMES[id].name;
 return <>
  <label>Wanneer open<select className="input" value={rule.mode} onChange={e=>onChange({mode:e.target.value as StationRule['mode']})}>{MODES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
  {rule.mode==='openingstijden'&&<label>Volgt de openingstijden van<select className="input" value={rule.source} onChange={e=>onChange({source:e.target.value as StationRule['source']})}>{SOURCES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>}
  {rule.mode==='eigen'&&<div className="station-hours">{ORDER.map(d=>{const h=rule.hours[d];const day=(patch:Partial<typeof h>)=>onChange({hours:rule.hours.map((x,i)=>i===d?{...x,...patch}:x)});return <div key={d} className="station-hour">
   <label className="check"><input type="checkbox" checked={h.open} onChange={e=>day({open:e.target.checked})}/> {DAYS[d]}</label>
   <input className="input" type="time" aria-label={`${name} ${DAYS[d]} vanaf`} disabled={!h.open} value={h.from} onChange={e=>day({from:e.target.value})}/>
   <input className="input" type="time" aria-label={`${name} ${DAYS[d]} tot`} disabled={!h.open} value={h.to} onChange={e=>day({to:e.target.value})}/>
  </div>})}</div>}
 </>;
}
/** Vandaag om hh:mm (lokale tijd van het toestel); ligt dat al achter ons, dan morgen. */
export function todayAt(time:string){const [h,m]=time.split(':').map(Number);const d=new Date();d.setHours(h,m,0,0);if(d.getTime()<=Date.now())d.setDate(d.getDate()+1);return d.toISOString()}
export const endOfDay=()=>{const d=new Date();d.setHours(23,59,0,0);return d.toISOString()};
export const timeOf=(iso:string)=>new Date(iso).toLocaleString('nl-NL',{weekday:'short',hour:'2-digit',minute:'2-digit'});

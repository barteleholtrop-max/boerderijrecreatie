'use client';
// Werkplek open of dicht (wens eigenaar 14 november 2026): per werkplek wanneer gasten kunnen bestellen. Altijd open, de
// openingstijden van de speelboerderij, de winkel of de Ite-avond volgen, eigen tijden per dag, of gesloten. Plus
// „Nu niet beschikbaar” (bijvoorbeeld als er vandaag geen kok is). Opslag: /api/werkplek/open, regels in lib/station-open-core.ts.
import {useEffect,useState} from 'react';
import {Pill} from '../ui';
import {STATION_IDS,STATION_NAMES,type StationSettings,type StationId,type StationStatus} from '@/lib/station-open-core';
import {StationRuleFields,todayAt,endOfDay,timeOf} from '../werkplek/station-rule-fields';
type Data={settings:StationSettings;version:number;status:Record<StationId,StationStatus>};
async function call(body?:unknown){
 const r=await fetch('/api/werkplek/open',body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});
 const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Er ging iets mis. Ververs en probeer opnieuw.');return d;
}

export function StationOpenCard(){
 const [until,setUntil]=useState<Record<string,string>>({}),[data,setData]=useState<Data|null>(null),[draft,setDraft]=useState<StationSettings|null>(null),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false);
 const load=async()=>{try{const d=await call() as Data;setData(d);setDraft(d.settings)}catch(e){setMsg((e as Error).message)}};
 useEffect(()=>{void load()},[]);
 if(!data||!draft)return <div className="card section-gap"><h3 className="card-title">Werkplekken open of dicht</h3><p className="small">{msg||'Laden…'}</p></div>;
 const set=(id:StationId,patch:Partial<StationSettings[StationId]>)=>setDraft(d=>d?{...d,[id]:{...d[id],...patch}}:d);
 const run=async(body:unknown,ok:string)=>{setBusy(true);setMsg('');try{await call(body);await load();setMsg(ok)}catch(e){setMsg((e as Error).message)}finally{setBusy(false)}};
 const changed=JSON.stringify(STATION_IDS.map(id=>({...draft[id],paused:null})))!==JSON.stringify(STATION_IDS.map(id=>({...data.settings[id],paused:null})));
 return <div className="card section-gap" data-bb-view="station-open">
  <div className="card-head"><h3 className="card-title">Werkplekken open of dicht</h3></div>
  <p className="small">Per werkplek: wanneer gasten in de bestelapp kunnen bestellen. Is een werkplek dicht, dan staan zijn producten op „nu niet te bestellen” en weigert de backoffice zulke bestellingen. De kassa en opnemen aan tafel blijven werken.</p>
  {msg&&<div className="message" role="status">{msg}</div>}
  <div className="station-open-grid">{STATION_IDS.map(id=>{const r=draft[id],st=data.status[id],p=data.settings[id].paused;return <section key={id} className="station-open" aria-label={STATION_NAMES[id].name}>
   <div className="card-head"><h4>{STATION_NAMES[id].name}</h4>{st.open?<Pill color="green">Nu open</Pill>:<Pill color="orange">Nu dicht</Pill>}</div>
   <StationRuleFields id={id} rule={r} onChange={patch=>set(id,patch)}/>
   <div className="station-pause">{p?<>
    <p className="small"><b>Nu niet beschikbaar</b>{p.until?` tot ${timeOf(p.until)}`:', tot iemand hem weer aanzet'}{p.by?` · door ${p.by}`:''}</p>
    <button type="button" className="btn secondary sm" disabled={busy} onClick={()=>run({action:'pauze',station:id,paused:false},`${STATION_NAMES[id].name} staat weer aan.`)}>Weer beschikbaar</button></>
    :<><button type="button" className="btn secondary sm" disabled={busy} onClick={()=>run({action:'pauze',station:id,paused:true,until:endOfDay()},`${STATION_NAMES[id].name} is vandaag niet beschikbaar.`)}>Vandaag niet beschikbaar</button>
     <button type="button" className="text-button" disabled={busy} onClick={()=>run({action:'pauze',station:id,paused:true,until:null},`${STATION_NAMES[id].name} is niet beschikbaar tot je hem weer aanzet.`)}>Tot ik hem weer aanzet</button>
     <span className="station-until"><input className="input" type="time" aria-label={`${STATION_NAMES[id].name} niet beschikbaar tot`} value={until[id]||''} onChange={e=>setUntil(u=>({...u,[id]:e.target.value}))}/>
      <button type="button" className="btn secondary sm" disabled={busy||!until[id]} onClick={()=>run({action:'pauze',station:id,paused:true,until:todayAt(until[id])},`${STATION_NAMES[id].name} is niet beschikbaar tot ${until[id]}.`)}>Niet beschikbaar tot</button></span></>}</div>
  </section>})}</div>
  <div className="action-row section-gap"><button type="button" className="btn" disabled={busy||!changed} onClick={()=>run({action:'instellen',settings:draft,version:data.version},'Opgeslagen. De bestelapp volgt het binnen een halve minuut.')}>Opslaan</button>
   {changed&&<button type="button" className="btn secondary" disabled={busy} onClick={()=>setDraft(data.settings)}>Annuleren</button>}</div>
 </div>;
}

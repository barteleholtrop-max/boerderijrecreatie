'use client';
// Op het werkplekscherm (wens eigenaar 14 november 2026): met één tik „Nu niet beschikbaar” (bijvoorbeeld geen kok vandaag) en
// weer terug. En (wens eigenaar 15 november 2026: „wel mooi als de werkplek ook tijden kan invullen”) via ⏰ Tijden de tijden
// van deze werkplek: altijd open, volgens de openingstijden, eigen tijden of gesloten, en niet beschikbaar tot een gekozen tijd.
import {useCallback,useEffect,useState} from 'react';
import {STATION_NAMES,type StationId,type StationRule,type StationStatus,type StationSettings} from '@/lib/station-open-core';
import {StationRuleFields,todayAt,endOfDay,timeOf} from './station-rule-fields';
type Data={settings:StationSettings;version:number;status:Record<StationId,StationStatus>};
export function StationOpenToggle({station}:{station:StationId}){
 const [data,setData]=useState<Data|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [open,setOpen]=useState(false),[draft,setDraft]=useState<StationRule|null>(null),[until,setUntil]=useState(''),[msg,setMsg]=useState('');
 const load=useCallback(async()=>{try{const r=await fetch('/api/werkplek/open',{cache:'no-store'});if(r.ok)setData(await r.json() as Data)}catch{}},[]);
 useEffect(()=>{void load();const t=setInterval(()=>{if(!document.hidden)void load()},30000);return()=>clearInterval(t)},[load]);
 if(!data)return null;
 const rule=data.settings[station],paused=!!rule.paused,status=data.status[station],name=STATION_NAMES[station].name;
 async function post(body:unknown,ok=''){
  setBusy(true);setError('');setMsg('');
  try{const r=await fetch('/api/werkplek/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Dat lukte niet.');await load();setMsg(ok);return true}
  catch(e){setError((e as Error).message);return false}finally{setBusy(false)}
 }
 async function toggle(){
  if(!paused&&!window.confirm('Nu niet beschikbaar voor gasten?\n\nGasten kunnen de producten van deze werkplek dan vandaag niet meer bestellen in de bestelapp. Je kunt hem altijd weer aanzetten.'))return;
  await post({action:'pauze',station,paused:!paused,...(paused?{}:{until:endOfDay()})});
 }
 const edit=()=>{setDraft(rule);setUntil('');setMsg('');setError('');setOpen(true)};
 const changed=!!draft&&JSON.stringify({...draft,paused:null})!==JSON.stringify({...rule,paused:null});
 return <>
  <button type="button" className={'kiosk-btn '+(paused?'dicht':'soft')} disabled={busy} onClick={toggle} aria-pressed={paused}
   title={paused?'Tik om weer open te gaan voor gasten':'Tik als gasten nu niets bij deze werkplek kunnen bestellen'}>
   {paused?'⛔ Niet beschikbaar · weer openen':status.open?'🟢 Open voor bestellingen':'🌙 Dicht volgens de tijden'}</button>
  <button type="button" className="kiosk-btn soft" onClick={edit} aria-expanded={open}>⏰ Tijden</button>
  {error&&!open&&<span className="kiosk-error" role="alert">{error}</span>}
  {open&&draft&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}><section className="drawer station-open" role="dialog" aria-modal="true" aria-label={`Tijden ${name}`}>
   <div className="drawer-top"><div><div className="eyebrow">WERKPLEK {name.toUpperCase()}</div><h2>Wanneer kunnen gasten bestellen?</h2></div><button type="button" className="close" aria-label="Sluiten" onClick={()=>setOpen(false)}>×</button></div>
   <p className="small">Nu: <b>{paused?'niet beschikbaar':status.open?'open':'dicht'}</b>{rule.paused?.until?` (tot ${timeOf(rule.paused.until)})`:paused?' (tot iemand hem weer aanzet)':''}.</p>
   {msg&&<div className="message" role="status">{msg}</div>}{error&&<div className="message" role="alert">{error}</div>}
   <StationRuleFields id={station} rule={draft} onChange={patch=>setDraft(d=>d?{...d,...patch}:d)}/>
   <button type="button" className="btn" disabled={busy||!changed} onClick={async()=>{await post({action:'werkplek',station,rule:draft,version:data.version},'Tijden opgeslagen. De bestelapp volgt het binnen een halve minuut.')}}>Tijden opslaan</button>
   <div className="station-pause">
    <p className="small"><b>Even niet beschikbaar</b></p>
    {paused?<button type="button" className="btn secondary sm" disabled={busy} onClick={()=>post({action:'pauze',station,paused:false},`${name} is weer open voor bestellingen.`)}>Weer beschikbaar</button>
    :<><button type="button" className="btn secondary sm" disabled={busy} onClick={()=>post({action:'pauze',station,paused:true,until:endOfDay()},`${name} is vandaag niet beschikbaar.`)}>Rest van vandaag</button>
     <span className="station-until"><input className="input" type="time" aria-label="Niet beschikbaar tot" value={until} onChange={e=>setUntil(e.target.value)}/>
      <button type="button" className="btn secondary sm" disabled={busy||!until} onClick={()=>post({action:'pauze',station,paused:true,until:todayAt(until)},`${name} is niet beschikbaar tot ${until}.`)}>Tot deze tijd</button></span></>}
   </div>
  </section></div>}
 </>;
}

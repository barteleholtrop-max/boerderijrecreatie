'use client';
// Magazijn (wens eigenaar 8 november 2026): wat het personeel op de tablet als „Bijna op” of „Op” heeft gemeld, voor Rianne.
// Staat bij Vandaag & taken en bij Inkoop → In te kopen deze week. „Besteld” houdt de melding zichtbaar tot er weer voorraad
// bij komt; „Afgehandeld” haalt hem weg (bijvoorbeeld: toch nog genoeg). Regels: lib/warehouse-core.ts.
import {useCallback,useEffect,useState} from 'react';
import {Pill} from './ui';
import {REQUEST_STATUS,type OpenRequest,type RequestStatus} from '@/lib/warehouse-core';

const UNIT={st:'stuks',kg:'kg',l:'liter'} as Record<string,string>;
const nice=(d:string)=>d?new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z')):'';
const remembered=()=>{try{return localStorage.getItem('bb-inkoop-wie')||''}catch{return ''}};
const remember=(v:string)=>{try{localStorage.setItem('bb-inkoop-wie',v)}catch{}};

export function MagazijnMeldingen({compact=false}:{compact?:boolean}){
 const [requests,setRequests]=useState<OpenRequest[]|null>(null),[version,setVersion]=useState(0),[count,setCount]=useState(0);
 const [who,setWho]=useState(''),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const load=useCallback(async()=>{const r=await fetch('/api/operations?magazijn=1',{cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok){setError(d.error||'Het magazijn kon niet worden geladen.');return}
  setRequests(d.requests);setVersion(d.version);setCount(d.items.length);setError('')},[]);
 useEffect(()=>{setWho(remembered());void load()},[load]);
 async function mark(r:OpenRequest,status:RequestStatus){
  if(!who.trim()){setError('Vul in wie dit afhandelt.');return}
  setBusy(r.ingredientId+status);setError('');
  try{const res=await fetch('/api/operations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'magazijn-melding',requestId:crypto.randomUUID(),version,ingredientId:r.ingredientId,status,by:who.trim()})});
   const d=await res.json().catch(()=>({}));if(!res.ok)throw Error(res.status===409?'Er is net iets anders opgeslagen. Ververst: probeer het nog een keer.':d.error||'Opslaan lukte niet.');}
  catch(e){setError(e instanceof Error?e.message:'Opslaan lukte niet.')}finally{setBusy('');await load()}}
 return <div className="card" data-bb-view="magazijn-meldingen">
  <div className="card-head"><h3 className="card-title">Magazijn: bijbestellen</h3><Pill color="orange">{requests?requests.filter(r=>r.status!=='besteld').length+' te bestellen':'…'}</Pill></div>
  {!compact&&<p className="ops-note">Gemeld op de tablet (Werkplek → Voorraad → Magazijn). Gasten zien het magazijn nooit.</p>}
  {error&&<div role="alert" className="message">{error}</div>}
  {requests&&requests.length>0&&<label className="ops-inline">Wie handelt af?<input value={who} maxLength={40} placeholder="Je naam" onChange={e=>{setWho(e.target.value);remember(e.target.value)}}/></label>}
  {requests?.map(r=><div className="task" key={r.ingredientId}><div className="task-dot">{r.status==='op'?'🔴':r.status==='bijna-op'?'🟠':'🚚'}</div>
   <div className="task-body"><strong>{r.name} · {r.status==='besteld'?'besteld':REQUEST_STATUS[r.reportedStatus].toLowerCase()}</strong>
    <span>Gemeld door {r.reportedBy} op {nice(r.reportedDate)} · voorraad {r.known?r.stock+' '+(UNIT[r.unit]||r.unit):'onbekend'}{r.min?`, minimum ${r.min}`:''}{r.supplier?` · ${r.supplier}`:''}{r.status==='besteld'?` · besteld${r.orderedBy?' door '+r.orderedBy:''} op ${nice(r.orderedDate)}`:''}{r.note?` · „${r.note}”`:''}</span></div>
   {r.status!=='besteld'&&<button type="button" className="btn secondary sm" disabled={!!busy} onClick={()=>mark(r,'besteld')}>Besteld</button>}
   <button type="button" className="btn secondary sm" disabled={!!busy} onClick={()=>mark(r,'afgehandeld')} title="Weghalen zonder levering, bijvoorbeeld omdat er toch genoeg is">Afgehandeld</button></div>)}
  {requests&&!requests.length&&<div className="empty">{count?'Niets gemeld vanuit het magazijn.':'Nog geen magazijnartikelen. Zet ze bij Inkoop & voorraad → Ingrediënten op soort „Magazijn”.'}</div>}
 </div>;
}

'use client';
// Overleggen met gasten (wens eigenaar 9 november 2026): notities en actiepunten bij een bezoek of gesprek, met als
// vervolg een optie in Planning (houdt de plek vast tot de vervaldatum) en een offerte. Regels in lib/meetings.ts.
import {useState} from 'react';
import Link from 'next/link';
import type {GuestState} from '@/lib/guest-core';
import type {CustomerCard} from '@/lib/guest-customers';
import {openActions,byDate,optionExpiry,type Meeting,type MeetingAction} from '@/lib/meetings';
import {dayLabel} from '@/lib/day-label';
import {Pill} from '../ui';
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date());
const nowTime=()=>new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',hour:'2-digit',minute:'2-digit'}).format(new Date());
type Act=(body:Record<string,unknown>)=>Promise<unknown>;
export type MeetingDraft=Omit<Meeting,'rev'|'reservationId'|'quoteId'|'created'|'createdBy'|'updated'|'updatedBy'>&{rev?:number};
export function newMeeting(customerId='',cards:CustomerCard[]=[]):MeetingDraft{
 const card=cards.find(c=>c.id===customerId);
 return {id:crypto.randomUUID(),date:today(),from:nowTime(),subject:'',customerId:card?.id||'',customerName:card?.name||'',attendees:'',notes:'',actions:[]};
}

/** Lijst met overleggen; open actiepunten staan erbij zodat niets blijft liggen. */
export function MeetingList({state,cards,selected,onOpen}:{state:GuestState;cards:CustomerCard[];selected?:string;onOpen:(m:Meeting)=>void}){
 const list=(state.meetings||[]).slice().sort(byDate),open=list.reduce((n,m)=>n+openActions(m).length,0);
 return <section className="card section-gap"><div className="card-head"><h3 className="card-title">Klantafspraken</h3><span className="small">{list.length} {list.length===1?'klantafspraak':'klantafspraken'}{open?` · ${open} open ${open===1?'actiepunt':'actiepunten'}`:''}</span></div>
  {!list.length?<p className="empty">Nog geen klantafspraken. Leg met „+ Klantafspraak” vast wat je met gasten bespreekt: notities, actiepunten, een optie in Planning en een offerte.</p>:
  <div className="quote-list">{list.slice(0,30).map(m=>{const card=cards.find(c=>c.id===m.customerId),todo=openActions(m),r=state.reservations.find(x=>x.id===m.reservationId),q=(state.quotes||[]).find(x=>x.id===m.quoteId);
   return <button className={'quote-row quote-row-button'+(selected===m.id?' selected':'')} key={m.id} onClick={()=>onOpen(m)}>
    <div className="quote-date"><span>{dayLabel(m.date).split(' ')[0]}</span><b>{Number(m.date.slice(8))}</b><span>{new Intl.DateTimeFormat('nl-NL',{month:'short',timeZone:'UTC'}).format(new Date(m.date+'T12:00:00Z'))}</span></div>
    <div className="quote-main"><strong>{m.subject}</strong><span>{card?.name||m.customerName}{m.attendees?' · '+m.attendees:''}</span>{todo.length>0&&<span className="quote-note">Open: {todo.slice(0,3).map(a=>a.text+(a.who?` (${a.who})`:'')).join(' · ')}{todo.length>3?` en nog ${todo.length-3}`:''}</span>}</div>
    <div className="quote-status">{todo.length>0?<Pill color="orange">{todo.length} open</Pill>:m.actions.length>0?<Pill color="green">Alles gedaan</Pill>:null}{r&&<Pill color={r.status==='geannuleerd'?'red':r.status==='bevestigd'?'green':'blue'}>{r.status==='optie'?'Optie':r.status}</Pill>}{q&&<Pill color="purple">{q.number}</Pill>}</div>
   </button>})}</div>}
 </section>;
}

export function MeetingEditor({draft,saved,state,cards,can,busy,act,onSaved,onClose,onMessage}:{draft:MeetingDraft;saved?:Meeting;state:GuestState;cards:CustomerCard[];can:boolean;busy:boolean;act:Act;onSaved:(id:string)=>void;onClose:()=>void;onMessage:(m:string)=>void}){
 const [m,setM]=useState<MeetingDraft>(draft),[newAction,setNewAction]=useState({text:'',who:'',due:''}),[dirty,setDirty]=useState(!saved);
 const set=(patch:Partial<MeetingDraft>)=>{setM(v=>({...v,...patch}));setDirty(true)};
 const setAction=(id:string,patch:Partial<MeetingAction>)=>set({actions:m.actions.map(a=>a.id===id?{...a,...patch}:a)});
 const card=cards.find(c=>c.id===m.customerId),r=saved?.reservationId?state.reservations.find(x=>x.id===saved.reservationId):undefined,q=saved?.quoteId?(state.quotes||[]).find(x=>x.id===saved.quoteId):undefined;
 const [option,setOption]=useState({date:'',from:'10:00',to:'13:00',people:'',activity:'groep' as 'groep'|'bezoek',expires:''});
 async function save(close=false){
  const pending=newAction.text.trim()?[...m.actions,{id:crypto.randomUUID(),text:newAction.text.trim(),who:newAction.who.trim(),due:newAction.due,done:false}]:m.actions;
  try{await act({action:'meeting',meeting:{...m,actions:pending,rev:saved?.rev}});setM(v=>({...v,actions:pending}));setNewAction({text:'',who:'',due:''});setDirty(false);onMessage('Klantafspraak opgeslagen.');onSaved(m.id);if(close)onClose();return true}catch{return false}
 }
 async function makeOption(){
  const wasDirty=dirty;if(wasDirty&&!await save())return;
  const expires=option.expires?new Date(option.expires+'T21:00:00Z').toISOString():optionExpiry(option.date);
  try{await act({action:'meeting-option',id:m.id,rev:wasDirty?undefined:saved?.rev,option:{date:option.date,from:option.from,to:option.to,people:Number(option.people),activity:option.activity,expires}});onMessage('Optie gezet in Planning. De plek blijft vastgehouden tot '+new Date(expires).toLocaleDateString('nl-NL',{day:'numeric',month:'long'})+'.')}catch{}
 }
 const quoteHref='/offertes?nieuw=1&uitoverleg='+encodeURIComponent(m.id)+(m.customerId?'&klant='+encodeURIComponent(m.customerId):'')+(r?'&reservering='+encodeURIComponent(r.id):'');
 return <section className="card section-gap meeting-editor" id="overleg-editor" aria-label="Overleg">
  <div className="card-head"><h3 className="card-title">{saved?'Klantafspraak: '+saved.subject:'Nieuwe klantafspraak'}</h3><button className="btn secondary sm" onClick={onClose}>Sluiten</button></div>
  <form className="guest-form" onSubmit={e=>{e.preventDefault();void save()}}>
   <label>Onderwerp<input value={m.subject} onChange={e=>set({subject:e.target.value})} required maxLength={200} placeholder="Bijvoorbeeld: kennismaking teamuitje" disabled={!can}/></label>
   <label>Datum<input type="date" value={m.date} onChange={e=>set({date:e.target.value})} required disabled={!can}/></label>
   <label>Tijd<input type="time" value={m.from} onChange={e=>set({from:e.target.value})} disabled={!can}/></label>
   <label>Klant<select value={m.customerId} onChange={e=>{const c=cards.find(x=>x.id===e.target.value);set({customerId:c?.id||'',customerName:c?.name||m.customerName})}} disabled={!can}><option value="">— nieuwe gast (naam hieronder) —</option>{cards.slice().sort((a,b)=>a.name.localeCompare(b.name,'nl')).map(c=><option key={c.id} value={c.id}>{c.name}{c.company?' · '+c.company:''}</option>)}</select></label>
   {!m.customerId&&<label>Naam gast<input value={m.customerName} onChange={e=>set({customerName:e.target.value})} maxLength={300} placeholder="Naam van de gast of organisatie" disabled={!can}/></label>}
   <label>Aanwezig<input value={m.attendees} onChange={e=>set({attendees:e.target.value})} maxLength={500} placeholder="Wie zaten er aan tafel?" disabled={!can}/></label>
   <label className="meeting-notes">Notities<textarea value={m.notes} onChange={e=>set({notes:e.target.value})} maxLength={10000} rows={8} placeholder="Wat is er besproken? Wensen, aantallen, datum, budget, bijzonderheden…" disabled={!can}/></label>
  </form>
  <h4>Actiepunten</h4>
  <div className="meeting-actions">{m.actions.map(a=><div className={'meeting-action'+(a.done?' done':'')} key={a.id}>
   <input type="checkbox" checked={a.done} onChange={e=>setAction(a.id,{done:e.target.checked})} aria-label={'Gedaan: '+a.text} disabled={!can}/>
   <input value={a.text} onChange={e=>setAction(a.id,{text:e.target.value})} maxLength={300} aria-label="Actiepunt" disabled={!can}/>
   <input value={a.who} onChange={e=>setAction(a.id,{who:e.target.value})} maxLength={100} placeholder="Wie" aria-label="Wie" disabled={!can}/>
   <input type="date" value={a.due} onChange={e=>setAction(a.id,{due:e.target.value})} aria-label="Uiterlijk" disabled={!can}/>
   {can&&<button className="btn secondary sm" onClick={()=>set({actions:m.actions.filter(x=>x.id!==a.id)})} aria-label={'Verwijder '+a.text}>×</button>}</div>)}
   {can&&<div className="meeting-action new"><span aria-hidden>+</span><input value={newAction.text} onChange={e=>{setNewAction({...newAction,text:e.target.value});setDirty(true)}} maxLength={300} placeholder="Nieuw actiepunt" aria-label="Nieuw actiepunt"
    onKeyDown={e=>{if(e.key==='Enter'&&newAction.text.trim()){e.preventDefault();set({actions:[...m.actions,{id:crypto.randomUUID(),text:newAction.text.trim(),who:newAction.who.trim(),due:newAction.due,done:false}]});setNewAction({text:'',who:'',due:''})}}}/>
    <input value={newAction.who} onChange={e=>setNewAction({...newAction,who:e.target.value})} maxLength={100} placeholder="Wie" aria-label="Wie (nieuw)"/><input type="date" value={newAction.due} onChange={e=>setNewAction({...newAction,due:e.target.value})} aria-label="Uiterlijk (nieuw)"/></div>}
   {!m.actions.length&&!can&&<p className="small">Geen actiepunten.</p>}
  </div>
  {can&&<div className="guest-form-actions"><button className="btn" disabled={busy} onClick={()=>void save()}>Klantafspraak opslaan</button>{saved&&<button className="btn red sm" disabled={busy} onClick={async()=>{if(!confirm('Dit overleg verwijderen? Een optie in Planning en een offerte blijven bestaan.'))return;try{await act({action:'meeting-delete',id:saved.id});onMessage('Klantafspraak verwijderd.');onClose()}catch{}}}>Verwijderen</button>}{dirty&&saved&&<span className="small">Niet opgeslagen wijzigingen</span>}</div>}

  {saved&&<div className="meeting-next">
   <div className="meeting-step"><h4>Als optie in Planning</h4>
    {r&&r.status!=='geannuleerd'?<div className="task"><div className="task-body"><strong>{dayLabel(r.date)} · {r.from}–{r.to} · {r.people} personen</strong><span>{r.status==='optie'?'Optie, vastgehouden tot '+new Date(r.expires).toLocaleDateString('nl-NL',{day:'numeric',month:'long'}):r.status}</span></div><Link className="btn secondary sm" href={'/planning?reservering='+encodeURIComponent(r.id)}>Open in Planning</Link></div>
    :can?<><p className="small">Een optie houdt de plek vast tot de vervaldatum (standaard 14 dagen, uiterlijk de dag zelf). Bevestigen doe je later in Planning.</p>
     <div className="guest-form meeting-option">
      <label>Datum<input type="date" value={option.date} min={today()} onChange={e=>setOption({...option,date:e.target.value})}/></label>
      <label>Van<input type="time" value={option.from} onChange={e=>setOption({...option,from:e.target.value})}/></label>
      <label>Tot<input type="time" value={option.to} onChange={e=>setOption({...option,to:e.target.value})}/></label>
      <label>Personen<input type="number" min={1} max={1000} value={option.people} onChange={e=>setOption({...option,people:e.target.value})}/></label>
      <label>Soort<select value={option.activity} onChange={e=>setOption({...option,activity:e.target.value as 'groep'|'bezoek'})}><option value="groep">Groep</option><option value="bezoek">Boerderijbezoek</option></select></label>
      <label>Vervalt op<input type="date" value={option.expires} min={today()} max={option.date||undefined} onChange={e=>setOption({...option,expires:e.target.value})} placeholder="over 14 dagen"/></label>
      <button className="btn secondary" disabled={busy||!option.date||!(Number(option.people)>0)||option.from>=option.to} onClick={()=>void makeOption()}>Zet als optie</button>
     </div></>:<p className="small">Nog geen optie.</p>}
   </div>
   <div className="meeting-step"><h4>Offerte</h4>
    {q?<div className="task"><div className="task-body"><strong>{q.number} · {q.title}</strong><span>{q.status}</span></div><Link className="btn secondary sm" href={'/offertes?offerte='+encodeURIComponent(q.id)}>Open offerte</Link></div>
    :can?<><p className="small">{r?'De klant, datum en het aantal personen van de optie gaan mee in het concept.':'De klant en het onderwerp gaan mee in het concept. Zet eerst een optie als ook datum en aantal personen mee moeten.'}</p><Link className="btn secondary" href={quoteHref} onClick={()=>{try{sessionStorage.setItem('offerte-overleg',JSON.stringify({id:m.id,subject:m.subject,notes:m.notes}))}catch{}}}>Offerte maken</Link></>:<p className="small">Nog geen offerte.</p>}
   </div>
   {card&&<p className="small">Klantenkaart: <Link href={'/gesprekken?tab=klanten&klant='+encodeURIComponent(card.id)}>{card.name}</Link></p>}
  </div>}
 </section>;
}

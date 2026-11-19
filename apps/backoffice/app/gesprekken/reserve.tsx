'use client';
import {useState} from 'react';
import Link from 'next/link';
import {call} from './mail';
import {dayLabel} from '@/lib/day-label';
import type {BookingSuggestion} from '@/lib/group-advice';
import {guessBooking} from '@/lib/booking-guess';
import type {Reservation} from '@/lib/guest-core';
import {openRequest} from '@/lib/reserve-update';

// Reserve date and time in the agenda straight from a conversation (wish owner, 3 November 2026).
// The same planning rules as Planning apply (opening hours, day parts, capacity); an option holds the place until it expires.
type Status='optie'|'aanvraag'|'bevestigd';
type Alternative={date:string;from:string;to:string};
const plusDays=(n:number)=>{const d=new Date();d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)};
const STATUS_LABEL:Record<Status,string>={optie:'Optie: houdt de plek vast tot de vervaldatum',aanvraag:'Aanvraag: houdt nog niets vast',bevestigd:'Bevestigd: definitieve reservering'};

export function ReserveForm({threadRef,name,email,customerId,suggestion,wishes,texts=[],onSaved}:{threadRef:string;name:string;email:string;customerId:string;suggestion?:BookingSuggestion|null;wishes?:string;texts?:string[];onSaved:()=>void}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[problem,setProblem]=useState(''),[done,setDone]=useState<{id:string;text:string}|null>(null),[alternatives,setAlternatives]=useState<Alternative[]>([]);
 const empty={activity:'groep',date:'',from:'',to:'',people:'',status:'optie' as Status,expires:plusDays(7),name,email,notes:(wishes||'').split('\n')[0].slice(0,500)};
 const [f,setF]=useState(empty),[source,setSource]=useState(''),[existing,setExisting]=useState<Reservation|null>(null);
 const set=(k:keyof typeof f)=>(e:{target:{value:string}})=>setF({...f,[k]:e.target.value});
 async function start(){
  // Per conversation: the advice's suggestion first, otherwise what the guest's mail and the advice clearly say (no AI).
  const g=guessBooking(texts,plusDays(0)),found=[g.date&&'datum',g.from&&'tijd',g.people&&'aantal'].filter(Boolean);
  // Een open aanvraag of optie bij dit gesprek wordt bijgewerkt, niet verdubbeld (wens eigenaar 3 november 2026).
  let open:Reservation|null=null;try{open=openRequest((await call<{state:{reservations:Reservation[]}}>('/api/gasten')).state.reservations,threadRef)}catch{}
  setExisting(open);
  setSource(suggestion?'Vooraf ingevuld met het voorstel uit het advies. Controleer en pas aan waar nodig.':open?'Vooraf ingevuld met de open aanvraag. Controleer en pas aan waar nodig.':found.length?`Vooraf ingevuld uit de mail en het advies (${found.join(', ')}). Controleer en pas aan waar nodig.`:'');
  setF({...empty,...(g.date?{date:g.date}:{}),...(g.from?{from:g.from,to:g.to!}:{}),...(g.people?{people:String(g.people)}:{}),
   ...(open?{activity:open.activity,date:open.date,from:open.from,to:open.to,people:String(open.people),name:open.name||empty.name,email:open.email||empty.email,notes:open.notes||empty.notes,status:open.status==='aanvraag'?'optie' as Status:open.status as Status}:{}),
   ...(suggestion?{activity:suggestion.activity,date:suggestion.date,from:suggestion.from,to:suggestion.to,people:String(suggestion.people)}:{})});
  setOpen(true);setProblem('');setDone(null);setAlternatives([]);
 }
 function reservation(){
  const fresh={id:crypto.randomUUID(),name:f.name.trim()||'Gast',email:f.email.trim(),phone:'',activity:f.activity,date:f.date,from:f.from,to:f.to,people:Number(f.people),sharing:false,status:f.status,
   // An option holds the place until the end of the chosen day (Amsterdam time is close enough for a day-level expiry).
   expires:f.status==='optie'?new Date(f.expires+'T23:59:00').toISOString():'',notes:f.notes,threadId:threadRef,tables:[] as string[],...(customerId?{customerId}:{})};
  // Bestaat er al een open aanvraag of optie bij dit gesprek, dan wordt die bijgewerkt (zelfde ID en versie, tafels blijven).
  return existing?{...existing,...fresh,id:existing.id,tables:existing.tables,phone:existing.phone,sharing:existing.sharing,...(existing.customerId&&!customerId?{customerId:existing.customerId}:{})}:fresh;
 }
 async function save(e:React.FormEvent){
  e.preventDefault();setBusy(true);setProblem('');setAlternatives([]);
  const r=reservation();
  try{
   const {version}=await call<{version:number}>('/api/gasten');
   await call('/api/gasten',{action:'reservation',version,requestId:crypto.randomUUID(),reservation:r});
   setDone({id:r.id,text:`${existing?'Bijgewerkt (geen tweede aanvraag). ':''}${f.status==='optie'?'Optie vastgelegd tot en met '+dayLabel(f.expires):f.status==='aanvraag'?'Aanvraag vastgelegd':'Reservering bevestigd'}: ${dayLabel(f.date)} ${f.from}–${f.to}, ${f.people} personen.`});
   setOpen(false);onSaved();
  }catch(err){
   setProblem((err as Error).message);
   // Full or closed: offer up to three other dates; nothing is held until one is saved.
   try{const v=await call<{alternatives:Alternative[]}>('/api/gasten',{action:'alternatives',version:(await call<{version:number}>('/api/gasten')).version,requestId:crypto.randomUUID(),reservation:{...r,status:'bevestigd',expires:''}});setAlternatives(v.alternatives||[])}catch{}
  }finally{setBusy(false)}
 }
 return <section id="reserveren" className="reserve-block" aria-label="Datum en tijd reserveren in agenda">
  {done&&<p className="message" role="status">{done.text} De reservering staat in Planning en is aan dit gesprek gekoppeld. <Link href={'/planning?reservering='+encodeURIComponent(done.id)}>Openen in Planning</Link></p>}
  {!open?<button type="button" className="btn sm" onClick={start}>📅 Datum en tijd reserveren in agenda</button>
  :<form className="guest-form reserve-form" onSubmit={save}>
   <h4>Datum en tijd reserveren in agenda</h4>
   {existing&&<p className="small"><b>Er staat al een {existing.status} bij dit gesprek</b> ({dayLabel(existing.date)} {existing.from}–{existing.to}, {existing.people} personen). Opslaan werkt die bij, er komt geen tweede in de agenda.</p>}
   <p className="small">{source||'Vul datum, tijd en aantal in.'} Openingstijden, tijdblokken en capaciteit uit Planning worden gecontroleerd.</p>
   <div className="reserve-grid">
    <label>Soort<select value={f.activity} onChange={set('activity')}><option value="groep">Groep</option><option value="bezoek">Bezoek (daggasten)</option><option value="yte">Ite by Boer Bart</option></select></label>
    <label>Datum<input type="date" required value={f.date} onChange={set('date')}/></label>
    <label>Van<input type="time" required value={f.from} onChange={set('from')}/></label>
    <label>Tot<input type="time" required value={f.to} onChange={set('to')}/></label>
    <label>Aantal personen<input type="number" min={1} max={1000} required value={f.people} onChange={set('people')}/></label>
    <label>Status<select value={f.status} onChange={set('status')}>{(Object.keys(STATUS_LABEL) as Status[]).map(s=><option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></label>
    {f.status==='optie'&&<label>Optie geldig tot en met<input type="date" required min={plusDays(0)} value={f.expires} onChange={set('expires')}/></label>}
    <label>Naam op de reservering<input required maxLength={300} value={f.name} onChange={set('name')}/></label>
    <label>E-mail<input type="email" maxLength={300} value={f.email} onChange={set('email')}/></label>
   </div>
   <label>Notitie (wat ze komen doen)<textarea rows={2} maxLength={5000} value={f.notes} onChange={set('notes')}/></label>
   {problem&&<p className="message error" role="alert">{problem}</p>}
   {alternatives.length>0&&<div><p className="small">Andere mogelijkheden (nog niets vastgelegd):</p><div className="actions">{alternatives.map(a=><button type="button" key={a.date} className="btn secondary sm" onClick={()=>{setF({...f,date:a.date,from:a.from,to:a.to});setAlternatives([]);setProblem('')}}>{dayLabel(a.date)} {a.from}–{a.to}</button>)}</div></div>}
   <div className="actions"><button className="btn sm" disabled={busy}>{busy?'Bezig…':f.status==='optie'?'Optie vastleggen':f.status==='aanvraag'?'Aanvraag vastleggen':'Reservering bevestigen'}</button><button type="button" className="btn secondary sm" disabled={busy} onClick={()=>setOpen(false)}>Annuleren</button></div>
   <p className="small">Er wordt geen mail verstuurd. Een optie of aanvraag komt als concept in de gekoppelde Google Agenda; een bevestigde reservering zet de dagelijkse taak erin.</p>
  </form>}
 </section>;
}

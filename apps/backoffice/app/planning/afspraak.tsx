'use client';
// Afspraken met klanten (wens eigenaar 9 november 2026), bijvoorbeeld een kennismakingsgesprek. Geen boeking: houdt geen plaats
// vast en is geen optie of offerte. De Backoffice-assistent kan er een klaarzetten; hier zie, maak en verwijder je ze zelf.
import {useState} from 'react';
import {today,type GuestState,type Appointment} from '@/lib/guest-core';
import {customerCards} from '@/lib/guest-customers';
const nice=(d:string)=>new Intl.DateTimeFormat('nl-NL',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));
const later=(t:string,m:number)=>{const x=Math.min(23*60+59,Number(t.slice(0,2))*60+Number(t.slice(3,5))+m);return String(Math.floor(x/60)).padStart(2,'0')+':'+String(x%60).padStart(2,'0')};
/** start: dag en tijd uit een klik in de weekagenda (9 november 2026); een nieuwe afspraak duurt dan standaard een half uur.
 *  klant: vanaf de klantenkaart (wens eigenaar 13 november 2026) staat de klant al ingevuld. */
export function AfspraakPaneel({state,id,act,busy,onClose,start,klant}:{state:GuestState;id:string;act:(b:Record<string,unknown>)=>Promise<unknown>;busy:boolean;onClose:()=>void;start?:{date:string;from:string};klant?:{id:string;name:string}}){
 const a=(state.appointments||[]).find(x=>x.id===id)||null,cards=customerCards(state);
 const [form,setForm]=useState<Appointment>(()=>a?{...a}:{id:crypto.randomUUID(),date:start?.date||today(),from:start?.from||'10:00',to:start?later(start.from,30):'10:30',subject:'Kennismakingsgesprek',customerId:klant?.id||'',customerName:klant?.name||'',notes:'',created:'',createdBy:''});
 const [error,setError]=useState('');
 async function run(b:Record<string,unknown>){setError('');try{await act(b);onClose()}catch(e){setError(e instanceof Error?e.message:'Dat lukte niet.')}}
 return <section className="card section-gap" id="afspraak" aria-label="Afspraak"><div className="row between"><h3 className="card-title">{a?'Afspraak':'Nieuwe afspraak'}</h3><button type="button" className="btn secondary sm" onClick={onClose}>Sluiten</button></div>
  {a&&<p className="small">{nice(a.date)} · {a.from}–{a.to}{a.createdBy?' · gemaakt door '+a.createdBy:''}</p>}
  <form className="form-grid" onSubmit={e=>{e.preventDefault();void run({action:'appointment',appointment:form})}}>
   <label>Onderwerp<input value={form.subject} maxLength={200} onChange={e=>setForm({...form,subject:e.target.value})}/></label>
   <label>Datum<input type="date" min={a?undefined:today()} value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></label>
   <label>Van<input type="time" value={form.from} onChange={e=>setForm({...form,from:e.target.value})}/></label>
   <label>Tot<input type="time" value={form.to} onChange={e=>setForm({...form,to:e.target.value})}/></label>
   <label>Klant<select value={form.customerId} onChange={e=>{const c=cards.find(c=>c.id===e.target.value);setForm({...form,customerId:c?.id||'',customerName:c?.name||''})}}><option value="">Geen klantenkaart</option>{cards.map(c=>{const label=c.name+(c.email?' · '+c.email:'');return <option key={c.id} value={c.id}>{label}</option>})}</select></label>
   <label>Notitie<textarea rows={3} maxLength={2000} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
   <div className="row"><button className="btn" disabled={busy}>Opslaan</button>{a&&<button type="button" className="btn secondary" disabled={busy} onClick={()=>{if(confirm('Deze afspraak verwijderen?'))void run({action:'appointment-delete',id:a.id})}}>Verwijderen</button>}</div>
  </form>{error&&<p className="mail-error" role="alert">{error}</p>}
  <p className="small">Een afspraak is geen boeking: hij houdt geen plaats vast. Staat er een Klanten-agenda gekoppeld, dan komt hij daar ook in.</p></section>;
}

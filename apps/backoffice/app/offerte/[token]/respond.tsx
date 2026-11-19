'use client';
// Online akkoord of een wijziging vragen (wens eigenaar 5 november 2026). Akkoord geldt voor precies deze versie.
import {useState} from 'react';
const money=(c:number)=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(c/100);
const when=(d:string)=>new Intl.DateTimeFormat('nl-NL',{dateStyle:'long',timeStyle:'short',timeZone:'Europe/Amsterdam'}).format(new Date(d));
type Props={token:string;rev:number;totalCents:number;name:string;problem:string;accepted:{at:string;name:string}|null;question:{at:string}|null};
export function Respond(p:Props){
 const [mode,setMode]=useState<''|'akkoord'|'vraag'>(''),[name,setName]=useState(p.name),[message,setMessage]=useState(''),[agree,setAgree]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [done,setDone]=useState<{kind:'akkoord'|'vraag';at:string;name:string}|null>(p.accepted?{kind:'akkoord',...p.accepted}:p.question?{kind:'vraag',at:p.question.at,name:''}:null);
 async function send(){setBusy(true);setError('');try{const r=await fetch('/api/public/offerte/'+encodeURIComponent(p.token),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:mode,rev:p.rev,name,message,agree:mode==='akkoord'?agree:undefined})}),d=await r.json();if(!r.ok)throw Error(d.error||'Dat lukt nu niet.');setDone({kind:mode as 'akkoord'|'vraag',at:new Date().toISOString(),name});if(mode==='akkoord')setTimeout(()=>location.reload(),1500)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 if(done?.kind==='akkoord')return <section className="quote-respond done no-print" role="status"><h2>Akkoord gegeven</h2><p>{done.name?`${done.name} heeft `:'Je hebt '}deze offerte geaccepteerd op {when(done.at)}. Dank je wel! We nemen contact met je op om de afspraak vast te leggen.</p></section>;
 if(p.problem)return <section className="quote-respond no-print"><p>{p.problem}</p></section>;
 return <section className="quote-respond no-print" aria-label="Reageren op de offerte">
  {done?.kind==='vraag'&&<p className="quote-respond-note" role="status">Je vraag is bij ons binnen. We passen de offerte aan en laten het je weten.</p>}
  <h2>Wat vind je van dit voorstel?</h2>
  {!mode&&<div className="quote-respond-actions"><button className="btn" onClick={()=>setMode('akkoord')}>Akkoord geven</button><button className="btn secondary" onClick={()=>setMode('vraag')}>Ik wil iets aanpassen</button></div>}
  {mode&&<div className="quote-respond-form">
   <label>Je naam<input value={name} maxLength={120} autoComplete="name" onChange={e=>setName(e.target.value)}/></label>
   {mode==='vraag'&&<label>Wat wil je aanpassen?<textarea rows={4} maxLength={2000} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Bijvoorbeeld: we komen met 20 personen, en graag een vegetarische lunch."/></label>}
   {mode==='akkoord'&&<label className="quote-respond-check"><input type="checkbox" checked={agree} onChange={e=>setAgree(e.target.checked)}/> Ik ga akkoord met deze offerte van {money(p.totalCents)} inclusief btw.</label>}
   {error&&<p className="message" role="alert">{error}</p>}
   <div className="quote-respond-actions"><button className="btn" disabled={busy||name.trim().length<2||(mode==='akkoord'&&!agree)||(mode==='vraag'&&message.trim().length<3)} onClick={send}>{busy?'Versturen…':mode==='akkoord'?'Akkoord geven':'Vraag versturen'}</button><button className="btn secondary" disabled={busy} onClick={()=>{setMode('');setError('')}}>Terug</button></div>
   {mode==='akkoord'&&<p className="small">Met je akkoord laat je weten dat je verder wilt met dit voorstel. We nemen contact met je op om de afspraak definitief te maken.</p>}
  </div>}
 </section>;
}

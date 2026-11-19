'use client';
// Opnieuw de code bij een gevoelige handeling (besluit eigenaar 6 november 2026). Antwoordt de server met „opnieuwCode”,
// dan vraagt dit venster de code uit de Authenticator-app, bevestigt die (/auth/opnieuw) en voert de handeling daarna
// nog één keer uit. Annuleren laat de handeling achterwege. Werkt voor elk scherm, zonder per scherm iets te bouwen.
// Stuurt een scherm de kopregel x-handeling mee (Bloei, 8 november 2026), dan toont het venster wat je precies bevestigt.
import {useEffect,useRef,useState} from 'react';
export function CodeOpnieuw(){
 const [open,setOpen]=useState(false),[what,setWhat]=useState(''),[code,setCode]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const waiting=useRef<Promise<boolean>|null>(null),settle=useRef<(ok:boolean)=>void>(()=>{}),orig=useRef<typeof fetch|null>(null);
 useEffect(()=>{
  const original=window.fetch.bind(window);orig.current=original;
  const ask=(description:string)=>{if(!waiting.current){waiting.current=new Promise<boolean>(res=>{settle.current=ok=>{waiting.current=null;setOpen(false);setCode('');setError('');setWhat('');res(ok)}});setWhat(description);setOpen(true)}return waiting.current};
  window.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
   const r=await original(input,init);if(r.status!==401)return r;
   let d:{opnieuwCode?:boolean}={};try{d=await r.clone().json()}catch{return r}
   if(!d.opnieuwCode)return r;
   let description='';try{description=decodeURIComponent(new Headers(init?.headers).get('x-handeling')||'').slice(0,300)}catch{}
   return await ask(description)?original(input,init):r;
  };
  return ()=>{window.fetch=original};
 },[]);
 async function submit(e:React.FormEvent){
  e.preventDefault();setBusy(true);setError('');
  try{const r=await (orig.current||fetch)('/auth/opnieuw',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:code.replace(/\s/g,'')})});
   const d=await r.json().catch(()=>({}));
   if(r.ok){settle.current(true);return}
   if(d.opnieuw){window.location.assign('/inloggen?terug='+encodeURIComponent(location.pathname));return}
   setError(String(d.error||'Er ging iets mis.'));setCode('');
  }catch{setError('Geen verbinding. Probeer het opnieuw.')}finally{setBusy(false)}
 }
 if(!open)return null;
 return <div className="code-again" role="dialog" aria-modal="true" aria-labelledby="code-again-titel">
  <form className="code-again-card login-form" onSubmit={submit}>
   <h2 id="code-again-titel">Bevestig met je code</h2>
   {what&&<p className="code-again-what"><strong>{what}</strong></p>}
   <p className="login-sub">{what?'Elke handeling met bezit of geld bevestig je met een nieuwe code. Open je Authenticator-app en vul de 6 cijfers van Boerderijrecreatie in.':'Dit is een gevoelige handeling. Open je Authenticator-app en vul de 6 cijfers van Boerderijrecreatie in.'}</p>
   {error&&<p className="login-msg fout" role="alert">{error}</p>}
   <label>Code uit de app<input className="login-code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required autoFocus value={code} onChange={e=>setCode(e.target.value)}/></label>
   <div className="action-row"><button className="login-primary" disabled={busy}>{busy?'Controleren…':'Bevestigen'}</button><button type="button" className="btn secondary" onClick={()=>settle.current(false)}>Annuleren</button></div>
  </form>
 </div>;
}

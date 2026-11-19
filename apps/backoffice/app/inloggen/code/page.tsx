'use client';
// Tweede stap: de code uit de Authenticator-app (besluit eigenaar 6 november 2026). De eerste keer: app koppelen met QR-code.
import {useEffect,useState} from 'react';
import {Brand,send} from '../brand';
type State={stap?:'code'|'koppelen';naam?:string;qr?:string;geheim?:string;error?:string;opnieuw?:boolean};
export default function Code(){
 const [s,setS]=useState<State|null>(null),[code,setCode]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[show,setShow]=useState(false);
 useEffect(()=>{fetch('/auth/code',{cache:'no-store'}).then(r=>r.json()).then(setS).catch(()=>setS({error:'Geen verbinding. Ververs de pagina.'}))},[]);
 async function submit(e:React.FormEvent){
  e.preventDefault();setError('');setBusy(true);
  try{const {ok,d}=await send('/auth/code',{code:code.replace(/\s/g,'')});
   if(ok&&typeof d.naar==='string'){window.location.assign(d.naar);return}
   if(d.opnieuw){window.location.assign('/inloggen?fout=opnieuw');return}
   setError(String(d.error||'Er ging iets mis.'));setCode('');
  }catch{setError('Geen verbinding. Probeer het opnieuw.')}finally{setBusy(false)}
 }
 return <main className="login-page"><section className="login-card" aria-labelledby="code-titel">
  <Brand/>
  <h1 id="code-titel">{s?.stap==='koppelen'?'Beveilig je account':'Code invullen'}</h1>
  {!s&&<p className="login-sub">Laden…</p>}
  {s?.error&&<><p className="login-msg fout" role="alert">{s.error}</p><a className="login-alt" href="/inloggen">Opnieuw inloggen</a></>}
  {s?.stap==='koppelen'&&<>
   <p className="login-sub">Hoi {s.naam}. Voor de backoffice gebruik je een Authenticator-app (bijvoorbeeld Google Authenticator). Dat doe je één keer:</p>
   <ol className="login-steps"><li>Installeer Google Authenticator op je telefoon.</li><li>Tik op <strong>+</strong> en kies <strong>QR-code scannen</strong>.</li><li>Scan deze code en vul hieronder de 6 cijfers in die de app toont.</li></ol>
   {s.qr&&<img className="login-qr" src={s.qr} alt="QR-code om Boer Bart toe te voegen aan je Authenticator-app" width={200} height={200}/>}
   <button type="button" className="login-link" onClick={()=>setShow(!show)}>{show?'Verberg sleutel':'Scannen lukt niet? Toon de sleutel om over te typen'}</button>
   {show&&<p className="login-secret"><code>{s.geheim}</code></p>}
   <p className="login-hint">Tip: koppel ook een tweede apparaat of zet de sleutel in je wachtwoordkluis, voor als je telefoon kwijtraakt.</p>
  </>}
  {s?.stap==='code'&&<p className="login-sub">Hoi {s.naam}. Open je Authenticator-app en vul de 6 cijfers van Boer Bart in.</p>}
  {(s?.stap==='code'||s?.stap==='koppelen')&&<form className="login-form" onSubmit={submit}>
   {error&&<p className="login-msg fout" role="alert">{error}</p>}
   <label>Code uit de app<input className="login-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus value={code} onChange={e=>setCode(e.target.value)}/></label>
   <button className="login-primary" disabled={busy}>{busy?'Controleren…':'Bevestigen'}</button>
   <p className="login-foot">Telefoon kwijt? Vraag een andere eigenaar om je Authenticator opnieuw in te stellen. <a href="/inloggen">Annuleren</a></p>
  </form>}
 </section></main>;
}

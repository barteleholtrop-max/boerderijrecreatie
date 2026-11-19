'use client';
// Nieuw wachtwoord kiezen na de herstelmail. Supabase zet het herstelbewijs achter # in de link (komt nooit in serverlogs).
import {useEffect,useState} from 'react';
import {Brand,send} from '../brand';
export default function NieuwWachtwoord(){
 const [token,setToken]=useState<string|null>(null),[password,setPassword]=useState(''),[repeat,setRepeat]=useState(''),[code,setCode]=useState('');
 const [needCode,setNeedCode]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{
  const h=new URLSearchParams(window.location.hash.slice(1));
  setToken(h.get('type')==='recovery'?h.get('access_token')||'':'');
  if(window.location.hash)history.replaceState(null,'',window.location.pathname);
 },[]);
 async function submit(e:React.FormEvent){
  e.preventDefault();setError('');
  if(password!==repeat){setError('De twee wachtwoorden zijn niet gelijk.');return}
  setBusy(true);
  try{const {ok,d}=await send('/auth/nieuw-wachtwoord',{token,password,code:code.replace(/\s/g,'')||undefined});
   if(ok){window.location.assign('/inloggen?wachtwoord=1');return}
   if(d.code)setNeedCode(true);setError(String(d.error||'Er ging iets mis.'));
  }catch{setError('Geen verbinding. Probeer het opnieuw.')}finally{setBusy(false)}
 }
 return <main className="login-page"><section className="login-card" aria-labelledby="nw-titel">
  <Brand/><h1 id="nw-titel">Nieuw wachtwoord</h1>
  {token===''&&<><p className="login-msg fout" role="alert">Deze link is verlopen of onvolledig. Vraag een nieuwe herstelmail aan.</p><a className="login-alt" href="/inloggen">Naar inloggen</a></>}
  {token&&<form className="login-form" onSubmit={submit}>
   {error&&<p className="login-msg fout" role="alert">{error}</p>}
   <label>Nieuw wachtwoord<input type="password" required autoComplete="new-password" minLength={10} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></label>
   <label>Herhaal wachtwoord<input type="password" required autoComplete="new-password" minLength={10} maxLength={128} value={repeat} onChange={e=>setRepeat(e.target.value)}/></label>
   {needCode&&<label>Code uit je Authenticator-app<input className="login-code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required value={code} onChange={e=>setCode(e.target.value)}/></label>}
   <p className="login-hint">Minstens 10 tekens.</p>
   <button className="login-primary" disabled={busy}>{busy?'Opslaan…':'Wachtwoord opslaan'}</button>
  </form>}
 </section></main>;
}

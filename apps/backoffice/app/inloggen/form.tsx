'use client';
// Keuze op het inlogscherm: Google, of e-mail en wachtwoord (inloggen, account aanmaken, wachtwoord vergeten).
import {useState} from 'react';
import {GoogleIcon,send} from './brand';
type Mode='kies'|'inloggen'|'aanmaken'|'vergeten';
export function LoginForm({terug}:{terug:string}){
 const [mode,setMode]=useState<Mode>('kies'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[repeat,setRepeat]=useState('');
 const [error,setError]=useState(''),[done,setDone]=useState(''),[busy,setBusy]=useState(false),[onthouden,setOnthouden]=useState(true);
 const go=(m:Mode)=>{setMode(m);setError('');setDone('');setPassword('');setRepeat('')};
 async function submit(e:React.FormEvent){
  e.preventDefault();setError('');setDone('');
  if(mode==='aanmaken'&&password!==repeat){setError('De twee wachtwoorden zijn niet gelijk.');return}
  setBusy(true);
  try{
   const path=mode==='inloggen'?'/auth/wachtwoord':mode==='aanmaken'?'/auth/aanmelden':'/auth/vergeten';
   const {ok,d}=await send(path,{email,password,terug,onthouden});
   if(!ok){setError(String(d.error||'Er ging iets mis. Probeer het opnieuw.'));return}
   if(typeof d.naar==='string'){window.location.assign(d.naar);return}
   setDone(String(d.bericht||''));setPassword('');setRepeat('');
  }catch{setError('Geen verbinding. Probeer het opnieuw.')}finally{setBusy(false)}
 }
 // „Onthoud deze telefoon” (wens eigenaar 13 november 2026): 30 dagen ingelogd. Gevoelige handelingen vragen de code wel.
 const remember=<label className="login-check"><input type="checkbox" checked={onthouden} onChange={e=>setOnthouden(e.target.checked)}/><span><b>Onthoud deze telefoon</b> <small>(30 dagen ingelogd blijven; niet aanvinken op een gedeelde computer)</small></span></label>;
 if(mode==='kies')return <>
  <p className="login-sub">Log in met je eigen account. Daarna vragen we de code uit je Authenticator-app.</p>
  <a className="login-google" href={'/auth/google?terug='+encodeURIComponent(terug)+(onthouden?'&onthouden=1':'')}><GoogleIcon/>Inloggen met Google</a>
  <div className="login-or" aria-hidden="true"><span>of</span></div>
  <button type="button" className="login-alt" onClick={()=>go('inloggen')}>Inloggen met e-mail en wachtwoord</button>
  {remember}
  <p className="login-foot">Geen Google-account? <button type="button" className="login-link" onClick={()=>go('aanmaken')}>Account aanmaken</button></p>
 </>;
 return <form className="login-form" onSubmit={submit}>
  <p className="login-sub">{mode==='inloggen'?'Log in met je e-mailadres en wachtwoord.':mode==='aanmaken'?'Maak een account met het e-mailadres dat Boerderijrecreatie voor je op de lijst heeft gezet. Je krijgt een mail om het te bevestigen.':'Vul je e-mailadres in. Je krijgt een mail met een link om een nieuw wachtwoord te kiezen.'}</p>
  {error&&<p className="login-msg fout" role="alert">{error}</p>}
  {done&&<p className="login-msg" role="status">{done}</p>}
  <label>E-mailadres<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} maxLength={200}/></label>
  {mode!=='vergeten'&&<label>Wachtwoord<input type="password" required autoComplete={mode==='aanmaken'?'new-password':'current-password'} minLength={mode==='aanmaken'?10:1} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></label>}
  {mode==='aanmaken'&&<><label>Herhaal wachtwoord<input type="password" required autoComplete="new-password" minLength={10} maxLength={128} value={repeat} onChange={e=>setRepeat(e.target.value)}/></label><p className="login-hint">Minstens 10 tekens. Een zin van een paar woorden is makkelijk te onthouden en sterk.</p></>}
  {mode==='inloggen'&&remember}
  <button className="login-primary" disabled={busy}>{busy?'Even geduld…':mode==='inloggen'?'Inloggen':mode==='aanmaken'?'Account aanmaken':'Stuur herstelmail'}</button>
  <div className="login-links">
   {mode==='inloggen'&&<button type="button" className="login-link" onClick={()=>go('vergeten')}>Wachtwoord vergeten?</button>}
   {mode!=='inloggen'&&<button type="button" className="login-link" onClick={()=>go('inloggen')}>Ik heb al een account</button>}
   <button type="button" className="login-link" onClick={()=>go('kies')}>← Terug</button>
  </div>
 </form>;
}

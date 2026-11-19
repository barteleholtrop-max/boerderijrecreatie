'use client';
// Gmail en agenda's: koppelen en synchroniseren. Verplaatst uit Gesprekken naar Koppelingen & printers
// (verzoek eigenaar, 3 november 2026); in Gesprekken staat alleen nog een statusregel met een link hierheen.
import {useCallback,useEffect,useState} from 'react';
import {MailConnection,Calendars,call,type MailStatus} from '../gesprekken/mail';

const returnMessage=(g:string,melding:string|null)=>g==='gekoppeld'
 ?'Google is gekoppeld. De gesprekken met het klantlabel worden nu opgehaald; kies hieronder eventueel de rol van je agenda\'s.'
 :g==='label-ontbreekt'
  ?'Google is gekoppeld, maar het label is niet gevonden. Maak het label aan in Gmail of controleer de naam bij Gmail instellen.'
  :melding||'Koppelen is niet gelukt.';

export function GmailSync(){
 const [status,setStatus]=useState<MailStatus|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[noAccess,setNoAccess]=useState(false);
 const load=useCallback(async()=>{
  try{setStatus((await call<{status:MailStatus}>('/api/mail?filter=alles')).status)}
  catch(e){if((e as {status?:number}).status===403)setNoAccess(true);else setMessage((e as Error).message)}
 },[]);
 useEffect(()=>{void load()},[load]);
 // While Gmail is synchronising, look again every few seconds; otherwise once a minute.
 useEffect(()=>{const t=setInterval(()=>{void load()},status?.syncing?4000:60000);return()=>clearInterval(t)},[load,status?.syncing]);
 // Google sends the browser back here after "Google koppelen".
 useEffect(()=>{
  const q=new URLSearchParams(location.search),g=q.get('gmail');
  if(g){setMessage(returnMessage(g,q.get('melding')));history.replaceState(null,'','/koppeling#gmail');document.getElementById('gmail')?.scrollIntoView()}
 },[]);
 async function mailAction(action:'sync'|'full-sync'|'disconnect'){
  if(action==='disconnect'&&!confirm('Google ontkoppelen? De toegang wordt ingetrokken; Gmail en de agenda zelf veranderen niet.'))return;
  setBusy(true);
  try{await call('/api/mail',{action});setMessage(action==='disconnect'?'Google is ontkoppeld.':'Synchronisatie gestart.');setTimeout(()=>void load(),1500)}
  catch(e){setMessage((e as Error).message)}
  finally{setBusy(false)}
 }
 return <section className="section-gap" id="gmail" aria-labelledby="gmail-title">
  <h2 id="gmail-title" style={{marginTop:32}}>Gmail en agenda&apos;s · koppelen en synchroniseren</h2>
  <p className="sub">De inbox synchroniseert vanzelf elke 5 minuten, de agenda&apos;s elke 15 minuten en direct na een wijziging in Planning. Met de knoppen hieronder doe je het meteen.</p>
  {message&&<div role="status" className="message">{message} <button onClick={()=>setMessage('')} aria-label="Melding sluiten">×</button></div>}
  {noAccess?<p className="small">Je hebt geen toegang tot de klantmail.</p>:<>
   <MailConnection status={status} busy={busy} onSync={()=>mailAction('sync')} onFull={()=>mailAction('full-sync')} onDisconnect={()=>mailAction('disconnect')}/>
   <Calendars status={status}/>
  </>}
 </section>;
}

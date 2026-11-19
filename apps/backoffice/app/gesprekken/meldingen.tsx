'use client';
// Meldingen op deze telefoon (wens eigenaar 9 november 2026): bij nieuwe gastmail en nieuwe aanvragen via de website een melding in
// de backoffice-app, in plaats van via Gmail. Op een iPhone werkt dit pas als de backoffice op het beginscherm staat.
import {useEffect,useState} from 'react';
const b64=(s:string)=>{const p='='.repeat((4-s.length%4)%4),raw=atob((s+p).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(raw,c=>c.charCodeAt(0))};
type State='laden'|'kan-niet'|'uit'|'aan'|'geweigerd';
export function Meldingen(){
 const [state,setState]=useState<State>('laden'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[key,setKey]=useState('');
 useEffect(()=>{(async()=>{
  if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window)){setState('kan-niet');return}
  if(Notification.permission==='denied'){setState('geweigerd');return}
  const reg=await navigator.serviceWorker.getRegistration('/').catch(()=>undefined),sub=await reg?.pushManager.getSubscription().catch(()=>null);
  const r=await fetch('/api/meldingen'+(sub?'?endpoint='+encodeURIComponent(sub.endpoint):''),{cache:'no-store'}).then(x=>x.ok?x.json():null).catch(()=>null);
  if(!r?.publicKey){setState('kan-niet');return}setKey(r.publicKey);setState(r.on?'aan':'uit');
 })()},[]);
 async function on(){setBusy(true);setError('');
  try{const reg=await navigator.serviceWorker.register('/backoffice-sw.js',{scope:'/'});await navigator.serviceWorker.ready;
   if(await Notification.requestPermission()!=='granted'){setState('geweigerd');return}
   const sub=await reg.pushManager.getSubscription()||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64(key)});
   const r=await fetch('/api/meldingen',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'aan',subscription:sub.toJSON()})});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Aanzetten lukte niet.');
   setState('aan')}
  catch(e){setError(e instanceof Error?e.message:'Aanzetten lukte niet.')}finally{setBusy(false)}}
 async function off(){setBusy(true);setError('');
  try{const reg=await navigator.serviceWorker.getRegistration('/'),sub=await reg?.pushManager.getSubscription();
   if(sub)await fetch('/api/meldingen',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'uit',endpoint:sub.endpoint})});
   setState('uit')}
  catch(e){setError(e instanceof Error?e.message:'Uitzetten lukte niet.')}finally{setBusy(false)}}
 if(state==='laden')return null;
 const title=state==='geweigerd'?'Meldingen zijn op deze telefoon geblokkeerd. Zet ze aan in de instellingen van je browser.':state==='kan-niet'?'Deze browser kan geen meldingen ontvangen. Op een iPhone: zet de backoffice eerst op je beginscherm en open hem van daaruit.':'Een melding op deze telefoon bij nieuwe gastmail en nieuwe aanvragen via de website.';
 return <>{state==='aan'?<button type="button" className="btn secondary" disabled={busy} title={title} onClick={off}>Meldingen uitzetten</button>
  :state==='uit'?<button type="button" className="btn secondary" disabled={busy||!key} title={title} onClick={on}>{busy?'Bezig…':'Meldingen aanzetten'}</button>
  :<span className="small" title={title}>{state==='geweigerd'?'Meldingen geblokkeerd':'Meldingen niet mogelijk'}</span>}
  {error&&<span className="small mail-error" role="alert">{error}</span>}</>;
}

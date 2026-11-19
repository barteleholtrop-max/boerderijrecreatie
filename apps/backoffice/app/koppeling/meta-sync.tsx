'use client';
// WhatsApp, Messenger en Instagram (akkoord eigenaar 9 november 2026): de stand van de koppeling met Meta, het webhookadres
// om in de Meta-app te plakken en het eenmalig ophalen van oude WhatsApp-gesprekken. Sleutels vul je in bij de koppeling erboven.
import {useEffect,useState} from 'react';
import {Pill} from '../ui';
import {call,when} from '../gesprekken/mail';
import type {MetaStatus} from '../gesprekken/meta';
import type {MetaCheckStep} from '@/lib/meta-store';
import {CHANNEL_NAME,CHANNELS} from '@/lib/meta-core';
import {WhatsappImport} from './whatsapp-import';
export function MetaSync(){
 const [s,setS]=useState<MetaStatus|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[noAccess,setNoAccess]=useState(false);
 const [steps,setSteps]=useState<MetaCheckStep[]|null>(null),[pin,setPin]=useState('');
 useEffect(()=>{call<{status:MetaStatus}>('/api/meta').then(d=>setS(d.status)).catch(e=>{if(e.status===403)setNoAccess(true);else setMessage(e.message)})},[]);
 async function history(){if(!confirm(`Oude WhatsApp-gesprekken ophalen (de laatste ${s?.historyDays} dagen)? Dit kan alleen kort na het koppelen van het nummer.`))return;setBusy(true);try{await call('/api/meta',{action:'geschiedenis'});setMessage('Gevraagd bij Meta. De gesprekken komen de komende minuten binnen in Gesprekken.')}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
 async function check(){setBusy(true);try{setSteps((await call<{steps:MetaCheckStep[]}>('/api/meta',{action:'controleren'})).steps)}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
 async function connect(){
  if(!confirm('Koppeling bij Meta afronden? De backoffice abonneert het WhatsApp-account en de Facebook-pagina op de app'+(pin?' en meldt het WhatsApp-nummer aan met deze pincode':'')+'. Daarna komen nieuwe berichten in Gesprekken.'))return;
  setBusy(true);try{const r=await call<{done:string[];errors:string[];steps:MetaCheckStep[]}>('/api/meta',{action:'koppelen',pin});setSteps(r.steps);setPin('');
   setMessage([r.done.length?'Gedaan: '+r.done.join('; ')+'.':'',r.errors.length?'Niet gelukt: '+r.errors.join('; '):''].filter(Boolean).join(' '))}
  catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
 if(noAccess)return null;
 return <section className="section-gap" id="meta" aria-labelledby="meta-title">
  <h2 id="meta-title" style={{marginTop:32}}>WhatsApp, Messenger en Instagram · stand</h2>
  <p className="sub">Meta stuurt elk nieuw bericht meteen naar de backoffice. Alleen privéberichten; reacties onder berichten niet. Stap voor stap: docs/WHATSAPP-META.md.</p>
  {message&&<div role="status" className="message">{message} <button onClick={()=>setMessage('')} aria-label="Melding sluiten">×</button></div>}
  {!s?<p className="small">Laden…</p>:<div className="card mail-connection">
   <div className="card-head"><h3 className="card-title">Meta</h3>{s.webhookReady?<Pill color="green">Webhook ingesteld</Pill>:<Pill color="orange">App-geheim en verificatiecode ontbreken</Pill>}</div>
   <p className="small">Webhookadres voor de Meta-app: <strong>{s.webhookUrl.startsWith('http')?s.webhookUrl:'<adres van de backoffice>/api/public/meta'}</strong></p>
   <div className="actions">{CHANNELS.map(c=><Pill key={c} color={s.channels[c]?'green':''}>{CHANNEL_NAME[c]}: {s.channels[c]?'gekoppeld':'nog niet'}</Pill>)}</div>
   <p className="small">{s.threads} gesprekken · laatste bericht: <strong>{when(s.lastMessageAt)}</strong> · sjablonen: {s.templatesReady?'beschikbaar':'Business-account-ID ontbreekt'} · verzenden: {s.sendEnabled?<strong>aan</strong>:'uit in deze omgeving (META_SEND_ENABLED)'}</p>
   <div className="actions"><button className="btn secondary sm" disabled={busy} onClick={check}>Koppeling controleren bij Meta</button></div>
   {steps&&<ul className="small" aria-label="Stand bij Meta">{steps.map(x=><li key={x.id}><Pill color={x.ok===true?'green':x.ok===false?'orange':''}>{x.ok===true?'In orde':x.ok===false?'Actie nodig':'Nog niet ingevuld'}</Pill> <strong>{x.label}</strong>: {x.detail}</li>)}</ul>}
   <div className="actions"><label className="small">Pincode WhatsApp-nummer (6 cijfers, alleen bij de eerste keer aanmelden; wordt niet bewaard){' '}
    <input inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,''))} style={{width:90}}/></label>
    <button className="btn sm" disabled={busy||(pin.length>0&&pin.length!==6)} onClick={connect}>Koppelen bij Meta</button></div>
   {s.channels.whatsapp&&s.historyDays>0&&<div className="actions"><button className="btn secondary sm" disabled={busy} onClick={history}>Oude WhatsApp-gesprekken ophalen ({s.historyDays} dagen)</button></div>}
  </div>}
  {s&&<WhatsappImport/>}
 </section>;
}

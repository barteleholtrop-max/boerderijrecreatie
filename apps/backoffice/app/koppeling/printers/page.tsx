'use client';
import {useEffect,useRef,useState} from 'react';
import {PageHead,Pill,Notice,SubTabs} from '../../ui';
import {systemTabs} from '../tabs';
import {PRINTER_STATIONS,STATION_LABELS,type Printer,type PrinterInput} from '@/lib/printers';
type Job={id:number,kind:string,title:string,status:string,attempts:number,created:string,doneAt:string|null,lastError:string};
type Row=Printer&{linked:boolean,printFrom:string,lastSeen:string,connected:boolean,waiting:number,jobs:Job[]};
type Link={printerId:string,secret:string,url:string,urlWithKey:string};
type Overview={printers:Row[],warnings:{id:string|null,text:string}[],pollSeconds:number,link?:Link};
const blank:PrinterInput={name:'',station:'kok',host:'',port:9100,model:'',paper:80,active:true,note:''};
const input=(p:Printer):PrinterInput=>({name:p.name,station:p.station,host:p.host,port:p.port,model:p.model,paper:p.paper,active:p.active,note:p.note});
const when=(iso:string)=>new Date(iso).toLocaleString('nl-NL',{timeZone:'Europe/Amsterdam',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit'});
const JOB_STATUS:Record<string,[string,''|'green'|'orange'|'red']>={wachtrij:['Wacht op printer','orange'],verstuurd:['Naar printer gestuurd','orange'],afgedrukt:['Afgedrukt','green'],fout:['Mislukt','red'],verlopen:['Verlopen','red']};
// Systeem → Printers (wens eigenaar 5 november 2026). Koppelen en afdrukken via Epson Server Direct Print (akkoord eigenaar
// 5 november 2026): de printer haalt zelf elke 5 seconden zijn bonnen op, ook als de tablet uit staat.
export default function Printers(){
 const [data,setData]=useState<Overview|null>(null),[forms,setForms]=useState<Record<string,PrinterInput>>({}),[adding,setAdding]=useState<PrinterInput|null>(null),[busy,setBusy]=useState(''),[message,setMessage]=useState(''),[link,setLink]=useState<Link|null>(null);
 const versions=useRef<Record<string,number>>({});
 // Forms only follow the server for printers that were not loaded yet or were saved elsewhere; unsaved typing stays.
 function show(d:Overview){setData(d);setForms(f=>{const next:Record<string,PrinterInput>={};for(const p of d.printers)next[p.id]=f[p.id]&&versions.current[p.id]===p.version?f[p.id]:input(p);versions.current=Object.fromEntries(d.printers.map(p=>[p.id,p.version]));return next})}
 async function load(){const r=await fetch('/api/printers',{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error);show(d)}
 useEffect(()=>{load().catch(e=>setMessage(e.message||'Printers laden mislukt. Ververs de pagina.'));const t=setInterval(()=>{if(!document.hidden)load().catch(()=>{})},10000);return()=>clearInterval(t)},[]);
 async function send(key:string,body:object,done:string){
  setBusy(key);setMessage('');
  try{const r=await fetch('/api/printers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json() as Overview&{error?:string};if(!r.ok)throw Error(d.error||'Opslaan mislukt.');if(d.link)setLink(d.link);versions.current={};show(d);setMessage(done);return true}
  catch(e){setMessage(e instanceof Error?e.message:'Opslaan mislukt.');return false}
  finally{setBusy('')}
 }
 const changed=(p:Printer)=>JSON.stringify(input(p))!==JSON.stringify(forms[p.id]);
 const copy=(text:string)=>{navigator.clipboard?.writeText(text).then(()=>setMessage('Gekopieerd.'),()=>setMessage('Kopiëren lukte niet; selecteer de tekst en kopieer zelf.'))};
 const value=(label:string,text:string)=><div className="printer-value"><span className="small">{label}</span><code>{text}</code><button className="btn secondary sm" type="button" onClick={()=>copy(text)}>Kopieer</button></div>;
 const fields=(value:PrinterInput,set:(v:PrinterInput)=>void,key:string)=><div className="grid two printer-fields">
  <div className="field"><label htmlFor={key+'-name'}>Naam</label><input id={key+'-name'} value={value.name} maxLength={60} onChange={e=>set({...value,name:e.target.value})}/></div>
  <div className="field"><label htmlFor={key+'-station'}>Waarvoor</label><select id={key+'-station'} value={value.station} onChange={e=>set({...value,station:e.target.value as PrinterInput['station']})}>{PRINTER_STATIONS.map(s=><option key={s} value={s}>{STATION_LABELS[s]}</option>)}</select></div>
  <div className="field"><label htmlFor={key+'-host'}>IP-adres</label><input id={key+'-host'} value={value.host} maxLength={253} inputMode="decimal" placeholder="Bijvoorbeeld 192.168.1.50" onChange={e=>set({...value,host:e.target.value})}/></div>
  <div className="field"><label htmlFor={key+'-port'}>Poort</label><input id={key+'-port'} type="number" min={1} max={65535} value={value.port} onChange={e=>set({...value,port:Number(e.target.value)})}/></div>
  <div className="field"><label htmlFor={key+'-model'}>Model</label><input id={key+'-model'} value={value.model} maxLength={80} placeholder="Bijvoorbeeld Epson TM-m30III" onChange={e=>set({...value,model:e.target.value})}/></div>
  <div className="field"><label htmlFor={key+'-paper'}>Papierbreedte</label><select id={key+'-paper'} value={value.paper} onChange={e=>set({...value,paper:Number(e.target.value) as 58|80})}><option value={80}>80 mm</option><option value={58}>58 mm</option></select></div>
  <div className="field" style={{gridColumn:'1 / -1'}}><label htmlFor={key+'-note'}>Opmerking</label><input id={key+'-note'} value={value.note} maxLength={500} onChange={e=>set({...value,note:e.target.value})}/></div>
  <label className="row small"><input type="checkbox" checked={value.active} onChange={e=>set({...value,active:e.target.checked})} style={{width:'auto'}}/> In gebruik</label>
 </div>;
 const connection=(p:Row)=>!p.linked?<Pill color="orange">Niet gekoppeld</Pill>:p.connected?<Pill color="green">Verbonden · vraagt elke {data?.pollSeconds||5} s</Pill>:<Pill color="red">{p.lastSeen?'Geen contact sinds '+when(p.lastSeen):'Gekoppeld · nog geen contact'}</Pill>;
 return <div data-bb-view="printers"><PageHead eyebrow="SYSTEEM" title="Printers" sub="Welke bonprinter waarvoor is. De printer haalt zelf elke 5 seconden zijn bonnen op, ook als de tablet uit staat."><button className="btn" disabled={!!adding||!data} onClick={()=>{setAdding({...blank});setMessage('')}}>＋ Printer toevoegen</button></PageHead>
  <SubTabs current="/koppeling/printers" items={systemTabs}/>
  <Notice kind="info" title="Zo werkt het">Na het koppelen vraagt de printer zelf via internet elke {data?.pollSeconds||5} seconden aan de backoffice of er een bon is (Epson Server Direct Print). Elke nieuwe bestelling met gerechten krijgt een bon bij de printer van de kok, dranken bij die van de barista: dezelfde bestellingen als op het werkplekscherm, ook als de tablet uit staat. Lukt afdrukken niet (papier op, klep open), dan blijft de bon wachten en komt hij er alsnog uit. Bestellingen van vóór het koppelen worden niet afgedrukt.</Notice>
  {message&&<div className="message section-gap" role="status">{message}</div>}
  {link&&data&&<section className="card section-gap printer-link" aria-label="Koppelgegevens"><div className="card-head"><h3 className="card-title">Koppelgegevens · {data.printers.find(p=>p.id===link.printerId)?.name}</h3><button className="btn secondary sm" onClick={()=>setLink(null)}>Sluiten</button></div>
   <div className="notice warn"><div><strong>Het wachtwoord zie je maar één keer.</strong> Vul het nu in bij de printer. Kwijt? Maak dan een nieuwe sleutel; de oude werkt dan niet meer.</div></div>
   <ol className="small printer-steps">
    <li>Pak een telefoon of laptop die op de wifi van de boerderij zit en open in de browser het adres van de printer, bijvoorbeeld <code>https://{data.printers.find(p=>p.id===link.printerId)?.host||'IP-adres-van-de-printer'}</code>. Een melding over het certificaat mag je hier accepteren. Log in als beheerder (het standaardwachtwoord staat op de sticker of de zelftestbon).</li>
    <li>Ga naar <b>Server Direct Print</b> (bij de TM-m30III onder <b>TM-i Settings → Services</b>; de plek kan per firmwareversie iets verschillen) en zet het op <b>Enable</b>.</li>
    <li>Vul bij <b>Server 1</b> in:</li>
   </ol>
   {value('URL',link.url)}{value('Interval (seconden)',String(data.pollSeconds))}{value('ID',link.printerId)}
   <p className="small">Zet <b>Server authentication</b> aan met:</p>
   {value('Gebruikersnaam / ID',link.printerId)}{value('Wachtwoord',link.secret)}
   <p className="small">Lukt aanmelden niet? Gebruik dan in plaats daarvan dit adres, zonder Server authentication (de sleutel zit in het adres):</p>
   {value('URL met sleutel',link.urlWithKey)}
   <ol className="small printer-steps" start={4}><li>Sla op en laat de printer herstarten als hij daarom vraagt. Binnen een halve minuut staat hier <b>Verbonden</b>. Kies dan <b>Testafdruk</b>.</li>
    <li>Geen verbinding? Controleer of de printer internet heeft, of de klok van de printer klopt en of de firmware actueel is (voor het beveiligde https-certificaat).</li></ol>
  </section>}
  {data&&data.warnings.length>0&&<div className="card section-gap"><h3 className="card-title">Aandachtspunten</h3><ul className="small">{data.warnings.map((w,i)=><li key={i}>{w.text}</li>)}</ul></div>}
  {adding&&<section className="card section-gap" aria-label="Nieuwe printer"><div className="card-head"><h3 className="card-title">Nieuwe printer</h3></div>{fields(adding,setAdding,'new')}
   <div className="row section-gap"><button className="btn" disabled={busy==='new'} onClick={async()=>{if(await send('new',{action:'nieuw',printer:adding},`${adding.name} toegevoegd.`))setAdding(null)}}>{busy==='new'?'Opslaan…':'Toevoegen'}</button><button className="btn secondary" disabled={busy==='new'} onClick={()=>setAdding(null)}>Annuleren</button></div></section>}
  {!data?<div className="empty section-gap">{message?'':'Printers laden…'}</div>:!data.printers.length&&!adding?<div className="empty section-gap">Nog geen printers vastgelegd.</div>:
  data.printers.map(p=><section className="card section-gap" key={p.id} aria-label={p.name}>
   <div className="card-head"><h3 className="card-title">{p.name}</h3><div className="row"><Pill color={p.active?'green':''}>{p.active?'In gebruik':'Niet in gebruik'}</Pill>{connection(p)}</div></div>
   {data.warnings.filter(w=>w.id===p.id).map((w,i)=><div className="notice warn" key={i}><div>{w.text}</div></div>)}
   <div className="row printer-actions">
    <button className="btn" disabled={busy===p.id} onClick={()=>{if(!p.linked||confirm(`Een nieuwe sleutel maken voor ${p.name}? De oude werkt dan direct niet meer; je moet hem in de printer opnieuw invullen.`))send(p.id,{action:'koppelen',id:p.id},p.linked?'Nieuwe sleutel gemaakt.':`${p.name} is klaar om te koppelen.`)}}>{p.linked?'Nieuwe sleutel maken':'Koppelen'}</button>
    <button className="btn secondary" disabled={busy===p.id||!p.linked||!p.active} onClick={()=>send(p.id,{action:'testafdruk',id:p.id},`Testafdruk klaargezet. ${p.connected?'De printer haalt hem binnen enkele seconden op.':'Zodra de printer verbonden is, komt hij eruit.'}`)}>Testafdruk</button>
    {p.linked&&<button className="text-button" disabled={busy===p.id} onClick={()=>{if(confirm(`${p.name} ontkoppelen? Er komen dan geen bonnen meer uit deze printer.`))send(p.id,{action:'ontkoppelen',id:p.id},`${p.name} ontkoppeld.`)}}>Ontkoppelen</button>}
    <span className="small" style={{marginLeft:'auto'}}>{p.waiting?`${p.waiting} bon${p.waiting===1?'':'nen'} wacht${p.waiting===1?'':'en'} op de printer`:p.linked?'Geen bonnen in de wachtrij':''}</span>
   </div>
   {p.jobs.length>0&&<details className="section-gap printer-jobs" open={p.jobs.some(j=>['fout','verlopen'].includes(j.status))}><summary>Laatste bonnen ({p.jobs.length})</summary>
    {p.jobs.map(j=><div className="printer-job" key={j.id}><div><b>{j.title}</b><small>{when(j.created)}{j.attempts>1?` · ${j.attempts} pogingen`:''}{j.lastError?' · '+j.lastError:''}</small></div><Pill color={JOB_STATUS[j.status]?.[1]||''}>{JOB_STATUS[j.status]?.[0]||j.status}</Pill>{['afgedrukt','fout','verlopen'].includes(j.status)&&<button className="text-button" disabled={busy===p.id} onClick={()=>send(p.id,{action:'opnieuw',jobId:j.id},'Bon opnieuw klaargezet.')}>Opnieuw afdrukken</button>}</div>)}
   </details>}
   <details className="section-gap"><summary>Instellingen</summary>
    {forms[p.id]&&fields(forms[p.id],v=>setForms(f=>({...f,[p.id]:v})),p.id)}
    <div className="row section-gap"><button className="btn" disabled={busy===p.id||!changed(p)} onClick={()=>send(p.id,{action:'opslaan',id:p.id,version:p.version,printer:forms[p.id]},`${forms[p.id].name} opgeslagen.`)}>{busy===p.id?'Opslaan…':'Opslaan'}</button>
     <button className="text-button" disabled={busy===p.id} onClick={()=>{if(confirm(`${p.name} verwijderen? De wachtrij van deze printer verdwijnt ook.`))send(p.id,{action:'verwijderen',id:p.id,version:p.version},`${p.name} verwijderd.`)}}>Verwijderen</button>
     <span className="small" style={{marginLeft:'auto'}}>Laatst gewijzigd {when(p.updated)}{p.updatedBy?' door '+p.updatedBy:''}</span></div>
   </details>
  </section>)}
 </div>
}

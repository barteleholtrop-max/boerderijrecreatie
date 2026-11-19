'use client';
// WhatsApp-export importeren (wens eigenaar 13 november 2026: „backup van de gesprekken uit WhatsApp, tekst en media”).
// De export (een .zip van „Chat exporteren” met media, of een losse .txt met eventueel losse bestanden) wordt hier in de
// browser uitgepakt en gelezen. Daarna gaan de berichten in één keer naar de backoffice en de bijlagen één voor één,
// zodat geen enkele aanvraag te groot wordt. Nogmaals dezelfde export importeren zet niets dubbel.
import {useState} from 'react';
import {parseWhatsappExport,phoneFromAuthor,type ParsedExport} from '@/lib/whatsapp-export';
import {zipEntries,type Source} from '@/lib/zip-browser';

type Plan={parsed:ParsedExport;sources:Source[];chatName:string};
const fileTitle=(n:string)=>n.replace(/\.(zip|txt)$/i,'').replace(/^(WhatsApp[- ]?chat( met| with| -)?|WhatsApp Chat - )\s*/i,'').trim();

export function WhatsappImport(){
 const [plan,setPlan]=useState<Plan|null>(null),[us,setUs]=useState(''),[phone,setPhone]=useState(''),[name,setName]=useState('');
 const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState(''),[done,setDone]=useState<{thread:string;added:number;skipped:number;media:number;missing:string[]}|null>(null);

 async function pick(files:FileList|null){
  setError('');setDone(null);setPlan(null);setStatus('');if(!files?.length)return;
  try{
   setBusy(true);setStatus('Export lezen…');
   const sources:Source[]=[];let chat:Source|null=null,chatName='';
   for(const f of Array.from(files)){
    if(/\.zip$/i.test(f.name)){const e=await zipEntries(f);sources.push(...e);const t=e.filter(x=>/\.txt$/i.test(x.name)).sort((a,b)=>(/chat/i.test(b.name)?1:0)-(/chat/i.test(a.name)?1:0))[0];if(t&&!chat){chat=t;chatName=fileTitle(f.name)}}
    else if(/\.txt$/i.test(f.name)&&!chat){chat={name:f.name,read:async()=>f};chatName=fileTitle(f.name)}
    else sources.push({name:f.name,read:async()=>f});
   }
   if(!chat)throw Error('Geen chatbestand (.txt) gevonden. Kies de .zip van „Chat exporteren”, of het .txt-bestand.');
   const parsed=parseWhatsappExport(await (await chat.read()).text());
   if(!parsed.messages.length)throw Error('In dit bestand staan geen berichten die we kunnen lezen.');
   const ours=parsed.authors.find(a=>/boer\s*bart/i.test(a))||parsed.authors.find(a=>!phoneFromAuthor(a))||parsed.authors[0];
   const other=parsed.authors.find(a=>a!==ours)||'';
   setPlan({parsed,sources,chatName});setUs(ours);
   setPhone(phoneFromAuthor(other)||phoneFromAuthor(chatName));setName(phoneFromAuthor(other)?'':other||(phoneFromAuthor(chatName)?'':chatName));setStatus('');
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }

 async function run(){
  if(!plan)return;setBusy(true);setError('');
  try{
   setStatus('Berichten opslaan…');
   const res=await fetch('/api/meta/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone,name,us,messages:plan.parsed.messages})});
   const d=await res.json().catch(()=>({})) as {error?:string;thread:string;added:number;skipped:number;media:{messageId:string;filename:string}[]};
   if(!res.ok)throw Error(d.error||'Importeren mislukt.');
   const byName=new Map(plan.sources.map(s=>[s.name,s])),missing:string[]=[];let sent=0;
   for(const [i,m] of d.media.entries()){
    setStatus(`Bijlagen opslaan… ${i+1} van ${d.media.length}`);
    const s=byName.get(m.filename);if(!s){missing.push(m.filename);continue}
    const blob=await s.read(),form=new FormData();form.set('messageId',m.messageId);form.set('file',new File([blob],m.filename));
    const r=await fetch('/api/meta/import',{method:'POST',body:form});
    if(r.ok)sent++;else{const e=await r.json().catch(()=>({})) as {error?:string};missing.push(m.filename+(e.error?' ('+e.error+')':''))}
   }
   setDone({thread:d.thread,added:d.added,skipped:d.skipped,media:sent,missing});setPlan(null);setStatus('');
  }catch(e){setError((e as Error).message);setStatus('')}finally{setBusy(false)}
 }

 const fmt=(iso:string)=>iso?new Date(iso).toLocaleDateString('nl-NL',{day:'numeric',month:'short',year:'numeric'}):'';
 return <div className="card mail-connection" style={{marginTop:16}}>
  <div className="card-head"><h3 className="card-title">WhatsApp-export importeren</h3></div>
  <p className="small">Oude gesprekken uit de WhatsApp Business-app (tekst en media) bij het gesprek in Gesprekken zetten. Kies de <strong>.zip</strong> van „Chat exporteren” (met media), of het <strong>.txt</strong>-bestand met eventueel de losse foto's erbij. Eén gesprek per keer. Nog eens importeren zet niets dubbel; er gaan geen meldingen uit.</p>
  <label className="small">Exportbestand(en) <input type="file" multiple accept=".zip,.txt,image/*,audio/*,video/*,.pdf,.vcf,.opus" disabled={busy} onChange={e=>{void pick(e.target.files);e.target.value=''}}/></label>
  {error&&<div role="alert" className="message error">{error}</div>}
  {status&&<p className="small" role="status">{status}</p>}
  {plan&&<div className="stack" style={{marginTop:10}}>
   <p className="small"><strong>{plan.parsed.messages.length}</strong> berichten van {fmt(plan.parsed.first)} tot {fmt(plan.parsed.last)} · {plan.parsed.messages.filter(m=>m.attachment).length} bijlagen ({plan.parsed.messages.filter(m=>m.attachment&&plan.sources.some(s=>s.name===m.attachment)).length} in de export)</p>
   <label>Wie is Boer Bart in deze export?<select value={us} onChange={e=>setUs(e.target.value)}>{plan.parsed.authors.map(a=><option key={a}>{a}</option>)}</select></label>
   <label>Telefoonnummer van de klant<input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+31 6 12345678" inputMode="tel"/></label>
   <label>Naam van de klant<input value={name} onChange={e=>setName(e.target.value)} maxLength={200}/></label>
   <div className="actions"><button className="btn" disabled={busy||!phone.trim()||!us} onClick={()=>void run()}>Importeren</button><button className="btn secondary" disabled={busy} onClick={()=>setPlan(null)}>Annuleren</button></div>
  </div>}
  {done&&<div role="status" className="message">
   Klaar: {done.added} berichten toegevoegd{done.skipped?`, ${done.skipped} stonden er al`:''}, {done.media} bijlagen opgeslagen.
   {done.missing.length>0&&<> Niet gevonden of niet gelukt: {done.missing.slice(0,10).join(', ')}{done.missing.length>10?` en nog ${done.missing.length-10}`:''}. Importeer dezelfde export later nog eens met de ontbrekende bestanden erbij.</>}
   {' '}<a href={'/gesprekken/telefoon?gesprek='+encodeURIComponent(done.thread)}>Gesprek openen</a>
  </div>}
 </div>;
}

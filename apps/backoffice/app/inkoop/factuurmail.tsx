'use client';
// Facturen uit de mail (besluit eigenaar 3 november 2026). Mails met het label „Inkoop” in de factuurmailbox
// (administratie@) staan hier. „Inlezen” haalt de PDF live uit Gmail en leest hem in de browser, net als een
// geüploade PDF; daarna volgt de bekende stap „Regels beoordelen”. Bewaar je de regels, dan gaat de mail op verwerkt.
import {useEffect,useState} from 'react';

type Mail={messageId:string;fromEmail:string;fromName:string;subject:string;received:string;attachments:{partId:string;filename:string;size:number}[];status:'nieuw'|'verwerkt'|'overgeslagen';updated:string;updatedBy:string};
type Overview={mailbox:string;label:string;oauthConfigured:boolean;connected:boolean;status:string;labelFound:boolean;lastSyncOk:string|null;lastError:string|null;syncing:boolean;mails:Mail[]};
export type MailMeta={messageId:string;fromName:string;fromEmail:string;received:string};
const when=(iso:string|null)=>iso?new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(iso)):'nog niet';
const day=(iso:string)=>new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',weekday:'short',day:'numeric',month:'short'}).format(new Date(iso));

async function post(body:object){
 const r=await fetch('/api/inkoop/factuurmail',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const d=await r.json().catch(()=>({})) as {error?:string;message?:string};if(!r.ok)throw Error(d.error||'Er ging iets mis.');return d;
}
/** Na „Beoordeelde regels bewaren”: de mail gaat op verwerkt. Mislukt dat, dan blijft hij op nieuw staan. */
export async function markInvoiceMail(messageId:string,invoiceId:string){try{await post({action:'status',messageId,status:'verwerkt',invoiceId})}catch{}}

export function FactuurMail({busy,refresh,onRead}:{busy:boolean;refresh:number;onRead:(file:File,meta:MailMeta)=>Promise<void>}){
 const [data,setData]=useState<Overview|null>(null),[msg,setMsg]=useState(''),[show,setShow]=useState<'nieuw'|'alles'>('nieuw'),[working,setWorking]=useState(false);
 async function load(){try{const r=await fetch('/api/inkoop/factuurmail',{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error||'Laden mislukt.');setData(d)}catch(e){setMsg((e as Error).message)}}
 useEffect(()=>{load();const q=new URLSearchParams(window.location.search),r=q.get('factuurmail');
  if(r==='gekoppeld')setMsg('Factuurmailbox gekoppeld (alleen lezen). De mails met het label worden nu opgehaald.');
  else if(r==='label-ontbreekt')setMsg('Gekoppeld, maar het label is niet gevonden. Maak het label aan in Gmail en druk op Nu ophalen.');
  else if(r==='fout')setMsg(q.get('melding')||'Koppelen is niet gelukt.');},[]);
 useEffect(()=>{if(refresh)load()},[refresh]);
 async function act(body:object,done?:string){setWorking(true);setMsg('');try{const d=await post(body);setMsg(d.message||done||'');await load()}catch(e){setMsg((e as Error).message)}finally{setWorking(false)}}
 async function read(m:Mail,partId:string,filename:string){
  setWorking(true);setMsg('');
  try{const r=await fetch(`/api/inkoop/factuurmail/pdf?id=${encodeURIComponent(m.messageId)}&part=${encodeURIComponent(partId)}`,{cache:'no-store'});
   if(!r.ok){const d=await r.json().catch(()=>({})) as {error?:string};throw Error(d.error||'De PDF kon niet worden opgehaald.')}
   const file=new File([await r.blob()],filename,{type:'application/pdf'});
   await onRead(file,{messageId:m.messageId,fromName:m.fromName,fromEmail:m.fromEmail,received:m.received});
  }catch(e){setMsg((e as Error).message)}finally{setWorking(false)}
 }
 const off=busy||working;
 const list=(data?.mails||[]).filter(m=>show==='alles'||m.status==='nieuw');
 const open=(data?.mails||[]).filter(m=>m.status==='nieuw').length;
 return <section className="ops-card">
  <h2>Facturen uit de mail{data?.connected&&open>0?` (${open})`:''}</h2>
  {!data?<p>Laden…</p>:!data.connected?<>
   <p>Koppel <b>{data.mailbox}</b> met alleen leesrechten. Daarna verschijnen hier de mails met het label <b>{data.label}</b>. De mailassistent zet dat label op facturen van winkel- en horecaleveranciers. De backoffice kan in deze mailbox niets verzenden, verwijderen of verplaatsen, en ziet alleen mail met dit label.</p>
   {data.status==='toegang-verlopen'&&<p className="ops-warning">De toegang is verlopen of ingetrokken. Koppel opnieuw.</p>}
   {data.oauthConfigured?<a className="btn" href="/api/inkoop/factuurmail/koppelen">Koppel {data.mailbox}</a>:<p className="ops-warning">Vul eerst de Google client-ID en het clientgeheim in bij Systeem &amp; koppelingen → Gmail.</p>}
  </>:<>
   <p className="ops-note">{data.mailbox} · label <b>{data.label}</b> · laatst opgehaald {when(data.lastSyncOk)}{data.syncing?' · bezig met ophalen…':''}. Elke 15 minuten komen nieuwe facturen binnen. De PDF wordt bij het inlezen uit Gmail gehaald en niet bewaard.</p>
   {data.lastError&&<p className="ops-warning">{data.lastError}</p>}
   <div className="ops-inline">
    <button type="button" className="btn secondary" disabled={off} onClick={()=>act({action:'sync'})}>Nu ophalen</button>
    <select aria-label="Welke mails" value={show} onChange={e=>setShow(e.target.value as 'nieuw'|'alles')}><option value="nieuw">Nog te verwerken ({open})</option><option value="alles">Alle factuurmails ({data.mails.length})</option></select>
   </div>
   {!list.length?<p>{show==='nieuw'?'Geen nieuwe factuurmails. Alles is verwerkt.':'Nog geen factuurmails met dit label.'}</p>:
   <div className="ops-scroll"><table><thead><tr><th>Ontvangen</th><th>Van</th><th>Onderwerp</th><th>PDF</th><th>Status</th><th/></tr></thead><tbody>
    {list.map(m=><tr key={m.messageId}>
     <td>{day(m.received)}</td>
     <td>{m.fromName||m.fromEmail}<div className="ops-hint">{m.fromName?m.fromEmail:''}</div></td>
     <td>{m.subject}</td>
     <td>{m.attachments.length?m.attachments.map(a=><div key={a.partId}><button type="button" className="text-button" disabled={off} onClick={()=>read(m,a.partId,a.filename)}>Inlezen: {a.filename}</button></div>):<span className="ops-hint">Geen PDF. Voer de factuur handmatig in.</span>}</td>
     <td>{m.status==='nieuw'?'Nieuw':m.status==='verwerkt'?'Verwerkt':'Overgeslagen'}{m.status!=='nieuw'&&m.updatedBy?<div className="ops-hint">{m.updatedBy} · {when(m.updated)}</div>:null}</td>
     <td>{m.status==='nieuw'?<button type="button" className="text-button" disabled={off} onClick={()=>act({action:'status',messageId:m.messageId,status:'overgeslagen'},'Overgeslagen.')}>Overslaan</button>
      :<button type="button" className="text-button" disabled={off} onClick={()=>act({action:'status',messageId:m.messageId,status:'nieuw'},'Weer op nieuw gezet.')}>Terugzetten</button>}</td>
    </tr>)}
   </tbody></table></div>}
   <p className="ops-hint">Een factuur van een leverancier die de lezer nog niet kent? Dan komen er geen regels uit de PDF. Voeg ze toe met „+ Regel toevoegen”. Leverancier en bron staan al ingevuld.</p>
   <button type="button" className="text-button" disabled={off} onClick={()=>act({action:'disconnect'})}>Factuurmailbox ontkoppelen</button>
  </>}
  {msg&&<p role="status" className="ops-note">{msg}</p>}
 </section>;
}

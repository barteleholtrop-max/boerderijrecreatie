'use client';
import Link from 'next/link';
import {ReserveForm} from './reserve';
import {GroupAdvicePanel,type AdviceSummary} from './group-advice';
import {useEffect,useRef,useState} from 'react';
import {Pill,Notice} from '../ui';
import {VoorLid} from './voor-lid';
import type {CustomerCard} from '@/lib/guest-customers';
import {dayLabel} from '@/lib/day-label';
// Gmail parts of Gesprekken: the Google connection, linked calendars and one Gmail conversation.
// Gmail is the source; the list comes from the backoffice index, an opened conversation is read live from Gmail.
export type MailStatus={mailbox:string;label:string;oauthConfigured:boolean;connected:boolean;status:string;labelFound:boolean;calendarAllowed:boolean;lastSyncOk:string|null;lastSyncAttempt:string|null;lastError:string|null;connectedBy:string;syncing:boolean;sendEnabled:boolean;threads:number};
export type MailRow={threadId:string;ref:string;subject:string;customerEmail:string;customerName:string;lastMessageAt:string;unread:boolean;automated:boolean;messageCount:number;attachmentCount:number;drafts:number;links:number;snippet:string;waiting:string;status:string;assigned:string;customerId:string};
type Msg={id:string;from:string;to:string;cc:string;bcc?:string;subject:string;date:string;text:string;fromHtml:boolean;attachments:{partId:string;filename:string;mimeType:string;size:number}[];fromUs:boolean;unread:boolean;automated:boolean};
type Draft=Msg&{draftId:string|null;messageId:string;source:string;createdBy:string;editable:boolean};
type Detail={thread:{threadId:string;ref:string;subject:string;customerEmail:string;customerName:string;lastMessageId:string;waiting:string;status:string;assigned:string;customerId:string;statusVersion:number;statusBy:string;statusAt:string|null;automated:number};messages:Msg[];drafts:Draft[];reply:{to:string[];cc:string[];subject:string}|null;reservations:{id:string;name:string;activity:string;date:string;from:string;to:string;people:number;status:string}[];links:{kind:string;ref:string;label:string;createdBy:string}[];sends:{requestId:string;status:string;error:string|null;created:string;by:string}[];gmailUrl:string;sendEnabled:boolean};
export const waitingLabel:Record<string,[string,'red'|'blue'|'green'|'orange']>={'klant-wacht':['Klant wacht op ons','red'],'wij-wachten':['Wij wachten op klant','blue'],'afgehandeld':['Afgehandeld','green'],'opnieuw-open':['Nieuw bericht na afhandeling','orange']};
export const when=(iso:string|null)=>iso?new Intl.DateTimeFormat('nl-NL',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Amsterdam'}).format(new Date(iso)):'nog niet';
const size=(n:number)=>n>1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' kB';
export async function call<T>(url:string,body?:unknown):Promise<T>{const r=await fetch(url,body===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(Error(d.error||'Er ging iets mis.'),{status:r.status});return d as T}

export function MailConnection({status,busy,onSync,onFull,onDisconnect}:{status:MailStatus|null;busy:boolean;onSync:()=>void;onFull:()=>void;onDisconnect:()=>void}){
 if(!status)return <p className="small">Gmail-koppeling laden…</p>;
 if(!status.oauthConfigured&&!status.connected)return <Notice kind="warn" title="Gmail nog niet ingesteld">{' '}Vul eerst de Google OAuth-client in bij <Link href="/koppeling">Systeem &amp; koppelingen → Gmail</Link>. Daarna koppel je hier met één klik. Er worden geen voorbeeldgesprekken getoond.</Notice>;
 const expired=status.status==='toegang-verlopen';
 return <div className="card mail-connection">
  <div className="card-head"><h3 className="card-title">Gmail · {status.mailbox}</h3>{status.connected?<Pill color={expired?'red':'green'}>{expired?'Toegang verlopen':'Gekoppeld'}</Pill>:<Pill color="orange">Niet gekoppeld</Pill>}</div>
  {status.connected?<p className="small">Label <strong>{status.label}</strong>{status.labelFound?'':' (nog niet gevonden)'} · {status.threads} gesprekken · laatste geslaagde synchronisatie: <strong>{when(status.lastSyncOk)}</strong>{status.syncing?' · bezig…':''}{status.connectedBy?' · gekoppeld door '+status.connectedBy:''}</p>
   :<p className="small">Koppel {status.mailbox} met Google. Je logt in bij Google en geeft toestemming om mail te lezen, concepten te maken en te verzenden, en voor de agenda. Archiveren, verwijderen en labels wijzigen kan deze koppeling niet.</p>}
  {status.lastError&&<p className="small mail-error">Laatste melding: {status.lastError}</p>}
  <p className="small">Verzenden: {status.sendEnabled?<strong>ingeschakeld</strong>:<>uitgeschakeld in deze omgeving (MAIL_SEND_ENABLED). Lezen en concepten maken werkt wel.</>}</p>
  <div className="actions">{(!status.connected||expired)&&status.oauthConfigured&&<a className="btn" href="/api/mail/oauth/start">{expired?'Opnieuw koppelen met Google':'Google koppelen'}</a>}
   {status.connected&&!expired&&<><button className="btn secondary sm" disabled={busy||status.syncing} onClick={onSync}>{status.syncing?'Synchroniseren…':'Nu synchroniseren'}</button><button className="btn ghost sm" disabled={busy||status.syncing} onClick={onFull}>Alles opnieuw ophalen</button><button className="btn red sm" disabled={busy} onClick={onDisconnect}>Ontkoppelen</button></>}</div>
 </div>;
}

/** Gesprekken only shows the state of the Gmail link; connecting and synchronising live at Koppelingen & printers (verzoek eigenaar 3 november 2026). */
export function MailStatusLine({status}:{status:MailStatus|null}){
 if(!status)return <p className="small">Gmail-koppeling laden…</p>;
 const settings=<Link href="/koppeling#gmail">Systeem &amp; koppelingen</Link>;
 if(!status.oauthConfigured&&!status.connected)return <Notice kind="warn" title="Gmail nog niet ingesteld">{' '}Stel Gmail in en koppel Google bij {settings}. Er worden geen voorbeeldgesprekken getoond.</Notice>;
 if(!status.connected)return <Notice kind="warn" title="Gmail nog niet gekoppeld">{' '}Koppel Google bij {settings}.</Notice>;
 if(status.status==='toegang-verlopen')return <Notice kind="warn" title="Toegang tot Gmail verlopen">{' '}Koppel opnieuw bij {settings}.</Notice>;
 return <p className="small mail-status-line">Gmail · {status.mailbox} · label <strong>{status.label}</strong> · laatste synchronisatie: <strong>{when(status.lastSyncOk)}</strong>{status.syncing?' · bezig…':''} · gaat vanzelf elke 5 minuten · synchroniseren en agenda&apos;s: {settings}{status.lastError&&<span className="mail-error"> · Laatste melding: {status.lastError}</span>}</p>;
}

type CalendarData={linked:{calendarId:string;name:string;role:string;lastSyncOk:string|null;lastError:string|null;updatedBy:string}[];available:{id:string;name:string;primary:boolean}[];error:string};
const roleNames:Record<string,string>={klanten:'Klanten-agenda (concept-aanvragen en opties)',evenementen:'Evenementen-agenda (evenementen uit Planning)'};
/** Linking calendars is choosing them from the account's list and giving each a role. */
export function Calendars({status}:{status:MailStatus|null}){
 const [data,setData]=useState<CalendarData|null>(null),[busy,setBusy]=useState(false),[note,setNote]=useState(''),[problem,setProblem]=useState('');
 const load=()=>call<CalendarData>('/api/mail/calendars').then(setData).catch(e=>setProblem(e.message));
 useEffect(()=>{if(status?.connected)void load()},[status?.connected]);
 if(!status?.connected)return null;
 async function link(calendarId:string,role:string){setBusy(true);setProblem('');setNote('');try{await call('/api/mail/calendars',{action:'link',calendarId,role:role||null});setNote(role?'Agenda gekoppeld; synchronisatie gestart.':'Agenda ontkoppeld. Bestaande items in Google blijven staan.');await load()}catch(e){setProblem((e as Error).message)}finally{setBusy(false)}}
 async function sync(){setBusy(true);setProblem('');try{await call('/api/mail/calendars',{action:'sync'});setNote('Agenda-synchronisatie gestart.');setTimeout(()=>void load(),2000)}catch(e){setProblem((e as Error).message)}finally{setBusy(false)}}
 const roleOf=(id:string)=>data?.linked.find(l=>l.calendarId===id)?.role||'';
 return <div className="card mail-connection section-gap" id="agendas">
  <div className="card-head"><h3 className="card-title">Agenda&apos;s</h3>{data?.linked.length?<button className="btn secondary sm" disabled={busy} onClick={sync}>Agenda&apos;s nu synchroniseren</button>:null}</div>
  <p className="small">Kies per agenda een rol. De backoffice is de bron: <strong>klanten</strong> krijgt conceptaanvragen en opties als voorlopig item (bevestigde afspraken zet de bestaande dagelijkse taak erin; het concept verdwijnt dan), <strong>evenementen</strong> krijgt de evenementen uit Planning. Alleen items die de backoffice zelf maakte, worden gewijzigd of opgeruimd.</p>
  {!status.calendarAllowed&&<Notice kind="warn" title="Agendatoestemming ontbreekt">{' '}Koppel Google opnieuw en sta ook de agenda toe.</Notice>}
  {problem&&<div className="message error" role="alert">{problem}</div>}{note&&<div className="message" role="status">{note}</div>}
  {data?.error&&<p className="small mail-error">{data.error}</p>}
  {data&&<ul className="mail-calendars">{[...data.available,...data.linked.filter(l=>!data.available.some(a=>a.id===l.calendarId)).map(l=>({id:l.calendarId,name:l.name+' (niet meer beschikbaar)',primary:false}))].map(c=>{const l=data.linked.find(x=>x.calendarId===c.id);return <li key={c.id}>
   <div><strong>{c.name}</strong>{c.primary?' · hoofdagenda':''}{l&&<span className="small"> · {l.lastError?<span className="mail-error">{l.lastError}</span>:'laatst gesynchroniseerd: '+when(l.lastSyncOk)}</span>}</div>
   <select className="input" aria-label={'Rol van '+c.name} value={roleOf(c.id)} disabled={busy} onChange={e=>link(c.id,e.target.value)}><option value="">Niet gebruiken</option>{Object.entries(roleNames).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
  </li>})}</ul>}
 </div>;
}

export function MailConversation({detail,cards,canManage,ai,reload,afterChange,onCustomer,onRemoved}:{detail:Detail;cards:CustomerCard[];canManage:boolean;ai:boolean;reload:()=>void;afterChange:()=>void;onCustomer:(id:string)=>void;onRemoved?:()=>void}){
 const t=detail.thread,[w,c]=waitingLabel[t.waiting]||['',''];
 const [text,setText]=useState(''),[editing,setEditing]=useState<Draft|null>(null);
 const [busy,setBusy]=useState(false),[note,setNote]=useState(''),[problem,setProblem]=useState(''),[orders,setOrders]=useState<{ref:string;label:string}[]|null>(null),[orderRef,setOrderRef]=useState('');
 const draftRequest=useRef(''),sendRequest=useRef('');
 const [advice,setAdvice]=useState<AdviceSummary|null>(null);
 // Conceptvoorstel in het antwoord (wens eigenaar 11 november 2026): staat er nog geen concept of eigen tekst, dan komt het gastconcept uit
 // het advies vast in het antwoordvak, ter controle. Er gaat niets naar Gmail tot je het bewaart; eigen tekst wordt nooit overschreven.
 // Na goedkeuring van de prijs wordt een nog onaangeroerd voorstel ververst, zodat de goedgekeurde prijs erin staat.
 const autoText=useRef(''),autoKey=useRef('');
 useEffect(()=>{
  if(!advice?.at||advice.stale||advice.busy||t.automated||detail.drafts.length||editing)return;
  if(text.trim()&&text!==autoText.current)return;
  const key=t.threadId+'|'+advice.at+'|'+(advice.approvedAt||'');if(autoKey.current===key)return;autoKey.current=key;
  void call<{text:string}>(base,{action:'advice-text'}).then(v=>{setText(cur=>cur.trim()&&cur!==autoText.current?cur:(autoText.current=v.text))}).catch(()=>{});
 },[advice?.at,advice?.stale,advice?.busy,advice?.approvedAt,detail.drafts.length,editing,t.threadId,t.automated]);
 useEffect(()=>{setAdvice(null);autoText.current='';autoKey.current=''},[t.threadId]);
 const base='/api/mail/threads/'+t.threadId;
 const card=cards.find(x=>x.id===t.customerId)||cards.find(x=>x.threadIds.includes(t.ref));
 async function act(body:Record<string,unknown>,done:string){setBusy(true);setProblem('');setNote('');try{await call(base,body);setNote(done);reload();afterChange();return true}catch(e){setProblem((e as Error).message);if((e as {status?:number}).status===409)reload();return false}finally{setBusy(false)}}
 async function saveDraft(){
  if(editing){if(await act({action:'draft-update',draftId:editing.draftId,baseMessageId:editing.messageId,lastMessageId:t.lastMessageId,body:text},'Concept bijgewerkt in Gmail.')){setEditing(null);setText('')}}
  else{draftRequest.current||=crypto.randomUUID();if(await act({action:'draft-create',lastMessageId:t.lastMessageId,body:text,requestId:draftRequest.current},'Concept bewaard in Gmail, in hetzelfde gesprek.')){draftRequest.current='';autoText.current='';setText('')}}
 }
 // Verwijderen (wens eigenaar 8 november 2026): alleen uit de backoffice; de mail blijft in Gmail staan.
 async function remove(){if(!confirm('Dit gesprek uit Gesprekken verwijderen?\n\nDe mail blijft in Gmail staan. Schrijft de klant opnieuw, dan komt het gesprek vanzelf terug.'))return;setBusy(true);setProblem('');try{await call(base,{action:'verwijderen',confirm:true,version:t.statusVersion});afterChange();onRemoved?.()}catch(e){setProblem((e as Error).message);if((e as {status?:number}).status===409)reload()}finally{setBusy(false)}}
 // Verzenden met één tik (wens eigenaar 11 november 2026: „De extra vraag om te bevestigen hoeft niet”). Het concept staat
 // er al boven; vlak voor verzenden controleert de server nog of er intussen een nieuw bericht of een gewijzigd concept is.
 // Eén aanvraag-id per concept: een tweede tik of een nieuwe poging na een storing verstuurt niets extra.
 const sentFor=useRef('');
 async function send(d:Draft){if(sentFor.current!==d.messageId){sentFor.current=d.messageId;sendRequest.current=crypto.randomUUID()}
  await act({action:'send',confirm:true,draftId:d.draftId,draftMessageId:d.messageId,lastMessageId:t.lastMessageId,requestId:sendRequest.current},'Verzonden vanuit Gmail, in hetzelfde gesprek.')}
 useEffect(()=>{if(!orders)call<{bestellingen:{ref:string;label:string}[]}>('/api/mail/linkable').then(d=>setOrders(d.bestellingen)).catch(()=>{})},[orders]);
 const hasDraft=detail.drafts.length>0,editorOpen=editing||!hasDraft;
 return <div>
  <div className="mail-detail-head"><div><h2>{t.subject}</h2><p className="small">{t.customerName?t.customerName+' · ':''}{t.customerEmail} · Gmail</p></div>
   <div className="actions">{w&&<Pill color={c as 'red'}>{w}</Pill>}<a className="btn ghost sm" href={detail.gmailUrl} target="_blank" rel="noreferrer">Openen in Gmail</a>{canManage&&<button type="button" className="btn red sm" disabled={busy} onClick={()=>{void remove()}}>Verwijderen</button>}</div></div>
  {canManage&&<VoorLid refId={t.ref}/>}
  {card?<aside className="customer-summary" aria-label="Gekoppelde klantenkaart"><div><strong>{card.name}</strong><span>{[card.company,card.email,card.phone].filter(Boolean).join(' · ')||'Contactgegevens nog aanvullen'}</span></div><button className="btn secondary sm" onClick={()=>onCustomer(card.id)}>Klantenkaart openen</button></aside>:null}
  {note&&<div className="message" role="status">{note}</div>}{problem&&<div className="message error" role="alert">{problem}</div>}
  <form className="guest-form guest-form-grouped" key={t.threadId+':'+t.statusVersion} onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void act({action:'work',status:f.get('status'),assigned:f.get('assigned'),customerId:f.get('customerId'),version:t.statusVersion},'Gesprek bijgewerkt. In Gmail verandert niets.')}}>
   <fieldset className="guest-fieldgroup"><legend>Afhandeling</legend>
    <label>Status<select name="status" defaultValue={t.status==='afgehandeld'?'afgehandeld':'open'} aria-label="Gespreksstatus"><option value="open">Open</option><option value="afgehandeld">Afgehandeld</option></select></label>
    <label>Verantwoordelijke<input name="assigned" defaultValue={t.assigned} maxLength={100} placeholder="bijv. rianne"/></label>
    <label>Klantenkaart<select name="customerId" defaultValue={t.customerId} aria-label="Klantenkaart"><option value="">Automatisch op e-mailadres</option>{cards.map(x=><option value={x.id} key={x.id}>{x.name}{x.email?' · '+x.email:''}</option>)}</select></label>
   </fieldset>
   <div className="guest-form-actions"><button className="btn secondary" disabled={busy}>Opslaan</button>{t.statusAt&&<span className="small">Laatst door {t.statusBy||'onbekend'} · {when(t.statusAt)}</span>}</div>
  </form>
  <GroupAdvicePanel threadRef={t.ref} key={t.threadId} base={base} lastMessageId={t.lastMessageId} automatic={ai&&!t.automated&&['klant-wacht','opnieuw-open'].includes(t.waiting)} canManage={canManage} onSummary={setAdvice} reserve={<div className="advice-reserve">
   {canManage&&<ReserveForm key={'reserveren:'+t.threadId} threadRef={t.ref} name={card?.name||t.customerName||''} email={card?.email||t.customerEmail||''} customerId={t.customerId||''} suggestion={advice?.booking} wishes={advice?.wishes} texts={[advice?.wishes||'',advice?.nextAction||'',...detail.messages.filter(m=>!m.fromUs).map(m=>m.text).reverse()]} onSaved={()=>{reload();afterChange()}}/>}
   {detail.reservations.length?<ul className="mail-links">{detail.reservations.map(r=><li key={r.id}>{r.name} · {r.activity} · {dayLabel(r.date)} {r.from}–{r.to} · {r.people} personen · <strong>{r.status}</strong></li>)}</ul>:<p className="small">Nog geen aanvraag of reservering bij dit gesprek.</p>}
   {canManage&&<Link className="btn secondary sm" href={'/planning?thread='+encodeURIComponent(t.ref)}>Aanvraag / reservering beheren</Link>}
   <p className="small">Een mail maakt nooit zelf een boeking. Beschikbaarheid en capaciteit komen uit Planning.</p>
  </div>} onText={value=>{if(text.trim()||editing||detail.drafts.length){setProblem('Er is al een concept of eigen tekst. Bewaar die eerst; niets is overschreven.');return false}setText(value);return true}}/>
  <h3 className="card-title section-gap">Mail</h3>
  <ol className="mail-thread">{detail.messages.map(m=><li key={m.id} className={'mail-message'+(m.fromUs?' ours':'')}>
   <div className="mail-message-head"><strong>{m.from}</strong><span className="small">{when(m.date)}</span></div>
   <div className="small">Aan: {m.to}{m.cc?' · Cc: '+m.cc:''}{m.unread?' · ongelezen in Gmail':''}{m.automated?' · automatisch bericht':''}{m.fromHtml?' · opgemaakte mail, als tekst getoond':''}</div>
   <div className="mail-text">{m.text||'(geen tekst)'}</div>
   {m.attachments.length>0&&<ul className="mail-attachments">{m.attachments.map(a=><li key={a.partId}><a href={`${base}/attachment?message=${m.id}&part=${encodeURIComponent(a.partId)}`}>📎 {a.filename}</a> <span className="small">{size(a.size)}</span></li>)}</ul>}
  </li>)}</ol>
  <h3 className="card-title section-gap">Antwoord</h3>
  {t.automated?<p className="small">Automatisch bericht (bijvoorbeeld een boekingsbevestiging). Hiervoor wordt geen concept gemaakt; schrijf zelf een antwoord als dat nodig is.</p>:null}
  {detail.drafts.map(d=><div key={d.messageId} className="mail-draft">
   <div className="mail-message-head"><strong>Concept in Gmail</strong><span className="small">{d.source==='backoffice'?'gemaakt in de backoffice'+(d.createdBy?' door '+d.createdBy:''):'gemaakt in Gmail of door de dagelijkse ChatGPT-taak'} · {when(d.date)}</span></div>
   <div className="small">Aan: {d.to||'(geen ontvanger)'}</div><div className="mail-text">{d.text||'(leeg)'}</div>
   <div className="actions">{d.editable?<button className="btn secondary sm" disabled={busy||!d.draftId} onClick={()=>{setEditing(d);setText(d.text)}}>Bewerken</button>:<span className="small">Bevat opmaak of bijlagen: bewerk dit concept in Gmail.</span>}
    <button className="btn sm" disabled={busy||!d.draftId||!detail.sendEnabled} onClick={()=>{void send(d)}}>{busy?'Bezig…':'Verzenden'}</button></div>
  </div>)}
  {!detail.sendEnabled&&<p className="small">Verzenden is in deze omgeving uitgeschakeld (of je hebt geen verzendrecht); er wordt geen echte mail verstuurd.</p>}
  {detail.drafts.length>0&&detail.sendEnabled&&<p className="small">Verzenden gaat direct. Is er intussen een nieuw bericht of een gewijzigd concept, dan wordt er niets verzonden.</p>}
  {editorOpen&&<div className="mail-editor">
   {!editing&&text&&text===autoText.current&&<p className="small advice-draft-note">✍ Conceptvoorstel van de mailassistent. Controleer en pas aan; er gaat niets weg tot je het als concept bewaart en daarna verzendt.</p>}
   <label htmlFor="mail-reply" className="small">{editing?'Concept bewerken (de wijziging wordt in hetzelfde Gmail-concept opgeslagen)':`Nieuw antwoord aan ${detail.reply?.to.join(', ')||'(geen ontvanger gevonden)'}`}</label>
   <textarea id="mail-reply" className="input" rows={12} value={text} maxLength={20000} onChange={e=>setText(e.target.value)}/>
   <div className="actions"><button className="btn" disabled={busy||!text.trim()||(!editing&&!detail.reply?.to.length)} onClick={saveDraft}>{editing?'Wijziging opslaan in Gmail':'Bewaren als concept in Gmail'}</button>
    {editing&&<button className="btn secondary" disabled={busy} onClick={()=>{setEditing(null);setText('')}}>Annuleren</button>}</div>
  </div>}
  <h3 className="card-title section-gap">Gekoppelde bestellingen</h3>
  {detail.links.length?<ul className="mail-links">{detail.links.map(l=><li key={l.kind+l.ref}>{l.label} <span className="small">({l.createdBy})</span> <button className="text-button" disabled={busy} onClick={()=>act({action:'link-remove',kind:l.kind,ref:l.ref},'Koppeling verwijderd.')}>verwijderen</button></li>)}</ul>:<p className="small">Nog niet gekoppeld aan een bestelling.</p>}
  <div className="actions"><select className="input" value={orderRef} onChange={e=>setOrderRef(e.target.value)} aria-label="Bestelling"><option value="">Kies een bestelling…</option>{(orders||[]).map(o=><option key={o.ref} value={o.ref}>{o.label}</option>)}</select>
   <button className="btn secondary sm" disabled={busy||!orderRef} onClick={()=>act({action:'link-add',kind:'bestelling',ref:orderRef},'Gekoppeld.')}>Koppelen</button></div>
  {detail.sends.length>0&&<><h3 className="card-title section-gap">Verzendgeschiedenis</h3><ul className="mail-links">{detail.sends.map(s=><li key={s.requestId}>{when(s.created)} · {s.by} · <strong>{s.status}</strong>{s.error?' — '+s.error:''}</li>)}</ul></>}
 </div>;
}

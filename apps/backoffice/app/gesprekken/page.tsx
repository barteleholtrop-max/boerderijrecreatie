'use client';
import {useState,useEffect,useCallback,useMemo,useRef} from 'react';
import Link from 'next/link';
import {PageHead} from '../ui';
import {Customers,CustomerSummary} from './customers';
import {customerCards,cardForThread} from '@/lib/guest-customers';
import {useGuests} from '../use-guests';
import {MailStatusLine,MailConversation,call,type MailStatus,type MailRow} from './mail';
import {dayLabel} from '@/lib/day-label';
import {GroupAdvicePanel,type AdviceSummary} from './group-advice';
import {ReserveForm} from './reserve';
import {Meldingen} from './meldingen';
import {Kennisbank} from './kennisbank';
import {MetaConversation,metaName,type MetaRow,type MetaStatus} from './meta';
import {ConversationRow,mailPreview,type ListRow} from './rij';
// One inbox (besluit eigenaar, 3 november 2026): Gmail-gesprekken met het label TODO Klanten via de Gmail-koppeling
// (lib/mail-store.ts) en websitechats uit het gastcontact. Klantenkaarten en reserveringen gelden voor beide.
// Sinds 9 november 2026 (akkoord eigenaar) ook WhatsApp, Messenger en Instagram (lib/meta-store.ts), met een filter per kanaal.
const filters:[string,string][]=[['open','Open'],['klant-wacht','Klant wacht op ons'],['wij-wachten','Wij wachten op klant'],['afgehandeld','Afgehandeld'],['alles','Alles']];
const chatStatuses=['nieuw','in behandeling','wacht op gast','afgehandeld'];
const chatWaiting=(s:string)=>s==='afgehandeld'?'afgehandeld':s==='wacht op gast'?'wij-wachten':'klant-wacht';
const kinds:[string,string][]=[['','Alle kanalen'],['whatsapp','WhatsApp'],['gmail','Mail'],['chat','Websitechat'],['messenger','Messenger'],['instagram','Instagram']];
// Lijst in de uitstraling van het telefoonontwerp (wens eigenaar 9 november 2026: gelijk op telefoon en computer), zie rij.tsx.
type Entry=ListRow&{subject:string;search:string};

export default function Inbox(){
 const {data,error,busy,act,reload}=useGuests(),[selected,setSelected]=useState(''),[search,setSearch]=useState(''),[filter,setFilter]=useState('open'),[assigned,setAssigned]=useState(''),[message,setMessage]=useState(''),[tab,setTab]=useState('gesprekken'),[customer,setCustomer]=useState(''),[kind,setKind]=useState('');
 const [meta,setMeta]=useState<{status:MetaStatus;threads:MetaRow[]}|null>(null);
 const [mail,setMail]=useState<{status:MailStatus;threads:MailRow[]}|null>(null),[detail,setDetail]=useState<any>(null),[loading,setLoading]=useState(false);
 // Snelheid (4 november 2026): klantenkaarten één keer per nieuwe dataset uitrekenen, niet bij elke toetsaanslag.
 const cards=useMemo(()=>data?customerCards(data.state,data.signups||[],data.orderCards||[]):[],[data]);
 const loadMail=useCallback(async()=>{try{setMail(await call('/api/mail?filter=alles'))}catch(e){if((e as {status?:number}).status!==403)setMessage((e as Error).message)}},[]);
 useEffect(()=>{void loadMail()},[loadMail]);
 const loadMeta=useCallback(async()=>{try{setMeta(await call('/api/meta'))}catch(e){if((e as {status?:number}).status!==403)setMessage((e as Error).message)}},[]);
 // WhatsApp en de andere Meta-kanalen komen via de webhook binnen; de lijst kijkt elke 30 seconden.
 useEffect(()=>{void loadMeta();const t=setInterval(()=>{void loadMeta()},30000);return()=>clearInterval(t)},[loadMeta]);
 // Only the backoffice index is read here; Gmail itself is synchronised in the background every few minutes.
 useEffect(()=>{const t=setInterval(()=>{void loadMail()},mail?.status.syncing?4000:60000);return()=>clearInterval(t)},[loadMail,mail?.status.syncing]);
 useEffect(()=>{const q=new URLSearchParams(location.search),g=q.get('gmail');if(q.get('tab')==='klanten')setTab('klanten');if(q.get('tab')==='kennis')setTab('kennis');if(q.get('klant'))setCustomer(q.get('klant')!);if(q.get('gesprek'))setSelected(q.get('gesprek')!);
  // Old return links from Google: connecting now lives at Koppelingen & printers.
  if(g){location.replace('/koppeling'+location.search+'#gmail')}},[]);
 const openMail=useCallback(async(threadId:string)=>{setLoading(true);try{setDetail(await call('/api/mail/threads/'+threadId))}catch(e){setDetail(null);setMessage((e as Error).message)}finally{setLoading(false)}},[]);
 useEffect(()=>{if(selected.startsWith('gmail:'))void openMail(selected.slice(6));else setDetail(null)},[selected,openMail]);
 function openConversation(ref:string){setSelected(ref);setTab('gesprekken');window.history.replaceState(null,'','/gesprekken'+(ref?'?gesprek='+encodeURIComponent(ref):''));if(ref&&window.matchMedia('(max-width:940px)').matches)setTimeout(()=>document.getElementById('gesprek')?.scrollIntoView({behavior:'smooth'}),50)}
 function openCustomer(id:string){setCustomer(id);setTab('klanten');window.history.replaceState(null,'','/gesprekken?tab=klanten&klant='+encodeURIComponent(id))}

 const entries:Entry[]=[
  ...(mail?.threads||[]).map(r=>({ref:r.ref,kind:'gmail' as const,name:r.customerName||r.customerEmail||'Onbekende afzender',subject:r.subject,text:mailPreview(r.subject,r.snippet),search:r.snippet,at:r.lastMessageAt,waiting:r.waiting,assigned:r.assigned,unread:r.unread,fromUs:r.waiting==='wij-wachten',automated:r.automated,drafts:r.drafts,attachments:r.attachmentCount})),
  ...(meta?.threads||[]).map(r=>({ref:r.ref,kind:r.channel,name:metaName(r),subject:r.snippet,text:r.snippet,search:r.snippet+' '+r.phone,at:r.lastMessageAt,waiting:r.waiting,assigned:r.assigned,unread:r.unread>0,unreadCount:r.unread,fromUs:r.lastFromUs,windowLeft:r.windowLeft})),
  ...(data?.state.threads.filter(t=>t.channel==='chat')||[]).map(t=>({ref:t.id,kind:'chat' as const,name:t.customer||t.sender||'Websitegast',subject:t.subject,text:t.subject,search:t.messages.map(m=>m.text).join(' '),at:t.updated,waiting:chatWaiting(t.status),assigned:t.assigned,unread:false})),
 ].filter(e=>(!kind||e.kind===kind)&&(filter==='alles'||(filter==='open'?e.waiting!=='afgehandeld':filter==='klant-wacht'?e.waiting==='klant-wacht'||e.waiting==='opnieuw-open':e.waiting===filter))&&(!assigned||e.assigned.toLowerCase().includes(assigned.toLowerCase()))&&(!search||[e.name,e.subject,e.search].join(' ').toLowerCase().includes(search.toLowerCase()))).sort((a,b)=>b.at.localeCompare(a.at));
 const chat=data?.state.threads.find(t=>t.id===selected&&t.channel==='chat');

 return <div className="guest-workspace compact-workspace" data-bb-view="guest-inbox"><PageHead eyebrow="GASTCONTACT" title="Gesprekken, aanvragen & klanten" sub="Klantmail (Gmail), websitechats, klantenkaarten en reserveringen op één plek. Gmail blijft de bron voor mail en concepten."><Meldingen/><button className="btn secondary" disabled={busy} onClick={()=>{reload();void loadMail();void loadMeta();if(selected.startsWith('gmail:'))void openMail(selected.slice(6))}}>Verversen</button></PageHead>
  {error&&<div role="alert" className="message">{error}</div>}{message&&<div role="status" className="message">{message} <button onClick={()=>setMessage('')}>×</button></div>}
  <nav className="tabs" aria-label="Gastcontact onderdelen"><button className={'tab'+(tab==='gesprekken'?' active':'')} aria-current={tab==='gesprekken'?'page':undefined} onClick={()=>openConversation(selected)}>Gesprekken & aanvragen</button><button className={'tab'+(tab==='klanten'?' active':'')} aria-current={tab==='klanten'?'page':undefined} onClick={()=>openCustomer(customer)}>Klanten</button><button className={'tab'+(tab==='kennis'?' active':'')} aria-current={tab==='kennis'?'page':undefined} onClick={()=>{setTab('kennis');window.history.replaceState(null,'','/gesprekken?tab=kennis')}}>Kennisbank</button></nav>
  {tab==='kennis'?<Kennisbank/>:!data?<p>Gesprekken laden…</p>:tab==='klanten'?<Customers state={data.state} signups={data.signups} orderCards={data.orderCards||[]} metaThreads={meta?.threads||[]} selected={customer} onSelect={openCustomer} onConversation={openConversation} act={act} busy={busy} canEdit={data.permissions.manage}/>:<>
  {data.mail.view?<MailStatusLine status={mail?.status||null}/>:<p className="small">Je hebt geen toegang tot de klantmail. Websitechats en klanten zie je wel.</p>}
  <div className="guest-inbox section-gap"><section className="mail-list tel-pane" aria-label="Gesprekken">
   <label className="tel-search"><span className="sr-only">Zoeken</span><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Zoek op naam, telefoon, e-mail of onderwerp"/></label>
   <nav className="tel-chips" aria-label="Filter">{filters.map(([k,l])=><button key={k} className={'tel-chip'+(filter===k?' active':'')+(k==='klant-wacht'?' warm':'')} aria-pressed={filter===k} onClick={()=>setFilter(k)}>{l}</button>)}</nav>
   <nav className="tel-chips" aria-label="Kanaal">{kinds.map(([k,l])=><button key={k} className={'tel-chip'+(kind===k?' active':'')} aria-pressed={kind===k} onClick={()=>setKind(k)}>{l}</button>)}</nav>
   <label className="tel-search small-search"><span className="sr-only">Medewerker</span><input placeholder="Filter op medewerker" value={assigned} onChange={e=>setAssigned(e.target.value)}/></label>
   <ul className="tel-list">{entries.map(e=><li key={e.ref}><ConversationRow r={e} active={selected===e.ref} onOpen={()=>openConversation(e.ref)}/></li>)}</ul>{!entries.length&&<p className="empty">Geen gesprekken in dit overzicht.</p>}
  </section>
  <section className="card mail-detail" id="gesprek" aria-label="Gesprek" aria-busy={loading}>
   {!selected&&<p className="empty">Kies een gesprek. Openen markeert niets als gelezen in Gmail.</p>}
   {selected.startsWith('gmail:')&&(loading&&!detail?<p className="small">Gesprek wordt uit Gmail geladen…</p>:detail&&detail.thread.ref===selected&&<MailConversation detail={detail} cards={cards} canManage={data.permissions.manage} ai={data.ai} reload={()=>openMail(selected.slice(6))} afterChange={()=>{void loadMail();reload()}} onCustomer={openCustomer} onRemoved={()=>{openConversation('');setMessage('Gesprek verwijderd uit Gesprekken. De mail staat nog in Gmail.')}}/>)}
   {selected.startsWith('meta:')&&<MetaConversation key={selected} id={selected.slice(5)} cards={cards} canManage={data.permissions.manage} onCustomer={openCustomer} afterChange={()=>{void loadMeta()}} createCard={async c=>{const id=crypto.randomUUID();try{await act({action:'customer',customer:{id,name:c.name,email:'',phone:c.phone,company:'',address:'',notes:''}});return id}catch{return null}}}/>}
   {chat&&<ChatConversation t={chat} data={data} act={act} busy={busy} onCustomer={openCustomer} reload={reload} onRemoved={()=>{openConversation('');setMessage('Websitechat verwijderd. Gekoppelde aanvragen en reserveringen blijven bestaan.')}}/>}
  </section></div></>}
 </div>;
}

/** Website chats (imported conversations) keep the existing guest workspace flow. */
function ChatConversation({t,data,act,busy,onCustomer,reload,onRemoved}:{t:any;data:NonNullable<ReturnType<typeof useGuests>['data']>;act:(b:Record<string,unknown>)=>Promise<any>;busy:boolean;onCustomer:(id:string)=>void;reload:()=>unknown;onRemoved:()=>void}){
 const cards=useMemo(()=>customerCards(data.state),[data]),linked=cardForThread(cards,t.id),go=(b:Record<string,unknown>)=>act(b).catch(()=>{});
 // Intern advies (Claude of OpenAI) ook bij een websitechat of groepsaanvraag (wens eigenaar 3 november 2026).
 const [advice,setAdvice]=useState<AdviceSummary|null>(null),[concept,setConcept]=useState(''),[copied,setCopied]=useState(false);
 const last=t.messages.at(-1),base='/api/gasten/chat/'+encodeURIComponent(t.id);
 // Conceptvoorstel vanzelf klaarzetten (wens eigenaar 11 november 2026), alleen zolang er nog geen eigen tekst staat.
 const autoKey=useRef('');
 useEffect(()=>{if(!advice?.at||advice.stale||advice.busy||concept.trim())return;const key=t.id+'|'+advice.at+'|'+(advice.approvedAt||'');if(autoKey.current===key)return;autoKey.current=key;void fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'advice-text'})}).then(r=>r.ok?r.json():null).then((v:{text?:string}|null)=>{if(v?.text)setConcept(c=>c.trim()?c:v.text!)}).catch(()=>{})},[advice?.at,advice?.stale,advice?.busy,advice?.approvedAt,t.id]);
 return <><h2>{t.subject}</h2><CustomerSummary card={linked} onOpen={onCustomer}/><p className="small">{t.customer||t.sender} · websitechat</p>
  <div className="actions"><button className="btn secondary" disabled={busy} onClick={()=>go({action:'claim',id:t.id})}>In behandeling nemen / verlengen</button>{data.permissions.manage&&<button type="button" className="btn red" disabled={busy} onClick={()=>{if(confirm('Deze websitechat verwijderen?\n\nHet gesprek en het interne advies verdwijnen. Gekoppelde aanvragen en reserveringen blijven bestaan.'))act({action:'thread-delete',id:t.id,confirm:true}).then(onRemoved).catch(()=>{})}}>Verwijderen</button>}</div><p role="status" className="small">{t.editingBy&&t.editingUntil>Date.now()?t.editingBy+' werkt aan dit gesprek (5 minuten; verleng zo nodig).':'Niemand werkt nu aan dit gesprek.'}</p>
  <form className="guest-form guest-form-grouped" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);go({action:'thread',id:t.id,thread:Object.fromEntries(f)})}} key={t.id+':'+data.version}><fieldset className="guest-fieldgroup"><legend>Afhandeling</legend><label>Status<select aria-label="Gespreksstatus" name="status" defaultValue={t.status}>{chatStatuses.map(s=><option key={s}>{s}</option>)}</select></label><label>Verantwoordelijke<input name="assigned" defaultValue={t.assigned}/></label><input type="hidden" name="customer" value={t.customer}/><label>Klantenkaart<select aria-label="Klantenkaart" name="customerId" defaultValue={t.customerId||''}><option value="">Automatisch op e-mailadres</option>{cards.map(c=><option value={c.id} key={c.id}>{c.name}{c.email?' · '+c.email:''}</option>)}</select></label></fieldset><fieldset className="guest-fieldgroup"><legend>Gesprekscontext</legend><label>Samenvatting<textarea name="summary" defaultValue={t.summary}/></label><label>Transcript / wensen<textarea name="transcript" defaultValue={t.transcript}/></label></fieldset><div className="guest-form-actions"><button className="btn secondary" disabled={busy||t.editingBy!==data.account}>Gespreksgegevens opslaan</button></div></form>
  <GroupAdvicePanel threadRef={t.id} key={t.id} base={base} lastMessageId={last?.id||''} automatic={!!data.ai&&t.status==='nieuw'} canManage={data.permissions.manage} onSummary={setAdvice} reserve={<div className="advice-reserve">
   {data.permissions.manage&&<ReserveForm key={'reserveren:'+t.id} threadRef={t.id} name={linked?.name||t.customer||t.sender||''} email={linked?.email||''} customerId={t.customerId||''} suggestion={advice?.booking} wishes={advice?.wishes} texts={[advice?.wishes||'',advice?.nextAction||'',...[...t.messages].reverse().map((m:any)=>m.text)]} onSaved={()=>{void reload()}}/>}
   <h3>Gekoppelde aanvragen</h3>{data.state.reservations.filter(r=>r.threadId===t.id).map(r=><p key={r.id}>{r.name} · {dayLabel(r.date)} {r.from} · {r.people} personen · {r.status}</p>)}
   <Link className="btn secondary sm" href={'/planning?thread='+encodeURIComponent(t.id)}>Aanvraag / reservering beheren</Link>
  </div>} onText={value=>{setConcept(value);setCopied(false);return true}}/>
  <div className="guest-history">{t.messages.map((m:any)=><article key={m.id}><strong>{m.from}</strong><p className="small">{new Date(m.at).toLocaleString('nl-NL')}</p><p style={{whiteSpace:'pre-wrap'}}>{m.text}</p></article>)}</div>
  {concept&&<section className="card section-gap" aria-label="Gastconcept"><h3 className="card-title">Gastconcept</h3><p className="small">Een websitechat heeft geen antwoordknop in de backoffice. Kopieer de tekst en stuur hem per mail of telefoon; er is niets verstuurd.</p><textarea rows={10} value={concept} onChange={e=>setConcept(e.target.value)}/><div className="actions"><button type="button" className="btn secondary sm" onClick={()=>{navigator.clipboard?.writeText(concept).then(()=>setCopied(true)).catch(()=>{})}}>{copied?'Gekopieerd':'Tekst kopiëren'}</button></div></section>}</>;
}

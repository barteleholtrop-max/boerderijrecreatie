'use client';
// Gesprekken in telefoonstand (wens eigenaar 9 november 2026: „de uitstraling van het ontwerp, in het linkermenu bij de
// Weekassistent”). Eén lijst met alle gesprekken (WhatsApp, mail, websitechat, Messenger, Instagram) zoals in het goedgekeurde
// ontwerp; een tik opent het gesprek schermvullend. Dezelfde gegevens en rechten als /gesprekken; alleen de weergave is anders.
import {useCallback,useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {useGuests} from '../../use-guests';
import {customerCards} from '@/lib/guest-customers';
import {call,MailConversation} from '../mail';
import {ConversationRow,KIND_NAME,isWaiting,mailPreview,type ListRow,type Kind} from '../rij';
import {MetaConversation,metaName,type MetaRow} from '../meta';
import {Meldingen} from '../meldingen';
import type {MailRow} from '../mail';

const chips:[string,string][]=[['','Alles'],['wacht','Wacht op ons'],['whatsapp','WhatsApp'],['gmail','Mail'],['chat','Chat'],['messenger','Messenger'],['instagram','Instagram']];
const chatWaiting=(s:string)=>s==='afgehandeld'?'afgehandeld':s==='wacht op gast'?'wij-wachten':'klant-wacht';

export default function GesprekkenTelefoon(){
 const {data,act,reload}=useGuests();
 const [mail,setMail]=useState<MailRow[]>([]),[meta,setMeta]=useState<MetaRow[]>([]),[filter,setFilter]=useState(''),[search,setSearch]=useState(''),[open,setOpen]=useState(''),[detail,setDetail]=useState<any>(null),[problem,setProblem]=useState('');
 const cards=useMemo(()=>data?customerCards(data.state,data.signups||[],data.orderCards||[]):[],[data]);
 const load=useCallback(async()=>{
  try{setMeta((await call<{threads:MetaRow[]}>('/api/meta')).threads)}catch(e){if((e as {status?:number}).status!==403)setProblem((e as Error).message)}
  try{setMail((await call<{threads:MailRow[]}>('/api/mail?filter=alles')).threads)}catch{}
 },[]);
 useEffect(()=>{void load();const t=setInterval(()=>{void load()},30000);return()=>clearInterval(t)},[load]);
 // Een link uit een melding (/gesprekken/telefoon?gesprek=…) opent meteen het gesprek.
 // Terugknop van de telefoon (melding eigenaar 10 november 2026: „hij gaat niet terug naar dit scherm”): een gesprek openen
 // is een stap in de geschiedenis, terug sluit het gesprek en toont de lijst weer.
 useEffect(()=>{const sync=()=>{setOpen(new URLSearchParams(location.search).get('gesprek')||'');window.scrollTo(0,0)};sync();window.addEventListener('popstate',sync);return()=>window.removeEventListener('popstate',sync)},[]);
 useEffect(()=>{setDetail(null);if(open.startsWith('gmail:'))call('/api/mail/threads/'+open.slice(6)).then(setDetail).catch(e=>setProblem(e.message))},[open]);
 function go(ref:string){
  if(ref){history.pushState({gesprek:ref},'','/management/gesprekken?gesprek='+encodeURIComponent(ref));setOpen(ref);window.scrollTo(0,0);return}
  // Terug naar de lijst: via de geschiedenis als we vanuit de lijst kwamen, anders (vanuit een melding) gewoon de lijst tonen.
  if((history.state as {gesprek?:string}|null)?.gesprek)history.back();else{history.replaceState(null,'','/management/gesprekken');setOpen('');window.scrollTo(0,0)}
  void load();
 }

 const rows:ListRow[]=[
  ...meta.map(r=>({ref:r.ref,kind:r.channel as Kind,name:metaName(r),text:r.snippet,at:r.lastMessageAt,waiting:r.waiting,assigned:r.assigned,unread:r.unread>0,unreadCount:r.unread,fromUs:r.lastFromUs,windowLeft:r.windowLeft})),
  ...mail.map(r=>({ref:r.ref,kind:'gmail' as Kind,name:r.customerName||r.customerEmail||'Onbekende afzender',text:mailPreview(r.subject,r.snippet),at:r.lastMessageAt,waiting:r.waiting,assigned:r.assigned,unread:r.unread,fromUs:r.waiting==='wij-wachten',automated:r.automated,drafts:r.drafts,attachments:r.attachmentCount})),
  ...(data?.state.threads.filter(t=>t.channel==='chat')||[]).map(t=>({ref:t.id,kind:'chat' as Kind,name:t.customer||t.sender||'Websitegast',text:t.subject,at:t.updated,waiting:chatWaiting(t.status),assigned:t.assigned,unread:false})),
 ].sort((a,b)=>b.at.localeCompare(a.at));
 const waitingCount=rows.filter(r=>isWaiting(r.waiting)).length;
 const q=search.trim().toLowerCase();
 const shown=rows.filter(r=>(!filter||(filter==='wacht'?isWaiting(r.waiting):r.kind===filter))&&(!q||[r.name,r.text,r.assigned].join(' ').toLowerCase().includes(q)));
 const current=rows.find(r=>r.ref===open);

 if(open)return <div className="tel" data-bb-view="gesprekken-telefoon-gesprek">
  <div className="tel-top"><button className="tel-back" onClick={()=>go('')} aria-label="Terug naar alle gesprekken">‹ Gesprekken</button>{current&&!open.startsWith('meta:')&&<span className={'tel-kind k-'+current.kind}>{KIND_NAME[current.kind]}</span>}</div>
  {problem&&<div className="message error" role="alert">{problem}</div>}
  {open.startsWith('meta:')&&<MetaConversation key={open} id={open.slice(5)} cards={cards} canManage={!!data?.permissions.manage} onCustomer={id=>{location.href='/gesprekken?tab=klanten&klant='+encodeURIComponent(id)}} afterChange={()=>{void load()}} createCard={async c=>{const id=crypto.randomUUID();try{await act({action:'customer',customer:{id,name:c.name,email:'',phone:c.phone,company:'',address:'',notes:''}});return id}catch{return null}}}/>}
  {open.startsWith('gmail:')&&(!detail?<p className="small">Gesprek wordt uit Gmail geladen…</p>:<div className="tel-mail"><MailConversation detail={detail} cards={cards} canManage={!!data?.permissions.manage} ai={!!data?.ai} reload={()=>{call('/api/mail/threads/'+open.slice(6)).then(setDetail).catch(()=>{})}} afterChange={()=>{void load();reload()}} onCustomer={id=>{location.href='/gesprekken?tab=klanten&klant='+encodeURIComponent(id)}} onRemoved={()=>go('')}/></div>)}
  {!open.startsWith('meta:')&&!open.startsWith('gmail:')&&<div className="tel-card"><p>Een websitechat open je in het volledige scherm.</p><Link className="btn" href={'/gesprekken?gesprek='+encodeURIComponent(open)}>Openen</Link></div>}
 </div>;

 return <div className="tel" data-bb-view="gesprekken-telefoon">
  <div className="tel-head"><div><span className="eyebrow">Boer Bart</span><h1>Gesprekken</h1></div><Meldingen/></div>
  <label className="tel-search"><span className="sr-only">Zoeken</span><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Zoek op naam, telefoon of e-mail"/></label>
  <nav className="tel-chips" aria-label="Filter">{chips.map(([k,l])=><button key={k} className={'tel-chip'+(filter===k?' active':'')+(k==='wacht'?' warm':'')} aria-pressed={filter===k} onClick={()=>setFilter(filter===k&&k?'':k)}>{l}{k===''?' · '+rows.length:k==='wacht'?' · '+waitingCount:''}</button>)}</nav>
  {problem&&<div className="message error" role="alert">{problem}</div>}
  <ul className="tel-list">{shown.map(r=><li key={r.ref}><ConversationRow r={r} onOpen={()=>go(r.ref)}/></li>)}</ul>
  {!shown.length&&<p className="empty">Geen gesprekken in dit overzicht.</p>}
  <p className="small tel-foot"><Link href="/gesprekken">Volledig scherm met klanten en kennisbank</Link></p>
 </div>;
}

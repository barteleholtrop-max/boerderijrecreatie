'use client';
import Link from 'next/link';
import {Suspense,useCallback,useEffect,useRef,useState} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';
import {makeId} from '@/lib/id.mjs';
import {PageHead,Pill,Notice} from '../ui';
import {ChatText} from '../chat-text';
import {useDictation,useReadAloud} from '../spraak';
import {useFoto} from '../foto';
import {Boodschappen} from './boodschappen';

type Thread={id:string;week:string;title:string;account:string;updated:string};
type Message={id:string;role:'user'|'assistant'|'notitie';account:string;text:string;created:string;sources:string[];foto?:boolean};
type MenuItem={productId:string;name:string;day:string;portions:number|null;note:string};
type Menu={id:string;status:string;version:number;items:MenuItem[]}|null;
type Detail={configured:boolean;thread:Thread;expired:boolean;messages:Message[];pending:{status:string;delayed:boolean}|null;menu:{concept:Menu;confirmed:Menu;proposal:{id:string;version:number}|null}};
type Overview={configured:boolean;week:string;weekTitle:string;threads:Thread[]};

const clock=(iso:string)=>new Intl.DateTimeFormat('nl-NL',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Amsterdam'}).format(new Date(iso));
const dayOf=(iso:string)=>new Intl.DateTimeFormat('nl-NL',{weekday:'long',day:'numeric',month:'long',timeZone:'Europe/Amsterdam'}).format(new Date(iso));
const time=(iso:string)=>new Intl.DateTimeFormat('nl-NL',{weekday:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Amsterdam'}).format(new Date(iso));
async function call(url:string,body?:unknown){
 const r=await fetch(url,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});
 const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error||'Er ging iets mis.');return data;
}

function MenuCard({title,menu,children}:{title:string;menu:Menu;children?:React.ReactNode}){
 if(!menu)return null;
 return <div className="card"><div className="card-head"><h3 className="card-title">{title}</h3><Pill color={menu.status==='bevestigd'?'green':'orange'}>{menu.status==='bevestigd'?'Bevestigd':'Concept'}</Pill></div>
  {menu.items.map((i,n)=><div className="menu-line" key={n}><span><strong>{i.name}</strong>{i.note?<span className="small"> · {i.note}</span>:null}</span><span className="small">{i.day||'hele week'}{i.portions?` · ${i.portions} porties`:''}</span></div>)}
  {children}</div>;
}


/** Ook gebruikt in de app Gesprekken (/assistent/telefoon, wens eigenaar 10 november 2026): dan zonder paginakop en
 * zonder overzicht, en opent hij meteen het weekgesprek van deze week. */
export function Assistent({app=false}:{app?:boolean}){
 const params=useSearchParams(),router=useRouter(),[auto,setAuto]=useState(''),threadId=params.get('gesprek')||(app?auto:'')||null;
 // In de app (wens eigenaar 10 november 2026: „werkt als een pagina, ik moet eerst scrollen om iets in te spreken”): het gesprek vult
 // het scherm zoals WhatsApp; het weekmenu zit achter de knop Weekmenu in de kop.
 const [menuOpen,setMenuOpen]=useState(false);
 const [overview,setOverview]=useState<Overview|null>(null),[detail,setDetail]=useState<Detail|null>(null),[text,setText]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const log=useRef<HTMLDivElement>(null),seen=useRef<Set<string>|null>(null),input=useRef<HTMLTextAreaElement>(null);
 // Spraak (wens eigenaar 9 november 2026): inspreken met de microfoonknop, en nieuwe antwoorden laten voorlezen.
 const dictation=useDictation(setText),voice=useReadAloud();
 // Foto meesturen (wens eigenaar 13 november 2026): de assistent leest de informatie eruit.
 const photo=useFoto(),fileInput=useRef<HTMLInputElement>(null);
 const load=useCallback(async()=>{
  try{setOverview(await call('/api/assistent'));if(threadId)setDetail(await call('/api/assistent?thread='+encodeURIComponent(threadId)));else setDetail(null)}
  catch(e){setError((e as Error).message)}
 },[threadId]);
 useEffect(()=>{void load()},[load]);
 // While the assistant is working, check every 2.5 seconds for the answer.
 useEffect(()=>{if(!detail?.pending)return;const t=setTimeout(()=>{void load()},2500);return()=>clearTimeout(t)},[detail,load]);
 useEffect(()=>{log.current?.scrollTo({top:log.current.scrollHeight})},[detail?.messages.length,detail?.pending]);
 // Alleen antwoorden die binnenkomen terwijl je kijkt, worden voorgelezen (niet het hele gesprek bij openen).
 useEffect(()=>{if(!detail)return;const ids=detail.messages.filter(m=>m.role==='assistant').map(m=>m.id);
  if(seen.current&&voice.on){const fresh=detail.messages.filter(m=>m.role==='assistant'&&!seen.current!.has(m.id));if(fresh.length)voice.say(fresh.map(m=>m.text).join('\n\n'))}
  seen.current=new Set(ids)},[detail,voice]);
 useEffect(()=>{seen.current=null},[threadId]);
 useEffect(()=>{if(app&&!auto&&overview){const c=overview.threads.find(t=>t.week===overview.week);if(c)setAuto(c.id)}},[app,auto,overview]);

 async function start(){setBusy(true);setError('');try{const r=await call('/api/assistent',{action:'start',requestId:makeId()});if(app)setAuto(r.thread);else router.push('/assistent?gesprek='+r.thread)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function send(e:React.FormEvent){
  e.preventDefault();if(dictation.listening)dictation.stop();if((!text.trim()&&!photo.foto)||!detail)return;setBusy(true);setError('');
  try{await call('/api/assistent',{action:'bericht',thread:detail.thread.id,text,requestId:makeId(),...(photo.payload?{foto:photo.payload}:{})});setText('');photo.clear();await load()}
  catch(err){setError((err as Error).message)}finally{setBusy(false)}
 }
 async function confirm(){
  const p=detail?.menu.proposal;if(!p)return;setBusy(true);setError('');
  try{await call('/api/voorstellen',{id:p.id,action:'goedkeuren',version:p.version,requestId:makeId(),note:''});await load()}
  catch(e){setError((e as Error).message);await load()}finally{setBusy(false)}
 }

 const current=overview?.threads.find(t=>t.week===overview.week);
 if(app&&!detail)return <div className="tel-card wa-start">{error&&<div className="message" role="alert">{error}</div>}{!overview?<p className="small">Laden…</p>:<><h2 className="serif">{overview.weekTitle}</h2><p className="small">Nog geen weekgesprek voor deze week.</p><button className="btn" disabled={busy} onClick={start}>Start weekgesprek</button></>}</div>;
 return <div data-bb-view="assistant">{!app&&<PageHead eyebrow="KEUKEN · WEEKPLANNING" title="Weekassistent" sub="Samen de week voorbereiden en alles regelen: weekmenu, voorraad, agenda, producten en meer. Vraag het, de assistent doet het.">
   {threadId?<Link className="btn secondary" href="/assistent">Alle gesprekken</Link>:<button className="btn" disabled={busy} onClick={start}>Start weekgesprek</button>}
  </PageHead>}
  {!app&&overview&&!overview.configured&&<Notice kind="warn" title="Assistent nog niet ingesteld">Voeg een Claude-sleutel toe bij <a href="/koppeling">Systeem &amp; koppelingen</a>, of zet hem in <code>ANTHROPIC_API_KEY</code> in <code>.env.local</code>. Berichten worden wel al bewaard.</Notice>}
  {error&&<div className="message" role="alert">{error}</div>}

  {!threadId&&overview&&<div className="grid two section-gap">
   <div className="card"><h3 className="card-title">{overview.weekTitle}</h3><p className="small">{current?'Er loopt al een weekgesprek voor deze week.':'Nog geen weekgesprek voor deze week.'}</p>
    <div className="action-row">{current?<Link className="btn" href={'/assistent?gesprek='+current.id}>Verder met het gesprek</Link>:<button className="btn" disabled={busy} onClick={start}>Start weekgesprek</button>}</div></div>
   <div className="card"><h3 className="card-title">Eerdere gesprekken</h3>{overview.threads.length?overview.threads.map(t=><div className="task" key={t.id}><div className="task-body"><strong>{t.title}</strong><span>{t.account} · laatst {time(t.updated)}</span></div><Link className="btn secondary sm" href={'/assistent?gesprek='+t.id}>Open</Link></div>):<div className="empty">Nog geen gesprekken.</div>}
    <p className="small" style={{marginTop:12}}>Gesprekken worden na 14 dagen automatisch verwijderd. Bevestigde weekmenu's blijven bewaard.</p></div>
  </div>}

  {detail&&<div className={'chat-layout'+(app?' wa-app':' section-gap')}>
   <div className="card chat wa-chat">
    <div className="wa-head"><span className="wa-avatar" aria-hidden="true">WA</span><div className="wa-who"><strong>Weekassistent</strong><span className="small">{detail.pending?(detail.pending.delayed?'vertraagd, probeert opnieuw…':'is aan het typen…'):detail.thread.title}</span></div>
     {app&&<button type="button" className={'wa-voice'+(menuOpen?' on':'')} aria-pressed={menuOpen} onClick={()=>setMenuOpen(v=>!v)}>{menuOpen?'Gesprek':'Weekmenu'}{!menuOpen&&detail.menu.proposal?' ●':''}</button>}
     {voice.supported&&<button type="button" className={'wa-voice'+(voice.on?' on':'')} aria-pressed={voice.on} onClick={voice.toggle} title="Nieuwe antwoorden voorlezen" aria-label="Nieuwe antwoorden voorlezen">{app?(voice.on?'🔊':'🔈'):voice.on?'🔊 Voorlezen aan':'🔈 Voorlezen'}</button>}</div>
    <div className="chat-log wa-log" ref={log} aria-live="polite">
     {(()=>{let last='';return detail.messages.map(m=>{const day=dayOf(m.created),sep=day!==last;last=day;return <div key={m.id} className="wa-item">
      {sep&&<div className="meta-day">{day}</div>}
      <div className={'bubble '+(m.role==='user'?'user':m.role==='notitie'?'note':'assistant')}>{m.foto&&<span className="foto-tag">📷 Foto</span>}<ChatText text={m.text}/>
       <span className="bubble-meta">{m.role==='user'?m.account+' · ':m.role==='notitie'?'Melding · ':''}{clock(m.created)}{m.sources.length?' · op basis van: '+m.sources.join(', '):''}{m.role==='assistant'&&voice.supported&&<button type="button" className="wa-say" aria-label="Voorlezen" onClick={()=>voice.say(m.text)}>🔈</button>}</span></div>
     </div>})})()}
     {detail.pending&&<div className="bubble assistant wa-typing" aria-label="De assistent is bezig met een antwoord"><span></span><span></span><span></span></div>}
    </div>
    {detail.expired?<Notice kind="warn" title="Gesprek gesloten">Dit gesprek is ouder dan twee weken. Start een nieuw weekgesprek.</Notice>:<>
    {photo.foto&&<div className="foto-preview"><img src={photo.foto.preview} alt="Gekozen foto"/><span className="small">Foto wordt meegestuurd{text.trim()?'':'. Typ er eventueel bij wat je wilt weten.'}</span><button type="button" className="btn ghost sm" onClick={photo.clear} aria-label="Foto weghalen">×</button></div>}
    {photo.problem&&<p className="small" role="alert">{photo.problem}</p>}
    <form className="chat-form wa-form" onSubmit={send}>
     <input ref={fileInput} type="file" accept="image/*" hidden onChange={photo.pick}/>
     <button type="button" className="wa-photo" aria-label="Foto toevoegen" title="Foto toevoegen" disabled={busy} onClick={()=>fileInput.current?.click()}>📷</button>
     <textarea ref={input} aria-label="Bericht aan de assistent" rows={1} placeholder={dictation.listening?'Luistert… praat maar':app?'Bericht':'Typ een bericht of tik op de microfoon'} value={text} maxLength={4000} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();e.currentTarget.form?.requestSubmit()}}}/>
     {(text.trim()||photo.foto)&&!dictation.listening?<button className="wa-round" disabled={busy} aria-label="Verstuur">➤</button>
      :<button type="button" className={'wa-round'+(dictation.listening?' rec':'')} aria-pressed={dictation.listening} aria-label={dictation.listening?'Stop met inspreken':'Inspreken'} onClick={()=>dictation.listening?dictation.stop():dictation.supported?dictation.start(text):input.current?.focus()}>{dictation.listening?'■':'🎤'}</button>}
    </form>
    {dictation.listening&&<p className="wa-hint" role="status">● Luistert… tik op ■ om te stoppen. Je kunt de tekst daarna nog aanpassen.</p>}
    {dictation.problem&&<p className="small" role="alert">{dictation.problem}</p>}
    {!dictation.supported&&<p className="small">Inspreken kan in deze browser met de microfoon op het toetsenbord.</p>}
    </>}
   </div>
   {(!app||menuOpen)&&<div className={'stack'+(app?' wa-menu':'')}>
    <MenuCard title="Weekmenu (concept)" menu={detail.menu.concept}>
     <div className="action-row" style={{marginTop:12}}><button className="btn" disabled={busy||!detail.menu.proposal} onClick={confirm}>Bevestigen</button><Link className="btn secondary" href="/goedkeuringen">Naar Goedkeuringen</Link></div>
     <p className="small" style={{marginTop:8}}>Na bevestigen kun je nog steeds wijzigingen doorgeven; de assistent maakt dan een nieuw concept.</p>
    </MenuCard>
    <MenuCard title="Weekmenu (bevestigd)" menu={detail.menu.confirmed}/>
    {!detail.menu.concept&&!detail.menu.confirmed&&<div className="card"><h3 className="card-title">Weekmenu</h3><p className="small">Nog geen weekmenu voor deze week. Zodra jullie het eens zijn, legt de assistent het hier als concept vast.</p></div>}
    {!app&&<Boodschappen week={detail.thread.week} refresh={(detail.menu.concept?.version||0)+(detail.menu.confirmed?.version||0)*1000+detail.messages.length}/>}
    {!app&&<Notice kind="info" title="Zo werkt het">De assistent leest producten, recepten en voorraad uit de backoffice. Hij helpt met alles: weekmenu, agenda, klanten, producten aanmaken en wijzigen, leden en openingstijden, en voert het meteen uit. Stuur gerust een foto (pakbon, factuur, recept) met 📷. Bestellen bij leveranciers en geldzaken doet hij niet.</Notice>}
   </div>}
  </div>}
 </div>;
}

'use client';
// Backoffice-assistent (opdracht eigenaar 6 november 2026): een typbalk onderaan elk scherm. Het gesprek klapt erboven open.
// Een actie voert de assistent meteen uit (wens eigenaar 13 november 2026: alle rechten); hij staat als kaart in het gesprek met de uitkomst.
// Een foto meesturen kan met de cameraknop: de assistent haalt de informatie eruit.
// Alleen zichtbaar voor beheerders: geeft /api/hulp een weigering, dan verschijnt de balk niet.
import {useCallback,useEffect,useRef,useState} from 'react';
import {usePathname,useRouter} from 'next/navigation';
import {makeId} from '@/lib/id.mjs';
import {ChatText} from './chat-text';
import {useFoto} from './foto';
const clock=(iso:string)=>{try{return new Intl.DateTimeFormat('nl-NL',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Amsterdam'}).format(new Date(iso))}catch{return ''}};

type Message={id:string;role:'user'|'assistant'|'notitie'|'systeem';text:string;created:string;foto?:boolean};
type ActionCard={id:string;type:string;title:string;details:string[];status:string;note:string;created:string;expired:boolean};
type Detail={configured:boolean;thread:{id:string;title:string};expired:boolean;messages:Message[];actions:ActionCard[];pending:{status:string;delayed:boolean}|null};
const KEY='boerbart-hulp-gesprek';
const STATUS:Record<string,[string,string]>={concept:['Wacht op jouw klik','orange'],bezig:['Bezig…','blue'],uitgevoerd:['Uitgevoerd','green'],mislukt:['Niet gelukt','red'],geannuleerd:['Geannuleerd',''],vervallen:['Vervallen','']};
const store={get:()=>{try{return localStorage.getItem(KEY)}catch{return null}},set:(v:string|null)=>{try{v?localStorage.setItem(KEY,v):localStorage.removeItem(KEY)}catch{}}};
async function call(url:string,body?:unknown){
 const r=await fetch(url,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});
 const data=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(Error(data.error||'Er ging iets mis.'),{status:r.status});return data;
}

export function HulpBalk(){
 const path=usePathname()||'/',router=useRouter();
 const [allowed,setAllowed]=useState(false),[configured,setConfigured]=useState(true);
 const [thread,setThread]=useState<string|null>(null),[detail,setDetail]=useState<Detail|null>(null);
 const [open,setOpen]=useState(false),[thinking,setThinking]=useState(false),[text,setText]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const log=useRef<HTMLDivElement>(null),input=useRef<HTMLTextAreaElement>(null),fileInput=useRef<HTMLInputElement>(null),photo=useFoto();
 useEffect(()=>{const start=(e:Event)=>{const v=(e as CustomEvent<{text?:string}>).detail?.text;if(typeof v==='string'&&v.length<=6000){setText(v);setOpen(true);input.current?.focus()}};window.addEventListener('boerbart-contract-assistent',start);return ()=>window.removeEventListener('boerbart-contract-assistent',start)},[]);

 useEffect(()=>{call('/api/hulp').then(d=>{setAllowed(true);setConfigured(d.configured);setThread(store.get())}).catch(()=>setAllowed(false))},[]);
 const load=useCallback(async(id:string)=>{
  try{setDetail(await call('/api/hulp?gesprek='+encodeURIComponent(id)))}
  catch(e){if((e as {status?:number}).status===404){store.set(null);setThread(null);setDetail(null)}else setError((e as Error).message)}
 },[]);
 useEffect(()=>{if(thread&&open)void load(thread)},[thread,open,load]);
 // Zolang de assistent nog antwoordt: elke twee seconden kijken.
 const waiting=!!detail?.pending||detail?.actions.some(a=>a.status==='bezig');
 // Zolang de assistent nadenkt, blijft het scherm klein (wens eigenaar 6 november 2026): alleen een klein label boven de balk.
 // Ook dan wordt er gekeken; zodra het antwoord er is, klapt het gesprek vanzelf open.
 useEffect(()=>{if(!thread||!(waiting||thinking))return;const t=setInterval(()=>void load(thread),2000);return ()=>clearInterval(t)},[thread,waiting,thinking,load]);
 useEffect(()=>{if(thinking&&detail&&!detail.pending){setThinking(false);setOpen(true)}},[thinking,detail]);
 useEffect(()=>{log.current?.scrollTo({top:log.current.scrollHeight})},[detail?.messages.length,detail?.actions.length,waiting]);
 useEffect(()=>{if(!open)return;const k=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false)};window.addEventListener('keydown',k);return ()=>window.removeEventListener('keydown',k)},[open]);

 async function send(){
  const t=text.trim();if((!t&&!photo.foto)||busy)return;setBusy(true);setError('');
  try{
   const requestId=makeId(),foto=photo.payload?{foto:photo.payload}:{};
   if(!thread||detail?.expired){await call('/api/hulp',{action:'start',requestId,text:t,pagina:path,...foto});store.set(requestId);setThread(requestId);setOpen(false);setThinking(true);await load(requestId)}
   else{await call('/api/hulp',{action:'bericht',gesprek:thread,requestId,text:t,pagina:path,...foto});setOpen(false);setThinking(true);await load(thread)}
   setText('');photo.clear();
  }catch(e){setError((e as Error).message)}finally{setBusy(false);input.current?.focus()}
 }
 async function decide(a:ActionCard,action:'uitvoeren'|'annuleren'){
  if(!thread)return;setBusy(true);setError('');
  try{await call('/api/hulp',{action,gesprek:thread,actie:a.id,requestId:makeId()});if(action==='uitvoeren'){router.refresh();window.dispatchEvent(new CustomEvent('boerbart-hulp-uitgevoerd',{detail:{type:a.type}}))}}
  catch(e){setError((e as Error).message)}finally{setBusy(false);await load(thread)}
 }
 function fresh(){store.set(null);setThread(null);setDetail(null);setError('');setThinking(false);input.current?.focus()}

 if(!allowed)return null;
 // Berichten en actiekaarten in tijdsvolgorde.
 const items=[...(detail?.messages||[]).map(m=>({at:m.created,m})),...(detail?.actions||[]).map(a=>({at:a.created,a}))].sort((x,y)=>x.at.localeCompare(y.at));
 return <div className={'hulp'+(open?' open':'')}>
  {open&&<section className="hulp-panel" aria-label="Backoffice-assistent">
   <div className="hulp-head"><strong>Backoffice-assistent</strong>
    <div className="row"><button className="btn ghost sm" onClick={fresh} disabled={!thread}>Nieuw gesprek</button><button className="close" aria-label="Klein maken" title="Klein maken" onClick={()=>setOpen(false)}>×</button></div></div>
   <div className="hulp-log" ref={log}>
    {!configured&&<div className="bubble note">De assistent is nog niet ingesteld: voeg een Claude-sleutel toe bij Systeem &amp; koppelingen.</div>}
    {!items.length&&<div className="hulp-intro">
     <p>Vraag alles, de assistent regelt het meteen: agenda, klanten, producten, leden, rooster en openingstijden. Met 📷 stuur je een foto mee, bijvoorbeeld een pakbon of menukaart.</p>
     <p className="small">Bijvoorbeeld: „Zet Anna zaterdag in als barista”, „Zet donderdag om 14:00 een kennismakingsgesprek met familie Jansen in de agenda”, „Maak een product Pompoensoep aan voor € 6,50 en publiceer het”, „Op 24 december zijn we gesloten”.</p>
     <p className="small">Geldzaken (Bloei, betalingen, kassa, uitbetalingen) en programmeren doet de assistent niet.</p></div>}
    {items.map(x=>'m' in x
     ?<div key={x.m.id} className={'bubble '+(x.m.role==='user'?'user':x.m.role==='assistant'?'assistant':'note')}>{x.m.foto&&<span className="foto-tag">📷 Foto</span>}<ChatText text={x.m.text}/>{x.m.role!=='notitie'&&x.m.role!=='systeem'&&<span className="bubble-time">{clock(x.m.created)}</span>}</div>
     :<ActionView key={x.a.id} a={x.a} busy={busy} decide={decide}/>)}
    {detail?.pending&&<div className="typing">{detail.pending.delayed?'De assistent probeert het opnieuw…':'De assistent denkt na…'}</div>}
   </div>
  </section>}
  {thinking&&!open&&<button type="button" className="hulp-thinking" onClick={()=>{setThinking(false);setOpen(true)}}><span className="hulp-dot"/>{detail?.pending?.delayed?'De assistent probeert het opnieuw…':'De assistent denkt na…'}</button>}
  {photo.foto&&<div className="foto-preview hulp-foto"><img src={photo.foto.preview} alt="Gekozen foto"/><span className="small">Foto wordt meegestuurd</span><button type="button" className="btn ghost sm" onClick={photo.clear} aria-label="Foto weghalen">×</button></div>}
  {photo.problem&&<div className="hulp-error" role="alert">{photo.problem}</div>}
  <form className="hulp-bar" onSubmit={e=>{e.preventDefault();void send()}}>
   <span className="hulp-ico" aria-hidden>✦</span>
   <input ref={fileInput} type="file" accept="image/*" hidden onChange={photo.pick}/>
   <textarea ref={input} rows={1} value={text} maxLength={4000} aria-label="Vraag de backoffice-assistent" placeholder="Vraag de assistent iets, bijvoorbeeld: zet Anna zaterdag in als barista"
    onFocus={()=>{if(thread&&!thinking)setOpen(true)}} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send()}}}/>
   {thread&&!open&&!thinking&&<button type="button" className="btn ghost sm" onClick={()=>setOpen(true)}>Gesprek</button>}
   <button type="button" className="btn ghost sm" aria-label="Foto toevoegen" title="Foto toevoegen" disabled={busy} onClick={()=>fileInput.current?.click()}>📷</button>
   <button className="btn sm" disabled={busy||(!text.trim()&&!photo.foto)}>Vraag</button>
  </form>
  {error&&<div className="hulp-error" role="alert">{error}</div>}
 </div>;
}

function ActionView({a,busy,decide}:{a:ActionCard;busy:boolean;decide:(a:ActionCard,d:'uitvoeren'|'annuleren')=>void}){
 const [label,color]=a.status==='concept'&&a.expired?STATUS.vervallen:STATUS[a.status]||[a.status,''];
 return <div className="hulp-action">
  <div className="row between"><strong>{a.title}</strong><span className={'pill '+color}>{label}</span></div>
  {a.details.length>0&&<ul>{a.details.map((d,i)=><li key={i}>{d}</li>)}</ul>}
  {a.note&&<p className="small">{a.note}</p>}
  {a.status==='concept'&&!a.expired&&<div className="action-row"><button className="btn sm" disabled={busy} onClick={()=>decide(a,'uitvoeren')}>Uitvoeren</button><button className="btn secondary sm" disabled={busy} onClick={()=>decide(a,'annuleren')}>Annuleren</button></div>}
 </div>;
}

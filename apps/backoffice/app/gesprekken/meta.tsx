'use client';
// WhatsApp, Messenger en Instagram in Gesprekken (akkoord eigenaar 9 november 2026), ontworpen voor de telefoon:
// berichten als chat, het venster van 24 uur zichtbaar, en verzenden alleen na een bevestiging. Na 24 uur alleen een
// goedgekeurd WhatsApp-sjabloon (kost per bericht). Alles blijft bewaard bij de klantenkaart.
import {useEffect,useMemo,useRef,useState} from 'react';
import Link from 'next/link';
import {Pill} from '../ui';
import {call,when,waitingLabel} from './mail';
import type {CustomerCard} from '@/lib/guest-customers';
import {CHANNEL_NAME,normalizePhone,showPhone,windowText,fillTemplate,type Channel,type Template} from '@/lib/meta-core';

export type MetaRow={id:string;ref:string;channel:Channel;contact:string;name:string;phone:string;customerId:string;lastMessageId:string;lastMessageAt:string;lastFromUs:boolean;unread:number;snippet:string;status:string;assigned:string;version:number;statusBy:string;statusAt:string;waiting:string;windowLeft:number};
export type MetaStatus={channels:Record<Channel,boolean>;webhookReady:boolean;templatesReady:boolean;historyDays:number;sendEnabled:boolean;threads:number;lastMessageAt:string|null;webhookUrl:string};
type Msg={id:string;fromUs:boolean;kind:string;text:string;media:{mime?:string;filename?:string;available:boolean}|null;at:string;status:string;by:string;source:string};
type Detail={thread:MetaRow;messages:Msg[];sends:{requestId:string;kind:string;status:string;error:string;by:string;created:string}[];sendEnabled:boolean};

export const channelPill:Record<Channel,'green'|'blue'|'orange'>={whatsapp:'green',messenger:'blue',instagram:'orange'};
export const metaName=(t:{name:string;phone:string;contact:string;channel:Channel})=>t.name||showPhone(t.phone)||(t.channel==='whatsapp'?showPhone(t.contact):CHANNEL_NAME[t.channel]+'-gast');
/** De klantenkaart van een gesprek: de gekozen kaart, anders de enige kaart met hetzelfde telefoonnummer. */
export function metaCard(cards:CustomerCard[],t:{customerId:string;phone:string}){
 const chosen=t.customerId&&cards.find(c=>c.id===t.customerId);if(chosen)return {card:chosen,suggested:false};
 const p=normalizePhone(t.phone),same=p?cards.filter(c=>normalizePhone(c.phone)===p):[];
 return same.length===1?{card:same[0],suggested:true}:{card:undefined,suggested:false};
}
const time=(iso:string)=>new Intl.DateTimeFormat('nl-NL',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Amsterdam'}).format(new Date(iso));
const dayOf=(iso:string)=>new Intl.DateTimeFormat('nl-NL',{weekday:'long',day:'numeric',month:'long',timeZone:'Europe/Amsterdam'}).format(new Date(iso));
const mediaLabel:Record<string,string>={audio:'Spraakbericht',image:'Foto',video:'Video',document:'Document',sticker:'Sticker'};
const delivery:Record<string,string>={sent:'verzonden',delivered:'afgeleverd',read:'gelezen'};

export function MetaConversation({id,cards,canManage,createCard,onCustomer,afterChange}:{id:string;cards:CustomerCard[];canManage:boolean;createCard:(c:{name:string;phone:string})=>Promise<string|null>;onCustomer:(id:string)=>void;afterChange:()=>void}){
 const [d,setD]=useState<Detail|null>(null),[text,setText]=useState(''),[busy,setBusy]=useState(false),[note,setNote]=useState(''),[problem,setProblem]=useState('');
 const [sheet,setSheet]=useState(false),[templates,setTemplates]=useState<Template[]|null>(null),[pick,setPick]=useState(''),[values,setValues]=useState<string[]>([]);
 const request=useRef(''),end=useRef<HTMLDivElement>(null),base='/api/meta/threads/'+encodeURIComponent(id);
 const load=async()=>{try{setD(await call<Detail>(base))}catch(e){setProblem((e as Error).message)}};
 useEffect(()=>{setD(null);setText('');setSheet(false);setNote('');setProblem('');void load()},[id]); // eslint-disable-line react-hooks/exhaustive-deps
 // Nieuwe berichten komen via de webhook binnen; zolang het gesprek open is, elke 20 seconden kijken.
 useEffect(()=>{const t=setInterval(()=>{if(!sheet)void load()},20000);return()=>clearInterval(t)},[id,sheet]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{end.current?.scrollIntoView({block:'end'})},[d?.messages.length]);
 // Antwoordvoorstel van de assistent (wens eigenaar 11 november 2026): wacht de klant op ons en is het venster open, dan schrijft
 // de assistent een voorstel in het schrijfvak. Er gaat niets vanzelf weg; eigen tekst wordt nooit overschreven.
 const [assist,setAssist]=useState(''),autoText=useRef(''),adviceKey=useRef('');
 async function suggest(){setAssist('bezig');try{
  const s=await call<{dossier:{revisions:{basis:string}[]};basis:string;available:boolean}>(base,{action:'advice-status'});
  if(!s.available){setAssist('uit');return}
  const last=s.dossier.revisions.at(-1);if(!last||last.basis!==s.basis)await call(base,{action:'advice-prepare'});
  const v=await call<{text:string}>(base,{action:'advice-text'});
  setText(cur=>cur.trim()&&cur!==autoText.current?cur:(autoText.current=v.text));setAssist('')
 }catch(e){setAssist((e as Error).message||'Geen voorstel gelukt.')}}
 useEffect(()=>{autoText.current='';adviceKey.current='';setAssist('')},[id]);
 useEffect(()=>{const t=d?.thread;if(!t||!['klant-wacht','opnieuw-open'].includes(t.waiting)||t.windowLeft<=0)return;
  const key=t.id+'|'+t.lastMessageId;if(adviceKey.current===key)return;adviceKey.current=key;void suggest()},[d?.thread.id,d?.thread.lastMessageId,d?.thread.waiting]); // eslint-disable-line react-hooks/exhaustive-deps
 // Alle hooks staan vóór de vroege return hieronder (melding eigenaar 12 november 2026: „This page couldn't load” bij een
 // Instagram- of Messenger-gesprek). Een hook ná „Gesprek laden…” laat React stoppen zodra het gesprek binnen is.
 const sentText=useRef('');
 const linked=useMemo(()=>d?metaCard(cards,d.thread):{card:undefined,suggested:false},[cards,d]);
 if(!d)return problem?<div className="message error" role="alert">{problem}</div>:<p className="small">Gesprek laden…</p>;
 const t=d.thread,open=t.windowLeft>0,[w,c]=waitingLabel[t.waiting]||['',''],uncertain=d.sends.find(s=>s.status==='onzeker');
 async function act(body:Record<string,unknown>,done:string){setBusy(true);setProblem('');setNote('');try{await call(base,body);setNote(done);await load();afterChange();return true}catch(e){setProblem((e as Error).message);await load();return false}finally{setBusy(false)}}
 const work=(patch:Record<string,unknown>,done:string)=>act({action:'work',status:t.status,assigned:t.assigned,customerId:t.customerId,version:t.version,...patch},done);
 // Versturen met één tik (wens eigenaar 11 november 2026: „De extra vraag om te bevestigen hoeft niet”). Eén aanvraag-id per
 // tekst: een tweede tik of een nieuwe poging na een storing verstuurt niets extra.
 async function send(){if(sentText.current!==text){sentText.current=text;request.current=crypto.randomUUID()}if(await act({action:'send',confirm:true,mode:'tekst',text,lastMessageId:t.lastMessageId,requestId:request.current},'Verzonden.')){setText('');sentText.current=''}}
 async function sendTemplate(tpl:Template){if(await act({action:'send',confirm:true,mode:'sjabloon',template:tpl.name,language:tpl.language,values,lastMessageId:t.lastMessageId,requestId:request.current},'Sjabloon verzonden. Antwoordt de klant, dan is het venster weer 24 uur open.')){setSheet(false)}}
 async function openSheet(){setSheet(true);setPick('');request.current=crypto.randomUUID();if(!templates)try{setTemplates((await call<{templates:Template[]}>('/api/meta/templates')).templates)}catch(e){setProblem((e as Error).message);setSheet(false)}}
 async function newCard(){const cardId=await createCard({name:metaName(t),phone:showPhone(t.phone)});if(cardId)await work({customerId:cardId},'Klantenkaart gemaakt en gekoppeld. Dit gesprek blijft bij deze klant bewaard.')}
 const chosen=templates?.find(x=>x.name+'|'+x.language===pick);
 let lastDay='';
 return <div className="meta-conversation">
  <div className="meta-head">
   <div className="meta-avatar" aria-hidden="true">{metaName(t).replace(/[^A-Za-zÀ-ÿ0-9 ]/g,'').split(' ').filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'?'}</div>
   <div className="meta-who"><h2>{metaName(t)}</h2><span className="small">{[t.channel==='whatsapp'?showPhone(t.contact):'',linked.card&&!linked.suggested?'klantenkaart: '+linked.card.name:''].filter(Boolean).join(' · ')}</span></div>
   <Pill color={channelPill[t.channel]}>{CHANNEL_NAME[t.channel]}</Pill>
  </div>
  <div className="meta-actions">
   {w&&<Pill color={c as 'red'}>{w}</Pill>}
   {canManage&&<button className="btn secondary sm" disabled={busy} onClick={()=>{const who=prompt('Wie handelt dit gesprek af?',t.assigned);if(who!==null)void work({assigned:who},'Verantwoordelijke opgeslagen.')}}>{t.assigned?'Toegewezen: '+t.assigned:'Toewijzen'}</button>}
   {canManage&&<button className="btn secondary sm" disabled={busy} onClick={()=>work({status:t.status==='afgehandeld'?'open':'afgehandeld'},t.status==='afgehandeld'?'Weer open gezet.':'Afgehandeld. Schrijft de klant opnieuw, dan komt het gesprek terug.')}>{t.status==='afgehandeld'?'Weer openen':'Afgehandeld'}</button>}
   {canManage&&<Link className="btn secondary sm" href={'/planning?thread='+encodeURIComponent(t.ref)}>Aanvraag in Planning</Link>}
   {linked.card&&!linked.suggested&&<button className="btn secondary sm" onClick={()=>onCustomer(linked.card!.id)}>Klantenkaart</button>}
  </div>
  {canManage&&!t.customerId&&(linked.card?<div className="notice info meta-card-hint"><div><strong>Dit is waarschijnlijk {linked.card.name}</strong>Zelfde telefoonnummer. Koppel het gesprek, dan blijft het bij deze klant bewaard. <button className="btn secondary sm" disabled={busy} onClick={()=>work({customerId:linked.card!.id},'Gekoppeld aan de klantenkaart.')}>Koppelen</button></div></div>
   :<div className="notice info meta-card-hint"><div><strong>Nog geen klantenkaart</strong>Maak er een, dan blijft dit gesprek voor altijd bij deze klant. <button className="btn secondary sm" disabled={busy} onClick={newCard}>Klantenkaart maken</button>{cards.length>0&&<select className="input" aria-label="Of kies een bestaande klantenkaart" defaultValue="" disabled={busy} onChange={e=>{if(e.target.value)void work({customerId:e.target.value},'Gekoppeld aan de klantenkaart.')}}><option value="">of kies een bestaande…</option>{cards.map(x=><option key={x.id} value={x.id}>{x.name}{x.phone?' · '+x.phone:''}</option>)}</select>}</div></div>)}
  {note&&<div className="message" role="status">{note}</div>}{problem&&<div className="message error" role="alert">{problem}</div>}
  <div className="meta-log" aria-label="Berichten">
   {d.messages.map(m=>{const day=dayOf(m.at),sep=day!==lastDay;lastDay=day;return <div key={m.id} className="meta-item">
    {sep&&<div className="meta-day">{day}</div>}
    <div className={'meta-bubble'+(m.fromUs?' ours':'')}>
     {m.media&&(m.kind==='image'||m.kind==='sticker'?<a href={'/api/meta/media/'+encodeURIComponent(m.id)} target="_blank" rel="noreferrer"><img src={'/api/meta/media/'+encodeURIComponent(m.id)} alt={m.text||mediaLabel[m.kind]} loading="lazy"/></a>
      :m.kind==='audio'?<audio controls preload="none" src={'/api/meta/media/'+encodeURIComponent(m.id)} aria-label="Spraakbericht"/>
      :m.kind==='video'?<video controls preload="none" src={'/api/meta/media/'+encodeURIComponent(m.id)}/>
      :<a href={'/api/meta/media/'+encodeURIComponent(m.id)}>{m.media.filename||mediaLabel[m.kind]||'Bijlage'} openen</a>)}
     {m.kind==='template'&&<span className="meta-tag">Sjabloon</span>}
     {m.text?<p>{m.text}</p>:!m.media&&<p className="small">({mediaLabel[m.kind]||'bericht van het type '+m.kind})</p>}
     <span className="meta-meta">{time(m.at)}{m.fromUs&&(m.by?' · '+m.by:m.source==='echo'?' · vanaf de telefoon':'')}{m.fromUs&&m.status?' · '+(delivery[m.status]||m.status):''}{m.source==='history'?' · opgehaald':''}</span>
    </div></div>})}
   {!d.messages.length&&<p className="empty">Nog geen berichten.</p>}
   <div ref={end}/>
  </div>
  {uncertain&&<div className="notice warn"><div><strong>Onzeker of het laatste bericht is aangekomen</strong>Kijk in WhatsApp of Meta Business Suite. Er wordt niets opnieuw verzonden. <button className="btn secondary sm" disabled={busy} onClick={()=>act({action:'vrijgeven',requestId:uncertain.requestId,arrived:true},'Vastgelegd als aangekomen.')}>Is aangekomen</button> <button className="btn secondary sm" disabled={busy} onClick={()=>act({action:'vrijgeven',requestId:uncertain.requestId,arrived:false},'Vastgelegd als niet aangekomen. Je kunt opnieuw versturen.')}>Niet aangekomen</button></div></div>}
  <div className="meta-composer">
   <div className={'meta-window'+(open?'':' closed')} role="status">{windowText(t.windowLeft)}</div>
   {!d.sendEnabled?<p className="small">Verzenden staat uit in deze omgeving (of je hebt geen verzendrecht). Lezen werkt wel.</p>
   :open?<>
    <div className="meta-assist small" role="status">{assist==='bezig'?'✍ De assistent schrijft een voorstel…'
     :text&&text===autoText.current?<>✍ Voorstel van de assistent. Controleer en pas aan voordat je verstuurt. <button type="button" className="text-button" disabled={busy} onClick={()=>{setText('');autoText.current='';void suggest()}}>Nieuw voorstel</button></>
     :assist&&assist!=='uit'?<>Geen voorstel: {assist} <button type="button" className="text-button" onClick={()=>void suggest()}>Opnieuw proberen</button></>
     :!text.trim()&&assist!=='uit'?<button type="button" className="text-button" disabled={busy} onClick={()=>void suggest()}>✍ Voorstel van de assistent</button>:null}</div>
    <div className="meta-input"><label htmlFor="meta-reply" className="sr-only">Antwoord</label><textarea id="meta-reply" rows={text.length>100?6:3} maxLength={4096} value={text} placeholder="Schrijf een antwoord…" onChange={e=>setText(e.target.value)}/><button className="btn meta-send" aria-label="Versturen" disabled={busy||!text.trim()} onClick={()=>{void send()}}>{busy?'Bezig…':'Versturen'}</button></div>
   </>:t.channel==='whatsapp'?<button className="btn" disabled={busy} onClick={openSheet}>Sjabloon kiezen…</button>
   :<p className="small">Meta laat pas weer een antwoord toe als de klant opnieuw schrijft.</p>}
  </div>
  {sheet&&<div className="meta-sheet-layer" onClick={e=>{if(e.target===e.currentTarget)setSheet(false)}}><div className="meta-sheet" role="dialog" aria-label="Kies een sjabloon">
   <div className="row between"><h3 className="serif">Kies een sjabloon</h3><button className="close" aria-label="Sluiten" onClick={()=>setSheet(false)}>×</button></div>
   <p className="small">Het venster van 24 uur is dicht. Meta laat nu alleen een goedgekeurd sjabloon toe; dat kost een klein bedrag per bericht.</p>
   {!templates?<p className="small">Sjablonen laden bij Meta…</p>:!templates.length?<p className="small">Er zijn nog geen goedgekeurde sjablonen. Maak ze aan in WhatsApp Manager (zie de handleiding).</p>:
    templates.map(x=><label key={x.name+'|'+x.language} className={'meta-template'+(pick===x.name+'|'+x.language?' chosen':'')}><input type="radio" name="sjabloon" checked={pick===x.name+'|'+x.language} onChange={()=>{setPick(x.name+'|'+x.language);setValues(Array(x.params).fill(''))}}/><span><strong>{x.name.replace(/_/g,' ')}</strong><span className="small">{x.body}</span></span></label>)}
   {chosen&&chosen.params>0&&<div className="stack">{values.map((v,i)=><label key={i} className="small">Invulveld {i+1}<input className="input" value={v} maxLength={500} onChange={e=>setValues(values.map((x,j)=>j===i?e.target.value:x))}/></label>)}</div>}
   {chosen&&<div className="mail-text">{fillTemplate(chosen.body,values.map(v=>v||'…'))}</div>}
   <p className="small">Een sjabloon kost een klein bedrag per bericht bij Meta.</p>
   <button className="btn" disabled={!chosen||busy||values.some(v=>!v.trim())} onClick={()=>chosen&&sendTemplate(chosen)}>{busy?'Bezig…':'Verzenden'}</button>
  </div></div>}
  {d.sends.some(s=>s.status==='mislukt')&&<details className="small section-gap"><summary>Verzendgeschiedenis</summary><ul className="mail-links">{d.sends.map(s=><li key={s.requestId}>{when(s.created)} · {s.by} · <strong>{s.status}</strong>{s.error?' — '+s.error:''}</li>)}</ul></details>}
 </div>;
}

'use client';
// Offertes & groepen (wens eigenaar 5 november 2026): offertes als voorstel dat Sanne opmaakt en aanpast, gekoppeld aan
// de klantenkaart. Bovenaan wat er openstaat, daaronder de groepsaanvragen die nog een offerte nodig hebben en de lijst.
// Een offerte begint als concept: uit een aanvraag, een klantenkaart of het prijsvoorstel bij een gesprek.
import {Suspense,useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {useRouter,useSearchParams} from 'next/navigation';
import {PageHead,Kpi,Pill,money} from '../ui';
import {useGuests} from '../use-guests';
import {customerCards,cardForReservation} from '@/lib/guest-customers';
import {quoteTotals,isExpired,type Quote,type QuoteStatus} from '@/lib/quotes';
import {dayLabel} from '@/lib/day-label';
import {GroupKnowledge} from './knowledge';
import {QuoteEditor,newDraft,STATUS,type Draft} from './editor';
import {MeetingList,MeetingEditor,newMeeting,type MeetingDraft} from './overleg';
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date());
const ACTIVITY:Record<string,string>={groep:'Groep',bezoek:'Boerderijbezoek',yte:'Yte'};
type Filter=''|'open'|QuoteStatus;
function Offertes(){
 const {data,error,busy,act,reload}=useGuests(),router=useRouter(),params=useSearchParams();
 const [filter,setFilter]=useState<Filter>(''),[draft,setDraft]=useState<Draft|null>(null),[message,setMessage]=useState(''),[meeting,setMeeting]=useState<MeetingDraft|null>(null);
 const state=data?.state,quotes=useMemo(()=>(state?.quotes||[]).slice().sort((a,b)=>b.updated.localeCompare(a.updated)),[state]);
 const cards=useMemo(()=>state?customerCards(state):[],[state]),can=!!data?.permissions.manage,now=today();
 // Openen via de adresbalk: ?offerte=<id>, of nieuw vanuit een klantenkaart, aanvraag of gesprek.
 useEffect(()=>{if(!state)return;const id=params.get('offerte');if(id){const q=quotes.find(x=>x.id===id);if(q&&draft?.id!==q.id)setDraft({...q});return}
  // Overleg (9 november 2026): ?overleg=<id>, of ?overleg=nieuw&klant=<id> vanaf de klantenkaart.
  const mid=params.get('overleg');if(mid&&meeting?.id!==mid){if(mid==='nieuw'){if(!meeting)setMeeting(newMeeting(params.get('klant')||'',cards))}else{const m=(state.meetings||[]).find(x=>x.id===mid);if(m)setMeeting({...m})}}
  if(params.get('nieuw')&&!draft){const d=newDraft({state,cards,customerId:params.get('klant')||'',reservationId:params.get('reservering')||'',threadId:params.get('gesprek')||''});
   // Prijsvoorstel bij het gesprek: de regels gaan als concept mee (Sanne past ze aan).
   try{const raw=sessionStorage.getItem('offerte-voorstel');if(raw){const v=JSON.parse(raw);if(v.threadId===d.threadId){d.lines=v.lines;if(v.title)d.title=v.title;if(v.intro)d.intro=v.intro;if(v.people&&!d.people)d.people=v.people;if(v.date&&!d.eventDate)d.eventDate=v.date}sessionStorage.removeItem('offerte-voorstel')}}catch{}
   // Uit een overleg: onderwerp als titel als die nog leeg is.
   try{const raw=sessionStorage.getItem('offerte-overleg');if(raw){const v=JSON.parse(raw);if(v.id===params.get('uitoverleg')&&!d.title&&v.subject)d.title=v.subject;sessionStorage.removeItem('offerte-overleg')}}catch{}
   setDraft(d)}},[state,params]);// eslint-disable-line react-hooks/exhaustive-deps
 function open(q:Quote|null){setMessage('');if(q){router.replace('/offertes?offerte='+encodeURIComponent(q.id),{scroll:false});setDraft({...q})}else{router.replace('/offertes?nieuw=1',{scroll:false});setDraft(state?newDraft({state,cards}):null)}setTimeout(()=>document.getElementById('offerte-editor')?.scrollIntoView({behavior:'smooth',block:'start'}),50)}
 function close(){router.replace('/offertes',{scroll:false});setDraft(null)}
 function openMeeting(m:MeetingDraft|null){setMessage('');setDraft(null);const d=m?{...m}:newMeeting('',cards);router.replace('/offertes?overleg='+(m?encodeURIComponent(m.id):'nieuw'),{scroll:false});setMeeting(d);setTimeout(()=>document.getElementById('overleg-editor')?.scrollIntoView({behavior:'smooth',block:'start'}),50)}
 function closeMeeting(){router.replace('/offertes',{scroll:false});setMeeting(null)}
 const count=(s:QuoteStatus)=>quotes.filter(q=>q.status===s).length,sum=(list:Quote[])=>list.reduce((n,q)=>n+quoteTotals(q.lines).totalCents,0);
 const sent=quotes.filter(q=>q.status==='verstuurd'),accepted=quotes.filter(q=>q.status==='geaccepteerd');
 // Groepsaanvragen (aanvraag of optie, vanaf vandaag) waar nog geen offerte bij hoort.
 const waiting=(state?.reservations||[]).filter(r=>r.activity!=='yte'&&['aanvraag','optie'].includes(r.status)&&r.date>=now&&!quotes.some(q=>q.reservationId===r.id)).sort((a,b)=>a.date.localeCompare(b.date));
 const shown=quotes.filter(q=>!filter?true:filter==='open'?['concept','verstuurd'].includes(q.status):q.status===filter);
 return <div data-bb-view="quotes" className="quotes-page">
  <PageHead eyebrow="GROEPSAANVRAGEN" title="Offertes & groepen" sub="Maak van een groepsaanvraag een offerte op maat. Een offerte begint als concept: pas regels, prijzen en tekst aan, en download hem als PDF voor de gast.">
   <Link className="btn secondary" href="/gesprekken">Gesprekken</Link><Link className="btn secondary" href="/planning">Planning</Link>{can&&<button className="btn secondary" onClick={()=>openMeeting(null)}>+ Klantafspraak</button>}{can&&<button className="btn" onClick={()=>open(null)}>+ Nieuwe offerte</button>}
  </PageHead>
  {error&&<div className="message" role="alert">{error}</div>}
  {message&&<div className="message" role="status">{message}</div>}
  {!data&&!error&&<p className="small">Laden…</p>}
  {data&&!can&&<p className="notice warn">Alleen wie de planning beheert, kan offertes maken en wijzigen.</p>}
  {data&&<>
   <div className="grid four">
    <Kpi label="Concepten" value={count('concept')} foot="nog af te maken" icon="✎" onClick={()=>setFilter(filter==='concept'?'':'concept')} active={filter==='concept'}/>
    <Kpi label="Verstuurd" value={count('verstuurd')} foot={sent.length?money(sum(sent))+' wacht op antwoord':'wacht op antwoord'} icon="✉" onClick={()=>setFilter(filter==='verstuurd'?'':'verstuurd')} active={filter==='verstuurd'}/>
    <Kpi label="Geaccepteerd" value={count('geaccepteerd')} foot={accepted.length?money(sum(accepted))+' totaal':'nog geen'} icon="✓" onClick={()=>setFilter(filter==='geaccepteerd'?'':'geaccepteerd')} active={filter==='geaccepteerd'}/>
    <Kpi label="Aanvragen zonder offerte" value={waiting.length} foot="groepen vanaf vandaag" icon="☆"/>
   </div>
   <ol className="quote-steps section-gap" aria-label="Van aanvraag naar afspraak">
    <li><b>1. Aanvraag</b><span>Lees het gesprek en het interne advies.</span></li>
    <li><b>2. Offerte</b><span>Maak een concept en pas het aan.</span></li>
    <li><b>3. Versturen</b><span>Stuur hem vanuit de offerte naar de gast.</span></li>
    <li><b>4. Afspraak</b><span>Na akkoord: leg de boeking vast in Planning.</span></li>
   </ol>
   {draft&&<QuoteEditor key={draft.id} draft={draft} saved={quotes.find(x=>x.id===draft.id)} cards={cards} state={state!} can={can} busy={busy} onClose={close}
    onSave={async(q,msg)=>{try{const from=params.get('uitoverleg');await act({action:'quote',quote:q,...(from?{meetingId:from}:{})});setMessage(msg);router.replace('/offertes?offerte='+encodeURIComponent(q.id),{scroll:false});return true}catch{return false}}}
    onSent={async msg=>{setMessage(msg);reload()}}
    onDelete={async id=>{try{await act({action:'quote-delete',id});setMessage('Concept verwijderd.');close()}catch{}}}/>}
   {meeting&&<MeetingEditor key={meeting.id} draft={meeting} saved={(state?.meetings||[]).find(x=>x.id===meeting.id)} state={state!} cards={cards} can={can} busy={busy} act={act}
    onSaved={id=>router.replace('/offertes?overleg='+encodeURIComponent(id),{scroll:false})} onClose={closeMeeting} onMessage={setMessage}/>}
   <MeetingList state={state!} cards={cards} selected={meeting?.id} onOpen={m=>openMeeting(m)}/>
   {waiting.length>0&&<section className="card section-gap"><div className="card-head"><h3 className="card-title">Groepsaanvragen zonder offerte</h3><span className="small">{waiting.length} {waiting.length===1?'aanvraag':'aanvragen'}</span></div>
    <div className="quote-list">{waiting.map(r=>{const card=cardForReservation(cards,r.id);return <div className="quote-row" key={r.id}>
     <div className="quote-date"><span>{dayLabel(r.date).split(' ')[0]}</span><b>{Number(r.date.slice(8))}</b><span>{new Intl.DateTimeFormat('nl-NL',{month:'short',timeZone:'UTC'}).format(new Date(r.date+'T12:00:00Z'))}</span></div>
     <div className="quote-main"><strong>{r.name}{r.example&&<> <Pill>voorbeeld</Pill></>}</strong><span>{ACTIVITY[r.activity]||r.activity} · {r.from}–{r.to} · {r.people} personen · {r.status}</span>{r.notes&&<span className="quote-note">{r.notes}</span>}</div>
     <div className="quote-actions">{card&&<Link className="btn secondary sm" href={'/gesprekken?tab=klanten&klant='+encodeURIComponent(card.id)}>Klantenkaart</Link>}{can&&<button className="btn sm" onClick={()=>{router.replace('/offertes?nieuw=1&reservering='+encodeURIComponent(r.id),{scroll:false});setDraft(newDraft({state:state!,cards,reservationId:r.id}));setTimeout(()=>document.getElementById('offerte-editor')?.scrollIntoView({behavior:'smooth'}),50)}}>Offerte maken</button>}</div></div>})}</div></section>}
   <section className="card section-gap"><div className="card-head"><h3 className="card-title">Offertes</h3>
    <div className="quote-filter" role="group" aria-label="Filter">{([['','Alle'],['open','Lopend'],['concept','Concept'],['verstuurd','Verstuurd'],['geaccepteerd','Geaccepteerd'],['afgewezen','Afgewezen'],['vervallen','Vervallen']] as [Filter,string][]).map(([f,l])=><button key={f} className={'chip-btn'+(filter===f?' active':'')} aria-pressed={filter===f} onClick={()=>setFilter(f)}>{l}</button>)}</div></div>
    {!shown.length?<p className="empty">{quotes.length?'Geen offertes met deze status.':'Nog geen offertes. Begin bij een groepsaanvraag hierboven, bij een klantenkaart of met „+ Nieuwe offerte”.'}</p>:
    <div className="quote-list">{shown.map(q=>{const t=quoteTotals(q.lines),st=STATUS[q.status],late=isExpired(q,now);return <button className={'quote-row quote-row-button'+(draft?.id===q.id?' selected':'')} key={q.id} onClick={()=>open(q)}>
     <div className="quote-num">{q.number}</div>
     <div className="quote-main"><strong>{q.title}</strong><span>{[q.customer.company,q.customer.name].filter(Boolean).join(' · ')}{q.eventDate?' · '+dayLabel(q.eventDate):''}{q.people?' · '+q.people+' personen':''}</span></div>
     <div className="quote-amount">{money(t.totalCents)}<span>incl. btw</span></div>
     <div className="quote-status">{q.status==='geaccepteerd'&&q.accepted?<Pill color="green">Online akkoord</Pill>:q.responses?.at(-1)?.kind==='vraag'&&q.responses.at(-1)!.rev===q.rev?<Pill color="purple">Vraag van gast</Pill>:<Pill color={late?'red':st.color}>{late?'Verlopen':st.label}</Pill>}<span className="small">{new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'short'}).format(new Date(q.updated))}</span></div></button>})}</div>}
   </section>
   <details className="section-gap quote-knowledge"><summary><b>Eerdere oplossingen en prijsbronnen</b> <span className="small">({(state?.groupKnowledge||[]).length} bronvoorbeelden, voor het interne advies)</span></summary><GroupKnowledge/></details>
  </>}
 </div>;
}
export default function Page(){return <Suspense fallback={null}><Offertes/></Suspense>}

'use client';
// Agenda in de managerapp (wens eigenaar 10 november 2026: „gesprekken, weekassistent, boodschappen en agenda bij de hand”).
// Dezelfde centrale planning als de weekagenda bij Planning (lib/guest-overview.ts, lib/week-agenda.ts), maar als lijst per dag:
// op een telefoon leesbaarder dan zeven kolommen. Een tik opent het agenda-item zelf in de app (./item.tsx, melding eigenaar
// 12 november 2026), niet de totale planning. De terugknop van de telefoon gaat terug naar de week.
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {useGuests} from '../../use-guests';
import {today} from '@/lib/guest-core';
import {overviewRange,weekStart,addDays} from '@/lib/guest-overview';
import {agendaDay} from '@/lib/week-agenda';
import {AgendaItem} from './item';

const LABEL:Record<string,string>={bezoek:'Daggasten',groep:'Groep',yte:'Ite',evenement:'Evenement',winkel:'Afhalen',afspraak:'Afspraak',feestdag:'Feestdag'};
const dayName=(d:string)=>new Intl.DateTimeFormat('nl-NL',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));
export default function AgendaTelefoon(){
 const {data,error}=useGuests(),[date,setDate]=useState(today()),start=weekStart(date),now=today();
 const days=useMemo(()=>data?overviewRange(data.state,start,7,data.signups||[]).map(d=>agendaDay(data.state,d)):[],[data,start]);
 // Het geopende item staat in het adres (?item=…&datum=…): de terugknop van de telefoon sluit het weer.
 const [open,setOpen]=useState<{item:string;datum:string}|null>(null);
 useEffect(()=>{const sync=()=>{const q=new URLSearchParams(location.search),item=q.get('item'),datum=q.get('datum')||'';
  setOpen(item&&/^\d{4}-\d{2}-\d{2}$/.test(datum)?{item,datum}:null);if(datum&&/^\d{4}-\d{2}-\d{2}$/.test(datum))setDate(datum);window.scrollTo(0,0)};
  sync();window.addEventListener('popstate',sync);return()=>window.removeEventListener('popstate',sync)},[]);
 function show(item:string,datum:string){history.pushState({agenda:item},'','/management/planning?item='+encodeURIComponent(item)+'&datum='+datum);setOpen({item,datum});window.scrollTo(0,0)}
 function back(){if((history.state as {agenda?:string}|null)?.agenda)history.back();else{history.replaceState(null,'','/management/planning');setOpen(null)}}
 const openDay=open&&data?overviewRange(data.state,open.datum,1,data.signups||[]).map(d=>agendaDay(data.state,d))[0]:null;
 const openBlock=openDay?.blocks.find(b=>b.key===open!.item);
 if(open&&data&&openBlock)return <AgendaItem state={data.state} block={openBlock} date={open.datum} signups={data.signups||[]} onBack={back}/>;
 if(open&&data&&!openBlock)return <div className="tel"><div className="tel-top"><button className="tel-back" onClick={back}>‹ Agenda</button></div><div className="tel-card"><p>Dit agenda-item bestaat niet meer of is verplaatst.</p></div></div>;
 return <div className="tel" data-bb-view="agenda-telefoon">
  <div className="tel-head"><div><span className="eyebrow">Planning</span><h1>Agenda</h1></div></div>
  <div className="tel-chips" role="group" aria-label="Week"><button className="tel-chip" aria-label="Vorige week" onClick={()=>setDate(addDays(start,-7))}>‹ Vorige</button><button className={'tel-chip'+(start===weekStart(now)?' active':'')} onClick={()=>setDate(now)}>Deze week</button><button className="tel-chip" aria-label="Volgende week" onClick={()=>setDate(addDays(start,7))}>Volgende ›</button></div>
  {error&&<div className="message error" role="alert">{error}</div>}
  {!data?<p className="small">Laden…</p>:days.map(d=>{const empty=!d.allDay.length&&!d.blocks.length;return <section key={d.date} className={'agd-day'+(d.date===now?' today':'')+(d.open?'':' closed')}>
   <h2>{dayName(d.date)}<span className="small">{d.open?d.hours:'gesloten'}</span></h2>
   {empty?<p className="small agd-empty">Niets gepland.</p>:<ul>
    {d.allDay.map(a=><li key={a.key} className={'agd-item '+a.kind}><span className="agd-time">hele dag</span><span className="agd-what"><strong>{a.title}</strong><span className="small">{LABEL[a.kind]||a.kind}</span></span></li>)}
    {d.blocks.map(b=><li key={b.key}><a className={'agd-item '+b.kind+(b.status&&b.status!=='bevestigd'&&b.status!=='besteld'?' tentative':'')} href={'/management/planning?item='+encodeURIComponent(b.key)+'&datum='+d.date} onClick={e=>{e.preventDefault();show(b.key,d.date)}}>
     <span className="agd-time">{b.from}{b.to?'–'+b.to:''}</span>
     <span className="agd-what"><strong>{b.title}</strong><span className="small">{[LABEL[b.kind]||b.kind,b.detail,b.status&&b.status!=='bevestigd'&&b.status!=='besteld'?b.status:''].filter(Boolean).join(' · ')}</span></span></a></li>)}
   </ul>}
  </section>})}
  <p className="small tel-foot"><Link href="/planning">Volledige planning met weekagenda</Link></p>
 </div>;
}

'use client';
import {useState} from 'react';
import Link from 'next/link';
import {Pill} from '../ui';
import {dayLabel} from '@/lib/day-label';
import {today,type GuestState} from '@/lib/guest-core';
import {overviewDay,overviewRange,weekStart,addDays,itemDetail,itemStatus,KIND_LABEL,type OverviewDay,type OverviewItem,type OverviewKind} from '@/lib/guest-overview';
const SPEND_PER_GUEST_CENTS=1500; // gemiddelde besteding per gast, in centen
type Signup={event_id:string;people:number;status:string};
const KIND_COLOR:Record<OverviewKind,'green'|'blue'|'purple'|'orange'>={bezoek:'green',groep:'blue',yte:'purple',evenement:'orange'};
const persons=(n:number)=>n+(n===1?' persoon':' personen');

export function Totals({day}:{day:OverviewDay}){
 return <div className="overview-totals"><strong className="overview-sure">{day.sure}</strong><span className="small"> zeker{day.possible>0&&<> · <b>+{day.possible}</b> mogelijk</>}</span>
  {day.forecast!=null&&<span className="small"> · prognose daggasten ±{day.forecast}</span>}
  {/* Gasten en verwachte omzet (wens eigenaar 6 november 2026): zeker + prognose × € 15 gemiddelde besteding. */}
  {day.open&&(day.forecast!=null||day.sure>0)&&<span className="small overview-omzet"> · verwacht ±{day.sure+(day.forecast??0)} gasten ≈ € {((day.sure+(day.forecast??0))*SPEND_PER_GUEST_CENTS/100).toLocaleString('nl-NL')} omzet</span>}</div>;
}
export function Kinds({day}:{day:OverviewDay}){
 return <div className="overview-kinds">{(Object.keys(KIND_LABEL) as OverviewKind[]).filter(k=>day.byKind[k]+day.possibleByKind[k]>0).map(k=><Pill key={k} color={KIND_COLOR[k]}>{KIND_LABEL[k]} {day.byKind[k]}{day.possibleByKind[k]>0&&<span className="pill-extra"> +{day.possibleByKind[k]}</span>}</Pill>)}
  {day.pickups>0&&<Pill>Afhalen {day.pickups}</Pill>}</div>;
}
function Bar({label,used,max}:{label:string;used:number;max:number}){
 if(!max)return null;
 const pct=Math.min(100,Math.round(used/max*100));
 return <div className="overview-bar" title={`${label}: ${used} van ${max}`}><span>{label} {used}/{max}</span><div><i style={{width:pct+'%'}} className={pct>=100?'full':pct>=80?'busy':''}/></div></div>;
}
/** One day as in the design "Vandaag op de boerderij": time, coloured marker, who and what, status. Also used on the dashboard. */
export function DayList({day,onOpen,href,pickupsHref}:{day:OverviewDay;onOpen?:(i:OverviewItem)=>void;href?:(i:OverviewItem)=>string;pickupsHref?:string}){
 if(!day.items.length&&!day.pickups)return <p>Nog geen boekingen of evenementen op deze dag.</p>;
 return <ul className="farm-day">{day.items.map(i=>{const st=itemStatus(i);return <li key={i.kind+i.id} className={i.status==='verlopen'?'expired':''}>
  <span className="farm-time">{i.from||'Hele dag'}</span>
  <div className="farm-body"><div><i className={'farm-mark '+i.kind} aria-hidden="true"/><strong>{i.title}</strong> <span className="small">· {i.what}</span>{i.example&&<> <Pill>voorbeeld</Pill></>}</div><span className="small">{itemDetail(i)}</span></div>
  <Pill color={st.color||undefined}>{st.label}</Pill>
  {href?<Link className="btn secondary sm" href={href(i)}>Openen</Link>:i.kind!=='evenement'&&onOpen&&<button type="button" className="btn secondary sm" onClick={()=>onOpen(i)}>Openen</button>}
 </li>})}
 {day.pickups>0&&<li><span className="farm-time">Hele dag</span><div className="farm-body"><div><i className="farm-mark winkel" aria-hidden="true"/><strong>Winkel: {day.pickups} {day.pickups===1?'afhaalbestelling':'afhaalbestellingen'}</strong></div><span className="small">nog niet afgehaald</span></div><Pill>Open</Pill>{pickupsHref&&<Link className="btn secondary sm" href={pickupsHref}>Openen</Link>}</li>}
 </ul>;
}

export function GuestOverview({state,signups,forecasts,onOpen}:{state:GuestState;signups:Signup[];forecasts:Record<string,number|null>;onOpen:(i:OverviewItem)=>void}){
 const [mode,setMode]=useState<'week'|'dag'>('week'),[date,setDate]=useState(today());
 const step=mode==='week'?7:1,start=mode==='week'?weekStart(date):date;
 const week=mode==='week'?overviewRange(state,start,7,signups,forecasts):[];
 const day=mode==='dag'?overviewDay(state,date,signups,forecasts):null;
 const sure=week.reduce((n,d)=>n+d.sure,0),possible=week.reduce((n,d)=>n+d.possible,0);
 // Closed days (from the opening hours, e.g. Monday–Wednesday) are left out of the week (owner request, 3 November 2026),
 // unless something is planned on them: then the day stays visible, marked closed, so nothing disappears unseen.
 const shown=week.filter(d=>d.open||d.items.length>0||d.pickups>0),hidden=week.filter(d=>!shown.includes(d));
 return <section className="card section-gap guest-overview" aria-label="Verwachte gasten">
  <div className="row between overview-head"><h2>Verwachte gasten</h2>
   <div className="row" style={{gap:8,flexWrap:'wrap'}}>
    <div className="overview-mode" role="group" aria-label="Weergave">{(['dag','week'] as const).map(m=><button key={m} type="button" className={'btn sm '+(mode===m?'':'secondary')} aria-pressed={mode===m} onClick={()=>setMode(m)}>{m==='dag'?'Dag':'Week'}</button>)}</div>
    <button type="button" className="btn secondary sm" aria-label={mode==='week'?'Vorige week':'Vorige dag'} onClick={()=>setDate(addDays(date,-step))}>‹</button>
    <button type="button" className="btn secondary sm" onClick={()=>setDate(today())}>Vandaag</button>
    <button type="button" className="btn secondary sm" aria-label={mode==='week'?'Volgende week':'Volgende dag'} onClick={()=>setDate(addDays(date,step))}>›</button>
    <input type="date" aria-label="Datum kiezen" value={date} onChange={e=>e.target.value&&setDate(e.target.value)}/>
   </div></div>
  <p className="small">Zeker = bevestigde boekingen en aanmeldingen voor evenementen. Mogelijk = geldige opties en aanvragen. Losse daggasten zonder boeking staan er niet in{Object.keys(forecasts).length?'; de prognose staat er apart bij':'; laad de bezoekersverwachting voor een prognose'}.</p>
  {mode==='week'?<>
   <p><strong>Week van {dayLabel(start)}:</strong> {persons(sure)} zeker{possible>0?`, +${possible} mogelijk`:''}.</p>
   {hidden.length>0&&<p className="small">Gesloten en niets gepland: {hidden.map(d=>dayLabel(d.date).split(' ')[0].toLowerCase()).join(', ')}. Kies Dag of een datum om zo'n dag toch te bekijken.</p>}
   <div className="overview-week" style={{'--days':shown.length||1} as React.CSSProperties}>{shown.map(d=><button type="button" key={d.date} className={'overview-day'+(d.date===today()?' today':'')+(d.open?'':' closed')} onClick={()=>{setDate(d.date);setMode('dag')}} aria-label={`${dayLabel(d.date)}: ${d.sure} zeker, ${d.possible} mogelijk. Dag openen`}>
    <span className="overview-date">{dayLabel(d.date)}</span>
    <span className="small">{d.hours}{d.holidays.length?' · '+d.holidays.join(', '):''}{d.note?' · '+d.note:''}</span>
    <Totals day={d}/><Kinds day={d}/>
    {d.parts.map(p=><div key={p.id}>{p.bezoek.used>0&&<Bar label={p.name+' bezoek'} used={p.bezoek.used} max={p.bezoek.max}/>}{p.groep.used>0&&<Bar label={p.name+' groep'} used={p.groep.used} max={p.groep.max}/>}</div>)}
    <ul className="overview-mini">{(()=>{const shown=d.items.filter(i=>i.status!=='verlopen');return <>{shown.slice(0,5).map(i=><li key={i.kind+i.id}><i className={'farm-mark '+i.kind} aria-hidden="true"/>{i.from} {i.title} ({i.people})</li>)}{shown.length>5&&<li>+{shown.length-5} meer</li>}</>})()}</ul>
   </button>)}</div>
  </>:day&&<>
   <div className="row between"><div><h3>{dayLabel(day.date)}</h3><span className="small">{day.hours}{day.holidays.length?' · '+day.holidays.join(', '):''}{day.note?' · '+day.note:''}</span></div><div><Totals day={day}/><Kinds day={day}/></div></div>
   {day.parts.length>0&&<div className="overview-parts">{day.parts.map(p=><div key={p.id} className="overview-part"><strong>{p.name}</strong> <span className="small">{p.from}–{p.to}</span><Bar label="Bezoek" used={p.bezoek.used} max={p.bezoek.max}/><Bar label="Groepen" used={p.groep.used} max={p.groep.max}/></div>)}</div>}
   {day.byKind.yte>0&&<p className="small">Ite by Boerderijrecreatie: {day.byKind.yte} van {day.seats} zitplaatsen.</p>}
   <DayList day={day} onOpen={onOpen}/>
  </>}
 </section>;
}

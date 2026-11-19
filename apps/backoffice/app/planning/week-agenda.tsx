'use client';
// Weekagenda (wens eigenaar 3 november 2026): alle gastboekingen, evenementen en afhaalmomenten in één weekweergave,
// zoals een agenda. Rekenwerk in lib/week-agenda.ts; gegevens uit dezelfde centrale planning als „Verwachte gasten”.
import {useMemo,useState} from 'react';
import {today,type GuestState} from '@/lib/guest-core';
import {overviewRange,weekStart,addDays,KIND_LABEL,type OverviewItem} from '@/lib/guest-overview';
import {agendaDay,hourRange,minutes,slotTime,type AgendaKind} from '@/lib/week-agenda';
type Signup={event_id:string;people:number;status:string};
const HOUR=48;
const short=(date:string)=>new Intl.DateTimeFormat('nl-NL',{weekday:'short',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z')).replace('.','');
const dayNum=(date:string)=>Number(date.slice(8,10));
const month=(date:string)=>new Intl.DateTimeFormat('nl-NL',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
const LEGEND:[AgendaKind,string][]=[...(Object.entries(KIND_LABEL) as [AgendaKind,string][]),['winkel','Afhalen winkel'],['afspraak','Afspraak']];
const STATUS:Record<string,string>={bevestigd:'',optie:'optie',aanvraag:'aanvraag',besteld:''};

// Klikken op een lege plek (wens eigenaar 9 november 2026): onSlot krijgt de dag en de tijd van de klik (lib/week-agenda.ts slotTime).
export function WeekAgenda({state,signups,onOpen,onEvent,onAppointment,onSlot,forecasts={}}:{state:GuestState;signups:Signup[];onOpen:(i:OverviewItem)=>void;onEvent?:(id:string,date:string)=>void;onAppointment?:(id:string)=>void;onSlot?:(date:string,time:string)=>void;forecasts?:Record<string,number|null>}){
 const [date,setDate]=useState(today());
 const start=weekStart(date);
 const days=useMemo(()=>overviewRange(state,start,7,signups).map(d=>agendaDay(state,d)),[state,start,signups]);
 const hours=hourRange(days),span=(hours.to-hours.from)*60;
 const top=(t:string)=>((minutes(t)!-hours.from*60)/60)*HOUR;
 const now=new Date(),nowDate=today(),nowMin=Number(new Intl.DateTimeFormat('nl-NL',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Europe/Amsterdam'}).format(now).replace(':',''));
 const nowTop=((Math.floor(nowMin/100)*60+nowMin%100)-hours.from*60)/60*HOUR;
 const hasAllDay=days.some(d=>d.allDay.length>0);
 return <section className="card section-gap week-agenda" aria-label="Weekagenda">
  <div className="row between overview-head"><h2>Weekagenda · {month(start)}</h2>
   <div className="row" style={{gap:8,flexWrap:'wrap'}}>
    <button type="button" className="btn secondary sm" aria-label="Vorige week" onClick={()=>setDate(addDays(start,-7))}>‹</button>
    <button type="button" className="btn secondary sm" onClick={()=>setDate(today())}>Vandaag</button>
    <button type="button" className="btn secondary sm" aria-label="Volgende week" onClick={()=>setDate(addDays(start,7))}>›</button>
    <input type="date" aria-label="Week kiezen" value={date} onChange={e=>e.target.value&&setDate(e.target.value)}/>
   </div></div>
  <ul className="agenda-legend">{LEGEND.map(([k,l])=><li key={k}><i className={'farm-mark '+k} aria-hidden="true"/>{l}</li>)}<li className="small">Gestreept = optie of aanvraag · grijs = gesloten</li></ul>
  <div className="agenda-scroll"><div className="agenda-grid" style={{'--hour':HOUR+'px'} as React.CSSProperties}>
   <div className="agenda-corner"/>
   {days.map(d=><div key={d.date} className={'agenda-dayhead'+(d.date===nowDate?' today':'')+(d.open?'':' closed')}><span>{short(d.date)}</span><b>{dayNum(d.date)}</b><span className="small">{d.open?d.hours:'gesloten'}</span>{d.open&&forecasts[d.date]!=null&&<span className="agenda-visitors" title="Voorspelling daggasten (Planning → Voorspelling aanpassen)">±{forecasts[d.date]} gasten</span>}</div>)}
   {hasAllDay&&<><div className="agenda-gutter small">hele dag</div>{days.map(d=><div key={d.date} className="agenda-allday">{d.allDay.map(a=>a.kind==='evenement'&&onEvent?<button type="button" key={a.key} className="agenda-chip evenement" onClick={()=>onEvent(a.key.slice('evenement'.length),d.date)}>{a.title}</button>:<span key={a.key} className={'agenda-chip '+a.kind}>{a.title}</span>)}</div>)}</>}
   <div className="agenda-hours" style={{height:span/60*HOUR}}>{Array.from({length:hours.to-hours.from},(_,i)=><span key={i} style={{top:i*HOUR}}>{String(hours.from+i).padStart(2,'0')}:00</span>)}</div>
   {days.map(d=><div key={d.date} className={'agenda-col'+(d.open?'':' closed')+(onSlot?' clickable':'')} style={{height:span/60*HOUR}} aria-label={'Agenda '+d.date}
    title={onSlot?'Klik om hier een afspraak te maken':undefined}
    onClick={onSlot?e=>{const el=e.target as HTMLElement;if(el.closest('.agenda-block'))return;const r=e.currentTarget.getBoundingClientRect();onSlot(d.date,slotTime(e.clientY-r.top,hours.from,HOUR))}:undefined}>
    {d.parts.map(p=>minutes(p.from)!==null&&minutes(p.to)!==null&&<div key={p.id} className="agenda-part" style={{top:top(p.from),height:Math.max(8,top(p.to)-top(p.from))}} title={`${p.name} ${p.from}–${p.to}`}/>)}
    {d.blocks.map(b=>{const h=Math.max(22,top(b.to)-top(b.from)),open=(!!b.item&&(b.kind!=='evenement'||!!onEvent))||(!!b.appointmentId&&!!onAppointment);
     const body=<><strong>{b.from} {b.title}</strong>{h>34&&<span>{b.detail}{STATUS[b.status]?' · '+STATUS[b.status]:''}</span>}</>;
     const style={top:top(b.from),height:h,left:`calc(${b.lane/b.lanes*100}% + 2px)`,width:`calc(${100/b.lanes}% - 4px)`};
     const cls='agenda-block '+b.kind+(b.status==='optie'||b.status==='aanvraag'?' maybe':'');
     return open?<button type="button" key={b.key} className={cls} style={style} title={`${b.from}–${b.to} ${b.title} · ${b.detail}`} onClick={()=>b.appointmentId?onAppointment!(b.appointmentId):b.kind==='evenement'?onEvent!(b.item!.id,d.date):onOpen(b.item!)}>{body}</button>
      :<div key={b.key} className={cls} style={style} title={`${b.from}–${b.to} ${b.title} · ${b.detail}`}>{body}</div>})}
    {d.date===nowDate&&nowTop>=0&&nowTop<=span/60*HOUR&&<div className="agenda-now" style={{top:nowTop}} aria-hidden="true"/>}
   </div>)}
  </div></div>
  <p className="small">{onSlot?'Klik op een lege plek om daar een afspraak te maken. ':''}Klik op een boeking of evenement om die te openen. Ochtend, middag en namiddag staan als lichte band in elke dag. Verlopen opties staan er niet in.</p>
 </section>;
}

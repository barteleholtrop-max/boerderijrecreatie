'use client';
// Vandaag & taken op het dashboard (wens eigenaar 16 november 2026, nieuwe indeling stap 2): de signalen (diensten die nog
// open staan, voorraad onder minimum) en wat uit het overleg komt, op één plek. /taken stuurt hierheen door. Productcontrole
// staat al apart op het dashboard en komt hier daarom niet nog een keer.
import Link from 'next/link';
import {Pill} from '../ui';
import {useTaken,takenDayLabel as dayLabel,overlegStatus} from './use-taken';
export function TakenKaarten(){
 const {loading,today,overleg,staff,low}=useTaken();
 return <>
  <div className="card" id="taken" data-bb-view="dashboard-taken"><div className="card-head"><h3 className="card-title">Wat moet er gebeuren?</h3><Pill color="orange">{loading?'…':low.length+staff.length+' open'}</Pill></div>
   {staff.map(x=><div className="task" key={x.pot+x.day}><div className="task-dot">☺</div><div className="task-body"><strong>Diensten op {dayLabel(x.day)}? · {x.potName}</strong><span>Ledenplanning · {x.text}{x.items.length?' ('+x.items.join(', ')+')':''}</span></div><Link className="btn secondary sm" href="/personeelsplanning">Plannen</Link></div>)}
   {low.map(i=><div className="task" key={i.id}><div className="task-dot">▥</div><div className="task-body"><strong>{i.name} bijbestellen</strong><span>Inkoop · voorraad {i.stock} {i.unit}, minimum {i.min}</span></div><Link className="btn secondary sm" href="/inkoop?tab=week">Open</Link></div>)}
   {!loading&&!low.length&&!staff.length&&<div className="empty">Geen open diensten of voorraadsignalen.</div>}</div>
  <div className="card" data-bb-view="taken-overleg"><div className="card-head"><h3 className="card-title">Uit het overleg</h3><Pill color="orange">{overleg?overleg.actions.length+overleg.waiting.length+' open':'…'}</Pill></div>
   {overleg?.waiting.map(w=><div className="task" key={w.id}><div className="task-dot">☷</div><div className="task-body"><strong>{w.title}</strong><span>{w.potName} · {overlegStatus(w.status)}</span></div><Link className="btn secondary sm" href="/overleg">Openen</Link></div>)}
   {overleg?.actions.map(a=><div className="task" key={a.id}><div className="task-dot">☐</div><div className="task-body"><strong>{a.text}</strong><span>{a.owner}{a.due?` · ${a.due.split('-').reverse().join('-')}`:''}{a.due&&a.due<today?' · te laat':''}</span></div><Link className="btn secondary sm" href="/overleg">Openen</Link></div>)}
   {overleg&&!overleg.actions.length&&!overleg.waiting.length&&<div className="empty">Niets uit het overleg.</div>}</div>
 </>
}

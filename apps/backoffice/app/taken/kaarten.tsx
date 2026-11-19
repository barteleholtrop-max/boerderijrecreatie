'use client';
// Vandaag & taken op het dashboard (wens eigenaar 16 november 2026, nieuwe indeling stap 2): de signalen (voorraad onder
// minimum) op één plek. /taken stuurt hierheen door. Productcontrole
// staat al apart op het dashboard en komt hier daarom niet nog een keer.
import Link from 'next/link';
import {Pill} from '../ui';
import {useTaken} from './use-taken';
export function TakenKaarten(){
 const {loading,low}=useTaken();
 return <>
  <div className="card" id="taken" data-bb-view="dashboard-taken"><div className="card-head"><h3 className="card-title">Wat moet er gebeuren?</h3><Pill color="orange">{loading?'…':low.length+' open'}</Pill></div>
   {low.map(i=><div className="task" key={i.id}><div className="task-dot">▥</div><div className="task-body"><strong>{i.name} bijbestellen</strong><span>Inkoop · voorraad {i.stock} {i.unit}, minimum {i.min}</span></div><Link className="btn secondary sm" href="/inkoop?tab=week">Open</Link></div>)}
   {!loading&&!low.length&&<div className="empty">Geen voorraadsignalen.</div>}</div>
 </>
}

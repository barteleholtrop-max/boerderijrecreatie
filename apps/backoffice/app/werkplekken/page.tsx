'use client';
// Bestellingen & uitgifte: de totale stroom van alle werkplekken (wens eigenaar 5 november 2026: „voor de eigenaar leuk om te
// volgen”). Eén overzicht van keuken, koffiebar en winkel samen: per werkplek hoeveel er nieuw, bezig en klaar is, en elke
// bestelling met per werkplek de stand. Alleen kijken: oppakken en klaar melden gebeurt op de werkplekschermen zelf
// (/werkplek/kok, /werkplek/barista, /werkplek/winkel). Gegevens via dezelfde deur als de werkplekken (GET /api/workplaces).
import {useEffect,useState} from 'react';
import {PageHead,SubTabs} from '../ui';
import {TabletScreens} from './screens';
import {waiting} from '@/lib/kiosk-core';
import {FLOW_STATIONS,mergeFlow,splitFlow,stationStats,type FlowOrder,type FlowStation,type StationOrder} from '@/lib/work-flow';

const NAMES:Record<FlowStation,{name:string;icon:string}>={kok:{name:'Kok',icon:'🍳'},barista:{name:'Barista',icon:'☕'},winkel:{name:'Winkel',icon:'🧺'}};
const STATE={nieuw:'Nieuw',behandeling:'Bezig',gereed:'Klaar'} as const;
const time=(iso:string)=>new Date(iso).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Amsterdam'});
const route=(mode:string)=>mode==='yte'?'Ite by Boer Bart · via de bediening':mode==='winkel'?'Winkel · afhalen':'Dagrestaurant · afhalen';

export default function Workplaces(){
 const [data,setData]=useState<Partial<Record<FlowStation,StationOrder[]>>|null>(null),[failed,setFailed]=useState(false),[updated,setUpdated]=useState(''),[now,setNow]=useState(0);
 useEffect(()=>{let live=true;const controller=new AbortController();
  async function read(){try{
   const lists=await Promise.all(FLOW_STATIONS.map(async s=>{const r=await fetch('/api/workplaces?station='+s,{cache:'no-store',signal:controller.signal});if(!r.ok)throw Error();return [s,await r.json() as StationOrder[]] as const}));
   if(!live)return;setData(Object.fromEntries(lists));setFailed(false);setNow(Date.now());setUpdated(new Date().toLocaleTimeString('nl-NL',{timeZone:'Europe/Amsterdam'}));
  }catch{if(live&&!controller.signal.aborted)setFailed(true)}}
  void read();const t=setInterval(()=>{if(!document.hidden)void read()},5000);
  return()=>{live=false;controller.abort();clearInterval(t)}},[]);
 const flow=data?splitFlow(mergeFlow(data)):{open:[],done:[]},stats=data?stationStats(data):[];
 return <div className="work-app flow-app" data-bb-view="work-flow">
  <PageHead eyebrow="RESTAURANT · WERKPLEKKEN" title="Bestellingen & uitgifte" sub="De totale stroom: alles wat er bij de kok, de barista en de winkel binnenkomt, onderweg is en klaar staat. Hier kijk je mee; oppakken en klaar melden doen de werkplekken op hun eigen scherm."><a className="btn" href="/opnemen">🍽️ Opnemen aan tafel</a></PageHead>
  <SubTabs current={'/werkplekken'} items={[['/werkplekken','Totale stroom'],['/kassa','Kassa · bestelling opnemen'],['/bestelopties','Bestelopties & werkplekken']]}/>
  {failed&&<div className="work-message message" role="status">Verversen mislukt. De getoonde informatie kan verouderd zijn.</div>}
  <div className="work-sync">{data?'Ververst vanzelf om de 5 seconden · laatst geladen '+updated:'Bestellingen laden…'}</div>
  <div className="flow-stations">{stats.map(s=>{const w=s.oldest?waiting(s.oldest,now):null;
   return <a key={s.station} className={'flow-station'+(w?' wait-'+w.level:'')} href={'/werkplek/'+s.station} title={'Open het werkplekscherm van '+NAMES[s.station].name}>
    <h2>{NAMES[s.station].icon} {NAMES[s.station].name}</h2>
    <div className="flow-counts"><span><b>{s.nieuw}</b>nieuw</span><span><b>{s.bezig}</b>bezig</span><span><b>{s.klaar}</b>klaar</span></div>
    <p>{w?`Langst wachtend: ${w.text}`:'Niets open'}</p></a>})}</div>
  <section className="flow-section"><h2>Onderweg <span>{flow.open.length}</span></h2>
   {data&&!flow.open.length&&<p className="work-empty">Alles is klaar. Even rust in de keuken.</p>}
   <div className="flow-list">{flow.open.map(f=><FlowCard key={f.id} f={f} now={now}/>)}</div></section>
  {flow.done.length>0&&<details className="flow-section flow-done"><summary>Klaar in de laatste 24 uur ({flow.done.length})</summary>
   <div className="flow-list">{flow.done.map(f=><FlowCard key={f.id} f={f} now={now}/>)}</div></details>}
  <TabletScreens/>
 </div>;
}

function FlowCard({f,now}:{f:FlowOrder;now:number}){
 const w=f.state==='klaar'?null:waiting(f.created,now);
 return <article className={'flow-card '+f.state+(w?' wait-'+w.level:'')}>
  <div className="flow-card-head"><div><b>{f.number}{f.test?' · proef':''}</b><h3>{f.reference}</h3></div>
   <span>{time(f.created)}{w?` · ${w.text}`:f.finished?` · klaar ${time(f.finished)}`:''}</span></div>
  <p className="ticket-route">{route(f.mode)}</p>
  {f.parts.map(p=><div key={p.station} className={'flow-part '+p.status}>
   <span className="flow-part-head">{NAMES[p.station].icon} {NAMES[p.station].name} <em>{STATE[p.status]}</em></span>
   <small>{p.lines.map(l=>l.quantity+'× '+l.name+(l.choices?.length?' ('+l.choices.join(', ')+')':'')).join(' · ')}</small></div>)}
 </article>;
}

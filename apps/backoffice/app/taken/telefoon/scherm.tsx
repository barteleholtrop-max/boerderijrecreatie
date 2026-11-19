'use client';
// Vandaag & taken in de managementapp (wens eigenaar 11 november 2026): wat er vandaag in de agenda staat en wat er moet gebeuren,
// in één lijst op de telefoon. Dezelfde gegevens als Vandaag & taken in de backoffice (app/taken/use-taken.ts) en de agenda
// (lib/guest-overview.ts, lib/week-agenda.ts). Een tik opent het onderdeel in de backoffice.
import {useMemo} from 'react';
import Link from 'next/link';
import {useGuests} from '../../use-guests';
import {overviewDay} from '@/lib/guest-overview';
import {agendaDay} from '@/lib/week-agenda';
import {useTaken,takenDayLabel} from '../use-taken';
import {MagazijnMeldingen} from '../../magazijn-meldingen';

const LABEL:Record<string,string>={bezoek:'Daggasten',groep:'Groep',yte:'Ite',evenement:'Evenement',winkel:'Afhalen',afspraak:'Afspraak',feestdag:'Feestdag'};
type Item={key:string;title:string;sub:string;href:string;late?:boolean};
function Lijst({titel,items,leeg}:{titel:string;items:Item[];leeg:string}){
 return <section className="agd-day"><h2>{titel}<span className="small">{items.length||''}</span></h2>
  {items.length?<ul>{items.map(i=><li key={i.key}><Link className="agd-item" href={i.href}><span className="agd-what"><strong>{i.title}</strong><span className="small">{i.sub}{i.late?' · te laat':''}</span></span></Link></li>)}</ul>
   :<p className="small agd-empty">{leeg}</p>}</section>;
}
export default function VandaagTelefoon(){
 const {data}=useGuests(),{loading,today,low,attention}=useTaken();
 const dag=useMemo(()=>data?agendaDay(data.state,overviewDay(data.state,today,data.signups||[])):null,[data,today]);
 const signalen:Item[]=[
  ...attention.map(a=>({key:'p'+a.key,title:`${a.label} · ${a.count}`,sub:'Productbeheer · '+a.hint,href:'/producten?filter='+a.key})),
  ...low.map(i=>({key:'i'+i.id,title:`${i.name} bijbestellen`,sub:`Inkoop · voorraad ${i.stock} ${i.unit}, minimum ${i.min}`,href:'/inkoop?tab=week'}))];
 return <div className="tel" data-bb-view="vandaag-telefoon">
  <div className="tel-head"><div><span className="eyebrow">Vandaag</span><h1>{takenDayLabel(today)}</h1></div></div>
  {dag&&<section className={'agd-day today'+(dag.open?'':' closed')}><h2>In de agenda<span className="small">{dag.open?dag.hours:'gesloten'}</span></h2>
   {!dag.allDay.length&&!dag.blocks.length?<p className="small agd-empty">Niets gepland.</p>:<ul>
    {dag.allDay.map(a=><li key={a.key} className={'agd-item '+a.kind}><span className="agd-time">hele dag</span><span className="agd-what"><strong>{a.title}</strong><span className="small">{LABEL[a.kind]||a.kind}</span></span></li>)}
    {dag.blocks.map(b=><li key={b.key}><Link className={'agd-item '+b.kind+(b.status&&b.status!=='bevestigd'&&b.status!=='besteld'?' tentative':'')} href={'/management/planning?item='+encodeURIComponent(b.key)+'&datum='+dag.date}>
     <span className="agd-time">{b.from}{b.to?'–'+b.to:''}</span><span className="agd-what"><strong>{b.title}</strong><span className="small">{[LABEL[b.kind]||b.kind,b.detail].filter(Boolean).join(' · ')}</span></span></Link></li>)}
   </ul>}</section>}
  <Lijst titel="Te doen" items={signalen} leeg={loading?'Laden…':'Geen open signalen.'}/>
  <MagazijnMeldingen compact/>
  <p className="small tel-foot"><Link href="/taken">Vandaag &amp; taken in de backoffice</Link></p>
 </div>;
}

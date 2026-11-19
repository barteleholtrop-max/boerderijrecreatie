'use client';
// Eén agenda-item in de app Management (melding eigenaar 12 november 2026: „als je in de telefoon app op de afspraak drukt wil
// ik graag naar het agenda item. We gaan nu naar de totale planning van het bedrijf”). De details staan meteen in de app:
// tijd, soort, status, contactgegevens en notities, uit dezelfde centrale planning (GuestState). De volledige planning blijft
// bereikbaar via een link onderaan, voor wie op de computer verder wil.
import Link from 'next/link';
import type {GuestState} from '@/lib/guest-core';
import {agendaHref,type AgendaBlock} from '@/lib/week-agenda';

const LABEL:Record<string,string>={bezoek:'Daggasten',groep:'Groep',yte:'Ite-diner',evenement:'Evenement',winkel:'Afhalen in de winkel',afspraak:'Afspraak'};
const STATUS:Record<string,string>={aanvraag:'Aanvraag',optie:'Optie',bevestigd:'Bevestigd',verlopen:'Optie verlopen',besteld:'Besteld',afspraak:'Afspraak'};
const dayName=(d:string)=>new Intl.DateTimeFormat('nl-NL',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));
const telHref=(p:string)=>'tel:'+p.replace(/[^\d+]/g,'');

function Rij({label,children}:{label:string;children:React.ReactNode}){return children?<div className="agd-row"><dt>{label}</dt><dd>{children}</dd></div>:null}
/** Telefoonnummers in een tekst worden aantikbaar. */
function Tekst({text}:{text:string}){
 const parts=text.split(/(\+?\d[\d \-()]{7,}\d)/g);
 return <p className="agd-notes">{parts.map((p,i)=>i%2?<a key={i} href={telHref(p)}>{p}</a>:p)}</p>;
}

export function AgendaItem({state,block,date,signups,onBack}:{state:GuestState;block:AgendaBlock;date:string;signups:{event_id:string;people:number;status:string}[];onBack:()=>void}){
 const appt=block.appointmentId?(state.appointments||[]).find(a=>a.id===block.appointmentId):undefined;
 const res=block.item&&block.kind!=='evenement'?state.reservations.find(r=>r.id===block.item!.id):undefined;
 const ev=block.kind==='evenement'&&block.item?state.events.find(e=>e.id===block.item!.id):undefined;
 const pickup=block.kind==='winkel'?state.pickups.find(p=>'w'+p.id===block.key):undefined;
 const tentative=block.status&&!['bevestigd','besteld','afspraak'].includes(block.status);
 const aangemeld=ev?signups.filter(s=>s.event_id===ev.id&&s.status==='aangemeld').reduce((n,s)=>n+s.people,0):0;
 return <div className="tel" data-bb-view="agenda-telefoon-item">
  <div className="tel-top"><button className="tel-back" onClick={onBack} aria-label="Terug naar de agenda">‹ Agenda</button><span className={'tel-kind agd-kind '+block.kind}>{LABEL[block.kind]||block.kind}</span></div>
  <article className={'agd-detail '+block.kind+(tentative?' tentative':'')}>
   <h1>{block.title}</h1>
   <p className="agd-when"><strong>{dayName(date)}</strong><span>{block.from}{block.to?' – '+block.to:''}</span></p>
   {block.status&&block.status!=='afspraak'&&<span className={'tel-state '+(tentative?'s-red':'s-green')}>{STATUS[block.status]||block.status}</span>}
   <dl className="agd-facts">
    {appt&&<><Rij label="Met">{appt.customerName}</Rij><Rij label="Ingepland door">{appt.createdBy}</Rij></>}
    {res&&<><Rij label="Naam">{res.name}</Rij><Rij label="Personen">{res.people}</Rij>
     <Rij label="Telefoon">{res.phone&&<a href={telHref(res.phone)}>{res.phone}</a>}</Rij>
     <Rij label="E-mail">{res.email&&<a href={'mailto:'+res.email}>{res.email}</a>}</Rij>
     <Rij label="Tafels">{res.tables.length?String(res.tables.length):''}</Rij>
     <Rij label="Optie tot">{res.status==='optie'&&res.expires?res.expires.slice(0,16).replace('T',' '):''}</Rij></>}
    {ev&&<><Rij label="Aanmeldingen">{aangemeld+(ev.capacity?' van '+ev.capacity:'')+' personen'}</Rij></>}
    {pickup&&<Rij label="Naam">{pickup.name}</Rij>}
   </dl>
   {(appt?.notes||res?.notes||ev?.description||pickup?.description)&&<section className="agd-section"><h2>{pickup?'Bestelling':'Notities'}</h2><Tekst text={appt?.notes||res?.notes||ev?.description||pickup?.description||''}/></section>}
   {!appt&&!res&&!ev&&!pickup&&block.detail&&<Tekst text={block.detail}/>}
  </article>
  <p className="small tel-foot"><Link href={agendaHref(block,date)}>Openen in de volledige planning</Link></p>
 </div>;
}

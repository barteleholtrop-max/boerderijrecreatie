// Day and week overview for Planning: how many guests to expect and what they come to do (wish owner, 3 November 2026).
// Pure: reads the central planning and event signups, changes nothing. Same capacity rules as validateBooking.
import {type GuestState,type Reservation,opening,peakPeople,groupDayOf} from './guest-core';
import {holidays} from './guest-calendar';

export type OverviewKind='bezoek'|'groep'|'yte'|'evenement';
export type OverviewStatus='bevestigd'|'optie'|'aanvraag'|'verlopen';
export type OverviewItem={exception?:string;kind:OverviewKind;id:string;from:string;to:string;title:string;what:string;people:number;status:OverviewStatus;notes:string;example:boolean;capacity?:number;tables?:number;expires?:string};
export type OverviewPart={id:string;name:string;from:string;to:string;bezoek:{used:number;max:number};groep:{used:number;max:number}};
export type OverviewDay={date:string;open:boolean;hours:string;note:string;holidays:string[];
 sure:number;possible:number;byKind:Record<OverviewKind,number>;possibleByKind:Record<OverviewKind,number>;items:OverviewItem[];parts:OverviewPart[];seats:number;pickups:number;forecast:number|null};
type Signup={event_id:string;people:number;status:string};

export const KIND_LABEL:Record<OverviewKind,string>={bezoek:'Daggasten',groep:'Groepen',yte:'Ite by Boer Bart',evenement:'Evenementen'};
const WHAT:Record<'bezoek'|'groep'|'yte',string>={bezoek:'Bezoek speelboerderij',groep:'Groepsbezoek',yte:'Ite-diner'};

export function addDays(date:string,n:number){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
/** Monday of the week that contains date. */
export function weekStart(date:string){const dow=new Date(date+'T12:00:00Z').getUTCDay();return addDays(date,dow===0?-6:1-dow);}

function status(r:Reservation,now:number):OverviewStatus{
 if(r.status==='optie')return Date.parse(r.expires)>now?'optie':'verlopen';
 return r.status as OverviewStatus;
}
// Only confirmed bookings and valid options hold a place; that is what the capacity rules count as well.
const holds=(r:Reservation,now:number)=>r.status==='bevestigd'||(r.status==='optie'&&Date.parse(r.expires)>now);

export function overviewDay(s:GuestState,date:string,signups:Signup[]=[],forecasts:Record<string,number|null>={},now=Date.now()):OverviewDay{
 const h=opening(s,date),exception=s.exceptions.find(e=>e.date===date),groupDay=groupDayOf(s,date);
 const items:OverviewItem[]=[];
 for(const r of s.reservations){
  if(r.date!==date||r.status==='geannuleerd')continue;
  // Een uitzondering staat altijd zichtbaar in de agenda, met de reden (wens eigenaar 13 november 2026).
  items.push({...(r.exception?{exception:r.exception}:{}),kind:r.activity,id:r.id,from:r.from,to:r.to,title:r.name,what:WHAT[r.activity],people:r.people,status:status(r,now),notes:r.exception?'Uitzondering: '+r.exception+(r.notes?'\n'+r.notes:''):r.notes,example:!!r.example,tables:r.tables.length,expires:r.expires});
 }
 for(const e of s.events){
  if(e.date!==date||e.holiday)continue;
  const people=signups.filter(x=>x.event_id===e.id&&x.status==='aangemeld').reduce((n,x)=>n+x.people,0);
  items.push({kind:'evenement',id:e.id,from:e.from,to:e.to,title:e.title,what:'Evenement',people,status:'bevestigd',notes:e.description||'',example:!!e.example,capacity:e.capacity||undefined});
 }
 items.sort((a,b)=>(a.from||'99').localeCompare(b.from||'99')||a.title.localeCompare(b.title,'nl'));
 const counted=items.filter(i=>i.status!=='verlopen');
 // byKind counts what is sure (confirmed); possibleByKind what may still come (valid options and requests).
 const byKind={bezoek:0,groep:0,yte:0,evenement:0} as Record<OverviewKind,number>,possibleByKind={...byKind};
 for(const i of counted)(i.status==='bevestigd'?byKind:possibleByKind)[i.kind]+=i.people;
 const blocking=s.reservations.filter(r=>r.date===date&&holds(r,now));
 const parts=(s.dayparts||[]).filter(d=>d.from&&d.to).map(d=>{
  const span={from:d.from,to:d.to,date} as Reservation,used=(a:'bezoek'|'groep')=>peakPeople(blocking.filter(r=>r.activity===a),span);
  return {id:d.id,name:d.name,from:d.from,to:d.to,bezoek:{used:used('bezoek'),max:d.bezoek},groep:{used:used('groep'),max:d.groep}};
 });
 return {date,open:!!h?.open,hours:h?.open?h.from+'–'+h.to:'Gesloten',note:[exception?.note,groupDay&&`Groepsdag ${groupDay.from}–${groupDay.to} (dicht voor daggasten): ${groupDay.note}`].filter(Boolean).join(' · '),
  holidays:holidays(Number(date.slice(0,4))).filter(x=>x.date===date).map(x=>x.title),
  sure:counted.filter(i=>i.status==='bevestigd').reduce((n,i)=>n+i.people,0),
  possible:counted.filter(i=>i.status!=='bevestigd').reduce((n,i)=>n+i.people,0),
  byKind,possibleByKind,items,parts,seats:s.tables.reduce((n,t)=>n+t.seats,0),pickups:s.pickups.filter(p=>p.date===date&&p.status==='besteld').length,forecast:forecasts[date]??null};
}

const persons=(n:number)=>n+(n===1?' persoon':' personen');
/** Second line of a row: how many, and what they come to do (first line of the notes or the event description). */
export function itemDetail(i:OverviewItem){
 const what=(i.notes||'').split('\n').map(l=>l.trim()).find(Boolean)||'';
 const count=i.kind==='evenement'?`${i.people} aangemeld${i.capacity?' van '+i.capacity:''}`:i.kind==='yte'&&i.tables?`${i.tables} ${i.tables===1?'tafel':'tafels'} · ${i.people} gasten`:persons(i.people);
 return [count,what.length>140?what.slice(0,139)+'…':what].filter(Boolean).join(' · ');
}
/** Status label and colour for the pill on the right. */
export function itemStatus(i:OverviewItem):{label:string;color:'green'|'orange'|'red'|''}{
 if(i.kind==='evenement'){if(!i.capacity)return {label:'Open',color:''};return i.people>=i.capacity?{label:'Vol',color:'red'}:{label:'Plek over',color:'orange'};}
 if(i.status==='optie')return {label:'Optie tot '+(i.expires||'').slice(8,10)+'-'+(i.expires||'').slice(5,7),color:'orange'};
 return {bevestigd:{label:'Bevestigd',color:'green'},aanvraag:{label:'Aanvraag',color:''},verlopen:{label:'Optie verlopen',color:'red'}}[i.status] as {label:string;color:'green'|'red'|''};
}

export function overviewRange(s:GuestState,from:string,days:number,signups:Signup[]=[],forecasts:Record<string,number|null>={},now=Date.now()){
 return Array.from({length:days},(_,i)=>overviewDay(s,addDays(from,i),signups,forecasts,now));
}

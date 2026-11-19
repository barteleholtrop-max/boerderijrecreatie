// The website's public view of the central planning (Planning en reserveringen): opening hours, exceptions,
// Ite by Boerderijrecreatie moments, day parts and events. Converted to the shape of lib/availability.ts so the website keeps the same contract.
// No capacities, reservations, groups or guest data leave the backoffice.
import {publicAvailability,type Availability} from './availability';
import type {GuestState} from './guest-core';
import {signupState,priceOf,paysOnline} from './event-signups-core';
import {publicPhoto,mediaId} from './public-products';
export const YTE_WEEKS_AHEAD=8;
/** taken: persons already signed up per event (from event_signups). mollieOn: online betalen (Mollie) staat aan. */
export function guestAvailability(s:GuestState,taken:Map<string,number>=new Map(),today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date()),mollieOn=false):Availability{
 // GuestState.hours is indexed by JavaScript weekday (0 = zondag); Availability by ISO weekday (index 0 = maandag).
 const openingHours=[1,2,3,4,5,6,0].map(i=>{const h=s.hours[i];return h&&h.open?{open:h.from,close:h.to}:null});
 return {services:s.services,servicePauses:s.servicePauses,openingHours,
  closedDays:s.exceptions.filter(e=>!e.hours.open).map(e=>({date:e.date,note:e.note})),
  specialHours:s.exceptions.filter(e=>e.hours.open).map(e=>({date:e.date,open:e.hours.from,close:e.hours.to})),
  yte:{weekdays:[s.yteService.weekday===0?7:s.yteService.weekday],times:[s.yteService.from],capacityGuests:null,weeksAhead:YTE_WEEKS_AHEAD,closedDates:[],end:s.yteService.configured?s.yteService.to:''},
  visit:{blocks:(s.dayparts||[]).map(d=>({id:d.id,name:d.name,start:d.from,end:d.to,visitors:d.bezoek||null,groups:d.groep||null})),dayMaxVisitors:s.capacity.bezoek||null,daysAhead:28},
  events:s.events.filter(e=>!e.holiday).map(e=>{const st=signupState(e,taken.get(e.id)||0,today);return {id:e.id,date:e.date,start:e.from,end:e.to,title:e.title,description:e.description||'',example:e.example===true,signup:{open:st.open,spotsLeft:st.spotsLeft},priceCents:priceOf(e),paymentInfo:priceOf(e)?(e.paymentInfo||'').slice(0,500):'',payOnline:paysOnline(e,mollieOn),photo:publicPhoto(e.photo)}}),
  groups:[]};
}
export const publicPlanning=(s:GuestState,now:Date,taken:Map<string,number>=new Map(),mollieOn=false)=>publicAvailability(guestAvailability(s,taken,undefined,mollieOn),now);

/** Beeldbankfoto's van evenementen die openbaar mogen (zichtbaar op de website): niet-feestdagen met een beeldbankfoto. */
export function eventMediaIds(s:Pick<GuestState,'events'>){const ids=new Set<string>();for(const e of s.events)if(!e.holiday){const id=mediaId(e.photo);if(id)ids.add(id)}return ids}
/** Tarieven voor de website (Bedrijfsgegevens → Tarieven op de website) in centen; null = niet ingevuld, dan noemt de site
 *  geen prijs. Nooit een geraden of oude prijs. */
export function publicPrices(s:GuestState){
 const c=(s.contact||{}) as Record<string,unknown>,cents=(v:unknown)=>{const t=String(v??'').trim().replace(',','.');return /^\d{1,4}(\.\d{1,2})?$/.test(t)?Math.round(Number(t)*100):null};
 return {entreeKind:cents(c.priceEntreeKind),kinderfeest:cents(c.priceKinderfeest),schoolreisje:cents(c.priceSchoolreisje),ite:cents(c.priceIte)};
}
/** Contactgegevens voor de website: alleen wat in Planning is ingevuld. */
export const publicContact=(s:GuestState)=>({phone:s.contact?.phone||'',email:s.contact?.email||'',whatsapp:s.contact?.whatsapp||'',street:s.contact?.street||'',postalCode:s.contact?.postalCode||'',city:s.contact?.city||''});

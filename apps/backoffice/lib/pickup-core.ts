// Afhaalmoment bij vooraf bestellen in de winkel (wens eigenaar 3 november 2026). Alleen rekenregels, geen database.
// - Afhalen kan op dagen dat de boerderij open is (openingstijden en uitzonderingen uit Planning), per half uur,
//   van openingstijd tot een half uur voor sluiten.
// - Vandaag pas vanaf een uur na nu (tijd om in te pakken); tot en met 14 dagen vooruit.
// - De website toont de momenten; de backoffice controleert het gekozen moment opnieuw bij het bestellen.
import {opening,type GuestState} from './guest-core';

export const PICKUP_STEP_MINUTES=30;
export const PICKUP_LEAD_MINUTES=60;
export const PICKUP_DAYS=14;
export type {PickupChoice} from './public-orders';
import type {PickupChoice} from './public-orders';
export type PickupDay={date:string;times:string[]};

const toMin=(t:string)=>{const m=/^(\d{2}):(\d{2})$/.exec(t);return m?Number(m[1])*60+Number(m[2]):NaN};
const hhmm=(n:number)=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
const addDays=(date:string,n:number)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
/** Datum en minuut van de dag in Nederland. */
export function amsterdamNow(now:Date){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));
 return {date:`${p.year}-${p.month}-${p.day}`,minute:Number(p.hour)*60+Number(p.minute)};
}

/** Alle afhaalmomenten vanaf nu, per dag (alleen dagen met minstens één moment). */
export function pickupSlots(s:Pick<GuestState,'hours'|'exceptions'|'services'|'servicePauses'>,now=new Date(),days=PICKUP_DAYS):PickupDay[]{
 const {date:today,minute}=amsterdamNow(now),out:PickupDay[]=[];
 for(let i=0;i<days;i++){
  const date=addDays(today,i),h=opening(s as GuestState,date,'winkel');
  if(!h?.open)continue;
  const from=toMin(h.from),to=toMin(h.to);if(!(from<to))continue;
  const earliest=i===0?minute+PICKUP_LEAD_MINUTES:-1,times:string[]=[];
  for(let t=Math.ceil(from/PICKUP_STEP_MINUTES)*PICKUP_STEP_MINUTES;t<=to-PICKUP_STEP_MINUTES;t+=PICKUP_STEP_MINUTES)if(t>=earliest)times.push(hhmm(t));
  if(times.length)out.push({date,times});
 }
 return out;
}

// parsePickup staat in public-orders.ts (zonder eigen imports, zodat dat bestand los te laden blijft).
export {parsePickup} from './public-orders';

/** Is dit moment (nog) te kiezen? Geeft een melding of null. */
export function pickupProblem(p:PickupChoice,s:Pick<GuestState,'hours'|'exceptions'|'services'|'servicePauses'>,now=new Date()){
 const day=pickupSlots(s,now).find(d=>d.date===p.date);
 return day&&day.times.includes(p.time)?null:'Dit afhaalmoment is niet (meer) beschikbaar. Kies een ander moment.';
}

/** Kort en leesbaar, bijvoorbeeld „do 5 nov om 15:00”. */
export function pickupLabel(p:{date:string;time:string}){
 const d=new Intl.DateTimeFormat('nl-NL',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(p.date+'T12:00:00Z')).replace(/\./g,'');
 return `${d} om ${p.time}`;
}

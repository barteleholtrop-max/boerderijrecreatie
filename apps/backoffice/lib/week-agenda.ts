// Weekagenda in Planning (wens eigenaar 3 november 2026): één weekoverzicht zoals een agenda, met alle gastboekingen
// (daggasten, groepen, Ite by Boer Bart), evenementen en afhaalmomenten van de winkel. Alleen rekenwerk: welke blokken waar staan.
// De gegevens komen uit overviewRange (lib/guest-overview.ts) en de afhaalbestellingen uit dezelfde planning.
import type {GuestState} from './guest-core';
import type {OverviewDay,OverviewItem} from './guest-overview';

export type AgendaKind=OverviewItem['kind']|'winkel'|'afspraak';
export type AgendaBlock={key:string;kind:AgendaKind;from:string;to:string;title:string;detail:string;status:string;item?:OverviewItem;appointmentId?:string;lane:number;lanes:number};
export type AgendaDay={date:string;open:boolean;hours:string;allDay:{key:string;title:string;kind:AgendaKind|'feestdag'}[];blocks:AgendaBlock[];parts:{id:string;name:string;from:string;to:string}[]};

export const minutes=(t:string)=>{const m=/^(\d{1,2}):(\d{2})$/.exec(t||'');return m?Number(m[1])*60+Number(m[2]):null};
const PICKUP_MINUTES=30,DEFAULT_MINUTES=60;
const hhmm=(n:number)=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');

/** Overlappende blokken naast elkaar: elk blok krijgt een baan; blokken in dezelfde groep delen de breedte. */
export function assignLanes<T extends {from:string;to:string}>(list:T[]):(T&{lane:number;lanes:number})[]{
 const sorted=[...list].sort((a,b)=>minutes(a.from)!-minutes(b.from)!||minutes(b.to)!-minutes(a.to)!);
 const out:(T&{lane:number;lanes:number})[]=[];let group:(T&{lane:number;lanes:number})[]=[],groupEnd=-1;const ends:number[]=[];
 const close=()=>{const n=Math.max(1,...group.map(g=>g.lane+1));for(const g of group)g.lanes=n;group=[];ends.length=0};
 for(const b of sorted){
  const s=minutes(b.from)!,e=minutes(b.to)!;
  if(group.length&&s>=groupEnd)close();
  let lane=ends.findIndex(x=>x<=s);if(lane<0){lane=ends.length;ends.push(e)}else ends[lane]=e;
  const placed={...b,lane,lanes:1};group.push(placed);out.push(placed);groupEnd=Math.max(groupEnd,e);
 }
 close();return out;
}

/** Eén dag van de weekagenda: blokken met tijd, de rest (hele dag, feestdag, gesloten) bovenaan. */
export function agendaDay(s:Pick<GuestState,'pickups'|'appointments'>,d:OverviewDay):AgendaDay{
 const timed:Omit<AgendaBlock,'lane'|'lanes'>[]=[],allDay:AgendaDay['allDay']=d.holidays.map(h=>({key:'h:'+h,title:h,kind:'feestdag' as const}));
 for(const i of d.items){
  if(i.status==='verlopen')continue;
  const from=minutes(i.from);
  if(from===null){allDay.push({key:i.kind+i.id,title:i.title,kind:i.kind});continue}
  const end=minutes(i.to),to=end!==null&&end>from?end:from+DEFAULT_MINUTES;
  timed.push({key:i.kind+i.id,kind:i.kind,from:hhmm(from),to:hhmm(to),title:i.title,detail:(i.people?i.people+(i.people===1?' persoon':' personen'):'')+(i.what?(i.people?' · ':'')+i.what:''),status:i.status,item:i});
 }
 for(const p of s.pickups.filter(p=>p.date===d.date&&p.status==='besteld')){
  const from=minutes(p.time);
  if(from===null){allDay.push({key:'w'+p.id,title:'Afhalen: '+p.name,kind:'winkel'});continue}
  timed.push({key:'w'+p.id,kind:'winkel',from:hhmm(from),to:hhmm(from+PICKUP_MINUTES),title:'Afhalen: '+p.name,detail:p.description.slice(0,120),status:'besteld'});
 }
 // Afspraken met klanten (wens eigenaar 9 november 2026): geen boeking, wel in de agenda.
 for(const a of (s.appointments||[]).filter(a=>a.date===d.date))timed.push({key:'a'+a.id,kind:'afspraak',from:a.from,to:a.to,title:a.subject,detail:[a.customerName,a.notes.split('\n')[0]].filter(Boolean).join(' · ').slice(0,120),status:'afspraak',appointmentId:a.id});
 return {date:d.date,open:d.open,hours:d.hours,allDay,blocks:assignLanes(timed),parts:d.parts.map(({id,name,from,to})=>({id,name,from,to}))};
}

/** Waar een tik op een agenda-item in de telefoonagenda heen gaat (melding eigenaar 10 november 2026: „ik wil graag in de details
 *  van dat agenda-item”): een afspraak opent het afspraakpaneel, een evenement springt naar dat evenement, een boeking opent de boeking. */
export function agendaHref(b:{kind:string;item?:{id:string};appointmentId?:string},date:string){
 if(b.appointmentId)return '/planning?afspraak='+encodeURIComponent(b.appointmentId);
 if(b.kind==='evenement'&&b.item)return '/planning?evenement='+encodeURIComponent(b.item.id)+'&datum='+encodeURIComponent(date);
 return b.item?'/planning?reservering='+encodeURIComponent(b.item.id):'/planning';
}

/** Welke uren de agenda toont: openingstijden en alle blokken passen erin, minstens 9–18 uur, op hele uren. */
export function hourRange(days:AgendaDay[]){
 let lo=9*60,hi=18*60;
 for(const d of days){
  const m=/^(\d{2}:\d{2})–(\d{2}:\d{2})$/.exec(d.hours);if(m){lo=Math.min(lo,minutes(m[1])!);hi=Math.max(hi,minutes(m[2])!)}
  for(const b of d.blocks){lo=Math.min(lo,minutes(b.from)!);hi=Math.max(hi,minutes(b.to)!)}
 }
 return {from:Math.floor(lo/60),to:Math.min(24,Math.ceil(hi/60))};
}

/** Klik in de weekagenda (wens eigenaar 9 november 2026: „ik wil ook op de agenda kunnen klikken om een afspraak aan te maken”):
 *  y pixels onder de bovenkant van de dagkolom, die begint om fromHour met hourPx pixels per uur → tijd, afgerond op een kwartier
 *  naar beneden, tussen 00:00 en 23:45. */
export function slotTime(y:number,fromHour:number,hourPx:number){
 const m=Math.min(23*60+45,Math.floor((fromHour*60+Math.max(0,y)/hourPx*60)/15)*15);
 return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
}

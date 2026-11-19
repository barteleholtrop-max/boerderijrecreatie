// Opening hours and bookable Ite by Boerderijrecreatie moments: the central source for the website (open/closed light, bookable days).
// Pure rules without database access, so they can be tested and reused by the public read point.
// Days are ISO weekdays: 1 = maandag … 7 = zondag. All times are local time in Europe/Amsterdam.
export type DayHours={open:string;close:string}|null;
// Onderdelen aan of uit, met een periode (wens eigenaar 6 november 2026): „uit van … tot en met …”. Buiten die periode telt alleen het vinkje.
export type ServiceId='speelboerderij'|'winkel'|'yte';
export type ServicePauses=Partial<Record<ServiceId,{from:string;to:string}|null>>;
/** Is dit onderdeel op deze datum aan? Uit met het vinkje, of binnen de periode „uit van … tot en met …”. */
export function serviceOn(s:{services?:Partial<Record<ServiceId,boolean>>;servicePauses?:ServicePauses},id:ServiceId,date:string){
 if(s.services?.[id]===false)return false;
 const p=s.servicePauses?.[id];return !(p&&p.from<=date&&date<=p.to);
}
export type ClosedDay={date:string;note:string};
export type Availability={
 services?:{speelboerderij:boolean;winkel:boolean;yte:boolean};
 servicePauses?:ServicePauses;
 openingHours:DayHours[]; // 7 entries, index 0 = maandag
 closedDays:ClosedDay[];  // whole farm closed (no Ite by Boerderijrecreatie either)
 specialHours?:{date:string;open:string;close:string}[]; // a date with different opening hours
 yte:{weekdays:number[];times:string[];capacityGuests:number|null;weeksAhead:number;closedDates:string[];end?:string}; // end: eindtijd van de Ite-avond (planning)
 // Speelboerderij visits and groups share the day parts (ochtend, middag, namiddag). Times and limits are set by the owner.
 visit:{blocks:Block[];dayMaxVisitors:number|null;daysAhead:number};
 events:AgendaEvent[];
 groups:GroupBooking[];
};
export type Block={id:string;name:string;start:string;end:string;visitors:number|null;groups:number|null};
export type AgendaEvent={id:string;date:string;start:string;end:string;title:string;description:string;example:boolean;
 // Aanmelden via de website (3 november 2026): open of niet, en hoeveel plaatsen er nog zijn (null = geen maximum).
 signup?:{open:boolean;spotsLeft:number|null};
 // Betaald evenement: prijs per persoon in centen (0 = gratis) en de betaalinstructie van de eigenaar.
 priceCents?:number;paymentInfo?:string;payOnline?:boolean;
 // Foto bij het evenement (3 november 2026): openbaar adres (https of /api/public/media/…), of null.
 photo?:string|null};
export type GroupBooking={id:string;date:string;blockId:string;name:string;guests:number;status:'optie'|'bevestigd';note:string;example:boolean};
export const defaultBlocks=():Block[]=>[['ochtend','Ochtend'],['middag','Middag'],['namiddag','Namiddag']].map(([id,name])=>({id,name,start:'',end:'',visitors:null,groups:null}));
export const weekdayNames=['maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag','zondag'];
export function emptyAvailability():Availability{return {openingHours:[null,null,null,null,null,null,null],closedDays:[],yte:{weekdays:[],times:[],capacityGuests:null,weeksAhead:8,closedDates:[]},visit:{blocks:defaultBlocks(),dayMaxVisitors:null,daysAhead:28},events:[],groups:[]}}

const isTime=(v:unknown):v is string=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const minutes=(t:string)=>Number(t.slice(0,2))*60+Number(t.slice(3,5));
export function isDay(v:unknown):v is string{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(v+'T12:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v}

/** Checks owner input completely; throws a Dutch message for the first problem. */
export function validateAvailability(input:unknown):Availability{
 const a=input as Availability;
 if(!a||typeof a!=='object'||!Array.isArray(a.openingHours)||a.openingHours.length!==7)throw Error('Vul voor elke dag van de week de openingstijden in, of zet de dag op gesloten.');
 const openingHours=a.openingHours.map((h,i)=>{
  if(h===null)return null;
  if(!h||!isTime(h.open)||!isTime(h.close))throw Error('Gebruik tijden als 10:00 bij '+weekdayNames[i]+'.');
  if(minutes(h.close)<=minutes(h.open))throw Error('De sluitingstijd moet na de openingstijd liggen ('+weekdayNames[i]+').');
  return {open:h.open,close:h.close};
 });
 if(!Array.isArray(a.closedDays)||a.closedDays.length>200)throw Error('Ongeldige lijst met gesloten dagen.');
 const closedDays=a.closedDays.map(c=>{if(!c||!isDay(c.date))throw Error('Kies een geldige datum bij de gesloten dagen.');if(typeof c.note!=='string'||c.note.length>120)throw Error('Houd de toelichting bij een gesloten dag kort (maximaal 120 tekens).');return {date:c.date,note:c.note.trim()}});
 const y=a.yte;
 if(!y||typeof y!=='object')throw Error('Vul de gegevens voor Ite by Boerderijrecreatie in.');
 if(!Array.isArray(y.weekdays)||y.weekdays.some(d=>!Number.isInteger(d)||d<1||d>7))throw Error('Kies geldige weekdagen voor Ite by Boerderijrecreatie.');
 if(!Array.isArray(y.times)||y.times.length>12||y.times.some(t=>!isTime(t)))throw Error('Gebruik starttijden als 19:00 voor Ite by Boerderijrecreatie.');
 if(y.capacityGuests!==null&&(!Number.isInteger(y.capacityGuests)||y.capacityGuests<1||y.capacityGuests>1000))throw Error('Vul een capaciteit van 1 tot en met 1000 gasten in, of laat het veld leeg.');
 if(!Number.isInteger(y.weeksAhead)||y.weeksAhead<1||y.weeksAhead>52)throw Error('Laat gasten 1 tot en met 52 weken vooruit boeken.');
 if(!Array.isArray(y.closedDates)||y.closedDates.length>200||y.closedDates.some(d=>!isDay(d)))throw Error('Kies geldige datums waarop Ite by Boerderijrecreatie niet doorgaat.');
 // Sections added on 2 November 2026 (evening); older saved settings get the three empty day parts.
 const v=a.visit??{blocks:defaultBlocks(),dayMaxVisitors:null,daysAhead:28};
 const limit=(n:unknown,what:string)=>{if(n===null)return null;if(!Number.isInteger(n)||(n as number)<0||(n as number)>5000)throw Error('Vul bij '+what+' een aantal van 0 tot en met 5000 in, of laat het leeg.');return n as number};
 if(!Array.isArray(v.blocks)||v.blocks.length<1||v.blocks.length>6)throw Error('Maak 1 tot 6 tijdblokken.');
 const blocks=v.blocks.map(b=>{
  if(!b||typeof b.id!=='string'||!/^[a-z0-9-]{1,40}$/.test(b.id)||typeof b.name!=='string'||!b.name.trim()||b.name.length>40)throw Error('Geef elk tijdblok een naam (maximaal 40 tekens).');
  const start=b.start||'',end=b.end||'';
  if((start||end)&&(!isTime(start)||!isTime(end)||minutes(end)<=minutes(start)))throw Error('Vul bij '+b.name+' een begin- en eindtijd in, met het einde na het begin.');
  return {id:b.id,name:b.name.trim(),start,end,visitors:limit(b.visitors,b.name+' (bezoekers)'),groups:limit(b.groups,b.name+' (groepsgasten)')};
 });
 if(new Set(blocks.map(b=>b.id)).size!==blocks.length)throw Error('Twee tijdblokken hebben dezelfde naam.');
 if(!Number.isInteger(v.daysAhead)||v.daysAhead<1||v.daysAhead>365)throw Error('Laat bezoekers 1 tot en met 365 dagen vooruit plannen.');
 const visit={blocks,dayMaxVisitors:limit(v.dayMaxVisitors,'het dagmaximum'),daysAhead:v.daysAhead};
 const evs=a.events??[];if(!Array.isArray(evs)||evs.length>300)throw Error('Ongeldige agenda.');
 const events=evs.map(e=>{
  if(!e||typeof e.id!=='string'||!/^[A-Za-z0-9-]{1,60}$/.test(e.id)||!isDay(e.date)||typeof e.title!=='string'||!e.title.trim()||e.title.length>120||typeof e.description!=='string'||e.description.length>1000)throw Error('Geef elk evenement een datum, een titel (maximaal 120 tekens) en een korte omschrijving.');
  const start=e.start||'',end=e.end||'';if((start&&!isTime(start))||(end&&!isTime(end))||(start&&end&&minutes(end)<=minutes(start)))throw Error('Controleer de tijden bij '+e.title+'.');
  return {id:e.id,date:e.date,start,end,title:e.title.trim(),description:e.description.trim(),example:e.example===true};
 }).sort((p,q)=>(p.date+p.start).localeCompare(q.date+q.start));
 const gs=a.groups??[];if(!Array.isArray(gs)||gs.length>500)throw Error('Ongeldige groepslijst.');
 const groups=gs.map(g=>{
  if(!g||typeof g.id!=='string'||!/^[A-Za-z0-9-]{1,60}$/.test(g.id)||!isDay(g.date)||!blocks.some(b=>b.id===g.blockId)||typeof g.name!=='string'||!g.name.trim()||g.name.length>120||!Number.isInteger(g.guests)||g.guests<1||g.guests>1000||!['optie','bevestigd'].includes(g.status)||typeof g.note!=='string'||g.note.length>1000)throw Error('Geef elke groep een naam, datum, tijdblok, aantal gasten (1 tot en met 1000) en status.');
  return {id:g.id,date:g.date,blockId:g.blockId,name:g.name.trim(),guests:g.guests,status:g.status,note:g.note.trim(),example:g.example===true};
 }).sort((p,q)=>(p.date+p.blockId).localeCompare(q.date+q.blockId));
 return {visit,events,groups,openingHours,closedDays:[...new Map(closedDays.map(c=>[c.date,c])).values()].sort((p,q)=>p.date.localeCompare(q.date)),
  yte:{weekdays:[...new Set(y.weekdays)].sort(),times:[...new Set(y.times)].sort(),capacityGuests:y.capacityGuests,weeksAhead:y.weeksAhead,closedDates:[...new Set(y.closedDates)].sort()}};
}

/** Local date, ISO weekday and minutes since midnight in Europe/Amsterdam. */
export function localMoment(now:Date){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 const day=`${parts.year}-${parts.month}-${parts.day}`;
 return {day,weekday:isoWeekday(day),minutes:Number(parts.hour)*60+Number(parts.minute)};
}
export const isoWeekday=(day:string)=>{const d=new Date(day+'T12:00:00Z').getUTCDay();return d===0?7:d};
export const addDays=(day:string,n:number)=>new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);

export type OpenStatus={state:'open'|'gesloten'|'onbekend';today:DayHours;note:string;nextOpen:{date:string;weekday:string;open:string}|null};
/** Open or closed right now. 'onbekend' as long as no opening hours are set: the website then shows no light. */
export function openStatus(a:Availability,now:Date):OpenStatus{
 if(a.services?.speelboerderij===false)return {state:'gesloten',today:null,note:'Speelboerderij gesloten',nextOpen:null};
 const pause=a.servicePauses?.speelboerderij,{day:nu}=localMoment(now);
 if(pause&&pause.from<=nu&&nu<=pause.to&&!(a.openingHours.every(h=>h===null)&&!(a.specialHours||[]).length))return {state:'gesloten',today:null,note:'Speelboerderij gesloten tot en met '+pause.to,nextOpen:null};
 if(a.openingHours.every(h=>h===null)&&!(a.specialHours||[]).length)return {state:'onbekend',today:null,note:'',nextOpen:null};
 const {day,weekday,minutes:m}=localMoment(now);
 const closed=new Map(a.closedDays.map(c=>[c.date,c.note])),special=new Map((a.specialHours||[]).map(h=>[h.date,{open:h.open,close:h.close}]));
 const hoursOn=(d:string)=>closed.has(d)||!serviceOn(a,'speelboerderij',d)?null:special.get(d)??a.openingHours[isoWeekday(d)-1];
 const today=hoursOn(day);
 let nextOpen=null;
 for(let i=0;i<=60&&!nextOpen;i++){const d=addDays(day,i),h=hoursOn(d);if(h&&(i>0||m<minutes(h.open)))nextOpen={date:d,weekday:weekdayNames[isoWeekday(d)-1],open:h.open}}
 const isOpen=!!today&&m>=minutes(today.open)&&m<minutes(today.close);
 return {state:isOpen?'open':'gesloten',today:today||null,note:closed.get(day)||'',nextOpen:isOpen?null:nextOpen};
}

/** Bookable Ite by Boerderijrecreatie moments from now up to weeksAhead weeks; past start times and closed dates are left out. */
export function yteMoments(a:Availability,now:Date){
 if(a.services?.yte===false)return [];
 const {day,minutes:m}=localMoment(now);
 const closed=new Set([...a.closedDays.map(c=>c.date),...a.yte.closedDates]);
 const result:{date:string;weekday:string;time:string}[]=[];
 for(let i=0;i<a.yte.weeksAhead*7;i++){
  const d=addDays(day,i),w=isoWeekday(d);
  if(!a.yte.weekdays.includes(w)||closed.has(d)||!serviceOn(a,'yte',d))continue;
  for(const time of a.yte.times)if(i>0||minutes(time)>m)result.push({date:d,weekday:weekdayNames[w-1],time});
 }
 return result;
}

/** Guest-facing view for GET /api/public/availability. Capacity is not yet reduced by reservations (no reservation module yet). */
export function publicAvailability(a:Availability,now:Date){
 const {day}=localMoment(now),until=addDays(day,60);
 const visitDays=openDays(a,now,a.visit.daysAhead);
 return {services:a.services,open:openStatus(a,now),
  // Day parts are only offered when the owner set a limit; the limits themselves are not published.
  visit:{blocks:a.visit.blocks.filter(b=>(b.visitors??0)>0).map(({id,name,start,end})=>({id,name,start,end})),days:visitDays},
  groups:{blocks:a.visit.blocks.filter(b=>(b.groups??0)>0).map(({id,name,start,end})=>({id,name,start,end}))},
  events:a.events.filter(e=>e.date>=day&&e.date<=addDays(day,120)).map(({id,date,start,end,title,description,example,signup,priceCents,paymentInfo,payOnline,photo})=>({id,date,start,end,title,description,example,signup:signup??{open:false,spotsLeft:null},priceCents:priceCents??0,paymentInfo:paymentInfo??'',payOnline:payOnline===true,photo:photo??null})),
  openingHours:a.openingHours.map((h,i)=>({weekday:weekdayNames[i],hours:h})),
  closedDays:a.closedDays.filter(c=>c.date>=day&&c.date<=until),
  // Website toont per onderdeel de echte stand (8 november 2026): pauzes „uit van … tot en met …”, afwijkende tijden en de Ite-eindtijd.
  servicePauses:Object.fromEntries(Object.entries(a.servicePauses||{}).filter(([,p])=>p&&p.to>=day).map(([k,p])=>[k,{from:p!.from,to:p!.to}])),
  specialHours:(a.specialHours||[]).filter(h=>h.date>=day&&h.date<=until),
  yte:{moments:yteMoments(a,now),weeksAhead:a.yte.weeksAhead,end:a.yte.end||''}};
}

/** Group guests per date and day part against the group limit. Options count too: they hold the place until decided. */
export function groupOccupancy(a:Availability){
 const m=new Map<string,{date:string;blockId:string;guests:number;limit:number|null}>();
 for(const g of a.groups){const k=g.date+'|'+g.blockId;const b=a.visit.blocks.find(b=>b.id===g.blockId);const o=m.get(k)||{date:g.date,blockId:g.blockId,guests:0,limit:b?.groups??null};o.guests+=g.guests;m.set(k,o)}
 return [...m.values()].map(o=>({...o,over:o.limit!==null&&o.guests>o.limit})).sort((p,q)=>(p.date+p.blockId).localeCompare(q.date+q.blockId));
}

/** Days on which the farm is open (opening hours, closed days), from today for daysAhead days. */
export function openDays(a:Availability,now:Date,days:number){
 if(a.services?.speelboerderij===false)return [];
 const {day}=localMoment(now),closed=new Set(a.closedDays.map(c=>c.date)),special=new Set((a.specialHours||[]).map(h=>h.date)),out:string[]=[];
 for(let i=0;i<days;i++){const d=addDays(day,i);if(!closed.has(d)&&serviceOn(a,'speelboerderij',d)&&(special.has(d)||a.openingHours[isoWeekday(d)-1]))out.push(d)}
 return out;
}

/** Example events and groups so the agenda and group overview can be judged. Marked as example; removable in one go. */
export function exampleContent(today:string,blocks:Block[]){
 const nextWeekday=(w:number,minDays:number)=>{let d=addDays(today,minDays);while(isoWeekday(d)!==w)d=addDays(d,1);return d};
 const b=(i:number)=>blocks[Math.min(i,blocks.length-1)].id;
 const events:AgendaEvent[]=[
  {id:'voorbeeld-lammetjes',date:nextWeekday(6,2),start:'10:00',end:'12:00',title:'Lammetjes knuffelen',description:'Kom kennismaken met de jonge dieren op het erf. Voor kinderen en ouders.',example:true},
  {id:'voorbeeld-boerenmarkt',date:nextWeekday(6,9),start:'11:00',end:'16:00',title:'Boerenmarkt op het erf',description:'Producten van de boerderij en uit de buurt, met koffie en iets lekkers.',example:true},
  {id:'voorbeeld-yte-thema',date:nextWeekday(4,9),start:'19:00',end:'',title:'Ite by Boerderijrecreatie: oogstavond',description:'Een avond met gerechten van de oogst van het seizoen.',example:true},
  {id:'voorbeeld-workshop',date:nextWeekday(3,16),start:'14:00',end:'16:00',title:'Kinderworkshop brood bakken',description:'Kinderen bakken hun eigen broodje en nemen het mee naar huis.',example:true},
 ];
 const groups:GroupBooking[]=[
  {id:'voorbeeld-verjaardag',date:nextWeekday(3,3),blockId:b(1),name:'Kinderfeest familie De Vries',guests:14,status:'bevestigd',note:'8 kinderen, pannenkoeken na het spelen.',example:true},
  {id:'voorbeeld-bedrijf',date:nextWeekday(5,5),blockId:b(0),name:'Teamuitje bedrijf (voorbeeld)',guests:24,status:'optie',note:'Rondleiding en lunch; optie vervalt over een week.',example:true},
  {id:'voorbeeld-school',date:nextWeekday(2,8),blockId:b(0),name:'Schoolklas groep 5',guests:30,status:'bevestigd',note:'Educatief programma over dieren en voedsel.',example:true},
  {id:'voorbeeld-familie',date:nextWeekday(6,10),blockId:b(2),name:'Familiedag (voorbeeld)',guests:18,status:'optie',note:'Wil graag een borrel na afloop.',example:true},
 ];
 return {events,groups};
}

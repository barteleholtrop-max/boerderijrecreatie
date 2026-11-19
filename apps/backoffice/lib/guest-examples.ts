// Example events and groups for judging the agenda, group overview and website (owner request 2 November 2026).
// Always marked as example and removable in one go. Example groups that do not fit the current capacity stay a request (aanvraag).
import {validateBooking,type GuestState,type Reservation} from './guest-core';
const addDays=(day:string,n:number)=>new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const weekday=(d:string)=>new Date(d+'T12:00:00Z').getUTCDay();
function next(today:string,day:number,minDays:number){let d=addDays(today,minDays);while(weekday(d)!==day)d=addDays(d,1);return d}

export function exampleEvents(today:string):GuestState['events']{
 return [
  ['Lammetjes knuffelen',next(today,6,2),'10:00','12:00','Kom kennismaken met de jonge dieren op het erf. Voor kinderen en ouders.'],
  ['Boerenmarkt op het erf',next(today,6,9),'11:00','16:00','Producten van de boerderij en uit de buurt, met koffie en iets lekkers.'],
  ['Ite by Boer Bart: oogstavond',next(today,4,9),'19:00','21:30','Een avond met gerechten van de oogst van het seizoen.'],
  ['Kinderworkshop brood bakken',next(today,3,16),'14:00','16:00','Kinderen bakken hun eigen broodje en nemen het mee naar huis.'],
 ].map(([title,date,from,to,description])=>({id:crypto.randomUUID(),date,from,to,title,description,holiday:false,example:true}));
}

export function exampleGroups(s:GuestState,today:string,now=Date.now()):Reservation[]{
 const part=(i:number)=>{const timed=s.dayparts.filter(d=>d.from&&d.to);return timed[Math.min(i,timed.length-1)]};
 const rows:[string,string,number,number,'bevestigd'|'optie',string][]=[
  ['Kinderfeest familie De Vries',next(today,3,3),1,14,'bevestigd','8 kinderen, pannenkoeken na het spelen.'],
  ['Teamuitje bedrijf (voorbeeld)',next(today,5,5),0,24,'optie','Rondleiding en lunch; optie vervalt over een week.'],
  ['Schoolklas groep 5',next(today,2,8),0,30,'bevestigd','Educatief programma over dieren en voedsel.'],
  ['Familiedag (voorbeeld)',next(today,6,10),2,18,'optie','Wil graag een borrel na afloop.'],
 ];
 const out:Reservation[]=[];
 for(const [name,date,i,people,status,notes] of rows){
  const p=part(i),r:Reservation={id:crypto.randomUUID(),name,email:'',phone:'',activity:'groep',date,from:p?.from||'10:00',to:p?.to||'12:00',people,sharing:false,status,expires:status==='optie'?new Date(now+7*86400000).toISOString():'',notes,threadId:'',tables:[],example:true};
  try{out.push(validateBooking({...s,reservations:[...s.reservations,...out]},r,now))}
  catch(e){out.push({...r,status:'aanvraag',expires:'',notes:notes+' (Voorbeeld als aanvraag: '+(e instanceof Error?e.message:'past nog niet')+')'})}
 }
 return out;
}

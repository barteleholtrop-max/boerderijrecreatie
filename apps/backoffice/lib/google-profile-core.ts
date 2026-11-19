// Koppeling met het Google Bedrijfsprofiel (besluit eigenaar 4 november 2026, stap 2): openingstijden, afwijkende dagen en
// evenementen gaan vanuit de backoffice naar het profiel van Boer Bart. Pure regels: geen netwerk, geen database.
// Google-formaten volgens de Business Profile API's (Business Information API v1 voor openingstijden, de v4 localPosts
// voor evenementberichten). Nog niet getest met het echte profiel: Google moet de toegang eerst goedkeuren.
import {createHash} from 'node:crypto';

export const BUSINESS_SCOPE='https://www.googleapis.com/auth/business.manage';
const DAYS=['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'] as const; // index = JavaScript-weekdag
type Hours={open:boolean;from:string;to:string};
type Exception={date:string;hours:Hours;note?:string};
type Ev={id:string;date:string;from:string;to:string;title:string;holiday:boolean;description?:string;example?:boolean};
const time=(t:string)=>{const [h,m]=t.split(':').map(Number);return m?{hours:h,minutes:m}:{hours:h}};
const date=(d:string)=>{const [year,month,day]=d.split('-').map(Number);return {year,month,day}};
const isDay=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime=(v:unknown):v is string=>typeof v==='string'&&/^\d{2}:\d{2}$/.test(v);
export const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0,32);

/** Vaste openingstijden per weekdag. Planning bewaart de week op JavaScript-weekdag (0 = zondag). */
export function regularHours(hours:Hours[]){
 const periods=hours.flatMap((h,i)=>h&&h.open&&isTime(h.from)&&isTime(h.to)&&h.from<h.to?[{openDay:DAYS[i],openTime:time(h.from),closeDay:DAYS[i],closeTime:time(h.to)}]:[]);
 return {periods};
}
/** Afwijkende dagen vanaf vandaag (hooguit een jaar vooruit): gesloten, of open met andere tijden. */
export function specialHours(exceptions:Exception[],today:string){
 const until=(()=>{const d=new Date(today+'T12:00:00Z');d.setUTCFullYear(d.getUTCFullYear()+1);return d.toISOString().slice(0,10)})();
 const specialHourPeriods=exceptions.filter(e=>isDay(e.date)&&e.date>=today&&e.date<=until).sort((a,b)=>a.date.localeCompare(b.date))
  .map(e=>e.hours.open&&isTime(e.hours.from)&&isTime(e.hours.to)&&e.hours.from<e.hours.to
   ?{startDate:date(e.date),openTime:time(e.hours.from),endDate:date(e.date),closeTime:time(e.hours.to)}
   :{startDate:date(e.date),closed:true});
 return {specialHourPeriods};
}
export function hoursPayload(s:{hours:Hours[];exceptions:Exception[]},today:string){
 return {regularHours:regularHours(s.hours),specialHours:specialHours(s.exceptions,today)};
}
/** Evenementen die op Google komen: eigen, toekomstige evenementen (geen feestdagen, geen voorbeelden), hooguit 20. */
export function profileEvents(events:Ev[],today:string){
 return events.filter(e=>!e.holiday&&!e.example&&isDay(e.date)&&e.date>=today&&isTime(e.from)&&e.title?.trim()).sort((a,b)=>(a.date+a.from).localeCompare(b.date+b.from)).slice(0,20);
}
/** Een evenement als bericht op het profiel (soort EVENT), met een knop naar de website. */
export function eventPost(e:Ev,website:string){
 const end=isTime(e.to)&&e.to>e.from?e.to:e.from;
 return {languageCode:'nl',topicType:'EVENT',summary:(e.description||e.title).slice(0,1500),
  event:{title:e.title.slice(0,58),schedule:{startDate:date(e.date),startTime:time(e.from),endDate:date(e.date),endTime:time(end)}},
  ...(website?{callToAction:{actionType:'LEARN_MORE',url:website}}:{})};
}
/** Wat er met de berichten op Google moet gebeuren: nieuw plaatsen, bijwerken of weghalen. */
export function planPosts(events:Ev[],posted:{eventId:string;postName:string;hash:string}[],website:string,today:string){
 const want=new Map(profileEvents(events,today).map(e=>{const body=eventPost(e,website);return [e.id,{body,hash:hash(body)}] as const}));
 const create:{eventId:string;body:ReturnType<typeof eventPost>;hash:string}[]=[],update:{eventId:string;postName:string;body:ReturnType<typeof eventPost>;hash:string}[]=[],remove:{eventId:string;postName:string}[]=[];
 for(const [eventId,w] of want){const p=posted.find(x=>x.eventId===eventId);if(!p)create.push({eventId,...w});else if(p.hash!==w.hash)update.push({eventId,postName:p.postName,...w})}
 for(const p of posted)if(!want.has(p.eventId))remove.push({eventId:p.eventId,postName:p.postName});
 return {create,update,remove};
}
/** Begrijpelijke melding bij de antwoorden van Google. */
export function googleProblem(status:number,message=''){
 if(status===429||(status===403&&/quota|rate|not been used|disabled|has not been enabled/i.test(message)))return 'Google heeft de toegang tot de Business Profile API nog niet goedgekeurd (of de API staat nog niet aan in het Google Cloud-project). Er is niets gewijzigd.';
 if(status===401)return 'De toegang tot het Google Bedrijfsprofiel is verlopen. Koppel opnieuw.';
 if(status===403)return 'Dit Google-account mag dit bedrijfsprofiel niet beheren. Koppel met het account dat eigenaar of beheerder is.';
 if(status===404)return 'Het gekozen bedrijfsprofiel is niet gevonden. Kies het profiel opnieuw.';
 return 'Google gaf een fout ('+status+(message?': '+message.slice(0,200):'')+'). Er is niets gewijzigd.';
}

// Groepsaanvraag van de website ("Groepen & feesten", besluit eigenaar 3 november 2026).
// - Direct antwoord op de datum: een INDICATIE uit de centrale planning (openingstijden, gesloten dagen, dagdelen,
//   capaciteit en bevestigde boekingen/opties). Er wordt niets vastgehouden; het team bevestigt altijd zelf.
//   Naar de website gaan alleen een stand en dagdeelnamen, nooit aantallen, capaciteiten of andere gasten.
// - Versturen: de aanvraag komt als websitegesprek in Gesprekken, aanvragen & klanten, met (als datum en aantal
//   bekend zijn) een concept-aanvraag in Planning. Een aanvraag houdt geen plaats vast (status 'aanvraag').
import {z} from 'zod';
import {validateBooking,opening,blocks,audit,dateSchema,reservationSchema,type GuestState,type Conversation,type Reservation} from './guest-core';

export type IndicationState='vrij'|'druk'|'vol'|'gesloten'|'onbekend';
export type Indication={state:IndicationState;date:string;parts:string[];alternatives:string[];message:string};
const MAX_DAYS_AHEAD=366,ALTERNATIVE_DAYS=60;

const ymd=(d:Date)=>d.toISOString().slice(0,10);
const addDays=(date:string,n:number)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return ymd(d)};
const dayName=(date:string)=>new Intl.DateTimeFormat('nl-NL',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
export const todayIn=(now:number)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date(now));

type Window={name:string;from:string;to:string};
/** Tijdvakken waarin een groep die dag kan komen: dagdelen met een groepslimiet binnen de openingstijden, anders de hele openingstijd. */
function windows(s:GuestState,date:string):Window[]{
 const h=opening(s,date);if(!h?.open)return [];
 const parts=(s.dayparts||[]).filter(d=>d.from&&d.to&&d.groep>0&&d.from>=h.from&&d.to<=h.to);
 return parts.length?parts.map(d=>({name:d.name,from:d.from,to:d.to})):[{name:'',from:h.from,to:h.to}];
}
const probe=(date:string,people:number,w:Window):Reservation=>({id:'indicatie',name:'Indicatie',email:'',phone:'',activity:'groep',date,from:w.from,to:w.to,people,sharing:false,status:'bevestigd',expires:'',notes:'',threadId:'',tables:[]});
function fits(s:GuestState,date:string,people:number,w:Window,now:number){try{validateBooking(s,probe(date,people,w),now);return true}catch{return false}}
const capacityKnown=(s:GuestState)=>s.capacity.groep>0||(s.dayparts||[]).some(d=>d.from&&d.to&&d.groep>0);

/** Volgende data (binnen 60 dagen) waarop de groep volgens de planning past. */
export function freeDates(s:GuestState,from:string,people:number,now:number,max=3){
 const out:string[]=[];
 for(let i=1;i<=ALTERNATIVE_DAYS&&out.length<max;i++){const d=addDays(from,i);if(windows(s,d).some(w=>fits(s,d,people,w,now)))out.push(d)}
 return out;
}

export function groupIndication(s:GuestState,date:string,people:number,now=Date.now()):Indication{
 const today=todayIn(now);
 if(!dateSchema.safeParse(date).success)throw Error('Kies een geldige datum.');
 if(date<today)throw Error('Kies een datum in de toekomst.');
 if(date>addDays(today,MAX_DAYS_AHEAD))throw Error('Zo ver vooruit plannen we nog niet. Stuur je aanvraag gerust, dan kijken we mee.');
 if(!Number.isInteger(people)||people<1||people>1000)throw Error('Vul een aantal personen in tussen 1 en 1000.');
 const base={date,parts:[] as string[],alternatives:[] as string[]};
 if(!capacityKnown(s))return {...base,state:'onbekend',message:'We kijken de datum voor je na zodra je aanvraag binnen is.'};
 const ws=windows(s,date);
 if(!ws.length){const alt=freeDates(s,date,people,now);return {...base,state:'gesloten',alternatives:alt,message:`Op ${dayName(date)} zijn we gesloten.`}}
 const free=ws.filter(w=>fits(s,date,people,w,now));
 if(!free.length){const alt=freeDates(s,date,people,now);return {...base,state:'vol',alternatives:alt,message:`Op ${dayName(date)} is er voor een groep van ${people} geen plek meer.`}}
 const parts=free.map(w=>w.name).filter(Boolean);
 const when=parts.length&&parts.length<ws.length?` (${parts.join(', ').toLowerCase()})`:'';
 const busy=s.reservations.some(r=>r.activity==='groep'&&r.date===date&&blocks(r,now));
 return busy
  ?{...base,state:'druk',parts,message:`Op ${dayName(date)}${when} is er nog plek, maar er komt die dag al een andere groep. We kijken samen wat het fijnst past.`}
  :{...base,state:'vrij',parts,message:`Op ${dayName(date)}${when} is er nog plek voor jullie groep.`};
}

const text=(max:number)=>z.string().trim().max(max);
export const groupRequestSchema=z.object({
 requestId:z.uuid(),
 activity:text(100).min(1),
 name:text(120).min(1,'Vul je naam in.'),
 email:z.email('Vul een geldig e-mailadres in.').max(200),
 phone:text(40).default(''),
 date:z.union([z.literal(''),dateSchema]).default(''),
 daypart:text(40).default(''),
 people:z.union([z.null(),z.number().int().min(1).max(1000)]).default(null),
 wishes:text(5000).min(1,'Vertel kort wat jullie wensen zijn.'),
});
export type GroupRequest=z.infer<typeof groupRequestSchema>;
export const MAX_REQUEST_BYTES=12_000;

const clean=(v:string)=>v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,' ');
/** Zet de aanvraag in de centrale gastgegevens. Geeft false als dezelfde aanvraag er al is. */
export function addGroupRequest(s:GuestState,r:GroupRequest,now=Date.now()):{added:boolean;threadId:string;indication:Indication|null}{
 const threadId='web:'+r.requestId,at=new Date(now).toISOString();
 let indication:Indication|null=null;
 if(r.date&&r.people)try{indication=groupIndication(s,r.date,r.people,now)}catch{}
 if(s.threads.some(t=>t.id===threadId))return {added:false,threadId,indication};
 const subject=('Groepsaanvraag · '+r.activity+(r.date?' · '+r.date:'')).slice(0,150);
 const lines=[`Activiteit: ${r.activity}`,`Naam: ${r.name}`,`E-mail: ${r.email}`,...(r.phone?[`Telefoon: ${r.phone}`]:[]),
  `Datum: ${r.date||'nog open'}`,...(r.daypart?[`Dagdeel: ${r.daypart}`]:[]),`Aantal personen: ${r.people??'nog open'}`,'',r.wishes];
 const summary=indication?`Direct antwoord op de website (indicatie, niets vastgehouden): ${indication.state} — ${indication.message}`:'Verstuurd via de website (Groepen & feesten).';
 const t:Conversation={id:threadId,mailbox:'',externalId:r.requestId,channel:'chat',subject,sender:r.email,status:'nieuw',assigned:'',
  messages:[{id:r.requestId,from:`${r.name} <${r.email}>`,to:'',subject,text:clean(lines.join('\n')),at,internetId:'',attachments:[]}],
  draft:'',draftId:'',draftBase:'',draftVersion:0,editingBy:'',editingUntil:0,summary,transcript:'',customer:r.name,updated:at};
 s.threads.push(t);audit(s,'website','groepsaanvraag ontvangen',threadId);
 // Concept-aanvraag in Planning als datum en aantal bekend zijn en de dag open is. Houdt geen plaats vast.
 if(r.date&&r.people){
  const ws=windows(s,r.date),w=ws.find(x=>x.name&&x.name===r.daypart)||ws.find(x=>fits(s,r.date,r.people!,x,now))||ws[0];
  if(w)s.reservations.push(reservationSchema.parse({id:crypto.randomUUID(),name:r.name,email:r.email,phone:r.phone,activity:'groep',date:r.date,from:w.from,to:w.to,people:r.people,
   sharing:false,status:'aanvraag',expires:'',notes:clean(r.wishes),threadId,tables:[]}));
 }
 return {added:true,threadId,indication};
}

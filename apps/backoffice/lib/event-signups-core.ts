// Aanmelden voor evenementen via de website: pure regels (geen database), zodat ze los te testen zijn.
// Een evenement staat open voor aanmelden tenzij de eigenaar het in Planning uitzet; een maximum is optioneel.
import {dayLabel} from './day-label';
export type SignupEvent={id:string;date:string;from:string;to:string;title:string;holiday:boolean;description?:string;example?:boolean;signup?:boolean;capacity?:number;priceCents?:number;paymentInfo?:string;payOnline?:boolean};
export type SignupRequest={requestId:string;eventId:string;name:string;email:string;phone:string;people:number;note:string};
export const MAX_SIGNUP_BYTES=8_000;
export const MAX_PEOPLE=20;
const email=/^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;
const clean=(v:unknown,max:number)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]+/g,' ').trim().slice(0,max+1):'';

/** Checks what a guest sent. Throws a Dutch message that can be shown on the website. */
export function parseSignup(raw:unknown):SignupRequest{
 const b=(raw&&typeof raw==='object'?raw:{}) as Record<string,unknown>;
 if(typeof b.requestId!=='string'||!/^[a-f0-9-]{36}$/.test(b.requestId))throw Error('Ververs de pagina en probeer het opnieuw.');
 if(typeof b.eventId!=='string'||!/^[A-Za-z0-9:_-]{1,100}$/.test(b.eventId))throw Error('Dit evenement bestaat niet (meer).');
 if(b.consent!==true)throw Error('Geef toestemming om je gegevens voor deze aanmelding te gebruiken.');
 if(typeof b.website==='string'&&b.website.trim())throw Error('Je aanmelding kon niet worden verstuurd.'); // honeypot field, stays empty for people
 const name=clean(b.name,120),mail=clean(b.email,200).toLowerCase(),phone=clean(b.phone,40),note=clean(b.note,1000);
 if(name.length<2||name.length>120)throw Error('Vul je naam in.');
 if(!email.test(mail)||mail.length>200)throw Error('Vul een geldig e-mailadres in.');
 if(phone.length>40||(phone&&!/^[0-9 +()./-]{6,40}$/.test(phone)))throw Error('Controleer je telefoonnummer.');
 if(note.length>1000)throw Error('Je opmerking is te lang (maximaal 1000 tekens).');
 const people=Number(b.people);
 if(!Number.isInteger(people)||people<1||people>MAX_PEOPLE)throw Error(`Kies een aantal personen van 1 tot en met ${MAX_PEOPLE}.`);
 return {requestId:b.requestId,eventId:b.eventId,name,email:mail,phone,people,note};
}

/** Whether guests may sign up for this event now, and how many places are left (null = no maximum). */
export function signupState(e:SignupEvent|undefined,taken:number,today:string){
 if(!e||e.holiday)return {open:false,reason:'Voor dit evenement is aanmelden niet mogelijk.',spotsLeft:null as number|null};
 if(e.example)return {open:false,reason:'Dit is een voorbeeldevenement; aanmelden is niet mogelijk.',spotsLeft:null};
 if(e.date<today)return {open:false,reason:'Dit evenement is al geweest.',spotsLeft:null};
 if(e.signup===false)return {open:false,reason:'Aanmelden is voor dit evenement niet nodig of niet mogelijk.',spotsLeft:null};
 const cap=Number.isInteger(e.capacity)&&(e.capacity as number)>0?e.capacity as number:null;
 const left=cap===null?null:Math.max(0,cap-taken);
 if(left===0)return {open:false,reason:'Dit evenement is vol.',spotsLeft:0};
 return {open:true,reason:'',spotsLeft:left};
}

// ---- Betaald evenement en bevestiging (3 november 2026) ----
export const priceOf=(e:{priceCents?:number}|undefined)=>Number.isSafeInteger(e?.priceCents)&&(e!.priceCents as number)>0?e!.priceCents as number:0;
/** Amount at the moment of signing up; a later price change does not alter existing sign-ups. */
export const signupAmount=(e:{priceCents?:number}|undefined,people:number)=>priceOf(e)*people;
// ---- Online betalen via Mollie (besluit eigenaar 3 november 2026) ----
/** Zo lang houdt een nog niet betaalde online aanmelding haar plaats vast; daarna telt ze niet meer mee voor het maximum. */
export const HOLD_MINUTES=60;
/** Betaalt de gast dit evenement direct online? Alleen bij een prijs, als online betalen niet is uitgezet en Mollie aan staat. */
export const paysOnline=(e:{priceCents?:number;payOnline?:boolean}|undefined,mollieOn:boolean)=>mollieOn&&priceOf(e)>0&&e?.payOnline!==false;
/** Telt deze aanmelding mee voor het maximum? Een vastgehouden plaats vervalt na hold_until, tenzij er al betaald is. */
export function holdsPlace(r:{status:string;holdUntil:string|null;paymentStatus:string},now:string){
 return r.status==='aangemeld'&&(!r.holdUntil||r.paymentStatus==='betaald'||r.holdUntil>now);
}
/** Remmen per e-mailadres (#132): zo kan niemand met één adres alle plaatsen vasthouden of het adres van een ander
 *  volsturen met bevestigingen. */
export const SIGNUP_LIMITS={perEventPerEmail:3,perHourPerEmail:5};
export const euro=(cents:number)=>'€ '+(cents/100).toFixed(2).replace('.',',');
export function confirmationText(e:SignupEvent,s:{name:string;people:number;note:string;amountCents:number;paidOnline?:boolean}){
 const when=`${dayLabel(e.date)}${e.from?`, ${e.from}${e.to?'–'+e.to:''} uur`:''}`;
 // Geen vrije tekst van het formulier (naam, opmerking) in de mail (#132): iedereen kan een willekeurig e-mailadres
 // invullen, en dan zou onze mail andermans tekst doorsturen. De naam en opmerking staan wel in de backoffice.
 const lines=['Hallo,','',`Wat fijn dat je komt! We hebben je aanmelding voor ${e.title} goed ontvangen.`,'',
  `Wanneer: ${when}`,`Aantal personen: ${s.people}`,...(s.note?['Je opmerking hebben we ook ontvangen.']:[]),
  ...(s.amountCents>0?['',`Kosten: ${euro(s.amountCents)} (${s.people} × ${euro(s.amountCents/s.people)})`,s.paidOnline?'Je hebt online betaald. Dank je wel!':e.paymentInfo?.trim()||'Hoe je betaalt, laten we je nog weten.']:[]),
  '','Kun je toch niet? Antwoord dan even op deze mail.','','Tot ziens op de boerderij!','','Boer Bart','Schoterweg 26, 8462 TD Rotstergaast'];
 return {subject:`Je aanmelding: ${e.title} op ${dayLabel(e.date)}`,body:lines.join('\n')};
}

// ---- Annuleringsmail (wens eigenaar 9 november 2026) ----
/** Wat de gast nodig heeft als het evenement niet doorgaat. Het evenement zelf staat dan al niet meer in de agenda, dus de
 *  gegevens komen mee in de opdracht. Betaald: online via Mollie storten we terug; anders nemen we contact op. */
export type CancelledEvent={title:string;date:string;from:string;to:string};
export function cancellationText(e:CancelledEvent,s:{name:string;people:number;amountCents:number;paidOnline:boolean;paid:boolean}){
 const when=`${dayLabel(e.date)}${e.from?`, ${e.from}${e.to?'–'+e.to:''} uur`:''}`;
 const money=s.paid&&s.amountCents>0?(s.paidOnline
  ?[`Je hebt ${euro(s.amountCents)} betaald. Dat storten we terug op de rekening waarmee je betaalde; dat kan een paar werkdagen duren.`]
  :[`Je hebt ${euro(s.amountCents)} betaald. We nemen contact met je op om dat terug te betalen.`]):[];
 const lines=['Hallo,','',`Helaas gaat ${e.title} op ${when} niet door. Je aanmelding (${s.people} ${s.people===1?'persoon':'personen'}) is daarom geannuleerd.`,
  ...(money.length?['',...money]:[]),'','Het spijt ons. Kijk in de agenda op onze website voor andere activiteiten; we zien je graag een andere keer.','',
  'Vragen? Antwoord dan op deze mail.','','Boer Bart','Schoterweg 26, 8462 TD Rotstergaast'];
 return {subject:`Gaat niet door: ${e.title} op ${dayLabel(e.date)}`,body:lines.join('\n')};
}

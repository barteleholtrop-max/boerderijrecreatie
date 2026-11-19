import {z} from 'zod';
import type {Customer} from './guest-customers';
import type {Visit} from './guest-forecast';
import {validIban,normalizeIban} from './nl-core';
import {serviceOn} from './availability';
export const dateSchema=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v);
export const timeSchema=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const id=z.string().min(1).max(100),short=z.string().max(300);
export const hoursSchema=z.object({open:z.boolean(),from:timeSchema,to:timeSchema}).refine(v=>!v.open||v.from<v.to,'Eindtijd moet na begintijd liggen.');
export type Hours=z.infer<typeof hoursSchema>;
export const reservationSchema=z.object({id,name:short.min(1),email:z.union([z.literal(''),z.email()]),phone:short,activity:z.enum(['yte','bezoek','groep']),date:dateSchema,from:timeSchema,to:timeSchema,people:z.number().int().min(1).max(1000),sharing:z.boolean(),status:z.enum(['aanvraag','optie','bevestigd','geannuleerd']),expires:z.string().max(40),notes:z.string().max(5000),threadId:z.string().max(100),tables:z.array(id).max(30),customerId:z.string().max(400).optional(),example:z.boolean().optional(),rev:z.number().int().min(0).optional(),
 // Uitzondering voor een besloten groep (wens eigenaar 13 november 2026): de reden waarom deze groep komt op een dag dat het
 // onderdeel uit staat of de dag gesloten is. Alleen voor groepen; daggasten en online reserveringen blijven dicht.
 exception:z.string().trim().max(500).optional(),
 // Voorrang (wens eigenaar 13 november 2026: „Als een vraag wordt gesteld om iets in te boeken mag dat altijd, ook buiten de
 // openingstijden”): een boeking met reden die buiten openingstijden, een gesloten periode, tijdblokken of capaciteit valt.
 // Alleen via de beheerroute (de assistent); de openingstijden voor daggasten en online reserveringen veranderen niet.
 override:z.boolean().optional(),
 // Handmatig ingeboekt (besluit eigenaar 18 november 2026: „Handmatig inboeken kan altijd, ongeacht openingstijden. Openingstijden zijn
 // bedoeld voor online reserveringen die automatisch ingeboekt kunnen worden”): door een medewerker in de backoffice vastgelegd.
 // Openingstijden, een gesloten periode, een uitgeschakeld onderdeel en tijdblok-tijden houden zo'n boeking niet tegen; capaciteit,
 // tafels en overlap met een andere groep wel (lib/guest-core.ts manualBooking).
 manual:z.boolean().optional()}).refine(v=>v.from<v.to,'Controleer de tijden.').refine(v=>!v.exception||v.activity!=='yte','Een uitzondering kan niet voor Ite by Boer Bart (die gebruikt de tafels).').refine(v=>!v.override||!!v.exception,'Geef een reden bij een boeking met voorrang.');
export type Reservation=z.infer<typeof reservationSchema>;
// Afspraken (wens eigenaar 9 november 2026): een kennismakingsgesprek of ander gesprek met een klant. Geen boeking: houdt geen
// plaats of capaciteit vast en staat los van opties en offertes. Te zien in de weekagenda en in de Klanten-agenda van Google.
export const appointmentSchema=z.object({id:z.string().min(1).max(100),date:dateSchema,from:timeSchema,to:timeSchema,subject:z.string().trim().min(1,'Vul het onderwerp in.').max(200),
 customerId:z.string().max(400),customerName:z.string().max(300),notes:z.string().max(2000),created:z.string().max(40),createdBy:z.string().max(100),rev:z.number().int().min(0).optional()}).refine(v=>v.from<v.to,'De eindtijd moet na de begintijd liggen.');
export type Appointment=z.infer<typeof appointmentSchema>;
export type Attachment={id:string;name:string;mime:string;size:number;messageId:string};
export type GuestMessage={id:string;from:string;to:string;subject:string;text:string;at:string;internetId:string;attachments:Attachment[]};
export type Conversation={customerId?:string;id:string;mailbox:string;externalId:string;channel:'gmail'|'chat';subject:string;sender:string;status:'nieuw'|'in behandeling'|'wacht op gast'|'afgehandeld';assigned:string;messages:GuestMessage[];draft:string;draftId:string;draftBase:string;draftVersion:number;editingBy:string;editingUntil:number;summary:string;transcript:string;customer:string;updated:string};
export const daypartSchema=z.object({id:z.string().regex(/^[a-z0-9-]{1,40}$/),name:z.string().trim().min(1).max(40),from:z.union([z.literal(''),timeSchema]),to:z.union([z.literal(''),timeSchema]),bezoek:z.number().int().min(0).max(5000),groep:z.number().int().min(0).max(5000)}).refine(v=>(v.from===''&&v.to==='')||(v.from!==''&&v.to!==''&&v.from<v.to),'Vul bij een tijdblok een begin- en eindtijd in, met het einde na het begin.');
export type Daypart=z.infer<typeof daypartSchema>;
export const defaultDayparts=():Daypart[]=>[['ochtend','Ochtend'],['middag','Middag'],['namiddag','Namiddag']].map(([id,name])=>({id,name,from:'',to:'',bezoek:0,groep:0}));
// Contactgegevens voor de website (footer), centraal in Planning (wens eigenaar 3 november 2026). Leeg = niet tonen.
const phoneText=z.union([z.literal(''),z.string().trim().regex(/^\+?[0-9][0-9 ()-]{5,19}$/,'Vul een geldig telefoonnummer in.')]);
export const LEGAL_FORMS=['eenmanszaak','vof','maatschap','bv','coöperatie','stichting','vereniging'] as const;
const text=(max:number)=>z.string().trim().max(max).optional().default('');
const httpsUrl=z.union([z.literal(''),z.string().trim().max(300).regex(/^https:\/\/[^\s<>"]+$/,'Vul een webadres in dat begint met https://.')]).optional().default('');
// Adres (4 november 2026): voor zoekmachines en AI (gestructureerde gegevens, llms.txt en de agendafeed). Optioneel.
const euroText=z.union([z.literal(''),z.string().trim().regex(/^\d{1,4}([.,]\d{1,2})?$/,'Vul een bedrag in euro in, bijvoorbeeld 9 of 62,50.')]).optional().default('');
/** De vaste tarieven die de website toont (Bedrijfsgegevens → Tarieven op de website). Sleutels nooit hernoemen. */
// Proef- en jaarlidmaatschap zijn vervallen (besluit eigenaar 15 november 2026: „Gasten hoeven geen lid meer te worden van de
// coöperatie”). Een eerder opgeslagen waarde valt bij het volgende opslaan vanzelf weg.
export const PRICE_KEYS=['priceEntreeKind','priceKinderfeest','priceSchoolreisje','priceIte'] as const;
export const contactSchema=z.object({phone:phoneText,email:z.union([z.literal(''),z.email('Vul een geldig e-mailadres in.').max(200)]),whatsapp:phoneText,street:z.string().trim().max(120).optional().default(''),postalCode:z.union([z.literal(''),z.string().trim().regex(/^[1-9][0-9]{3} ?[A-Za-z]{2}$/,'Vul een geldige postcode in, bijvoorbeeld 8462 TD.')]).optional().default(''),city:z.string().trim().max(80).optional().default(''),
 // Voor de factuur van een gezamenlijke rekening (wens eigenaar 5 november 2026). Niet naar de website.
 kvk:z.union([z.literal(''),z.string().trim().regex(/^\d{8}$/,'Een KvK-nummer heeft 8 cijfers.')]).optional().default(''),
 vatNumber:z.union([z.literal(''),z.string().trim().toUpperCase().regex(/^NL\d{9}B\d{2}$/,'Vul een btw-nummer in zoals NL123456789B01.')]).optional().default(''),
 // Bedrijfsgegevens (wens eigenaar 5 november 2026): één plek voor alles over het bedrijf, op de pagina Bedrijfsgegevens.
 // Alles optioneel; leeg = niet tonen. Facturen, verkoopoverzicht en website lezen het hier.
 tradeName:text(100),legalName:text(150),legalForm:z.union([z.literal(''),z.enum(LEGAL_FORMS)]).optional().default(''),owners:text(150),
 establishmentNumber:z.union([z.literal(''),z.string().trim().regex(/^\d{12}$/,'Een vestigingsnummer heeft 12 cijfers.')]).optional().default(''),
 adminEmail:z.union([z.literal(''),z.email('Vul een geldig e-mailadres in voor de administratie.').max(200)]).optional().default(''),
 website:httpsUrl,instagram:httpsUrl,facebook:httpsUrl,
 iban:z.union([z.literal(''),z.string().trim().refine(validIban,'Dit IBAN is niet geldig. Controleer het rekeningnummer.').transform(normalizeIban)]).optional().default(''),
 ibanName:text(70),
 bic:z.union([z.literal(''),z.string().trim().toUpperCase().regex(/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/,'Een BIC heeft 8 of 11 tekens, bijvoorbeeld BUNQNL2A.')]).optional().default(''),
 // Tarieven op de website (15 november 2026, de nieuwe site live zetten): vaste prijzen die geen product in de kassa of webwinkel
 // zijn. Bedrag in euro (9 of 62,50); leeg = de website noemt geen prijs. Zie PRICE_KEYS en publicPrices.
 ...Object.fromEntries(PRICE_KEYS.map(k=>[k,euroText]))});
export type Contact=z.infer<typeof contactSchema>;
/** Groepsdag (wens eigenaar 13 november 2026): op één datum groepen ontvangen terwijl het onderdeel uit staat of de dag dicht is.
 * De dag blijft dicht voor daggasten en online reserveringen; de rest van de gesloten periode verandert niet. */
export const groupDaySchema=z.object({date:dateSchema,from:timeSchema,to:timeSchema,note:z.string().trim().min(3,'Schrijf erbij waarom groepen op deze dag welkom zijn.').max(500)}).refine(v=>v.from<v.to,'De eindtijd moet na de begintijd liggen.');
export type GroupDay=z.infer<typeof groupDaySchema>;
export const groupDayOf=(s:{groupDays?:GroupDay[]},date:string)=>s.groupDays?.find(g=>g.date===date)||null;
export type GuestState={groupDays?:GroupDay[];/** Verwijderde websitechats (8 november 2026): dezelfde chat komt niet opnieuw binnen. */deletedThreads?:string[];services?:{speelboerderij:boolean;winkel:boolean;yte:boolean};servicePauses?:import('./availability').ServicePauses;groupAdvice?:Record<string,import('./group-advice').GroupDossier>;groupKnowledge?:import('./group-advice').KnowledgeExample[];customers:Customer[];yteService:{weekday:number;from:string;to:string;configured:boolean};visits:Visit[];hours:Hours[];exceptions:{date:string;hours:Hours;note:string}[];tables:{id:string;seats:number}[];capacity:{bezoek:number;groep:number};contact?:Contact;quotes?:import('./quotes').Quote[];meetings?:import('./meetings').Meeting[];
 // Day parts (ochtend, middag, namiddag): capacity per part for visits and groups. Times and limits are set by the owner (2 November 2026).
 dayparts:Daypart[];reservations:Reservation[];appointments?:Appointment[];events:{id:string;date:string;from:string;to:string;title:string;holiday:boolean;description?:string;example?:boolean;signup?:boolean;capacity?:number;priceCents?:number;paymentInfo?:string;payOnline?:boolean;photo?:string}[];pickups:{id:string;date:string;time:string;name:string;description:string;status:'besteld'|'afgehaald'}[];threads:Conversation[];sync:Record<string,{at:string;error:string}>;audit:{at:string;by:string;action:string;reference:string}[]};
// Vandaag volgens „nu” (standaard de klok); de boekingsregels geven hun eigen nu mee, zodat ze ook met een vaste tijd kloppen
// (15 november 2026: met de klok werd een vaste testdatum ineens „verleden” en gaf elke groep „vol”).
export const today=(now=Date.now())=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date(now));
export function initialGuestState():GuestState{return {customers:[],yteService:{weekday:4,from:'19:00',to:'',configured:false},visits:[],hours:Array.from({length:7},(_,i)=>({open:i===0||i>=4,from:'10:00',to:'18:00'})),exceptions:[],tables:Array.from({length:12},(_,i)=>({id:String(i+1),seats:i<8?4:i<10?6:10})),capacity:{bezoek:0,groep:0},dayparts:defaultDayparts(),reservations:[],events:[],pickups:[],threads:[],sync:{},audit:[]};}
export function opening(s:GuestState,date:string,service:'speelboerderij'|'winkel'='speelboerderij'){const h=s.exceptions.find(e=>e.date===date)?.hours||s.hours[new Date(date+'T12:00:00Z').getUTCDay()];if(!serviceOn(s,service,date))return {...h,open:false};return h;}
export function blocks(r:Reservation,now=Date.now()){return r.status==='bevestigd'||r.status==='optie'&&Date.parse(r.expires)>now;}
export function overlaps(a:Reservation,b:Reservation){return a.date===b.date&&a.from<b.to&&b.from<a.to;}
export function peakPeople(entries:Reservation[],r:Reservation){const changes=entries.filter(o=>overlaps(o,r)).flatMap(o=>[{time:o.from<r.from?r.from:o.from,delta:o.people},{time:o.to>r.to?r.to:o.to,delta:-o.people}]).sort((a,b)=>a.time.localeCompare(b.time)||a.delta-b.delta);let used=0,peak=0;for(const e of changes){used+=e.delta;peak=Math.max(peak,used)}return peak;}
// Prefer a single smallest fitting table. Sharing is allowed only when BOTH parties explicitly consent.
// Exhaustive subset search (max 20 tables) also supports a large party spanning multiple tables.
export function allocate(s:GuestState,r:Reservation,now=Date.now()):string[]{
 const others=s.reservations.filter(o=>o.id!==r.id&&blocks(o,now)&&overlaps(o,r));
 const free=s.tables.map(t=>{const bookings=others.filter(o=>o.tables.includes(t.id));return {...t,free:bookings.length?(r.sharing&&bookings.every(o=>o.sharing&&o.tables.length===1)?t.seats-peakPeople(bookings,r):0):t.seats}}).filter(t=>t.free>0);
 const single=free.filter(t=>t.free>=r.people).sort((a,b)=>a.free-b.free)[0];if(single)return [single.id];
 // Never split a party across already shared tables: allocation of seats must stay unambiguous.
 const unused=free.filter(t=>t.free===t.seats);let best:string[]=[],waste=Infinity;
 function choose(i:number,total:number,ids:string[]){if(total>=r.people){const score=total-r.people+ids.length/100;if(score<waste){best=[...ids];waste=score}return}if(i===unused.length)return;choose(i+1,total,ids);choose(i+1,total+unused[i].seats,[...ids,unused[i].id])}choose(0,0,[]);return best;
}
function regularBooking(s:GuestState,r:Reservation,now=Date.now()):Reservation{
 if(!blocks(r,now))return {...r,tables:[]};
 {const id=r.activity==='yte'?'yte':'speelboerderij',p=s.servicePauses?.[id];if(!serviceOn(s,id,r.date))throw Error(s.services?.[id]===false||!p?'Dit onderdeel is uitgeschakeld voor nieuwe boekingen.':`Dit onderdeel is uit van ${p.from} tot en met ${p.to}. Kies een andere datum.`)}
 if(r.date<today(now))throw Error('Kies een toekomstige datum.');
 if(r.status==='optie'&&(!Number.isFinite(Date.parse(r.expires))||Date.parse(r.expires)<=now))throw Error('Kies een toekomstige vervaldatum voor de optie.');
 if(r.activity==='yte'){const y=s.yteService;if(!y.configured)throw Error('Stel eerst de eindtijd van de Ite-avond centraal in.');if(new Date(r.date+'T12:00:00Z').getUTCDay()!==y.weekday||r.from!==y.from||r.to>y.to)throw Error('De boeking past niet bij het ingestelde Ite-eetmoment.');const exception=s.exceptions.find(e=>e.date===r.date);if(exception&&!exception.hours.open)throw Error('Deze datum is gesloten.');}else{const h=opening(s,r.date);if(!h.open||r.from<h.from||r.to>h.to)throw Error('Deze aanvraag past niet binnen de openingstijden.');}
 if(r.activity==='yte'){const tables=allocate(s,r,now);if(!tables.length)throw Error('Er zijn onvoldoende passende tafelplaatsen beschikbaar.');return {...r,tables}}
 const same=s.reservations.filter(o=>o.id!==r.id&&o.activity===r.activity&&blocks(o,now)),used=peakPeople(same,r);
 // With day parts that have times and a limit for this activity, the booking must fit in one part and within its limit.
 // The overall capacity then works as an optional extra maximum (0 = no extra limit).
 const act=r.activity as 'bezoek'|'groep';
 const parts=(s.dayparts||[]).filter(d=>d.from&&d.to&&d[act]>0);
 if(parts.length){
  const part=parts.find(d=>r.from>=d.from&&r.to<=d.to);
  if(!part)throw Error('Kies een tijd binnen een tijdblok ('+parts.map(d=>d.name+' '+d.from+'–'+d.to).join(', ')+').');
  if(used+r.people>part[act])throw Error('Het tijdblok '+part.name+' is vol of heeft niet genoeg plaats voor '+r.people+' personen.');
  if(s.capacity[r.activity]>0&&peakPeople(same,r)+r.people>s.capacity[r.activity])throw Error('De totale capaciteit is onvoldoende.');
  return {...r,tables:[]};
 }
 if(!s.capacity[r.activity]||used+r.people>s.capacity[r.activity])throw Error('Capaciteit is niet ingesteld of onvoldoende beschikbaar.');return {...r,tables:[]};
}
/** Controle van een boeking, zoals de knoppen in Planning. Een groep mag ook op een dag dat het onderdeel uit staat of de dag dicht is,
 * als uitzondering (een groepsdag op die datum, of een reden bij de boeking zelf), met dezelfde controles op capaciteit en overlap. */
export function validateBooking(s:GuestState,r:Reservation,now=Date.now()):Reservation{
 if(r.manual&&!(r.override&&r.exception)){try{return regularBooking(s,r,now)}catch(e){if(!blocks(r,now))throw e;return manualBooking(s,r,now)}}
 const day=r.activity==='groep'?groupDayOf(s,r.date):null;
 if(r.override&&r.exception){try{return regularBooking(s,r,now)}catch(e){if(!blocks(r,now))throw e;return overrideBooking(r,now)}}
 if(r.activity!=='groep'||(!r.exception&&!day))return regularBooking(s,r,now);
 try{return regularBooking(s,r,now)}catch(e){if(!blocks(r,now))throw e;return exceptionBooking(s,r,day,now)}
}
/** Wat een gewone boeking zou tegenhouden: null = past gewoon; anders de reden (de assistent meldt dit als waarschuwing). */
export function bookingProblem(s:GuestState,r:Reservation,now=Date.now()):string|null{
 try{regularBooking(s,{...r,exception:undefined,override:undefined},now);return null}catch(e){return e instanceof Error?e.message:'Past niet in de gewone regels.'}
}
/** Voorrang: alleen een geldige datum en vervaldatum; openingstijden, gesloten periode, tijdblokken en capaciteit gelden niet. */
function overrideBooking(r:Reservation,now:number):Reservation{
 if(r.date<today(now))throw Error('Kies een datum vanaf vandaag.');
 if(r.status==='optie'&&(!Number.isFinite(Date.parse(r.expires))||Date.parse(r.expires)<=now))throw Error('Kies een toekomstige vervaldatum voor de optie.');
 return {...r,tables:[]};
}
/** Handmatig ingeboekt: geen openingstijden, gesloten periode, uitgeschakeld onderdeel of tijdblok-tijden. Wel: een datum vanaf vandaag,
 * een geldige vervaldatum, tafels voor Ite, en de capaciteit (tijdblok en totaal) of geen overlap met een andere groep. */
function manualBooking(s:GuestState,r:Reservation,now:number):Reservation{
 if(r.date<today(now))throw Error('Kies een datum vanaf vandaag.');
 if(r.status==='optie'&&(!Number.isFinite(Date.parse(r.expires))||Date.parse(r.expires)<=now))throw Error('Kies een toekomstige vervaldatum voor de optie.');
 if(r.activity==='yte'){const tables=allocate(s,r,now);if(!tables.length)throw Error('Er zijn onvoldoende passende tafelplaatsen beschikbaar.');return {...r,tables}}
 const act=r.activity as 'bezoek'|'groep';
 const same=s.reservations.filter(o=>o.id!==r.id&&o.activity===act&&blocks(o,now)),used=peakPeople(same,r);
 const part=(s.dayparts||[]).find(d=>d.from&&d.to&&d[act]>0&&r.from>=d.from&&r.to<=d.to);
 if(part&&used+r.people>part[act])throw Error('Het tijdblok '+part.name+' is vol of heeft niet genoeg plaats voor '+r.people+' personen.');
 if(s.capacity[act]>0&&used+r.people>s.capacity[act])throw Error('De totale capaciteit is onvoldoende.');
 // Zonder tijdblok of capaciteit die hier geldt: een besloten groep heeft de ruimte voor zich alleen.
 if(act==='groep'&&!part&&!(s.capacity.groep>0)){const clash=same.find(o=>overlaps(o,r));if(clash)throw Error(`Er staat op dat moment al een groep (${clash.name}, ${clash.from}–${clash.to}).`)}
 return {...r,tables:[]};
}
function exceptionBooking(s:GuestState,r:Reservation,day:GroupDay|null,now:number):Reservation{
 if(r.date<today(now))throw Error('Kies een toekomstige datum.');
 if(r.status==='optie'&&(!Number.isFinite(Date.parse(r.expires))||Date.parse(r.expires)<=now))throw Error('Kies een toekomstige vervaldatum voor de optie.');
 if(!r.exception&&day&&(r.from<day.from||r.to>day.to))throw Error(`Op deze groepsdag zijn groepen welkom van ${day.from} tot ${day.to}. Kies een tijd daarbinnen, of geef een reden voor een uitzondering.`);
 const same=s.reservations.filter(o=>o.id!==r.id&&o.activity==='groep'&&blocks(o,now)),used=peakPeople(same,r);
 const part=(s.dayparts||[]).find(d=>d.from&&d.to&&d.groep>0&&r.from>=d.from&&r.to<=d.to);
 if(part&&used+r.people>part.groep)throw Error('Het tijdblok '+part.name+' is vol of heeft niet genoeg plaats voor '+r.people+' personen.');
 if(s.capacity.groep>0&&used+r.people>s.capacity.groep)throw Error('De totale capaciteit voor groepen is onvoldoende.');
 // Zonder tijdblok of capaciteit die hier geldt: een besloten groep heeft de ruimte voor zich alleen.
 if(!part&&!(s.capacity.groep>0)){const clash=same.find(o=>overlaps(o,r));if(clash)throw Error(`Er staat op dat moment al een groep (${clash.name}, ${clash.from}–${clash.to}).`)}
 return {...r,tables:[]};
}
export function alternatives(s:GuestState,r:Reservation){const result:Reservation[]=[];for(let i=1;i<=60&&result.length<3;i++){const d=new Date(r.date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+i);try{result.push(validateBooking(s,{...r,date:d.toISOString().slice(0,10),status:'bevestigd'}))}catch{}}return result;}
export function tableLabel(s:GuestState,r:Reservation,table:string){const peers=s.reservations.filter(o=>blocks(o)&&overlaps(o,r)&&o.tables.includes(table)).sort((a,b)=>a.id.localeCompare(b.id));return blocks(r)&&peers.length>1?table+String.fromCharCode(97+peers.findIndex(o=>o.id===r.id)):table;}
export function audit(s:GuestState,by:string,action:string,reference:string){s.audit.push({at:new Date().toISOString(),by,action,reference});}
export function versionOf(t:Conversation){return t.messages.map(m=>m.id).join('|');}
export function mergeThread(old:Conversation|undefined,incoming:Conversation){if(!old)return incoming;const merged={...old,...incoming,status:old.status,assigned:old.assigned,draft:old.draft,draftId:old.draftId,draftBase:old.draftBase,draftVersion:old.draftVersion,editingBy:old.editingBy,editingUntil:old.editingUntil,summary:old.summary,transcript:old.transcript,customer:old.customer,customerId:old.customerId};if(versionOf(old)!==versionOf(incoming)&&old.status==='afgehandeld')merged.status='nieuw';return merged;}

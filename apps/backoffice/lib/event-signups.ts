// Aanmeldingen voor evenementen: opslag (server). Regels in lib/event-signups-core.ts.
import {getDb} from '@/db';
import {eventSignups} from '@/db/schema';
import {and,eq,sql,inArray} from 'drizzle-orm';
import {loadGuest} from './guest-store';
import {signupState,signupAmount,confirmationText,cancellationText,paysOnline,HOLD_MINUTES,SIGNUP_LIMITS,type SignupRequest,type CancelledEvent} from './event-signups-core';
import {mollieKey} from './online-payments';
import {inTransaction} from './portable/env';
// Plaatsen tellen en vastleggen gebeurt per evenement één voor één (ook met meerdere servers bij Supabase): zo kan de
// laatste plaats nooit twee keer worden vergeven. Vroeger zorgde SQLite daarvoor (één schrijver tegelijk).
const perEvent=<T>(eventId:string,fn:()=>Promise<T>)=>inTransaction(async()=>{await getDb().execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'evenement:'+eventId}))`);return fn()});
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date());

/** Which sign-ups take a place (same rule as holdsPlace in event-signups-core): signed up, and not an unpaid online
 *  sign-up whose hold has expired. */
const takesPlace=(now:string)=>sql`${eventSignups.status}='aangemeld' AND (${eventSignups.holdUntil} IS NULL OR ${eventSignups.paymentStatus}='betaald' OR ${eventSignups.holdUntil}>${now})`;
/** Persons signed up per event (cancelled sign-ups and expired unpaid holds do not count). */
export async function signupTotals(){
 const rows=await getDb().select({eventId:eventSignups.eventId,people:sql<number>`sum(${eventSignups.people})`}).from(eventSignups).where(takesPlace(new Date().toISOString())).groupBy(eventSignups.eventId);
 return new Map(rows.map(r=>[r.eventId,Number(r.people)||0]));
}
export class SignupError extends Error{status:number;constructor(m:string,status=409){super(m);this.status=status}}
/**
 * Saves a sign-up once (same requestId again returns the same result). The maximum is checked in the INSERT itself,
 * so two guests signing up at the same moment can never together exceed it.
 * Paid event with online payment (Mollie on): the place is held for HOLD_MINUTES while the guest pays; the confirmation
 * mail waits until the payment is confirmed (status 'betaling'). Call inside withConnectionSettings.
 */
export async function createSignup(r:SignupRequest){
 const db=getDb();
 const previous=(await db.select().from(eventSignups).where(eq(eventSignups.requestId,r.requestId)))[0];
 if(previous){if(previous.eventId!==r.eventId||previous.email!==r.email||previous.people!==r.people)throw new SignupError('Deze aanmelding is al verstuurd met andere gegevens. Herlaad de pagina.');return {signup:previous,duplicate:true,pay:!!previous.holdUntil&&previous.paymentStatus!=='betaald'}}
 const {state}=await loadGuest(),e=state.events.find(x=>x.id===r.eventId);
 const taken=(await signupTotals()).get(r.eventId)||0,st=signupState(e,taken,today());
 if(!st.open)throw new SignupError(st.reason);
 if(st.spotsLeft!==null&&r.people>st.spotsLeft)throw new SignupError(st.spotsLeft===1?'Er is nog 1 plaats vrij.':`Er zijn nog ${st.spotsLeft} plaatsen vrij.`);
 {const now=new Date().toISOString(),hourAgo=new Date(Date.now()-3600_000).toISOString();
  const [c]=await db.select({same:sql<number>`count(*) FILTER (WHERE ${eventSignups.eventId}=${r.eventId} AND ${takesPlace(now)})`,recent:sql<number>`count(*) FILTER (WHERE ${eventSignups.created}>${hourAgo})`}).from(eventSignups).where(eq(eventSignups.email,r.email));
  if(Number(c?.same)>=SIGNUP_LIMITS.perEventPerEmail)throw new SignupError('Met dit e-mailadres staan al genoeg aanmeldingen voor deze activiteit. Wil je iets wijzigen? Antwoord dan op de bevestigingsmail.');
  if(Number(c?.recent)>=SIGNUP_LIMITS.perHourPerEmail)throw new SignupError('Met dit e-mailadres zijn net al veel aanmeldingen verstuurd. Probeer het later opnieuw.');}
 const id=crypto.randomUUID(),stamp=new Date().toISOString(),cap=e!.capacity&&e!.capacity>0?e!.capacity:null;
 const amount=signupAmount(e,r.people),pay=amount>0?'open':'',online=paysOnline(e,!!mollieKey());
 const hold=online?new Date(Date.parse(stamp)+HOLD_MINUTES*60000).toISOString():null,confirmation=online?'betaling':'wacht';
 // Met expliciete soorten: bij INSERT … SELECT leidt Postgres die niet af uit de kolommen.
 const values=sql`${id}::text,${r.requestId}::text,${r.eventId}::text,${r.name}::text,${r.email}::text,${r.phone}::text,${r.people}::bigint,${r.note}::text,'aangemeld',${amount}::bigint,${pay}::text,${hold}::text,${confirmation}::text,${stamp}::text,${stamp}::text`;
 const columns=sql`INSERT INTO event_signups(id,request_id,event_id,name,email,phone,people,note,status,amount_cents,payment_status,hold_until,confirmation,created,updated)`;
 const insert=cap===null
  ?sql`${columns} VALUES(${values}) ON CONFLICT(request_id) DO NOTHING`
  :sql`${columns} SELECT ${values} WHERE (SELECT coalesce(sum(people),0) FROM event_signups WHERE event_id=${r.eventId} AND ${takesPlace(stamp)})+${r.people}<=${cap} ON CONFLICT(request_id) DO NOTHING`;
 await perEvent(r.eventId,()=>db.execute(insert));
 const saved=(await db.select().from(eventSignups).where(eq(eventSignups.requestId,r.requestId)))[0];
 if(!saved)throw new SignupError('Net iemand je voor: er zijn niet genoeg plaatsen meer vrij.');
 const fresh=saved.id===id;
 if(fresh&&!online)await queueConfirmation(saved.id);
 return {signup:saved,duplicate:!fresh,pay:online};
}
/** Sign-ups for the backoffice (Planning), optionally for some events only. */
export async function listSignups(eventIds?:string[]){
 const db=getDb(),q=db.select().from(eventSignups);
 return eventIds?(eventIds.length?await q.where(inArray(eventSignups.eventId,eventIds)):[]):await q;
}
export async function setSignupStatus(id:string,status:'aangemeld'|'geannuleerd',by:string){
 // Terugzetten door het team: de aanmelding telt dan weer gewoon mee, ook als een betaaltermijn verlopen was.
 const done=await getDb().update(eventSignups).set({status,...(status==='aangemeld'?{holdUntil:null}:{}),updated:new Date().toISOString(),updatedBy:by}).where(and(eq(eventSignups.id,id))).returning({id:eventSignups.id});
 if(!done.length)throw new SignupError('Aanmelding niet gevonden.',404);
}

export async function setSignupPaid(id:string,paid:boolean,by:string){
 const row=(await getDb().select().from(eventSignups).where(eq(eventSignups.id,id)))[0];
 if(!row)throw new SignupError('Aanmelding niet gevonden.',404);if(!row.amountCents)throw new SignupError('Voor deze aanmelding hoeft niet betaald te worden.');
 // Online betaald: alleen Mollie bepaalt dat; terugbetalen gaat via het Mollie-dashboard.
 if(!paid&&row.paymentStatus==='betaald'&&row.paidBy.startsWith('Mollie'))throw new SignupError('Deze aanmelding is online betaald via Mollie. Terugbetalen doe je in het Mollie-dashboard.');
 await getDb().update(eventSignups).set({paymentStatus:paid?'betaald':'open',paidAt:paid?new Date().toISOString():null,paidBy:paid?by:'',...(paid?{holdUntil:null}:{}),...(paid&&row.confirmation==='betaling'?{confirmation:'wacht'}:{}),updated:new Date().toISOString(),updatedBy:by}).where(eq(eventSignups.id,id));
 // Wachtte de bevestiging op de betaling, dan gaat ze nu alsnog.
 if(paid&&row.confirmation==='betaling')await queueConfirmation(id);
}

/** Betaling bevestigd door Mollie (lib/signup-payments.ts): betaald, plaats vast, en dan pas de bevestigingsmail. */
export async function markPaidOnline(id:string,mode:'test'|'live'){
 const db=getDb(),stamp=new Date().toISOString();
 const done=await db.update(eventSignups).set({paymentStatus:'betaald',paidAt:stamp,paidBy:mode==='live'?'Mollie':'Mollie (test)',holdUntil:null,updated:stamp,updatedBy:'mollie'}).where(and(eq(eventSignups.id,id),sql`${eventSignups.paymentStatus}<>'betaald'`)).returning({confirmation:eventSignups.confirmation});
 if(done[0]?.confirmation==='betaling'){await db.update(eventSignups).set({confirmation:'wacht'}).where(eq(eventSignups.id,id));await queueConfirmation(id)}
}

// ---- Bevestigingsmail (via de Gmail-koppeling, vanuit de mailbox van Gesprekken) ----
/** Queues one confirmation per sign-up (job key per sign-up and attempt), handled by the background worker. */
export async function queueConfirmation(id:string,attempt='1'){
 const {enqueue}=await import('./outbox');await enqueue('aanmelding-bevestiging:'+id+':'+attempt,'aanmelding-bevestiging',{id});
 const {tick}=await import('./assistant-jobs');void tick();
}
export async function resendConfirmation(id:string){
 const row=(await getDb().select().from(eventSignups).where(eq(eventSignups.id,id)))[0];
 if(!row)throw new SignupError('Aanmelding niet gevonden.',404);
 if(row.confirmation==='verzonden')throw new SignupError('De bevestiging is al verzonden.');
 await getDb().update(eventSignups).set({confirmation:'wacht',confirmationError:null}).where(eq(eventSignups.id,id));
 await queueConfirmation(id,String(Date.now()));
}
/**
 * Sends the confirmation once. The message has a fixed Message-ID: before sending, Gmail is searched for it, so a retry
 * after a lost connection never sends a second mail. Without Gmail connection or with sending switched off nothing is sent
 * and the status shows why ('uit'); the team can send it later from Planning.
 */
export async function sendConfirmation(id:string){
 const db=getDb(),row=(await db.select().from(eventSignups).where(eq(eventSignups.id,id)))[0];
 if(!row||row.confirmation==='verzonden'||row.status!=='aangemeld')return;
 const set=(v:Partial<typeof eventSignups.$inferInsert>)=>db.update(eventSignups).set(v).where(eq(eventSignups.id,id));
 const {sendEnabled,mailbox,isConnected,mailClient}=await import('./mail-store');
 if(!sendEnabled()){await set({confirmation:'uit',confirmationError:'Verzenden staat uit in deze omgeving (MAIL_SEND_ENABLED).'});return}
 if(!await isConnected()){await set({confirmation:'uit',confirmationError:'Gmail is niet gekoppeld (Gesprekken → Google koppelen).'});return}
 const {state}=await loadGuest(),e=state.events.find(x=>x.id===row.eventId);
 if(!e){await set({confirmation:'mislukt',confirmationError:'Het evenement bestaat niet meer.'});return}
 const g=await mailClient(),messageId=`<aanmelding-${row.id}@example.nl>`;
 const found=(await g.findMessages('in:sent rfc822msgid:'+messageId)).messages?.[0];
 if(found){await set({confirmation:'verzonden',confirmationMessageId:found.id,confirmationError:null});return}
 const {buildMessage}=await import('./mail-core'),{GmailError}=await import('./gmail-api');
 const text=confirmationText(e,{name:row.name,people:row.people,note:row.note,amountCents:row.amountCents,paidOnline:row.paymentStatus==='betaald'&&row.paidBy.startsWith('Mollie')});
 try{
  const sent=await g.sendMessage(buildMessage({from:mailbox(),to:row.email,subject:text.subject,body:text.body,messageId}));
  await set({confirmation:'verzonden',confirmationMessageId:sent.id,confirmationError:null});
 }catch(err){
  // A clear refusal (4xx) is final; otherwise the job is retried and first checks whether the mail did go out.
  if(err instanceof GmailError&&err.status>=400&&err.status<500){await set({confirmation:'mislukt',confirmationError:err.message});return}
  await set({confirmationError:'Nog niet verzonden; wordt opnieuw geprobeerd.'});throw err;
 }
}

// ---- Annuleringsmail (wens eigenaar 9 november 2026) ----
/** Kan er nu gemaild worden? Zo niet, dan zegt de reden wat de coördinator zelf moet doen. */
// Dezelfde controles als sendEnabled() en isConnected() in lib/mail-store.ts, zonder die hele module te laden.
export async function mailReady():Promise<{ok:true}|{ok:false;reason:string}>{
 if(process.env.MAIL_SEND_ENABLED!=='1')return {ok:false,reason:'Verzenden staat uit in deze omgeving (MAIL_SEND_ENABLED)'};
 const [{connectionSetting},{MAILBOX_DEFAULT},{mailAccounts}]=await Promise.all([import('./connection-runtime'),import('./mail-core'),import('@/db/schema')]);
 const box=(connectionSetting('GMAIL_MAILBOX')||MAILBOX_DEFAULT).trim().toLowerCase();
 const a=(await getDb().select({refreshToken:mailAccounts.refreshToken,status:mailAccounts.status}).from(mailAccounts).where(eq(mailAccounts.mailbox,box)))[0];
 if(!a?.refreshToken||a.status==='toegang-verlopen')return {ok:false,reason:'Gmail is niet gekoppeld (Gesprekken → Google koppelen)'};
 return {ok:true};
}
/** Eén annuleringsmail per aanmelding (vaste sleutel: dubbel in de rij zetten verstuurt niets dubbel). */
export async function queueCancellation(id:string,event:CancelledEvent){
 const {enqueue}=await import('./outbox');await enqueue('aanmelding-annulering:'+id,'aanmelding-annulering',{id,event});
 const {tick}=await import('./assistant-jobs');void tick();
}
/** Verstuurt de annuleringsmail één keer: vaste Message-ID, en eerst kijken of hij al in Verzonden staat (net als de bevestiging).
 *  Alleen voor een aanmelding die echt geannuleerd is. Zonder Gmail-koppeling gebeurt er niets (de coördinator kreeg dat al te zien). */
export async function sendCancellation(payload:unknown){
 const p=(payload&&typeof payload==='object'?payload:{}) as {id?:unknown;event?:Partial<CancelledEvent>};
 const id=typeof p.id==='string'?p.id:'',e=p.event;
 if(!id||!e||typeof e.title!=='string'||typeof e.date!=='string')return;
 const row=(await getDb().select().from(eventSignups).where(eq(eventSignups.id,id)))[0];
 if(!row||row.status!=='geannuleerd'||!row.email)return;
 if(!(await mailReady()).ok)return;
 const {mailbox,mailClient}=await import('./mail-store'),g=await mailClient(),messageId=`<annulering-${row.id}@example.nl>`;
 if((await g.findMessages('in:sent rfc822msgid:'+messageId)).messages?.[0])return;
 const {buildMessage}=await import('./mail-core'),{GmailError}=await import('./gmail-api');
 const text=cancellationText({title:e.title,date:e.date,from:e.from||'',to:e.to||''},{name:row.name,people:row.people,amountCents:row.amountCents,paid:row.paymentStatus==='betaald',paidOnline:row.paymentStatus==='betaald'&&row.paidBy.startsWith('Mollie')});
 try{await g.sendMessage(buildMessage({from:mailbox(),to:row.email,subject:text.subject,body:text.body,messageId}))}
 catch(err){if(err instanceof GmailError&&err.status>=400&&err.status<500){console.warn('[annulering] niet verstuurd',row.id,err.message);return}throw err}
}

/**
 * Opnieuw betalen nadat de vastgehouden plaats verlopen is: de plaats wordt alleen opnieuw vastgehouden als er nog
 * genoeg plaatsen vrij zijn (gecontroleerd in de UPDATE zelf, net als bij aanmelden). Geeft false als dat niet lukt.
 */
export async function renewHold(id:string){
 const db=getDb(),row=(await db.select().from(eventSignups).where(eq(eventSignups.id,id)))[0];
 if(!row||row.status!=='aangemeld')return false;
 const now=new Date().toISOString();
 if(!row.holdUntil||row.paymentStatus==='betaald'||row.holdUntil>now)return true;
 const {state}=await loadGuest(),e=state.events.find(x=>x.id===row.eventId);
 if(!e||!signupState(e,0,today()).open)return false; // evenement voorbij, uitgezet of weg
 const cap=e.capacity&&e.capacity>0?e.capacity:null,until=new Date(Date.now()+HOLD_MINUTES*60000).toISOString();
 const room=cap===null?sql`1`:sql`(SELECT coalesce(sum(people),0) FROM event_signups WHERE event_id=${row.eventId} AND id<>${id} AND ${takesPlace(now)})+${row.people}<=${cap}`;
 const done=await perEvent(row.eventId,()=>db.update(eventSignups).set({holdUntil:until,updated:now}).where(and(eq(eventSignups.id,id),eq(eventSignups.status,'aangemeld'),sql`${eventSignups.paymentStatus}<>'betaald'`,room)).returning({id:eventSignups.id}));
 return done.length>0;
}

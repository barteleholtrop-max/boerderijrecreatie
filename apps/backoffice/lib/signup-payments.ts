// Online betalen van een aanmelding voor een betaald evenement via Mollie (besluit eigenaar 3 november 2026).
// Zelfde regels als bij bestellingen (lib/online-payments.ts):
// - Eén regel in `signup_payments` per betaalpoging (provider mollie-test of mollie-live, kenmerk tr_…), hooguit MAX_ATTEMPTS.
// - Betaald geldt pas als de backoffice de betaling zelf bij Mollie heeft opgehaald en bedrag, modus en kenmerk kloppen.
// - Na een bevestigde betaling: aanmelding betaald, plaats definitief, en dan pas de bevestigingsmail.
// Tijdens het betalen houdt de aanmelding haar plaats HOLD_MINUTES vast (lib/event-signups.ts).
import {getDb} from '@/db';
import {eventSignups,signupPayments} from '@/db/schema';
import {and,eq} from 'drizzle-orm';
import {applyPaymentUpdate,type Payment} from './payments';
import {mollieKey,MAX_ATTEMPTS,PaymentsOff} from './online-payments';
import {createMolliePayment,getMolliePayment,createMollieRefund,refundFailed,mapMollieStatus,checkMolliePayment,webhookUrl,MollieError,type MolliePayment} from './mollie';
import {markPaidOnline,renewHold} from './event-signups';
import {loadGuest} from './guest-store';
import {dayLabel} from './day-label';

type SignupRow=typeof eventSignups.$inferSelect;
type Row=typeof signupPayments.$inferSelect;
type Key=NonNullable<ReturnType<typeof mollieKey>>;
const providerFor=(mode:'test'|'live')=>'mollie-'+mode;
// De algemene betaalregels (payments.ts) werken met een orderId; voor een aanmelding speelt dat geen rol.
const asPayment=(r:Row):Payment=>({id:r.id,orderId:1,method:'online',amountCents:r.amountCents,status:r.status as Payment['status'],provider:r.provider,externalRef:r.externalRef,version:r.version});

export async function signupByRequest(requestId:string){return (await getDb().select().from(eventSignups).where(eq(eventSignups.requestId,requestId)))[0]??null}
const attemptsOf=(signupId:string)=>getDb().select().from(signupPayments).where(eq(signupPayments.signupId,signupId));

/** Verwerkt de stand bij Mollie voor één betaalpoging. Herhaalbaar: dezelfde stand nog eens verandert niets. */
async function applyMollie(row:Row,p:MolliePayment,key:Key){
 const wrong=checkMolliePayment(p,{paymentId:row.id,amountCents:row.amountCents,mode:key.mode});
 if(wrong||p.id!==row.externalRef)throw new MollieError(wrong?wrong.replace('bestelling','aanmelding'):'Deze betaling hoort bij een andere aanmelding.',409);
 const status=mapMollieStatus(p.status);
 if(!status||row.status!=='open')return;
 const next=applyPaymentUpdate(asPayment(row),{status,externalRef:p.id});
 if(next.result==='duplicate')return;
 const done=await getDb().update(signupPayments).set({status:next.payment.status,version:next.payment.version,updated:new Date().toISOString()}).where(and(eq(signupPayments.id,row.id),eq(signupPayments.version,row.version))).returning({id:signupPayments.id});
 if(done.length&&status==='betaald')await markPaidOnline(row.signupId,key.mode);
}

/** Haalt open betaalpogingen van deze aanmelding opnieuw op bij Mollie (bij terugkomst op de website). */
export async function refreshSignup(s:SignupRow){
 const key=mollieKey();if(!key)return;
 for(const row of await attemptsOf(s.id))if(row.status==='open'&&row.provider===providerFor(key.mode)&&row.externalRef)await applyMollie(row,await getMolliePayment(key.key,row.externalRef),key);
}

/** Melding van Mollie voor een aanmelding. false = geen betaalpoging van een aanmelding met dit kenmerk. */
export async function handleSignupWebhook(id:string,key:Key){
 const [row]=await getDb().select().from(signupPayments).where(and(eq(signupPayments.provider,providerFor(key.mode)),eq(signupPayments.externalRef,id)));
 if(!row)return false;
 await applyMollie(row,await getMolliePayment(key.key,id),key);
 return true;
}

/** Start (of hervat) het betalen van een aanmelding. Geeft de betaalpagina van Mollie, of paid als er al betaald is. */
export async function startSignupPayment(s:SignupRow,redirectUrl:string):Promise<{paid:true}|{checkoutUrl:string}>{
 const key=mollieKey();if(!key)throw new PaymentsOff();
 if(s.status!=='aangemeld')throw new MollieError('Deze aanmelding is geannuleerd. Neem contact met ons op als dat niet klopt.',409);
 if(s.amountCents<=0)throw new MollieError('Voor deze aanmelding hoef je niets te betalen.',409);
 if(s.paymentStatus==='betaald')return {paid:true};
 await refreshSignup(s);
 const fresh=(await signupByRequest(s.requestId))!;if(fresh.paymentStatus==='betaald')return {paid:true};
 const rows=await attemptsOf(s.id),provider=providerFor(key.mode);
 // Een poging die nog open staat, gaat verder op dezelfde betaalpagina.
 for(const row of rows.filter(r=>r.status==='open'&&r.provider===provider&&r.externalRef)){
  const p=await getMolliePayment(key.key,row.externalRef!);
  if(p.status==='open'&&p.checkoutUrl)return {checkoutUrl:p.checkoutUrl};
  if(p.status==='pending'||p.status==='authorized')throw new MollieError('Je betaling wordt nog verwerkt. Wacht even en kijk dan opnieuw.',409);
 }
 if(rows.length>=MAX_ATTEMPTS)throw new MollieError('Betalen is te vaak geprobeerd voor deze aanmelding. Neem contact met ons op.',429);
 // Verlopen plaats: alleen opnieuw betalen als er nog plaats is.
 if(!await renewHold(s.id))throw new MollieError('Je plaats is inmiddels vrijgegeven en het evenement is vol. Neem contact met ons op.',409);
 const {state}=await loadGuest(),e=state.events.find(x=>x.id===s.eventId);
 // Vast kenmerk per poging: dubbel klikken geeft bij Mollie (Idempotency-Key) en hier dezelfde betaling.
 const attempt=rows.length+1,id=`aanmelding-${s.id}-${attempt}`,requestId=`mollie:aanmelding:${s.requestId}:${attempt}`;
 const what=e?`${e.title} ${dayLabel(e.date)}`:'evenement';
 const p=await createMolliePayment(key.key,{amountCents:s.amountCents,description:`Boerderijrecreatie - ${what} - ${s.people} ${s.people===1?'persoon':'personen'}`,redirectUrl,webhookUrl:webhookUrl(),metadata:{paymentId:id,aanmelding:s.id},idempotencyKey:requestId});
 const now=new Date().toISOString();
 await getDb().insert(signupPayments).values({id,requestId,signupId:s.id,amountCents:s.amountCents,status:'open',provider,externalRef:p.id,version:1,created:now,updated:now}).onConflictDoNothing();
 const [row]=await getDb().select().from(signupPayments).where(eq(signupPayments.id,id));
 if(!row||row.externalRef!==p.id)throw new MollieError('De betaling kon niet worden vastgelegd. Probeer het opnieuw.',409);
 if(mapMollieStatus(p.status)){await applyMollie(row,p,key);if((await signupByRequest(s.requestId))?.paymentStatus==='betaald')return {paid:true};throw new MollieError('De betaling is niet gelukt. Probeer het opnieuw.',409)}
 if(!p.checkoutUrl)throw new MollieError('Mollie gaf geen betaalpagina terug. Probeer het opnieuw.');
 return {checkoutUrl:p.checkoutUrl};
}

/** Wat de gast na terugkomst van Mollie te zien krijgt: alleen eigen gegevens, geen kenmerken van Mollie. */
export async function signupReceipt(s:SignupRow){
 const rows=await attemptsOf(s.id),last=rows.sort((a,b)=>b.created.localeCompare(a.created)||b.id.localeCompare(a.id))[0];
 const {state}=await loadGuest(),e=state.events.find(x=>x.id===s.eventId);
 const now=new Date().toISOString(),expired=!!s.holdUntil&&s.holdUntil<=now&&s.paymentStatus!=='betaald';
 return {eventId:s.eventId,title:e?.title??'',date:e?.date??'',from:e?.from??'',to:e?.to??'',name:s.name,people:s.people,amountCents:s.amountCents,
  cancelled:s.status!=='aangemeld',paid:s.paymentStatus==='betaald',holdExpired:expired,
  payment:{available:!!mollieKey(),status:s.paymentStatus==='betaald'?'betaald':last?.status??null}};
}

// ---- Terugbetalen (besluit eigenaar 9 november 2026) ----
/** Betaalt de online betaalde, geannuleerde aanmeldingen van één evenement terug via Mollie. De coördinator drukt daarvoor bewust op
 *  één knop. Per betaling een vaste Idempotency-Key: nogmaals drukken (of een verloren antwoord) betaalt nooit twee keer terug.
 *  Alleen betalingen in de modus van de huidige sleutel (test of live); een betaling uit de andere modus gaat via het Mollie-dashboard.
 *  Call inside withConnectionSettings. */
export async function refundCancelledSignups(eventId:string,by:string){
 const key=mollieKey();if(!key)throw new PaymentsOff();
 const db=getDb(),out={refunded:0,cents:0,problems:[] as string[]};
 const list=(await db.select().from(eventSignups).where(eq(eventSignups.eventId,eventId))).filter(s=>s.status==='geannuleerd'&&s.paymentStatus==='betaald'&&s.paidBy.startsWith('Mollie'));
 for(const s of list){
  const row=(await attemptsOf(s.id)).find(r=>r.status==='betaald');
  if(!row?.externalRef){out.problems.push(`${s.name}: geen Mollie-betaling gevonden; kijk in het Mollie-dashboard`);continue}
  if(row.provider!==providerFor(key.mode)){out.problems.push(`${s.name}: betaald in de ${row.provider==='mollie-live'?'live':'test'}modus; terugbetalen in het Mollie-dashboard`);continue}
  try{
   const r=await createMollieRefund(key.key,{paymentId:row.externalRef,amountCents:row.amountCents,description:'Boerderijrecreatie - evenement gaat niet door',idempotencyKey:'terugbetaling:'+row.id});
   if(refundFailed(r.status)){out.problems.push(`${s.name}: Mollie heeft de terugbetaling niet uitgevoerd (${r.status})`);continue}
   const next=applyPaymentUpdate(asPayment(row),{status:'terugbetaald',externalRef:row.externalRef}),at=new Date().toISOString();
   await db.update(signupPayments).set({status:next.payment.status,version:next.payment.version,updated:at}).where(and(eq(signupPayments.id,row.id),eq(signupPayments.version,row.version)));
   await db.update(eventSignups).set({paymentStatus:'terugbetaald',updated:at,updatedBy:by}).where(eq(eventSignups.id,s.id));
   out.refunded++;out.cents+=row.amountCents;
  }catch(e){out.problems.push(`${s.name}: ${e instanceof Error?e.message:'terugbetalen lukte niet'}`)}
 }
 return out;
}

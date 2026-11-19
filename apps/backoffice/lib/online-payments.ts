// Online betalen van een gastbestelling via Mollie (besluit eigenaar 3 november 2026, keuze E).
// - Eén regel in `payments` per betaalpoging (provider mollie-test of mollie-live, kenmerk tr_…), hooguit MAX_ATTEMPTS.
// - Betaald geldt pas als de backoffice de betaling zelf bij Mollie heeft opgehaald en bedrag, modus en kenmerk kloppen.
// - Na een bevestigde betaling gaat de bestelling van „wacht op betaling” naar „vastgelegd”: dan pas zien keuken, bar
//   of winkel hem. Betaalregel en bestelling worden in één batch bijgewerkt; herhaalde meldingen veranderen niets.
import {inTransaction} from './portable/env';
import {getDb} from '@/db';
import {orders,payments} from '@/db/schema';
import {and,eq,gte,inArray,sql} from 'drizzle-orm';
import {applyPaymentUpdate,orderPaymentStatus,type Payment} from './payments';
import {GUEST_ORDER_STATUS,orderNumber} from './public-orders';
import {recordSale} from './stock-sales';
import type {SaleLine} from './orders';
import {connectionSetting} from './connection-runtime';
import {validBunqKey,bunqMode,createBunqMeTab,getBunqMeTab,cancelBunqMeTab,paymentsSince,BunqError,type BunqClient,type BunqMeTab} from './bunq';
import {validMollieKey,createMolliePayment,getMolliePayment,mapMollieStatus,checkMolliePayment,webhookUrl,findMollieCustomerPayment,MollieError,type MolliePayment} from './mollie';

export const MAX_ATTEMPTS=5;
type OrderRow=typeof orders.$inferSelect;
type PaymentRow=typeof payments.$inferSelect;
type Key={key:string;mode:'test'|'live'};
const providerFor=(mode:'test'|'live')=>'mollie-'+mode;
// Te betalen: het eigen bedrag als de gast dat koos (besluit eigenaar 3 november 2026), anders de normale waarde.
export const amountDue=(o:Pick<OrderRow,'totalCents'|'chosenCents'>)=>o.chosenCents??o.totalCents;
const asPayment=(r:PaymentRow):Payment=>({id:r.id,orderId:r.orderId,method:r.method as Payment['method'],amountCents:r.amountCents,status:r.status as Payment['status'],provider:r.provider,externalRef:r.externalRef,version:r.version});

/** De Mollie-sleutel uit Systeem & koppelingen (of de server); null als betalen niet aan staat. */
export function mollieKey():Key|null{
 const key=(connectionSetting('MOLLIE_API_KEY')||'').trim();
 return validMollieKey(key)?{key,mode:key.startsWith('live_')?'live':'test'}:null;
}

export class PaymentsOff extends MollieError{constructor(){super('Online betalen staat nog niet aan.',503)}}

// ---- Online betalen via Mollie of via een bunq-betaalverzoek (wens eigenaar 10 november 2026: Mollie gaf geen akkoord,
// „kan het ook via een betaalverzoekstructuur?”). Keuze bij Systeem & koppelingen → Mollie: „Online betalen via”.
// bunq geldt voor gastbestellingen: de bestelpagina, de QR op de kassa en de zelfkassa. Evenementen, gezamenlijke rekeningen,
// oogstabonnementen en de Bloeimarkt blijven via Mollie. Uitleg: docs/BETALEN-BUNQ.md.
export function onlineVia():'bunq'|'mollie'|null{
 if((connectionSetting('ONLINE_BETALEN')||'').trim()==='bunq')return validBunqKey((connectionSetting('GUEST_BUNQ_API_KEY')||'').trim())?'bunq':null;
 return mollieKey()?'mollie':null;
}
/** Stand van online betalen voor de schermen: live (echt geld), test of uit. */
export function onlineMode():'live'|'test'|'uit'{const via=onlineVia();return via==='bunq'?(bunqMode()==='live'?'live':'test'):via==='mollie'?mollieKey()!.mode:'uit'}
const bunqProvider=()=>'bunqme-'+(bunqMode()==='live'?'live':'test');
const isOnlineProvider=(p:string)=>p.startsWith('mollie-')||p.startsWith('bunqme-');
const tabIdOf=(row:PaymentRow)=>{const m=/^bunqme:(\d{1,15})$/.exec(row.externalRef||'');return m?Number(m[1]):null};
/** Gasten zien een gewone Nederlandse melding; wat bunq zei, gaat mee als detail (voor de kassa) en naar het logboek. */
export function payError(e:unknown):never{
 if(e instanceof BunqError){console.error('[bunq-betaalverzoek]',e.providerStatus||'',e.message);const m=new MollieError('Online betalen lukt nu even niet. Betaal bij de kassa of probeer het later opnieuw.',e.status>=500?503:502);m.detail=e.message;throw m}
 throw e;
}
export async function bunqMain():Promise<{c:BunqClient;main:number}>{
 try{
  const {bunq,guestAccountId}=await import('./bunq-guest');const c=await bunq(),main=await guestAccountId(c);
  if(!main)throw new MollieError('Online betalen lukt nu even niet. Betaal bij de kassa of probeer het later opnieuw.',503,);
  return {c,main};
 }catch(e){if(e instanceof MollieError){e.detail??='bunq gaf geen actieve rekening terug. Vul bij Koppelingen → bunq de rekening in (GUEST_BUNQ_ACCOUNT_ID).';throw e}payError(e)}
}
/** Verwerkt de stand van één betaalverzoek. Betaald alleen als bunq een betaling van precies dit bedrag bij het verzoek toont, of
 *  (achtervang, als bunq het verzoek nog niet bijwerkte) als er op Main een bijschrijving staat met precies deze omschrijving en dit
 *  bedrag, ná het aanmaken van de poging. Herhaalbaar. */
async function applyBunq(row:PaymentRow,tab:BunqMeTab,c:BunqClient,main:number){
 if(row.status!=='open')return;
 const test=bunqMode()==='live'?0:1;
 let paid=tab.paid.some(p=>p.amountCents===row.amountCents);
 if(!paid&&tab.description){
  const since=new Date(Date.parse(row.created)-120000).toISOString();
  paid=(await paymentsSince(c,main,since,400)).some(p=>p.amountCents===row.amountCents&&p.description.trim()===tab.description.trim());
 }
 if(paid){await settle(row,'betaald',row.externalRef,test);await cancelBunqMeTab(c,main,tab.id);return}
 if(tab.status==='CANCELLED'||tab.status==='EXPIRED')await settle(row,'mislukt',row.externalRef,test);
}
async function refreshBunqRows(rows:PaymentRow[]){
 const open=rows.filter(r=>r.status==='open'&&r.provider.startsWith('bunqme-')&&tabIdOf(r)!==null);if(!open.length)return;
 const {c,main}=await bunqMain();
 for(const row of open){try{await applyBunq(row,await getBunqMeTab(c,main,tabIdOf(row)!),c,main)}catch(e){payError(e)}}
}
/** Werkproces (elke ronde): open betaalverzoeken van de laatste dag nakijken, zodat een bestelling ook in de keuken komt als de
 *  gast na het betalen de pagina sluit. Alleen als online betalen via bunq loopt. */
export async function refreshOpenBunqPayments(){
 if(onlineVia()!=='bunq')return 0;
 const since=new Date(Date.now()-86400000).toISOString();
 const rows=(await getDb().select().from(payments).where(and(eq(payments.status,'open'),gte(payments.created,since)))).filter(r=>r.provider.startsWith('bunqme-'));
 if(rows.length)await refreshBunqRows(rows);
 return rows.length;
}
async function startBunqPayment(order:OrderRow,redirectUrl:string):Promise<{paid:true}|{checkoutUrl:string}>{
 const {c,main}=await bunqMain();
 await refreshBunqRows(await paymentsOf(order.id));
 const fresh=await orderByRequest(order.requestId);if(fresh?.paymentStatus==='betaald')return {paid:true};
 const rows=await paymentsOf(order.id),provider=bunqProvider();
 try{
  // Een verzoek dat nog openstaat, gaat verder op dezelfde link.
  for(const row of rows.filter(r=>r.status==='open'&&r.provider===provider&&tabIdOf(r)!==null)){
   const tab=await getBunqMeTab(c,main,tabIdOf(row)!);
   if(tab.shareUrl&&tab.status!=='CANCELLED'&&tab.status!=='EXPIRED'&&!tab.paid.length)return {checkoutUrl:tab.shareUrl};
  }
  if(rows.length>=MAX_ATTEMPTS)throw new MollieError('Betalen is te vaak geprobeerd voor deze bestelling. Vraag het aan een van ons.',429);
  const attempt=rows.length+1,number=orderNumber(order.id),id=`bunqme-${order.id}-${attempt}`;
  // Omschrijving per poging uniek, zodat een late betaling van een eerdere poging nooit een nieuwe poging betaald maakt.
  const description=`Boer Bart bestelling ${number}${attempt>1?'-'+attempt:''}`;
  const tabId=await createBunqMeTab(c,main,{amountCents:amountDue(order),description,redirectUrl});
  const now=new Date().toISOString();
  await getDb().insert(payments).values({id,requestId:`bunqme:${order.requestId}:${attempt}`,orderId:order.id,method:'online',amountCents:amountDue(order),status:'open',provider,externalRef:'bunqme:'+tabId,version:1,created:now,updated:now}).onConflictDoNothing();
  const [row]=await getDb().select().from(payments).where(eq(payments.id,id));
  // Tegelijk op betalen gedrukt: de andere poging was eerder; ons verzoek sluiten en die van de ander gebruiken.
  const useId=row&&tabIdOf(row)!==null?tabIdOf(row)!:null;
  if(useId===null)throw new MollieError('De betaling kon niet worden vastgelegd. Probeer het opnieuw.',409);
  if(useId!==tabId)await cancelBunqMeTab(c,main,tabId);
  const tab=await getBunqMeTab(c,main,useId);
  if(!tab.shareUrl)throw new MollieError('bunq gaf geen betaallink terug. Probeer het opnieuw.');
  return {checkoutUrl:tab.shareUrl};
 }catch(e){payError(e)}
}

export async function orderByRequest(requestId:string){return (await getDb().select().from(orders).where(eq(orders.requestId,requestId)))[0]??null}
const paymentsOf=(orderId:number)=>getDb().select().from(payments).where(eq(payments.orderId,orderId));

/** Verwerkt de stand bij Mollie voor één betaalregel. Herhaalbaar: dezelfde stand nog eens verandert niets. */
export async function applyMollie(row:PaymentRow,p:MolliePayment,key:Key){
 const wrong=checkMolliePayment(p,{paymentId:row.id,amountCents:row.amountCents,mode:key.mode});
 if(wrong||p.id!==row.externalRef)throw new MollieError(wrong||'Deze betaling hoort bij een andere bestelling.',409);
 const status=mapMollieStatus(p.status);if(status&&row.status==='open')await settle(row,status,p.id,key.mode==='live'?0:1);
}

/** Verwerkt een betaalde of mislukte betaalregel en geeft de bestelling vrij als alles betaald is (Mollie én contant).
 *  Betaalregel en bestelling in één batch; daarna van de voorraad af. Herhaalbaar: dezelfde stand nog eens verandert niets. */
async function settle(row:PaymentRow,status:'betaald'|'mislukt'|'terugbetaald',externalRef:string|null,test:number){
 const next=applyPaymentUpdate(asPayment(row),{status,externalRef});
 if(next.result==='duplicate')return;
 const db=getDb(),now=new Date().toISOString();
 const [order]=await db.select().from(orders).where(eq(orders.id,row.orderId));if(!order)return;
 const all=(await paymentsOf(row.orderId)).map(r=>r.id===row.id?{...r,status:next.payment.status}:r);
 const state=orderPaymentStatus(amountDue(order),all.map(r=>({amountCents:r.amountCents,status:r.status as Payment['status']})));
 const release=state==='betaald'&&order.status===GUEST_ORDER_STATUS;
 await db.batch([
  db.update(payments).set({status:next.payment.status,version:next.payment.version,updated:now}).where(and(eq(payments.id,row.id),eq(payments.version,row.version))),
  db.update(orders).set({paymentStatus:state,...(release?{status:'vastgelegd',test}:{})}).where(eq(orders.id,order.id)),
 ]);
 // Online: pas na een bevestigde betaling van de voorraad af (besluit eigenaar 3 november 2026). Herhaalbaar per bestelnummer.
 // Een oogstaandeel is vooruitbetaling voor een periode, geen losse voorraadportie.
 if(release&&order.salesContext!=='abonnement')await recordSale(orderNumber(order.id),(JSON.parse(order.data) as {lines:SaleLine[]}).lines);
}

/** Haalt open betalingen van deze bestelling opnieuw op bij Mollie (bij terugkomst op de bestelpagina). */
export async function refreshOrder(order:OrderRow){
 const all=await paymentsOf(order.id);
 if(all.some(r=>r.status==='open'&&r.provider.startsWith('bunqme-')))await refreshBunqRows(all);
 const key=mollieKey();if(!key)return;
 for(const row of await paymentsOf(order.id))if(row.status==='open'&&row.provider===providerFor(key.mode)&&row.externalRef)await applyMollie(row,await getMolliePayment(key.key,row.externalRef),key);
}

/** Melding van Mollie: alleen het kenmerk wordt gebruikt; de stand komt altijd van Mollie zelf. */
export async function handleWebhook(id:string){
 const key=mollieKey();if(!key)throw new PaymentsOff();
 const [row]=await getDb().select().from(payments).where(and(eq(payments.provider,providerFor(key.mode)),eq(payments.externalRef,id)));
 // Geen bestelling? Dan misschien een aanmelding voor een betaald evenement (lib/signup-payments.ts).
 // Geen bestelling? Dan misschien een deel van een gezamenlijke rekening (lib/group-bill.ts).
 if(!row){const {handleSignupWebhook}=await import('./signup-payments');if(await handleSignupWebhook(id,key))return true;const {handleShareWebhook}=await import('./group-bill');return handleShareWebhook(id,key)}
 await applyMollie(row,await getMolliePayment(key.key,id),key);
 return true;
}

/** Start (of hervat) het betalen. Geeft de betaalpagina van Mollie, of paid als er al betaald is. */
export async function startPayment(order:OrderRow,redirectUrl:string,opts:{register?:boolean}={}):Promise<{paid:true}|{checkoutUrl:string}>{
 const via=onlineVia();if(!via)throw new PaymentsOff();
 if(order.groupCodeId)throw new MollieError('Deze bestelling staat op de groepsrekening: je hoeft niets te betalen.',409);
 if(amountDue(order)<=0)throw new MollieError('Er is niets af te rekenen voor deze bestelling.',409);
 // Kassa: de bestelling is al vastgelegd (gaat direct naar de werkplek) en wordt daarna afgerekend.
 if(order.paymentStatus==='betaald'||(order.status!==GUEST_ORDER_STATUS&&!(opts.register&&order.status==='vastgelegd')))return {paid:true};
 // Een oogstabonnement loopt via een Mollie-incasso; dat kan niet met een bunq-betaalverzoek.
 if(via==='bunq'){if(order.salesContext==='abonnement')throw new MollieError('Een abonnement afsluiten kan nu niet online. Vraag het aan een van ons.',409);return startBunqPayment(order,redirectUrl)}
 const key=mollieKey()!;
 await refreshOrder(order);
 const fresh=await orderByRequest(order.requestId);if(fresh?.paymentStatus==='betaald')return {paid:true};
 const rows=await paymentsOf(order.id),provider=providerFor(key.mode);
 // Een poging die nog open staat, gaat verder op dezelfde betaalpagina.
 for(const row of rows.filter(r=>r.status==='open'&&r.provider===provider&&r.externalRef)){
  const p=await getMolliePayment(key.key,row.externalRef!);
  if(p.status==='open'&&p.checkoutUrl)return {checkoutUrl:p.checkoutUrl};
  if(p.status==='pending'||p.status==='authorized')throw new MollieError('Je betaling wordt nog verwerkt. Wacht even en kijk dan opnieuw.',409);
 }
 if(rows.length>=MAX_ATTEMPTS)throw new MollieError('Betalen is te vaak geprobeerd voor deze bestelling. Vraag het aan een van ons.',429);
 // Vast kenmerk per poging: dubbel klikken geeft bij Mollie (Idempotency-Key) en hier dezelfde betaling.
 const attempt=rows.length+1,number=orderNumber(order.id);
 const id=`mollie-${order.id}-${attempt}`,requestId=`mollie:${order.requestId}:${attempt}`;
 const p=await createMolliePayment(key.key,{amountCents:amountDue(order),description:`Boer Bart bestelling ${number}`,redirectUrl,webhookUrl:webhookUrl(),metadata:{paymentId:id,order:number},idempotencyKey:requestId});
 const now=new Date().toISOString();
 await getDb().insert(payments).values({id,requestId,orderId:order.id,method:'online',amountCents:amountDue(order),status:'open',provider,externalRef:p.id,version:1,created:now,updated:now}).onConflictDoNothing();
 const [row]=await getDb().select().from(payments).where(eq(payments.id,id));
 if(!row||row.externalRef!==p.id)throw new MollieError('De betaling kon niet worden vastgelegd. Probeer het opnieuw.',409);
 if(mapMollieStatus(p.status)){await applyMollie(row,p,key);if((await orderByRequest(order.requestId))?.paymentStatus==='betaald')return {paid:true};throw new MollieError('De betaling is niet gelukt. Probeer het opnieuw.',409)}
 if(!p.checkoutUrl)throw new MollieError('Mollie gaf geen betaalpagina terug. Probeer het opnieuw.');
 return {checkoutUrl:p.checkoutUrl};
}

/** Wat de gast over het betalen te zien krijgt. */
export async function paymentState(order:OrderRow){
 const rows=await paymentsOf(order.id),last=rows.sort((a,b)=>b.created.localeCompare(a.created)||b.id.localeCompare(a.id))[0];
 return {available:!!onlineVia(),status:order.paymentStatus==='betaald'?'betaald':last?.status??null};
}

// ---- Contant bij een medewerker (zelfservicekassa in de winkel, besluit eigenaar 4 november 2026) ----
// De gast kiest „contant”; er komt een open betaalregel (methode contant, provider balie). Pas als een medewerker op het
// werkplekscherm Winkel „Contant ontvangen” tikt, is de bestelling betaald en gaat hij van de voorraad af.
const CASH_PROVIDER='balie';
export async function requestCash(order:OrderRow){
 if(order.groupCodeId)throw new MollieError('Deze bestelling staat op de groepsrekening: je hoeft niets te betalen.',409);
 if(amountDue(order)<=0)throw new MollieError('Er is niets af te rekenen voor deze bestelling.',409);
 if(order.paymentStatus==='betaald'||order.status!==GUEST_ORDER_STATUS)return {paid:true as const};
 const id=`contant-${order.id}`,now=new Date().toISOString();
 await getDb().insert(payments).values({id,requestId:`contant:${order.requestId}`,orderId:order.id,method:'contant',amountCents:amountDue(order),status:'open',provider:CASH_PROVIDER,externalRef:null,version:1,created:now,updated:now}).onConflictDoNothing();
 return {cash:true as const,number:orderNumber(order.id),amountCents:amountDue(order)};
}
/** Bestellingen die op contante betaling bij een medewerker wachten (voor het werkplekscherm Winkel). */
export async function cashWaiting(){
 const db=getDb();
 const rows=await db.select({order:orders,payment:payments}).from(payments).innerJoin(orders,eq(orders.id,payments.orderId)).where(and(eq(payments.provider,CASH_PROVIDER),eq(payments.status,'open'),eq(orders.status,GUEST_ORDER_STATUS)));
 return rows.map(({order,payment})=>({orderId:order.id,number:orderNumber(order.id),created:order.created,amountCents:payment.amountCents,
  lines:(JSON.parse(order.data) as {lines:SaleLine[]}).lines.map(l=>({name:l.name,quantity:l.quantity}))}));
}
/** Een medewerker bevestigt dat het geld ontvangen is. */
export async function confirmCash(orderId:number,who:string){
 const [row]=await getDb().select().from(payments).where(and(eq(payments.orderId,orderId),eq(payments.provider,CASH_PROVIDER),eq(payments.status,'open')));
 if(!row)throw new MollieError('Deze bestelling wacht niet (meer) op een contante betaling.',409);
 const [order]=await getDb().select().from(orders).where(eq(orders.id,orderId));
 await settle(row,'betaald',`${CASH_PROVIDER}:${who.slice(0,60)}:${orderId}`,order?.test??1);
}


// ---- Afrekenen aan de medewerkerskassa (wens eigenaar 4 november 2026: contant, pin en QR) ----
// De kassa legt de bestelling vast (direct naar de werkplek en van de voorraad af) en rekent daarna af. Contant en pin
// bevestigt de medewerker zelf: er komt één betaalregel die meteen betaald is (provider balie). Pin gaat voorlopig via
// de losse pinautomaat; de medewerker tikt „Pin gelukt”. QR loopt via Mollie (startPayment met register).
export type RegisterMethod='contant'|'pin';
const REGISTER_MODES=['yte','zelfservice','winkel'];
export async function payAtRegister(order:OrderRow,method:RegisterMethod,who:string){
 if(!REGISTER_MODES.includes(order.mode)||order.status!=='vastgelegd')throw new MollieError('Deze bestelling kan niet aan de kassa worden afgerekend.',409);
 if(order.paymentStatus==='betaald')return;
 if(amountDue(order)<=0)throw new MollieError('Er is niets af te rekenen voor deze bestelling.',409);
 const rows=await paymentsOf(order.id);
 // Een QR-betaling die al loopt eerst bij Mollie nakijken, zodat er niet twee keer betaald wordt.
 if(rows.some(r=>r.status==='open'&&isOnlineProvider(r.provider))){try{await refreshOrder(order)}catch{}
  if((await orderByRequest(order.requestId))?.paymentStatus==='betaald')return;}
 const id=`kassa-${order.id}-${method}`,now=new Date().toISOString();
 await getDb().insert(payments).values({id,requestId:`kassa:${order.requestId}:${method}`,orderId:order.id,method,amountCents:amountDue(order),status:'open',provider:CASH_PROVIDER,externalRef:null,version:1,created:now,updated:now}).onConflictDoNothing();
 const [row]=await getDb().select().from(payments).where(eq(payments.id,id));
 if(!row)throw new MollieError('De betaling kon niet worden vastgelegd. Probeer het opnieuw.',409);
 if(row.status==='open')await settle(row,'betaald',`${CASH_PROVIDER}:${who.slice(0,60)}:kassa-${order.id}-${method}`,order.test);
}
/** Stand van het afrekenen aan de kassa (haalt een lopende QR-betaling opnieuw op bij Mollie). */
export async function registerState(order:OrderRow){
 try{await refreshOrder(order)}catch{}
 const fresh=(await orderByRequest(order.requestId))??order;
 return {paymentStatus:fresh.paymentStatus,amountCents:amountDue(fresh),qr:!!onlineVia()};
}

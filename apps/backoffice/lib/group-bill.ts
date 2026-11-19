// Gezamenlijke rekening: database en betalen (wens eigenaar 5 november 2026). Regels in lib/group-bill-core.ts.
// - Een rekening is een groepscode (group_codes) met origin 'gast': de rekeninghouder opent hem zelf bij het bestellen.
//   Zijn beheerlink (token) maakt de website; de backoffice bewaart alleen de sha-256 ervan.
// - Afrekenen: de rekening gaat dicht (status gesloten) en wordt in delen gezet (group_bill_shares). Elk deel wordt betaald
//   met iDEAL (Mollie, zelfde controles als bij bestellingen: betaald geldt pas als Mollie het zelf zegt), contant of pin.
// - Alle delen betaald: rekening voldaan (paid_at), alle bestellingen erop betaald, en de factuur krijgt „Voldaan”.
import {createHash,randomUUID} from 'node:crypto';
import {getDb} from '@/db';
import {groupCodes,groupBillShares,orders,orderLines} from '@/db/schema';
import {and,eq,ne,sql,inArray,gte} from 'drizzle-orm';
import {env,inTransaction} from '@/lib/portable/env';
import {mollieKey,MAX_ATTEMPTS,PaymentsOff,onlineVia,bunqMain,payError} from './online-payments';
import {bunqMode,createBunqMeTab,getBunqMeTab,cancelBunqMeTab,paymentsSince,type BunqClient,type BunqMeTab} from './bunq';
import {createMolliePayment,getMolliePayment,mapMollieStatus,checkMolliePayment,webhookUrl,MollieError,type MolliePayment} from './mollie';
import {newGroupCode,allocate,valuation,checkChosen} from './order-options';
import {getSetting} from './order-options-store';
import type {SaleLine} from './orders';
import {amsterdamToday} from './order-options-store';
import {fillState,splitAmounts,invoiceData,invoicePayment,checkNewLimit,type GuestContact,type Seller} from './group-bill-core';
import {connectionSetting} from './connection-runtime';
import {orderPageUrl} from './public-orders';
import {loadGuest} from './guest-store';
import {companyProfile,invoiceName} from './company';

type Group=typeof groupCodes.$inferSelect;
type Share=typeof groupBillShares.$inferSelect;
type Key=NonNullable<ReturnType<typeof mollieKey>>;
export class BillError extends Error{status:number;constructor(m:string,status=409){super(m);this.status=status}}
export const HOLDER_TOKEN=/^[A-Za-z0-9_-]{32,64}$/;
export const SHARE_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const hashToken=(t:string)=>createHash('sha256').update(t).digest('hex');
const providerFor=(mode:'test'|'live')=>'mollie-'+mode;
const now=()=>new Date().toISOString();
/** Eén wijziging tegelijk per rekening (#189): verdelen en een deel afrekenen kunnen elkaar niet kruisen. Alleen binnen inTransaction. */
const lockGroup=(id:string)=>getDb().execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'groep:'+id}))`);

export async function groupById(id:string){return (await getDb().select().from(groupCodes).where(eq(groupCodes.id,id)))[0]??null}
export async function billByToken(token:string){
 if(!HOLDER_TOKEN.test(token))return null;
 return (await getDb().select().from(groupCodes).where(and(eq(groupCodes.holderTokenHash,hashToken(token)),eq(groupCodes.origin,'gast'))))[0]??null;
}
export async function spentOn(id:string){
 return Number((await env.DB.prepare(`SELECT COALESCE(SUM(total_cents),0) AS n FROM orders WHERE group_code_id=?`).bind(id).first() as {n:number}).n);
}
const sharesOf=(id:string)=>getDb().select().from(groupBillShares).where(and(eq(groupBillShares.groupCodeId,id),ne(groupBillShares.status,'vervallen')));

/** Geeft de rekening een doorlopend factuurnummer als hij er nog geen heeft (uniek; bij een gelijktijdige poging opnieuw). */
export async function ensureInvoiceNumber(id:string){
 for(let i=0;i<5;i++){
  const g=await groupById(id);if(!g||g.invoiceNumber)return g?.invoiceNumber??null;
  try{await env.DB.prepare(`UPDATE group_codes SET invoice_number=(SELECT COALESCE(MAX(invoice_number),0)+1 FROM group_codes) WHERE id=? AND invoice_number IS NULL`).bind(id).run()}catch{}
 }
 return (await groupById(id))?.invoiceNumber??null;
}

/** Opent een rekening voor een gast (de rekeninghouder). Herhaalbaar met dezelfde id (bijvoorbeeld na een verbroken verbinding). */
export async function openBill(id:string,b:{name:string;limitCents:number;holder:GuestContact;token:string;kind?:'groep'|'eigen';warnCents?:number|null}){
 const existing=await groupById(id);
 if(existing){if(existing.holderTokenHash!==hashToken(b.token))throw new BillError('Deze rekening bestaat al. Herlaad de pagina.');return existing}
 const today=amsterdamToday(),t=now();
 for(let attempt=0;attempt<5;attempt++){
  const code=newGroupCode();
  const r=await env.DB.prepare(`INSERT INTO group_codes(id, code, name, host, budget_cents, valid_from, valid_until, status, version, created, created_by, updated, origin, holder_name, holder_email, holder_phone, holder_token_hash, paid_at, kind, warn_cents) VALUES(?,?,?,?,?,?,?,'actief',1,?,?,?,'gast',?,?,?,?,'',?,?) ON CONFLICT DO NOTHING`)
   .bind(id,code,b.name,b.holder.name,b.limitCents,today,today,t,'gast',t,b.holder.name,b.holder.email,b.holder.phone,hashToken(b.token),b.kind??'groep',b.kind==='eigen'?b.warnCents??null:null).run();
  if(r.meta.changes===1)break;
  if(await groupById(id))break;
 }
 const g=await groupById(id);if(!g)throw new BillError('Er kon geen rekening worden geopend. Probeer het opnieuw.',503);
 await ensureInvoiceNumber(id);
 return (await groupById(id))!;
}

/** De rekeninghouder verhoogt (of verlaagt) het maximum. Niet lager dan wat er al op staat. */
export async function changeLimit(g:Group,limitCents:unknown){
 if(g.status!=='actief'||g.paidAt)throw new BillError('Deze rekening wordt al afgerekend; het maximum kan niet meer veranderen.');
 const next=checkNewLimit(limitCents,await spentOn(g.id));
 const r=await getDb().update(groupCodes).set({budgetCents:next,version:g.version+1,updated:now()}).where(and(eq(groupCodes.id,g.id),eq(groupCodes.version,g.version))).returning({id:groupCodes.id});
 if(!r.length)throw new BillError('De rekening is net gewijzigd. Probeer het opnieuw.');
}

/** Eigen rekening: de gast zet zijn eigen waarschuwingsgrens (of haalt hem weg). Blokkeert niets. */
export async function changeWarn(g:Group,warnCents:unknown){
 if(g.kind!=='eigen')throw new BillError('Een grens voor een waarschuwing hoort bij een eigen rekening.',400);
 if(warnCents!==null&&(!Number.isSafeInteger(warnCents)||(warnCents as number)<100||(warnCents as number)>g.budgetCents))throw new BillError('Kies een grens tussen € 1,00 en € 500,00, of laat hem leeg.',400);
 const r=await getDb().update(groupCodes).set({warnCents:warnCents as number|null,version:g.version+1,updated:now()}).where(and(eq(groupCodes.id,g.id),eq(groupCodes.version,g.version))).returning({id:groupCodes.id});
 if(!r.length)throw new BillError('De rekening is net gewijzigd. Probeer het opnieuw.');
}

/** Start het afrekenen: de rekening gaat dicht voor nieuwe bestellingen en wordt in `count` gelijke delen gezet.
 *  Opnieuw verdelen kan zolang er nog geen deel betaald is of bij Mollie in behandeling. */
/** payers: meebetalen (wens eigenaar 5 november 2026): één deel per persoon, de rekeninghouder eerst. Zonder: gelijke delen
 *  zonder naam (kassa). */
export async function startSettlement(g:Group,count:number,payers?:{email:string;name:string}[]){
 if(payers)count=payers.length;
 if(g.paidAt)return sharesOf(g.id);
 const total=await spentOn(g.id);
 if(total<=0){await getDb().update(groupCodes).set({status:'gesloten',paidAt:now(),version:g.version+1,updated:now()}).where(eq(groupCodes.id,g.id));return []}
 const amounts=splitAmounts(total,count);
 const current=await sharesOf(g.id);
 const same=(x:Share[])=>x.length===count&&x.reduce((s,y)=>s+y.amountCents,0)===total&&(payers?payers.every((p,i)=>x.find(y=>y.position===i+1)?.payerEmail===p.email):x.every(y=>!y.payerEmail));
 if(same(current))return current;
 const paidMsg='Er is al een deel betaald. Betaal de overige delen zoals ze zijn verdeeld.';
 if(current.some(s=>s.status==='betaald'))throw new BillError(paidMsg);
 // Een deel met een iDEAL-poging: eerst bij Mollie nakijken. Is die al betaald (de melding is er nog niet), dan wordt
 // het deel nu afgerekend en nooit vervangen; loopt hij nog, dan wachten (#189).
 for(const s of current)if(s.status==='open'&&s.externalRef){
  try{await refreshShare(s)}catch{}
  const fresh=(await shareById(s.id))!;
  if(fresh.status==='betaald')throw new BillError(paidMsg);
  if(fresh.externalRef&&await stillAtMollie(fresh))throw new BillError('Er loopt nog een betaling van een deel. Wacht even en probeer het opnieuw.');
 }
 const checked=await sharesOf(g.id);
 const t=now(),db=getDb();
 await inTransaction(async()=>{
  await lockGroup(g.id);
  // Onder het slot opnieuw kijken: is er intussen iets betaald of gewijzigd, dan niet verdelen.
  const latest=await sharesOf(g.id),before=new Map(checked.map(c=>[c.id,c]));
  if(latest.some(s=>s.status==='betaald'))throw new BillError(paidMsg);
  if(latest.length!==checked.length||latest.some(s=>before.get(s.id)?.version!==s.version||before.get(s.id)?.status!==s.status||before.get(s.id)?.externalRef!==s.externalRef))
   throw new BillError('De rekening is net gewijzigd. Probeer het opnieuw.');
  await db.update(groupCodes).set({status:'gesloten',updated:t}).where(eq(groupCodes.id,g.id));
  await db.update(groupBillShares).set({status:'vervallen',updated:t}).where(and(eq(groupBillShares.groupCodeId,g.id),eq(groupBillShares.status,'open')));
  await db.insert(groupBillShares).values(amounts.map((a,i)=>({id:randomUUID(),groupCodeId:g.id,position:i+1,count,amountCents:a,status:'open',payerEmail:payers?.[i]?.email??'',payerName:payers?.[i]?.name??'',created:t,updated:t})));
 });
 await ensureInvoiceNumber(g.id);
 return sharesOf(g.id);
}
async function stillAtMollie(s:Share){
 // Betaalverzoek van bunq: loopt nog zolang het verzoek niet gesloten of verlopen is (betaald is dan al verwerkt door refreshShare).
 if(s.provider.startsWith('bunqme-')&&shareTab(s)!==null){try{const {c,main}=await bunqMain();const tab=await getBunqMeTab(c,main,shareTab(s)!);return tab.status!=='CANCELLED'&&tab.status!=='EXPIRED'}catch{return true}}
 const key=mollieKey();if(!key||s.provider!==providerFor(key.mode)||!s.externalRef)return false;
 // Ook 'paid': betaald bij Mollie maar nog niet verwerkt. Zo'n deel mag nooit vervallen of nog eens worden afgerekend.
 try{const p=await getMolliePayment(key.key,s.externalRef);return ['open','pending','authorized','paid'].includes(p.status)}catch{return true}
}

/** Zet een deel op betaald (of een iDEAL-poging op mislukt) en sluit de rekening af als alles betaald is. Herhaalbaar. */
async function settleShare(s:Share,status:'betaald'|'mislukt',method:string,by:string,ref:string|null){
 if(s.status!=='open')return;
 const t=now();
 const done=await inTransaction(async()=>{await lockGroup(s.groupCodeId);return getDb().update(groupBillShares).set(status==='betaald'?{status,method,paidBy:by.slice(0,80),paidAt:t,version:s.version+1,updated:t}:{externalRef:null,provider:'',paidCents:null,version:s.version+1,updated:t})
  .where(and(eq(groupBillShares.id,s.id),eq(groupBillShares.version,s.version),eq(groupBillShares.status,'open'),...(ref?[eq(groupBillShares.externalRef,ref)]:[]))).returning({id:groupBillShares.id})});
 if(done.length&&status==='betaald')await finishIfPaid(s.groupCodeId);
}
async function finishIfPaid(id:string){
 const shares=await sharesOf(id);
 if(!shares.length||shares.some(s=>s.status!=='betaald'))return;
 const t=now(),db=getDb();
 await db.batch([
  db.update(groupCodes).set({paidAt:t,status:'gesloten',updated:t}).where(and(eq(groupCodes.id,id),eq(groupCodes.paidAt,''))),
  db.update(orders).set({paymentStatus:'betaald'}).where(eq(orders.groupCodeId,id)),
 ]);
 await allocatePaid(id,shares.reduce((t,x)=>t+(x.paidCents??x.amountCents),0));
 await ensureInvoiceNumber(id);
 await queueBillMail(id,'voldaan');
}

/** Meebetalen met „Jou wat goed fielt”: wijkt wat er echt betaald is af van het totaal, dan gaat dat bedrag naar verhouding
 *  over de bestellingen op de rekening, met de btw daarover (dezelfde omzetregel als een eigen bedrag bij bestellen). */
async function allocatePaid(id:string,paid:number){
 const db=getDb(),os=await db.select({id:orders.id,totalCents:orders.totalCents,data:orders.data}).from(orders).where(eq(orders.groupCodeId,id)).orderBy(orders.id);
 const total=os.reduce((t,o)=>t+o.totalCents,0);if(!os.length||paid===total)return;
 const per=allocate(os.map(o=>o.totalCents),paid);
 for(const [i,o] of os.entries()){
  const lines=(JSON.parse(o.data) as {lines:SaleLine[]}).lines,v=valuation(lines,per[i]);
  await db.batch([
   db.update(orders).set({chosenCents:v.chosenCents,differenceCents:v.differenceCents,chosenVat9Cents:v.vat9Cents,chosenVat21Cents:v.vat21Cents}).where(eq(orders.id,o.id)),
   ...v.lines.map((l,pos)=>db.update(orderLines).set({paidCents:l.paidCents,paidVatCents:l.paidVatCents}).where(and(eq(orderLines.orderId,o.id),eq(orderLines.position,pos)))),
  ]);
 }
}

// ---- iDEAL per deel (Mollie)
async function applyShareMollie(s:Share,p:MolliePayment,key:Key){
 const wrong=checkMolliePayment(p,{paymentId:s.id+':'+s.attempts,amountCents:s.paidCents??s.amountCents,mode:key.mode});
 if(wrong||p.id!==s.externalRef)throw new MollieError(wrong?wrong.replace('bestelling','rekening'):'Deze betaling hoort bij een ander deel.',409);
 const status=mapMollieStatus(p.status);if(!status)return;
 await settleShare(s,status,'online','iDEAL',p.id);
}
export async function shareById(id:string){return SHARE_ID.test(id)?(await getDb().select().from(groupBillShares).where(eq(groupBillShares.id,id)))[0]??null:null}
// ---- Betaalverzoek van bunq per deel (wens eigenaar 11 november 2026: eigen rekening na afloop afrekenen; Mollie gaf geen akkoord).
// Zelfde regels als bij bestellingen (lib/online-payments.ts): betaald alleen als bunq een betaling van precies dit bedrag bij het
// verzoek toont, of (achtervang) als er op Main een bijschrijving met precies deze omschrijving en dit bedrag staat.
const bunqShareProvider=()=>'bunqme-'+(bunqMode()==='live'?'live':'test');
const shareTab=(s:Share)=>{const m=/^bunqme:(\d{1,15})$/.exec(s.externalRef||'');return m?Number(m[1]):null};
async function applyShareBunq(s:Share,tab:BunqMeTab,c:BunqClient,main:number){
 if(s.status!=='open')return;
 const due=s.paidCents??s.amountCents;
 let paid=tab.paid.some(p=>p.amountCents===due);
 if(!paid&&tab.description){const since=new Date(Date.parse(s.updated)-120000).toISOString();paid=(await paymentsSince(c,main,since,400)).some(p=>p.amountCents===due&&p.description.trim()===tab.description.trim())}
 if(paid){await settleShare(s,'betaald','bunq','Betaalverzoek (bunq)',s.externalRef);await cancelBunqMeTab(c,main,tab.id);return}
 if(tab.status==='CANCELLED'||tab.status==='EXPIRED')await settleShare(s,'mislukt','bunq','',s.externalRef);
}
async function payShareBunq(s:Share,redirectUrl:string,amount:number):Promise<{paid:true}|{checkoutUrl:string}>{
 const {c,main}=await bunqMain();
 try{
  if(s.externalRef&&s.provider.startsWith('bunqme-')&&shareTab(s)!==null){
   const tab=await getBunqMeTab(c,main,shareTab(s)!);await applyShareBunq(s,tab,c,main);
   const fresh=(await shareById(s.id))!;if(fresh.status==='betaald')return {paid:true};
   if(fresh.externalRef===s.externalRef&&tab.shareUrl&&tab.status!=='CANCELLED'&&tab.status!=='EXPIRED')return {checkoutUrl:tab.shareUrl};
   s=fresh;
  }
  if(s.attempts>=MAX_ATTEMPTS)throw new MollieError('Betalen is te vaak geprobeerd voor dit deel. Vraag het aan een van ons.',429);
  const g=(await groupById(s.groupCodeId))!,attempt=s.attempts+1;
  const description=`Boer Bart rekening ${g.code}${s.count>1?' deel '+s.position:''}${attempt>1?'-'+attempt:''}`;
  const tabId=await createBunqMeTab(c,main,{amountCents:amount,description,redirectUrl});
  const saved=await getDb().update(groupBillShares).set({provider:bunqShareProvider(),externalRef:'bunqme:'+tabId,attempts:attempt,paidCents:amount===s.amountCents?null:amount,version:s.version+1,updated:now()})
   .where(and(eq(groupBillShares.id,s.id),eq(groupBillShares.version,s.version),eq(groupBillShares.status,'open'))).returning();
  if(!saved.length){await cancelBunqMeTab(c,main,tabId);throw new MollieError('Dit deel is net gewijzigd. Probeer het opnieuw.',409)}
  const tab=await getBunqMeTab(c,main,tabId);if(!tab.shareUrl)throw new MollieError('bunq gaf geen betaallink terug. Probeer het opnieuw.');
  return {checkoutUrl:tab.shareUrl};
 }catch(e){if(e instanceof MollieError||e instanceof BillError)throw e;payError(e)}
}
/** Werkproces: open betaalverzoeken van delen (laatste 2 dagen) nakijken, zodat een rekening ook voldaan wordt als de gast de pagina sloot. */
export async function refreshOpenBunqShares(){
 if(onlineVia()!=='bunq')return 0;
 const since=new Date(Date.now()-2*86400000).toISOString();
 const rows=(await getDb().select().from(groupBillShares).where(and(eq(groupBillShares.status,'open'),gte(groupBillShares.updated,since)))).filter(s=>s.provider.startsWith('bunqme-')&&shareTab(s)!==null);
 if(!rows.length)return 0;
 const {c,main}=await bunqMain();
 for(const s of rows){try{await applyShareBunq(s,await getBunqMeTab(c,main,shareTab(s)!),c,main)}catch(e){console.error('[rekening-betaalverzoek]',e instanceof Error?e.message:e)}}
 return rows.length;
}
export async function refreshShare(s:Share){
 if(s.status==='open'&&s.provider.startsWith('bunqme-')&&shareTab(s)!==null){const {c,main}=await bunqMain();try{await applyShareBunq(s,await getBunqMeTab(c,main,shareTab(s)!),c,main)}catch(e){payError(e)}return}
 const key=mollieKey();if(!key||s.status!=='open'||!s.externalRef||s.provider!==providerFor(key.mode))return;
 await applyShareMollie(s,await getMolliePayment(key.key,s.externalRef),key);
}
/** Melding van Mollie voor een deel van een rekening. false = geen deel met dit kenmerk. */
export async function handleShareWebhook(id:string,key:Key){
 const [s]=await getDb().select().from(groupBillShares).where(and(eq(groupBillShares.provider,providerFor(key.mode)),eq(groupBillShares.externalRef,id)));
 if(!s)return false;
 await applyShareMollie(s,await getMolliePayment(key.key,id),key);
 return true;
}
/** Start (of hervat) iDEAL voor één deel. Geeft de betaalpagina van Mollie, of paid als het deel al betaald is. */
/** chosen: „Jou wat goed fielt” voor dit deel (alleen bij meebetalen, binnen de grenzen van de bestelopties); null = het
 *  gedeelde bedrag. Een lopende iDEAL-poging gaat door met het bedrag dat toen gekozen is. Nul: afgerekend zonder betaling. */
export async function payShareOnline(s:Share,redirectUrl:string,chosen:number|null=null):Promise<{paid:true}|{checkoutUrl:string}>{
 const via=onlineVia(),key=mollieKey();if(!via)throw new PaymentsOff();
 if(s.status==='betaald')return {paid:true};
 if(via==='bunq'){
  if(s.status!=='open')throw new BillError('Dit betaalverzoek is vervangen door een nieuwe verdeling. Vraag de rekeninghouder om de nieuwe link.');
  // Een lopend verzoek gaat door met het bedrag dat toen gekozen is.
  let amount=s.paidCents??s.amountCents;
  if(!(s.externalRef&&s.provider.startsWith('bunqme-'))&&chosen!==null&&chosen!==s.amountCents){
   if(!s.payerEmail)throw new BillError('Bij dit deel betaal je het vaste bedrag.');
   try{amount=checkChosen(chosen,s.amountCents,await getSetting('website'))!}catch(e){throw new BillError((e as Error).message,400)}
   if(amount===0){const r=await getDb().update(groupBillShares).set({paidCents:0,version:s.version+1,updated:now()}).where(and(eq(groupBillShares.id,s.id),eq(groupBillShares.version,s.version),eq(groupBillShares.status,'open'))).returning();
    if(r.length)await settleShare(r[0],'betaald','nul','zelf gekozen: € 0',null);return {paid:true}}
  }
  return payShareBunq(s,redirectUrl,amount);
 }
 if(!key)throw new PaymentsOff();
 if(s.status!=='open')throw new BillError('Dit betaalverzoek is vervangen door een nieuwe verdeling. Vraag de rekeninghouder om de nieuwe link.');
 if(s.externalRef&&s.provider===providerFor(key.mode)){
  const p=await getMolliePayment(key.key,s.externalRef);
  await applyShareMollie(s,p,key);
  const fresh=(await shareById(s.id))!;
  if(fresh.status==='betaald')return {paid:true};
  if(p.status==='open'&&p.checkoutUrl&&fresh.externalRef===p.id)return {checkoutUrl:p.checkoutUrl};
  if(p.status==='pending'||p.status==='authorized')throw new MollieError('Je betaling wordt nog verwerkt. Wacht even en kijk dan opnieuw.',409);
  s=fresh;
 }
 if(s.attempts>=MAX_ATTEMPTS)throw new MollieError('Betalen is te vaak geprobeerd voor dit deel. Vraag het aan een van ons.',429);
 let amount=s.amountCents;
 if(chosen!==null&&chosen!==s.amountCents){
  if(!s.payerEmail)throw new BillError('Bij dit deel betaal je het vaste bedrag.');
  try{amount=checkChosen(chosen,s.amountCents,await getSetting('website'))!}catch(e){throw new BillError((e as Error).message,400)}
  if(amount===0){const r=await getDb().update(groupBillShares).set({paidCents:0,version:s.version+1,updated:now()}).where(and(eq(groupBillShares.id,s.id),eq(groupBillShares.version,s.version),eq(groupBillShares.status,'open'))).returning();
   if(r.length)await settleShare(r[0],'betaald','nul','zelf gekozen: € 0',null);return {paid:true}}
 }
 const g=(await groupById(s.groupCodeId))!,attempt=s.attempts+1;
 const p=await createMolliePayment(key.key,{amountCents:amount,description:`Boer Bart rekening ${g.name}${s.count>1?` - deel ${s.position} van ${s.count}`:''}`,redirectUrl,webhookUrl:webhookUrl(),
  metadata:{paymentId:s.id+':'+attempt,rekening:g.code},idempotencyKey:`rekening:${s.id}:${attempt}`});
 const saved=await getDb().update(groupBillShares).set({provider:providerFor(key.mode),externalRef:p.id,attempts:attempt,paidCents:amount===s.amountCents?null:amount,version:s.version+1,updated:now()})
  .where(and(eq(groupBillShares.id,s.id),eq(groupBillShares.version,s.version),eq(groupBillShares.status,'open'))).returning();
 if(!saved.length)throw new MollieError('Dit deel is net gewijzigd. Probeer het opnieuw.',409);
 if(mapMollieStatus(p.status)){await applyShareMollie(saved[0],p,key);if((await shareById(s.id))?.status==='betaald')return {paid:true};throw new MollieError('De betaling is niet gelukt. Probeer het opnieuw.',409)}
 if(!p.checkoutUrl)throw new MollieError('Mollie gaf geen betaalpagina terug. Probeer het opnieuw.');
 return {checkoutUrl:p.checkoutUrl};
}
/** De gast wil contant betalen (wens eigenaar 11 november 2026: „bij op rekening moet nog een optie contant worden toegevoegd”).
 *  Het deel blijft open en krijgt de markering 'contant-gevraagd', met het zelfgekozen bedrag; de kassa ziet het bij Open rekeningen
 *  en rekent het af met 💶. Een lopend betaalverzoek wordt eerst nagekeken. */
export async function requestShareCash(s:Share,chosen:number|null=null):Promise<{paid:true}|{cash:true;amountCents:number}>{
 if(s.status==='betaald')return {paid:true};
 if(s.status!=='open')throw new BillError('Dit betaalverzoek is vervangen door een nieuwe verdeling. Vraag de rekeninghouder om de nieuwe link.');
 if(s.externalRef){try{await refreshShare(s)}catch{}const fresh=(await shareById(s.id))!;if(fresh.status==='betaald')return {paid:true};
  if(fresh.externalRef&&await stillAtMollie(fresh))throw new BillError('Er loopt nog een betaalverzoek voor deze rekening. Rond dat af, of wacht tot het verlopen is.');s=fresh}
 let amount=s.amountCents;
 if(chosen!==null&&chosen!==s.amountCents){
  if(!s.payerEmail)throw new BillError('Bij dit deel betaal je het vaste bedrag.');
  try{amount=checkChosen(chosen,s.amountCents,await getSetting('website'))!}catch(e){throw new BillError((e as Error).message,400)}
  if(amount===0){const r=await getDb().update(groupBillShares).set({paidCents:0,version:s.version+1,updated:now()}).where(and(eq(groupBillShares.id,s.id),eq(groupBillShares.version,s.version),eq(groupBillShares.status,'open'))).returning();
   if(r.length)await settleShare(r[0],'betaald','nul','zelf gekozen: € 0',null);return {paid:true}}
 }
 const r=await getDb().update(groupBillShares).set({method:'contant-gevraagd',paidCents:amount===s.amountCents?null:amount,version:s.version+1,updated:now()})
  .where(and(eq(groupBillShares.id,s.id),eq(groupBillShares.version,s.version),eq(groupBillShares.status,'open'))).returning({id:groupBillShares.id});
 if(!r.length)throw new BillError('Dit deel is net gewijzigd. Probeer het opnieuw.');
 return {cash:true,amountCents:amount};
}
/** Een medewerker rekent een deel af aan de kassa (contant of pin). Een lopende iDEAL-poging wordt eerst nagekeken. */
export async function payShareAtRegister(s:Share,method:'contant'|'pin',who:string){
 if(s.status==='betaald')return;
 if(s.status!=='open')throw new BillError('Dit deel is vervangen door een nieuwe verdeling. Ververs de lijst.');
 if(s.externalRef){try{await refreshShare(s)}catch{}const fresh=(await shareById(s.id))!;if(fresh.status==='betaald')return;
  if(fresh.externalRef&&await stillAtMollie(fresh))throw new BillError('Voor dit deel loopt nog een iDEAL-betaling. Wacht even of laat de gast die afbreken.');s=fresh}
 await settleShare(s,'betaald',method,who,null);
}

// ---- Overzichten
export type BillSummary={cashCents:number;id:string;code:string;name:string;origin:string;holderName:string;holderPhone:string;holderEmail:string;validUntil:string;status:string;paidAt:string;invoiceNumber:number|null;mailOpen:string;mailPaid:string;mailError:string;orders:number}&ReturnType<typeof fillState>;
// where: alleen vaste stukken SQL uit dit bestand, nooit invoer van buiten.
async function summaries(where:string):Promise<BillSummary[]>{
 const rows=(await env.DB.prepare(`SELECT g.id, g.code, g.name, g.origin, g.holder_name AS "holderName", g.holder_phone AS "holderPhone", g.holder_email AS "holderEmail", g.valid_until AS "validUntil", g.status, g.paid_at AS "paidAt", g.invoice_number AS "invoiceNumber", g.mail_open AS "mailOpen", g.mail_paid AS "mailPaid", g.mail_error AS "mailError", g.budget_cents AS "budgetCents", COALESCE(SUM(o.total_cents),0) AS "spentCents", COUNT(o.id) AS orders, (SELECT COALESCE(SUM(COALESCE(s.paid_cents,s.amount_cents)),0) FROM group_bill_shares s WHERE s.group_code_id=g.id AND s.status='open' AND s.method='contant-gevraagd') AS "cashCents" FROM group_codes g LEFT JOIN orders o ON o.group_code_id=g.id WHERE ${where} GROUP BY g.id ORDER BY g.created DESC LIMIT 200`).all()).results as (Omit<BillSummary,'percent'|'near'|'full'|'leftCents'|'limitCents'>&{budgetCents:number})[];
 return rows.map(r=>({...r,invoiceNumber:r.invoiceNumber===null?null:Number(r.invoiceNumber),orders:Number(r.orders),cashCents:Number((r as {cashCents?:number}).cashCents||0),...fillState(Number(r.spentCents),Number(r.budgetCents))}));
}
/** Rekeningen die nog betaald moeten worden (voor de kassa): met bestellingen erop of door een gast geopend, en niet voldaan. */
export async function openBills(){return (await summaries(`g.paid_at=''`)).filter(b=>b.orders>0||b.origin==='gast'&&b.status==='actief')}
/** Door gasten geopende rekeningen van vorige dagen die nog niet voldaan zijn: de factuur moet nog naar de rekeninghouder. */
export async function overdueBills(today=amsterdamToday()){return (await summaries(`g.paid_at='' AND g.origin='gast'`)).filter(b=>b.validUntil<today&&b.orders>0)}
/** Alle rekeningen met een factuurnummer (Financiën → Facturen). */
export async function invoicedBills(){return (await summaries(`g.invoice_number IS NOT NULL`)).filter(b=>b.orders>0)}

/** Stand van één rekening: wat erop staat, de delen en de factuur. */
export async function billDetail(g:Group){
 const os=await getDb().select({id:orders.id,created:orders.created,totalCents:orders.totalCents,vat9Cents:orders.vat9Cents,vat21Cents:orders.vat21Cents,data:orders.data}).from(orders).where(eq(orders.groupCodeId,g.id)).orderBy(orders.id);
 const shares=(await sharesOf(g.id)).sort((a,b)=>a.position-b.position);
 // Afzender en rekeningnummer uit Bedrijfsgegevens (één plek, wens eigenaar 5 november 2026).
 const {state}=await loadGuest(),co=companyProfile(state.contact,connectionSetting);
 const seller:Seller={name:invoiceName(co),street:co.street,postalCode:co.postalCode,city:co.city,email:co.email,phone:co.phone,kvk:co.kvk,vatNumber:co.vatNumber,website:co.website};
 const spent=os.reduce((s,o)=>s+o.totalCents,0);
 return {id:g.id,code:g.code,name:g.name,origin:g.origin,status:g.status,paidAt:g.paidAt,validUntil:g.validUntil,fill:fillState(spent,g.budgetCents),
  holder:{name:g.holderName,email:g.holderEmail,phone:g.holderPhone},kind:g.kind,warnCents:g.warnCents??null,over:g.warnCents!=null&&spent>g.warnCents,
  shares:shares.map(s=>({id:s.id,position:s.position,count:s.count,amountCents:s.amountCents,status:s.status,method:s.method,paidAt:s.paidAt,busy:!!s.externalRef&&s.status==='open',payer:s.payerName,holder:!!s.payerEmail&&s.payerEmail===g.holderEmail.toLowerCase(),paidCents:s.paidCents})),
  invoice:{...invoiceData({...g,invoiceNumber:g.invoiceNumber??null},os,shares,seller),
   // Betalen op de factuur: betaallink per openstaand deel en het IBAN uit Bedrijfsgegevens.
   payment:invoicePayment(shares,{iban:co.iban,accountName:co.ibanName},orderPageUrl(),!!g.paidAt)}};
}
/** Groepsinformatie voor de werkplekken: naam en hoe vol de rekening is. */
export async function fillForGroups(ids:string[]){
 if(!ids.length)return new Map<string,{name:string;holder:string}&ReturnType<typeof fillState>>();
 const rows=await getDb().select({id:groupCodes.id,name:groupCodes.name,holder:groupCodes.holderName,host:groupCodes.host,budget:groupCodes.budgetCents,spent:sql<number>`(SELECT COALESCE(SUM(o.total_cents),0) FROM orders o WHERE o.group_code_id=group_codes.id)`}).from(groupCodes).where(inArray(groupCodes.id,ids));
 return new Map(rows.map(r=>[r.id,{name:r.name,holder:r.holder||r.host,...fillState(Number(r.spent),Number(r.budget))}]));
}

// ---- Factuurmail (wens eigenaar 5 november 2026): vanaf de mailbox van Gesprekken (info@: klanten en gasten).
// Eén mail per soort en rekening: met een vaste Message-ID wordt eerst in Gmail gekeken of hij al verstuurd is, zodat een
// nieuwe poging na een verbroken verbinding nooit een tweede mail stuurt. Zonder Gmail-koppeling of met verzenden uit: 'uit'.
export type BillMailKind='voldaan'|'open';
export async function queueBillMail(id:string,kind:BillMailKind,attempt='1'){
 const g=await groupById(id);if(!g?.holderEmail)return;
 const {enqueue}=await import('./outbox');await enqueue(`rekening-mail:${id}:${kind}:${attempt}`,'rekening-mail',{id,kind,attempt});
 const {tick}=await import('./assistant-jobs');void tick();
}
/** Betaallinks voor wat nog openstaat: de open delen, of één deel voor de hele rekening (dat sluit de rekening voor nieuwe bestellingen). */
async function payLinks(g:Group){
 const {orderPageUrl}=await import('./public-orders');
 let shares=(await sharesOf(g.id)).filter(s=>s.status==='open');
 if(!shares.length&&!(await sharesOf(g.id)).length){await startSettlement(g,1);shares=(await sharesOf(g.id)).filter(s=>s.status==='open')}
 return shares.sort((a,b)=>a.position-b.position).map(s=>{const u=new URL(orderPageUrl());u.searchParams.set('deel',s.id);return {label:s.count>1?`Deel ${s.position} van ${s.count}`:'Hele rekening',amountCents:s.amountCents,url:u.toString()}});
}
/** attempt: '1' automatisch; een ander kenmerk bij „Opnieuw versturen” (dan een nieuwe mail met een eigen Message-ID). */
export async function sendBillMail(id:string,kind:BillMailKind,attempt='1'){
 const g=await groupById(id);if(!g||!g.holderEmail)return;
 const field=kind==='voldaan'?'mailPaid':'mailOpen';
 if(g[field]==='verzonden')return;
 if(kind==='open'&&g.paidAt)return; // intussen betaald: dan komt de voldaan-mail
 const set=(v:Partial<typeof groupCodes.$inferInsert>)=>getDb().update(groupCodes).set(v).where(eq(groupCodes.id,id));
 const {sendEnabled,mailbox,isConnected,mailClient}=await import('./mail-store');
 if(!sendEnabled()){await set({[field]:'uit',mailError:'Verzenden staat uit in deze omgeving (MAIL_SEND_ENABLED).'});return}
 if(!await isConnected()){await set({[field]:'uit',mailError:'Gmail is niet gekoppeld (Gesprekken → Google koppelen).'});return}
 const client=await mailClient(),messageId=`<rekening-${g.id}-${kind}${attempt==='1'?'':'-'+attempt.replace(/\W/g,'')}@boerbart.nl>`;
 const found=(await client.findMessages('in:sent rfc822msgid:'+messageId)).messages?.[0];
 if(found){await set({[field]:'verzonden',mailError:''});return}
 const links=kind==='open'?await payLinks(g):[];
 const {invoiceMailText}=await import('./group-bill-core');
 const inv=(await billDetail((await groupById(id))!)).invoice,text=invoiceMailText(inv,kind,links);
 // De factuur als PDF in de bijlage (wens eigenaar 11 november 2026).
 const {invoicePdf}=await import('./invoice-pdf'),pdf=await invoicePdf(inv);
 const {buildMessage}=await import('./mail-core'),{GmailError}=await import('./gmail-api');
 try{await client.sendMessage(buildMessage({from:mailbox(),to:g.holderEmail,subject:text.subject,body:text.body,messageId,attachments:[{filename:`Factuur ${inv.number}.pdf`,mimeType:'application/pdf',data:pdf}]}));await set({[field]:'verzonden',mailError:''})}
 catch(err){
  if(err instanceof GmailError&&err.status>=400&&err.status<500){await set({[field]:'mislukt',mailError:err.message});return}
  await set({mailError:'Nog niet verzonden; wordt opnieuw geprobeerd.'});throw err;
 }
}
/** Ronde (elk uur): rekeningen van gasten van vorige dagen die nog openstaan krijgen één keer de factuur met betaallink. */
export async function mailOverdueBills(){
 for(const b of await overdueBills()){const g=await groupById(b.id);if(g&&!g.mailOpen&&g.holderEmail)await queueBillMail(b.id,'open')}
}

// ---- Meebetalen (wens eigenaar 5 november 2026)
// De rekeninghouder vinkt aan wie mag meebetalen; het totaal wordt gelijk gedeeld over hem en die personen. Iedere meebetaler
// ziet alleen het gedeelde bedrag en kiest zelf wat hij voor zijn deel betaalt („Jou wat goed fielt”). Minder betaald: zijn
// deel is afgerekend; meer: de anderen betalen gewoon hun eigen deel.
const personKey=(email:string)=>createHash('sha256').update('persoon:'+email.toLowerCase()).digest('hex').slice(0,16);
/** Wie er op de rekening besteld hebben (uit de gegevens bij hun bestelling), de rekeninghouder eerst. Alleen naam en een sleutel. */
export async function participants(g:Group){
 const os=await getDb().select({data:orders.data}).from(orders).where(eq(orders.groupCodeId,g.id)).orderBy(orders.id);
 const seen=new Map<string,{key:string;name:string;email:string;holder:boolean}>();
 const add=(name:string,email:string)=>{const e=email.toLowerCase();if(e&&!seen.has(e))seen.set(e,{key:personKey(e),name,email:e,holder:e===g.holderEmail.toLowerCase()})};
 if(g.holderEmail)add(g.holderName||'Rekeninghouder',g.holderEmail);
 for(const o of os){const guest=(JSON.parse(o.data) as {guest?:{name:string;email:string}}).guest;if(guest?.email)add(guest.name,guest.email)}
 return [...seen.values()];
}
/** Afrekenen met meebetalers: één deel voor de rekeninghouder en één per aangevinkte persoon. Daarna een melding aan wie dat aanzette. */
export async function startSharing(g:Group,keys:string[]){
 const people=await participants(g);
 const holder=people.find(p=>p.holder)??people[0];
 if(!holder)throw new BillError('Er staat niets op de rekening om te betalen.');
 const others=people.filter(p=>p!==holder&&keys.includes(p.key));
 const payers=[holder,...others].map(p=>({email:p.email,name:p.name}));
 await startSettlement(g,payers.length,payers);
 void notifyPayers(g);
 return sharesOf(g.id);
}
/** Melding „Meebetalen aan de rekening” naar de telefoons van de aangevinkte personen (als ze meldingen aanzetten). */
export async function notifyPayers(g:Group){
 try{
  const {notifyOrder}=await import('./push'),{orderPageUrl}=await import('./public-orders');
  const shares=(await sharesOf(g.id)).filter(s=>s.status==='open'&&s.payerEmail&&s.payerEmail!==g.holderEmail.toLowerCase());
  if(!shares.length)return;
  const os=await getDb().select({id:orders.id,data:orders.data}).from(orders).where(eq(orders.groupCodeId,g.id));
  for(const s of shares){
   const u=new URL(orderPageUrl());u.searchParams.set('deel',s.id);
   for(const o of os.filter(o=>((JSON.parse(o.data) as {guest?:{email:string}}).guest?.email||'').toLowerCase()===s.payerEmail))
    await notifyOrder(o.id,'meebetalen:'+s.id,{title:'Meebetalen aan de rekening',body:`${g.holderName||'De rekeninghouder'} vraagt je mee te betalen aan „${g.name}”. Tik om je deel te betalen.`,url:u.pathname+u.search});
  }
 }catch{}
}
/** Meebetalen via de ene link of QR-code: de meebetaler vult het e-mailadres in dat hij bij het bestellen gebruikte. */
export async function shareForEmail(code:string,email:string){
 const g=(await getDb().select().from(groupCodes).where(eq(groupCodes.code,code)))[0];if(!g)return null;
 const e=email.trim().toLowerCase();if(!e)return null;
 return (await sharesOf(g.id)).find(s=>s.payerEmail===e)??null;
}

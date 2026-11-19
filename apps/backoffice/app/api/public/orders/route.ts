import {getDb} from '@/db';
import {orders,orderLines,products} from '@/db/schema';
import {eq,inArray,sql} from 'drizzle-orm';
import {buildLine,orderTotals,lineRecords,type SaleProduct,type SaleLine} from '@/lib/orders';
import {stockProblem} from '@/lib/shop-stock';
import {stationStatuses} from '@/lib/station-open';
import {closedProblem} from '@/lib/station-open-core';
import {publishedStock,recordSale,availableForWebsite,hasTracked} from '@/lib/stock-sales';
import {parseGuestOrder,checkRoute,routeMode,guestReceipt,corsHeaders,originAllowed,createRateLimit,clientKey,GUEST_ORDER_STATUS,GROUP_ORDER_STATUS,MAX_BODY_BYTES,orderNumber,type GuestOrderRequest} from '@/lib/public-orders';
import {env,inTransaction} from '@/lib/portable/env';
import {checkChosen,valuation,normalizeCode,groupProblem,budgetProblem} from '@/lib/order-options';
import {getSetting,findGroup,findGroupById,groupSpent,amsterdamToday,GROUP_ORDER_INSERT_SQL,LINES_FOR_ORDER_SQL} from '@/lib/order-options-store';
import {pickupProblem,pickupLabel} from '@/lib/pickup-core';
import {loadGuest} from '@/lib/guest-store';
import {openBill,BillError,hashToken,spentOn} from '@/lib/group-bill';
import {limitProblem} from '@/lib/group-bill-core';
const euroText=(c:number)=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(c/100);
// Afhaalmoment (winkel, vooraf bestellen): opnieuw tegen de openingstijden van Planning gecontroleerd.
async function checkPickup(order:GuestOrderRequest){if(!order.pickup)return null;return pickupProblem(order.pickup,(await loadGuest()).state)}
const pickupRef=(order:GuestOrderRequest)=>order.pickup?` · afhalen ${pickupLabel(order.pickup)} · ${order.pickup.name}`:'';
export const dynamic='force-dynamic';
// Public write endpoint for guest orders from the website (no login; see proxy.ts and lib/public-orders.ts).
// Orders wait for payment (Mollie, lib/online-payments.ts) and only then go to the work stations. An own amount of zero has
// nothing to pay and goes through at once; a group order goes to the host's bill (see below).
// Group orders (groepscode) go to the work stations straight away: the host pays the whole bill afterwards (owner, 3 November 2026).
const limit=createRateLimit();
const reply=(origin:string|null,body:unknown,status=200)=>Response.json(body,{status,headers:corsHeaders(origin)});
export function OPTIONS(req:Request){
 const origin=req.headers.get('origin');
 return new Response(null,{status:originAllowed(origin)?204:403,headers:corsHeaders(origin)});
}
export async function POST(req:Request){
 const origin=req.headers.get('origin');
 if(!originAllowed(origin))return reply(origin,{error:'Bestellen kan alleen via de website van Boer Bart.'},403);
 if(!(req.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))return reply(origin,{error:'Ongeldige bestelling.'},415);
 if(Number(req.headers.get('content-length')||0)>MAX_BODY_BYTES)return reply(origin,{error:'Je bestelling is te groot.'},413);
 const text=await req.text().catch(()=>'');
 if(new TextEncoder().encode(text).length>MAX_BODY_BYTES)return reply(origin,{error:'Je bestelling is te groot.'},413);
 const parsed=readOrder(text);
 if('error' in parsed)return reply(origin,{error:parsed.error},400);
 const order=parsed.order;
 try{
  const db=getDb();// De beheerlink van een nieuwe rekening staat nooit in de bestelling; alleen de sha-256 (om een herhaalde aanvraag te herkennen).
  const request=JSON.stringify({channel:'website',route:order.route,lines:order.lines,chosenCents:order.chosenCents,groupCode:order.groupCode,...(order.pickup?{pickup:order.pickup}:{}),
   ...(order.guest?{guest:order.guest}:{}),...(order.klant?{klant:order.klant}:{}),...(order.dividend?{dividend:hashToken(order.dividend)}:{}),...(order.openBill?{openBill:{name:order.openBill.name,limitCents:order.openBill.limitCents,token:hashToken(order.openBill.token),...(order.openBill.kind==='eigen'?{kind:'eigen',warnCents:order.openBill.warnCents}:{})}}:{})});
  // Same request again (for example after a lost connection): return the same order, nothing is added.
  const previous=await db.select().from(orders).where(eq(orders.requestId,order.requestId));
  if(previous[0])return previous[0].request===request?reply(origin,guestReceipt(previous[0])):reply(origin,{error:'Deze bestelling is al verstuurd met andere gegevens. Herlaad de pagina.'},409);
  const late=await checkPickup(order);if(late)return reply(origin,{error:late,reason:'afhalen'},409);
  if(order.groupCode!==null||order.openBill)return await groupOrder(origin,req.headers,order,request,db);
  if(!limit(clientKey(req.headers)))return reply(origin,{error:'Er worden nu veel bestellingen tegelijk verstuurd. Probeer het over een minuut opnieuw.'},429);
  const source=await db.select().from(products).where(inArray(products.id,[...new Set(order.lines.map(l=>l.productId))]));
  const built=priceLines(order,source);
  if('error' in built)return reply(origin,{error:built.error},409);
  const lines=built.lines;
  // Werkplek dicht (wens eigenaar 14 november 2026): niet bestellen bij een werkplek die nu gesloten of niet beschikbaar is.
  const shut=closedProblem(lines,await stationStatuses());if(shut)return reply(origin,{error:shut,reason:'gesloten'},409);
  // Uitverkocht of te weinig op voorraad: niet bestellen. Afboeken gebeurt na betaling (lib/online-payments.ts),
  // of meteen als er niets te betalen is (eigen bedrag nul) of de gastheer betaalt (groepscode): die gaan direct door.
  // Wat wachtende (nog niet betaalde) bestellingen vasthouden telt mee (#141); vlak voor het opslaan nog eens onder slot.
  const short=stockProblem(lines,await availableForWebsite(source));
  if(short)return reply(origin,{error:short},409);
  const totals=orderTotals(lines);if(totals.totalCents<=0||totals.totalCents>1000000)return reply(origin,{error:'Dit bedrag kan niet online worden besteld. Vraag het aan een van ons.'},400);
  // Eigen bedrag: only when switched on for online ordering; null = the normal price.
  // Betalen met saldo bestaat hier niet (geen leden): een bestelling met dat kenmerk wordt geweigerd.
  if(order.dividend)return reply(origin,{error:'Betalen met saldo kan hier niet. Betaal met iDEAL.',reason:'dividend'},400);
  let chosen:number|null;
  try{chosen=checkChosen(order.chosenCents,totals.totalCents,order.chosenCents===null?null:await getSetting('website'))}catch(e){return reply(origin,{error:(e as Error).message,reason:'eigen-bedrag'},400)}
  const v=valuation(lines,chosen),own=chosen!==null;
  // Nul euro gekozen: niets af te rekenen, dus de bestelling gaat meteen door (gemarkeerd in het kenmerk).
  const free=own&&v.zero,mode=routeMode(order.route),reference=(free?'Online · website · eigen bedrag nul':'Online · website')+pickupRef(order);
  const data=JSON.stringify({mode,reference,channel:'website',lines,totalCents:totals.totalCents,test:true,paymentStatus:'Niet gekoppeld',status:'Online bestelling, wacht op betaling',
   salesContext:'website',chosenCents:chosen,differenceCents:v.differenceCents,zero:own&&v.zero,pickup:order.pickup});
  // Order and lines in one transaction; a repeated requestId changes nothing.
  const orderId=sql`(SELECT ${orders.id} FROM ${orders} WHERE ${orders.requestId}=${order.requestId})`;
  const owners=new Map<string,string|null>(); // geen producteigenaren: de verkoop hoort bij het bedrijf
  // Getelde producten: controle en opslaan samen onder één slot, zodat twee gasten niet allebei het laatste stuk krijgen (#141).
  const tracked=hasTracked(source);
  const stored=await inTransaction(async()=>{
  if(tracked){
   await env.DB.prepare('SELECT pg_advisory_xact_lock(hashtext(?))').bind('voorraad:website').first();
   const again=(await db.select({id:orders.id}).from(orders).where(eq(orders.requestId,order.requestId)))[0];
   if(!again){const late=stockProblem(lines,await availableForWebsite(source));if(late)return late}
  }
  await db.batch([
   db.insert(orders).values({requestId:order.requestId,request,data,created:new Date().toISOString(),mode,reference,status:free?'vastgelegd':GUEST_ORDER_STATUS,paymentStatus:free?'nul-bedrag':'niet-gekoppeld',test:1,...totals,
    salesContext:'website',commercialCents:totals.totalCents,chosenCents:chosen,differenceCents:v.differenceCents,chosenVat9Cents:own?v.vat9Cents:null,chosenVat21Cents:own?v.vat21Cents:null}).onConflictDoNothing(),
   db.insert(orderLines).values(lineRecords(lines).map((l,i)=>({...l,orderId,paidCents:v.lines[i].paidCents,paidVatCents:v.lines[i].paidVatCents,ownerId:owners.get(l.productId)??null}))).onConflictDoNothing(),
  ]);
  return null;
  });
  if(stored)return reply(origin,{error:stored},409);
  const saved=await db.select().from(orders).where(eq(orders.requestId,order.requestId));
  if(!saved[0]||saved[0].request!==request)return reply(origin,{error:'Deze bestelling is al verstuurd met andere gegevens. Herlaad de pagina.'},409);
  if(free)await recordSale(orderNumber(saved[0].id),lines);
  return reply(origin,guestReceipt(saved[0]),201);
 }catch{return reply(origin,{error:'Je bestelling kon nu niet worden verstuurd. Probeer het opnieuw.'},503)}
}

function readOrder(text:string):{order:GuestOrderRequest}|{error:string}{
 try{return {order:parseGuestOrder(JSON.parse(text))}}catch(e){return {error:e instanceof SyntaxError?'Ongeldige bestelling.':(e as Error).message}}
}
// Prices, VAT and choices always come from the published product at the version the guest saw.
function priceLines(order:GuestOrderRequest,source:{id:string;version:number;published:string|null}[]):{lines:SaleLine[]}|{error:string}{
 try{
  const lines=order.lines.map(l=>{const row=source.find(p=>p.id===l.productId);
   if(!row?.published)throw Error('Een product staat niet meer op de kaart. Herlaad de pagina.');
   if(row.version!==l.version)throw Error('De kaart is net bijgewerkt. Kijk je bestelling nog even na.');
   return buildLine(JSON.parse(row.published) as SaleProduct,l)});
  checkRoute(order.route,lines);
  return {lines};
 }catch(e){return {error:(e as Error).message}}
}

// Group bill (groepscode): the guest pays nothing; the host pays the whole bill later, up to his maximum.
// The budget is checked inside the insert itself (see lib/order-options-store.ts), so it holds under concurrency.
async function groupOrder(origin:string|null,headers:Headers,order:GuestOrderRequest,request:string,db:ReturnType<typeof getDb>){
 // Op een rekening kan alleen eten en drinken (wens eigenaar 5 november 2026); winkelproducten betaalt de gast zelf.
 if(order.route==='winkel')return reply(origin,{error:'Winkelproducten kun je niet op een rekening zetten. Betaal ze nu via een betaalverzoek; eten en drinken kan wel op de rekening.',reason:'groep'},400);
 const today=amsterdamToday();
 if(!limit(clientKey(headers)))return reply(origin,{error:'Er worden nu veel bestellingen tegelijk verstuurd. Probeer het over een minuut opnieuw.'},429);
 // Gezamenlijke rekening openen (wens eigenaar 5 november 2026): eerst de rekening, dan deze bestelling erop.
 let own=false;
 if(order.openBill){try{await openBill('gast-'+order.requestId,{name:order.openBill.name,limitCents:order.openBill.limitCents,holder:order.guest!,token:order.openBill.token,kind:order.openBill.kind,warnCents:order.openBill.warnCents});own=true}
  catch(e){return reply(origin,{error:e instanceof BillError?e.message:'De rekening kon nu niet worden geopend. Probeer het opnieuw.'},e instanceof BillError?e.status:503)}}
 const code=own?null:normalizeCode(order.groupCode);const group=own?await findGroupById('gast-'+order.requestId):code?await findGroup(code):null;
 const problem=group?.origin==='gast'&&group.status!=='actief'?'Deze rekening wordt al afgerekend. Bestel en betaal zelf, of vraag het aan een van ons.':groupProblem(group,today);
 if(problem||!group)return reply(origin,{error:problem,reason:'groep'},400);
 const source=await db.select().from(products).where(inArray(products.id,[...new Set(order.lines.map(l=>l.productId))]));
 const built=priceLines(order,source);if('error' in built)return reply(origin,{error:built.error},409);
 const lines=built.lines,totals=orderTotals(lines);
 const shut=closedProblem(lines,await stationStatuses());if(shut)return reply(origin,{error:shut,reason:'gesloten'},409);
 const short=stockProblem(lines,await publishedStock(source));if(short)return reply(origin,{error:short},409);
 if(totals.totalCents<=0)return reply(origin,{error:'Dit bedrag kan niet online worden besteld. Vraag het aan een van ons.'},400);
 // Eigen rekening: het vangnet (€ 500) is geen maximum dat de gast zelf kiest; dan eerst afrekenen.
 const eigenFull=(spent:number)=>spent+totals.totalCents>group.budgetCents?`Op je rekening staat al ${euroText(spent)}. Reken eerst af, dan kun je daarna weer bestellen.`:null;
 const over=group.kind==='eigen'?eigenFull(await spentOn(group.id)):group.origin==='gast'?limitProblem(await spentOn(group.id),totals.totalCents,group.budgetCents,group.holderName):budgetProblem(await groupSpent(group.id),totals.totalCents,group.budgetCents);
 if(over)return reply(origin,{error:over,reason:'groep'},409);
 const mode=routeMode(order.route),reference=(group.kind==='eigen'?'Eigen rekening · ':'Groep · ')+group.name+pickupRef(order),now=new Date().toISOString();
 const data=JSON.stringify({mode,reference,channel:'website',lines,totalCents:totals.totalCents,test:true,paymentStatus:'Op groepsrekening',status:'Op rekening van de gastheer',
  salesContext:'website',chosenCents:null,differenceCents:0,group:{id:group.id,name:group.name,code:group.code,own},guest:order.guest??null,pickup:order.pickup});
 const owners=new Map<string,string|null>(); // geen producteigenaren: de verkoop hoort bij het bedrijf
 await env.DB.batch([
  // Per groep één bestelling tegelijk (ook met meerdere servers): het budget kan nooit worden overschreden.
  env.DB.prepare('SELECT pg_advisory_xact_lock(hashtext(?))').bind('groep:'+group.id),
  env.DB.prepare(GROUP_ORDER_INSERT_SQL).bind(order.requestId,request,data,now,mode,reference,GROUP_ORDER_STATUS,'op-rekening',totals.totalCents,totals.vat9Cents,totals.vat21Cents,'website',group.id,today),
  ...lineRecords(lines).map(l=>env.DB.prepare(LINES_FOR_ORDER_SQL).bind(order.requestId,l.position,l.productId,l.name,l.station,l.quantity,l.unitCents,l.totalCents,l.vat,l.vatCents,null,null,owners.get(l.productId)??null)),
 ]);
 const saved=await db.select().from(orders).where(eq(orders.requestId,order.requestId));
 // Nothing saved: someone else used the last of the budget, or the code was closed, in the same moment.
 if(!saved[0])return reply(origin,{error:group.kind==='eigen'?(eigenFull(await spentOn(group.id))||'Je rekening wordt al afgerekend. Bestel en betaal zelf.'):group.origin==='gast'?(limitProblem(await spentOn(group.id),totals.totalCents,group.budgetCents,group.holderName)||'De rekening wordt al afgerekend. Bestel en betaal zelf.'):'Het budget van deze groep is bereikt. Vraag het aan de gastheer of bestel en betaal zelf.',reason:'groep'},409);
 if(saved[0].request!==request)return reply(origin,{error:'Deze bestelling is al verstuurd met andere gegevens. Herlaad de pagina.'},409);
 // Gaat direct naar de werkplekken (de gastheer betaalt later): nu van de voorraad af. Herhaalbaar per bestelnummer.
 await recordSale(orderNumber(saved[0].id),lines);
 // Eigen rekening: de stand en de zelfgekozen grens gaan mee, zodat de bestelpagina kan waarschuwen (blokkeert niets).
 if(group.kind==='eigen'){const spent=await spentOn(group.id);return reply(origin,{...guestReceipt(saved[0]),bill:{kind:'eigen',spentCents:spent,warnCents:group.warnCents??null,over:group.warnCents!=null&&spent>group.warnCents}},201)}
 return reply(origin,guestReceipt(saved[0]),201);
}

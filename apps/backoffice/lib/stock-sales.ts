// Verkoop en voorraad (besluit eigenaar 3 november 2026): de kassa haalt direct af, een online bestelling pas na
// betaling. Afboeken gaat via de bestaande voorraadlijst (stock_moves, reden „Verkoop”), in één transactie met een
// regel in operation_requests (request_id „verkoop:<bestelnummer>”): dezelfde bestelling wordt nooit twee keer afgeboekt.
// Een verkoop wordt nooit geblokkeerd door de voorraadadministratie: lukt afboeken niet, dan blijft de bestelling
// gewoon staan en volgt een melding in het serverlog. Ligt er minder dan verkocht, dan gaat de voorraad naar 0 en
// staat het tekort in de omschrijving (dan klopt de telling niet: opnieuw tellen).
import {getDb} from '@/db';
import {ingredients,products,recipeLines,recipes} from '@/db/schema';
import {inArray} from 'drizzle-orm';
import {env,inTransaction} from '@/lib/portable/env';
import {loadOps,saveOps,isProcessed} from './operations-store';
import {applyMovement} from './operations-core';
import {isTracked,saleMoves,stockMap,type StockSource} from './shop-stock';

const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date());

/** Ingrediënten en recepten (zonder de voorraadlijst zelf): genoeg om voorraad in stuks uit te rekenen. */
export async function stockSource():Promise<StockSource>{
 const db=getDb();
 const [ing,rec,lines]=await Promise.all([
  db.select({id:ingredients.id,name:ingredients.name,stock:ingredients.stock,known:ingredients.known,min:ingredients.min}).from(ingredients),
  db.select({productId:recipes.productId,yield:recipes.yield,lossPct:recipes.lossPct}).from(recipes),
  db.select({productId:recipeLines.productId,ingredientId:recipeLines.ingredientId,quantity:recipeLines.quantity,position:recipeLines.position}).from(recipeLines),
 ]);
 return {ingredients:ing.map(i=>({...i,known:!!i.known})),recipes:rec.map(r=>({...r,lines:lines.filter(l=>l.productId===r.productId).sort((a,b)=>a.position-b.position)}))};
}

/** Voorraad in stuks voor de getelde producten onder deze gepubliceerde producten. */
export async function publishedStock(rows:{id:string;published:string|null}[]){
 const tracked=rows.flatMap(r=>{if(!r.published)return [];const p=JSON.parse(r.published) as {stockMode?:unknown};return isTracked(p)?[{id:r.id,stockMode:p.stockMode}]:[]});
 return tracked.length?stockMap(await stockSource(),tracked):new Map<string,number>();
}

/** Issue #141: online bestellingen gaan pas na betaling van de voorraad af. Zonder meer konden twee gasten tegelijk
 *  (of na elkaar, binnen de betaaltijd) het laatste stuk bestellen en allebei betalen. Daarom houdt een websitebestelling
 *  die op betaling wacht haar stuks RESERVE_MINUTES vast: de voorraad voor de volgende gast telt die al als weg.
 *  Een betaalpoging bij Mollie verloopt ruim binnen die tijd; een verlaten bestelling geeft de stuks daarna vanzelf vrij. */
export const RESERVE_MINUTES=20;
export const WAITING_FOR_PAYMENT='wacht-op-betaling';// = GUEST_ORDER_STATUS (lib/public-orders.ts)
// Oogstaandeelperioden zijn vooruitbetalingen, geen reservering van één los winkelstuk.
export async function heldByWaitingOrders(now=Date.now()){
 const since=new Date(now-RESERVE_MINUTES*60_000).toISOString();
 const rows=(await env.DB.prepare(`SELECT l.product_id AS "productId", SUM(l.quantity) AS quantity FROM order_lines l JOIN orders o ON o.id=l.order_id WHERE o.status=? AND o.created>? AND o.sales_context<>? GROUP BY l.product_id`).bind(WAITING_FOR_PAYMENT,since,'abonnement').all()).results as {productId:string;quantity:number|string}[];
 return rows.map(r=>({productId:r.productId,quantity:Number(r.quantity)}));
}
/** Voorraad voor een nieuwe websitebestelling: de gepubliceerde voorraad min wat wachtende bestellingen vasthouden. */
export async function availableForWebsite(rows:{id:string;published:string|null}[],now=Date.now()){
 const tracked=rows.flatMap(r=>{if(!r.published)return [];const p=JSON.parse(r.published) as {stockMode?:unknown};return isTracked(p)?[{id:r.id,stockMode:p.stockMode}]:[]});
 if(!tracked.length)return new Map<string,number>();
 const src=await stockSource();
 for(const m of saleMoves(src,await heldByWaitingOrders(now))){const i=src.ingredients.find(i=>i.id===m.ingredientId);if(i)i.stock=Math.max(0,i.stock-m.quantity)}
 return stockMap(src,tracked);
}
/** Bevat deze bestelling getelde producten? Alleen dan is het voorraadslot nodig. */
export const hasTracked=(rows:{published:string|null}[])=>rows.some(r=>!!r.published&&isTracked(JSON.parse(r.published)));

/** Boekt de verkoop af. Veilig om vaker aan te roepen met hetzelfde bestelnummer. */
export async function recordSale(orderNumber:string,lines:{productId:string;quantity:number}[]){
 try{
  const ids=[...new Set(lines.map(l=>l.productId))];if(!ids.length)return;
  const rows=await getDb().select({id:products.id,published:products.published}).from(products).where(inArray(products.id,ids));
  const tracked=new Set(rows.filter(r=>r.published&&isTracked(JSON.parse(r.published))).map(r=>r.id));
  const sold=lines.filter(l=>tracked.has(l.productId));if(!sold.length)return;
  const requestId='verkoop:'+orderNumber;
  // Systeemtest 5 november 2026: tien betalingen die tegelijk binnenkwamen boekten er maar zes af (de rest botste vier
  // keer en gaf op). Daarom één afboeking tegelijk, onder hetzelfde slot als de voorraadcontrole van kassa en website.
  for(let attempt=0;attempt<4;attempt++){
   const outcome=await inTransaction(async()=>{
   await env.DB.prepare('SELECT pg_advisory_xact_lock(hashtext(?))').bind('voorraad:website').first();
   if(await isProcessed(requestId))return 'klaar';
   const loaded=await loadOps('none'),s=structuredClone(loaded.state),day=today();
   const before=structuredClone({ingredients:s.ingredients,recipes:s.recipes}) as unknown as StockSource;
   const moves=saleMoves(s,sold);
   for(const m of moves)if(m.quantity>0)applyMovement(s,m.ingredientId,-m.quantity,day,'Verkoop',orderNumber+(m.shortage>0?` (tekort ${m.shortage}: opnieuw tellen)`:''),crypto.randomUUID());
   if(moves.some(m=>m.shortage>0))console.warn(`[voorraad] ${orderNumber}: meer verkocht dan er geteld lag; voorraad op 0 gezet. Tel opnieuw.`);
   if(!moves.some(m=>m.quantity>0))return 'klaar';
   const result=await saveOps(loaded,s,requestId,'verkoop');
   // „Je bent bijna uitverkocht” (wens eigenaar 5 november 2026): bericht aan de leverancier als de grens net is gepasseerd.
   return result==='conflict'?'opnieuw':result==='saved'?{before,after:{ingredients:s.ingredients,recipes:s.recipes} as unknown as StockSource}:'klaar';
   });
   if(outcome==='opnieuw')continue;
   // Bericht aan de leverancier pas na het afboeken, buiten het slot.
   return;
  }
  console.warn(`[voorraad] ${orderNumber}: afboeken lukte niet door gelijktijdige wijzigingen. Controleer de voorraad.`);
 }catch(e){console.warn(`[voorraad] ${orderNumber}: afboeken mislukt: ${e instanceof Error?e.message:e}`)}
}

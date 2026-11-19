// Database access for inkoop, voorraad en recepten. Each change is saved in one transaction together with a
// row in operation_requests: its request_id blocks double processing, its unique version blocks two
// simultaneous changes from both being saved (the later one gets a conflict and must refresh).
import {getDb} from '@/db';
import {ingredients,invoices,invoiceLines,recipes,recipeLines,recipeHistory,stockMoves,incomingOrders,operationRequests} from '@/db/schema';
import {eq,and,desc,max,count,inArray,sql,gte,or} from 'drizzle-orm';
import {fromRows,diffOps,type MoveRow,type OpsRows} from './operations-rows';
import type {Ops} from './operations-core';
import {BOOKED_REASONS} from './packing-slip-core';

export type LoadedOps={state:Ops;version:number;moveCount:number;lastSeq:number;loadedMoves:number};
// moves: 'recent' = the latest 100 (for display), or only the recipe-consumption moves with this reference (for the duplicate check).
export async function loadOps(moves:'recent'|{consumeNote:string}|'none'='none'):Promise<LoadedOps>{
 const db=getDb();
 const [ing,inv,invLines,rec,recLines,inc,ver,stats]=await Promise.all([
  db.select().from(ingredients),db.select().from(invoices),db.select().from(invoiceLines),db.select().from(recipes),db.select().from(recipeLines),db.select().from(incomingOrders),
  db.select({v:max(operationRequests.version)}).from(operationRequests),
  db.select({n:count(),last:max(stockMoves.seq)}).from(stockMoves),
 ]);
 let moveRows:MoveRow[]=[];
 if(moves==='recent')moveRows=await db.select().from(stockMoves).orderBy(desc(stockMoves.seq)).limit(100);
 else if(moves!=='none'){const suffix=' / '+moves.consumeNote;moveRows=await db.select().from(stockMoves).where(and(eq(stockMoves.reason,'Receptverbruik'),sql`right(${stockMoves.reference},length(${suffix}))=${suffix}`));}
 const rows:OpsRows={ingredients:ing,invoices:inv,invoiceLines:invLines,recipes:rec,recipeLines:recLines,incoming:inc};
 return {state:fromRows(rows,moveRows),version:ver[0]?.v??0,moveCount:stats[0]?.n??0,lastSeq:stats[0]?.last??0,loadedMoves:moveRows.length};
}

/** Tellingen en verkopen vanaf een datum, voor de afwijkingenlijst van de werkplektelling (lib/stock-count-core.ts). */
export async function countAndSaleMoves(since:string){
 return getDb().select({ingredientId:stockMoves.ingredientId,quantity:stockMoves.quantity,date:stockMoves.date,reason:stockMoves.reason,reference:stockMoves.reference,seq:stockMoves.seq}).from(stockMoves)
  .where(and(gte(stockMoves.date,since),or(eq(stockMoves.reason,'Verkoop'),eq(stockMoves.reason,'Telling / correctie'),eq(stockMoves.reason,'Beginvoorraad')))).orderBy(stockMoves.seq);
}

/** Bewegingen van magazijnartikelen voor de open bestelverzoeken (lib/warehouse-core.ts): de meldingen zelf en alles wat
 * er weer bij kwam, het afgelopen halfjaar. Oudere meldingen zonder levering tellen niet meer mee. */
export async function warehouseMoves(ids:string[]){
 const since=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date(Date.now()-183*86400000));
 return getDb().select({ingredientId:stockMoves.ingredientId,quantity:stockMoves.quantity,date:stockMoves.date,reason:stockMoves.reason,reference:stockMoves.reference,seq:stockMoves.seq}).from(stockMoves)
  .where(and(inArray(stockMoves.ingredientId,ids),gte(stockMoves.date,since),or(eq(stockMoves.reason,'Bestelverzoek'),sql`${stockMoves.quantity} > 0`))).orderBy(stockMoves.seq);
}

/** Pakbon of kassabon al geboekt? (wens eigenaar 17 november 2026) Zelfde leverancier/winkel en nummer. */
export async function slipBooked(reference:string){
 const rows=await getDb().select({id:stockMoves.id}).from(stockMoves).where(and(inArray(stockMoves.reason,BOOKED_REASONS),sql`left(${stockMoves.reference},length(${reference+' · '}))=${reference+' · '}`)).limit(1);
 return rows.length>0;
}

export async function isProcessed(requestId:string){return (await getDb().select({id:operationRequests.requestId}).from(operationRequests).where(eq(operationRequests.requestId,requestId))).length>0}

export async function saveOps(loaded:LoadedOps,next:Ops,requestId:string,action:string):Promise<'saved'|'duplicate'|'conflict'>{
 const db=getDb(),c=diffOps(loaded.state,next,loaded.loadedMoves,loaded.lastSeq);
 const statements:any[]=[db.insert(operationRequests).values({requestId,version:loaded.version+1,action,created:new Date().toISOString()})];
 for(const r of c.ingredients)statements.push(db.insert(ingredients).values(r).onConflictDoUpdate({target:ingredients.id,set:r}));
 for(const r of c.invoices)statements.push(db.insert(invoices).values(r).onConflictDoUpdate({target:invoices.id,set:r}));
 for(const r of c.invoiceLines)statements.push(db.insert(invoiceLines).values(r).onConflictDoUpdate({target:[invoiceLines.invoiceId,invoiceLines.id],set:r}));
 for(const r of c.recipes)statements.push(db.insert(recipes).values(r).onConflictDoUpdate({target:recipes.productId,set:r}));
 if(c.replaceRecipeLines.length)statements.push(db.delete(recipeLines).where(inArray(recipeLines.productId,c.replaceRecipeLines)));
 for(const r of c.recipeLines)statements.push(db.insert(recipeLines).values(r));
 for(const r of c.history)statements.push(db.insert(recipeHistory).values(r));
 for(const r of c.incoming)statements.push(db.insert(incomingOrders).values(r).onConflictDoUpdate({target:incomingOrders.id,set:r}));
 for(const r of c.moves)statements.push(db.insert(stockMoves).values(r));
 try{await db.batch(statements as [any,...any[]]);return 'saved'}
 catch(e){
  // Our batch was rolled back. If the request id exists now, the same request was processed concurrently.
  if(await isProcessed(requestId))return 'duplicate';
  // The version was taken by another change in the meantime: nothing of this request was saved.
  if((await db.select({v:max(operationRequests.version)}).from(operationRequests))[0]?.v!==loaded.version)return 'conflict';
  throw e}
}

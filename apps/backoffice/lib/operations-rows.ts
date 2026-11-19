// Conversion between the in-memory operations state (used by lib/operations-core.ts, unchanged) and table rows.
// Pure functions: no database access, so they can be tested directly.
import type {Ops,Ingredient,Invoice,Recipe,StockMove,Incoming,Unit,PurchaseLine} from './operations-core';

export type IngredientRow={id:string;name:string;unit:string;supplier:string;article:string;stock:number;known:number;countedAt:string;pack:number;min:number;leadDays:number;shelfDays:number;allergens:string;checked:number;notes:string;origin:string;ownCents:number|null;position:number;kind:string};
export type InvoiceRow={id:string;supplier:string;number:string;date:string;source:string;reviewed:number;position:number};
export type InvoiceLineRow={invoiceId:string;id:string;position:number;article:string;description:string;quantity:number;unit:string;netCents:number;ingredientId:string;kind:string;received:number;orderId:string|null};
export type RecipeRow={productId:string;name:string;yield:number;method:string;lossPct:number;packagingCents:number;version:number;reviewed:number;position:number};
export type RecipeLineRow={productId:string;ingredientId:string;position:number;quantity:number};
export type MoveRow={id:string;seq:number;ingredientId:string;quantity:number;date:string;reason:string;reference:string};
export type IncomingRow={id:string;ingredientId:string;quantity:number;remaining:number;due:string;status:string;supplier:string;position:number};
export type HistoryRow={productId:string;date:string;portionCents:number|null;recipe:string};
export type OpsRows={ingredients:IngredientRow[];invoices:InvoiceRow[];invoiceLines:InvoiceLineRow[];recipes:RecipeRow[];recipeLines:RecipeLineRow[];incoming:IncomingRow[]};

const flag=(v:boolean)=>v?1:0;
export function toRows(s:Ops):OpsRows{
 return {
  ingredients:s.ingredients.map((i,position)=>({id:i.id,name:i.name,unit:i.unit,supplier:i.supplier,article:i.article,stock:i.stock,known:flag(i.known),countedAt:i.countedAt,pack:i.pack,min:i.min,leadDays:i.leadDays,shelfDays:i.shelfDays,allergens:JSON.stringify(i.allergens),checked:flag(i.checked),notes:i.notes,origin:i.origin,ownCents:i.ownCents,position,kind:i.kind==='magazijn'?'magazijn':'keuken'})),
  invoices:s.invoices.map((v,position)=>({id:v.id,supplier:v.supplier,number:v.number,date:v.date,source:v.source,reviewed:flag(v.reviewed),position})),
  invoiceLines:s.invoices.flatMap(v=>v.lines.map((l,position)=>({invoiceId:v.id,id:l.id,position,article:l.article,description:l.description,quantity:l.quantity,unit:l.unit,netCents:l.netCents,ingredientId:l.ingredientId,kind:l.kind,received:flag(l.received),orderId:l.orderId??null}))),
  recipes:s.recipes.map((r,position)=>({productId:r.productId,name:r.name,yield:r.yield,method:r.method,lossPct:r.lossPct,packagingCents:r.packagingCents,version:r.version,reviewed:flag(r.reviewed),position})),
  recipeLines:s.recipes.flatMap(r=>r.lines.map((l,position)=>({productId:r.productId,ingredientId:l.ingredientId,position,quantity:l.quantity}))),
  incoming:s.incoming.map((o,position)=>({id:o.id,ingredientId:o.ingredientId,quantity:o.quantity,remaining:o.remaining,due:o.due,status:o.status,supplier:o.supplier,position})),
 };
}

const byPosition=<T extends {position:number}>(a:T,b:T)=>a.position-b.position;
export function fromRows(r:OpsRows,moves:MoveRow[]):Ops{
 const lines=new Map<string,InvoiceLineRow[]>();for(const l of r.invoiceLines)(lines.get(l.invoiceId)??lines.set(l.invoiceId,[]).get(l.invoiceId)!).push(l);
 const rlines=new Map<string,RecipeLineRow[]>();for(const l of r.recipeLines)(rlines.get(l.productId)??rlines.set(l.productId,[]).get(l.productId)!).push(l);
 return {
  ingredients:[...r.ingredients].sort(byPosition).map((i):Ingredient=>({id:i.id,name:i.name,unit:i.unit as Unit,supplier:i.supplier,article:i.article,stock:i.stock,known:!!i.known,countedAt:i.countedAt,pack:i.pack,min:i.min,leadDays:i.leadDays,shelfDays:i.shelfDays,allergens:JSON.parse(i.allergens),checked:!!i.checked,notes:i.notes,origin:i.origin==='eigen'?'eigen':'inkoop',ownCents:i.ownCents??null,...(i.kind==='magazijn'?{kind:'magazijn' as const}:{})})),
  invoices:[...r.invoices].sort(byPosition).map((v):Invoice=>({id:v.id,supplier:v.supplier,number:v.number,date:v.date,source:v.source,reviewed:!!v.reviewed,lines:(lines.get(v.id)||[]).sort(byPosition).map(l=>({id:l.id,article:l.article,description:l.description,quantity:l.quantity,unit:l.unit as Unit,netCents:l.netCents,ingredientId:l.ingredientId,kind:l.kind as PurchaseLine['kind'],received:!!l.received,...(l.orderId!=null?{orderId:l.orderId}:{})}))})),
  recipes:[...r.recipes].sort(byPosition).map((x):Recipe=>({productId:x.productId,name:x.name,yield:x.yield,method:x.method,lossPct:x.lossPct,packagingCents:x.packagingCents,version:x.version,reviewed:!!x.reviewed,lines:(rlines.get(x.productId)||[]).sort(byPosition).map(l=>({ingredientId:l.ingredientId,quantity:l.quantity}))})),
  moves:[...moves].sort((a,b)=>a.seq-b.seq).map((m):StockMove=>({id:m.id,ingredientId:m.ingredientId,quantity:m.quantity,date:m.date,reason:m.reason,reference:m.reference})),
  incoming:[...r.incoming].sort(byPosition).map((o):Incoming=>({id:o.id,ingredientId:o.ingredientId,quantity:o.quantity,remaining:o.remaining,due:o.due,status:o.status as Incoming['status'],supplier:o.supplier})),
  // Not loaded as a whole any more: requests live in operation_requests, history in recipe_history. New entries are appended by the core.
  requests:[],recipeHistory:[],
 };
}

// What has to be written after an action: only new or changed rows. Nothing is ever deleted except the
// lines of a recipe that was replaced (they are rewritten as a whole).
export type OpsChanges={ingredients:IngredientRow[];invoices:InvoiceRow[];invoiceLines:InvoiceLineRow[];recipes:RecipeRow[];replaceRecipeLines:string[];recipeLines:RecipeLineRow[];incoming:IncomingRow[];moves:MoveRow[];history:HistoryRow[]};
function changed<T>(before:T[],after:T[],key:(r:T)=>string){const old=new Map(before.map(r=>[key(r),JSON.stringify(r)]));return after.filter(r=>old.get(key(r))!==JSON.stringify(r));}
export function diffOps(before:Ops,after:Ops,loadedMoves:number,lastSeq:number):OpsChanges{
 const a=toRows(before),b=toRows(after);
 const lineKey=(l:RecipeLineRow)=>l.productId+'\u0000'+l.ingredientId;
 const replace=[...new Set(changed(a.recipeLines,b.recipeLines,lineKey).map(l=>l.productId).concat(a.recipeLines.filter(l=>!b.recipeLines.some(x=>lineKey(x)===lineKey(l))).map(l=>l.productId)))];
 return {
  ingredients:changed(a.ingredients,b.ingredients,r=>r.id),
  invoices:changed(a.invoices,b.invoices,r=>r.id),
  invoiceLines:changed(a.invoiceLines,b.invoiceLines,r=>r.invoiceId+'\u0000'+r.id),
  recipes:changed(a.recipes,b.recipes,r=>r.productId),
  replaceRecipeLines:replace,
  recipeLines:b.recipeLines.filter(l=>replace.includes(l.productId)),
  incoming:changed(a.incoming,b.incoming,r=>r.id),
  moves:after.moves.slice(loadedMoves).map((m,i)=>({...m,seq:lastSeq+i+1})),
  history:after.recipeHistory.map(h=>({productId:h.recipe.productId,date:h.date,portionCents:h.portionCents,recipe:JSON.stringify(h.recipe)})),
 };
}

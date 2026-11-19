// Boodschappenlijst bij de Weekassistent (wens eigenaar 9 november 2026: „met de producten die voor die week gekocht moeten
// worden; als ze erop klikt een duidelijke vink van besteld. Ideaal als ze naar de Hanos moet.”).
// Geen eigen rekenregel: de lijst komt uit het weekmenu (bevestigd, anders het concept) en de vaste rekenregel van Inkoop &
// voorraad (shoppingPlan: recepten × porties, voorraad, minimum, verpakking). Een vinkje legt een bestelling „onderweg” vast
// in Inkoop & voorraad (incoming_orders, vast kenmerk per week en ingrediënt), zodat dezelfde voorraadregels het meetellen.
// Uitvinken annuleert die bestelling (alleen zolang er nog niets van is ontvangen). Er gaat niets naar een leverancier.
// Ook op de lijst (wens eigenaar 9 november 2026): wat na een telling onder het minimum zit (ook zonder weekmenu), en wat
// iemand zelf toevoegt (tabel shopping_items, ook via de Weekassistent: „zet melk op de boodschappenlijst”).
import {loadOps,saveOps} from './operations-store';
import {shoppingPlan,priceInfo,type Ops,type Demand} from './operations-core';
import {weekMenus} from './assistant-store';
import {getDb} from '@/db';
import {shoppingItems} from '@/db/schema';
import {and,eq,asc} from 'drizzle-orm';

export class ShoppingError extends Error{constructor(message:string,public status=400){super(message)}}
export const shoppingId=(week:string,ingredientId:string)=>'boodschap:'+week+':'+ingredientId;
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date());

export type ShoppingLine={ingredientId:string;name:string;unit:string;supplier:string;quantity:number|null;packs:number|null;pack:number;needed:number;stock:number|null;
 estimatedCents:number|null;counted:boolean;checked:boolean;received:boolean;reason:'menu'|'voorraad'};
export type OwnItem={id:string;name:string;amount:string;checked:boolean;checkedBy:string;createdBy:string};

/** De lijst voor een week: weekmenu, voorraad onder het minimum en zelf toegevoegd. Afgevinkte regels blijven staan (met vinkje);
 * hun eigen bestelling telt niet mee bij het uitrekenen. */
export async function shoppingList(week:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(week))throw new ShoppingError('Ongeldige week.');
 const menus=await weekMenus(week),menu=menus.confirmed||menus.concept;
 const loaded=await loadOps('none'),ops=loaded.state,now=today(),due=week>now?week:now;
 const own=(id:string)=>ops.incoming.find(o=>o.id===shoppingId(week,id));
 // Rekenen zonder de eigen vinkjes, zodat een afgevinkte regel met dezelfde hoeveelheid blijft staan.
 const base:Ops={...ops,incoming:ops.incoming.filter(o=>!o.id.startsWith('boodschap:'+week+':'))};
 const per=new Map<string,number>(),missingPortions:string[]=[];
 for(const it of menu?.items||[]){if(it.portions&&it.portions>0)per.set(it.productId,(per.get(it.productId)||0)+it.portions);else missingPortions.push(it.name)}
 const demand:Demand[]=[...per].map(([productId,portions])=>({productId,portions}));
 const plan=demand.length?shoppingPlan(base,demand,due,now):{lines:[],blockers:[] as string[],totalCents:null};
 const names=new Map(base.recipes.map(r=>[r.productId,r.name]));
 const line=(l:typeof plan.lines[number],reason:ShoppingLine['reason']):ShoppingLine=>{const o=own(l.ingredient.id);return {
  ingredientId:l.ingredient.id,name:l.ingredient.name,unit:l.ingredient.unit,supplier:l.ingredient.supplier,quantity:l.quantity,packs:l.packs,pack:l.ingredient.pack,needed:l.needed,
  stock:l.ingredient.known?l.ingredient.stock:null,estimatedCents:l.estimatedCents,counted:l.ingredient.known,checked:o?.status==='confirmed'||o?.status==='received',received:o?.status==='received'||(!!o&&o.remaining<o.quantity),reason}};
 const keep=(l:typeof plan.lines[number])=>l.quantity===null||l.quantity>0||own(l.ingredient.id)?.status==='confirmed';
 const lines=plan.lines.filter(keep).map(l=>line(l,'menu'));
 // Voorraad onder het minimum (na een telling), ook zonder weekmenu: aanvullen tot het minimum, afgerond op verpakking.
 const inMenu=new Set(plan.lines.map(l=>l.ingredient.id));
 const low=base.ingredients.filter(i=>i.known&&i.min>0&&!inMenu.has(i.id)).map(i=>{
  const incoming=base.incoming.filter(o=>o.ingredientId===i.id&&o.status==='confirmed'&&o.due<=due).reduce((t,o)=>t+o.remaining,0);
  const shortage=Math.max(0,i.min-i.stock-incoming),packs=Math.ceil(Math.max(0,shortage-1e-9)/i.pack),quantity=packs*i.pack,unit=priceInfo(base,i.id,now).unitCents;
  return {ingredient:i,needed:0,quantity,packs,estimatedCents:unit===null?null:Math.round(quantity*unit)} as typeof plan.lines[number]});
 lines.push(...low.filter(keep).map(l=>line(l,'voorraad')));
 lines.sort((a,b)=>Number(a.checked)-Number(b.checked)||a.supplier.localeCompare(b.supplier,'nl')||a.name.localeCompare(b.name,'nl'));
 const items:OwnItem[]=(await getDb().select().from(shoppingItems).where(and(eq(shoppingItems.week,week),eq(shoppingItems.removed,0))).orderBy(asc(shoppingItems.created)))
  .map(r=>({id:r.id,name:r.name,amount:r.amount,checked:!!r.checked,checkedBy:r.checkedBy,createdBy:r.createdBy}));
 return {week,version:loaded.version,menu:menu?{status:menu.status,items:menu.items.length}:null,lines,items,missingPortions,
  blockers:plan.blockers.map(b=>b.replace(/^Geen recept voor (.+)$/,(m,id)=>'Geen recept voor '+(names.get(id)||menu?.items.find(i=>i.productId===id)?.name||id))),totalCents:plan.totalCents};
}

/** Zelf iets op de lijst zetten (ook door de Weekassistent op verzoek). Dezelfde naam twee keer in één week wordt niet dubbel. */
export async function addItem(week:string,name:unknown,amount:unknown,by:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(week))throw new ShoppingError('Ongeldige week.');
 const n=String(name??'').replace(/\s+/g,' ').trim(),a=String(amount??'').replace(/\s+/g,' ').trim();
 if(!n||n.length>120||a.length>60)throw new ShoppingError('Vul een naam in (hooguit 120 tekens) en eventueel een hoeveelheid.');
 const db=getDb(),same=(await db.select().from(shoppingItems).where(and(eq(shoppingItems.week,week),eq(shoppingItems.removed,0)))).find(r=>r.name.toLowerCase()===n.toLowerCase()&&!r.checked);
 if(same){if(a&&a!==same.amount)await db.update(shoppingItems).set({amount:a}).where(eq(shoppingItems.id,same.id));return {id:same.id,already:true}}
 const id=crypto.randomUUID();await db.insert(shoppingItems).values({id,week,name:n,amount:a,createdBy:by,created:new Date().toISOString()});return {id,already:false};
}
export async function updateItem(id:unknown,change:{checked?:boolean;removed?:boolean},by:string){
 if(typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id))throw new ShoppingError('Ongeldige aanvraag.');
 const set=change.removed?{removed:1}:{checked:change.checked?1:0,checkedBy:change.checked?by:'',checkedAt:change.checked?new Date().toISOString():''};
 const r=await getDb().update(shoppingItems).set(set).where(and(eq(shoppingItems.id,id),eq(shoppingItems.removed,0))).returning({id:shoppingItems.id});
 if(!r.length)throw new ShoppingError('Dit staat niet (meer) op de boodschappenlijst.',409);
}

/** Vinkje „besteld” aan of uit. Eén aanvraag-id per tik: dubbel tikken of herladen doet niets extra. */
export async function setChecked(week:string,ingredientId:string,checked:boolean,requestId:string,by:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(week)||typeof ingredientId!=='string'||!ingredientId||ingredientId.length>100||!/^[A-Za-z0-9_-]{8,100}$/.test(requestId))throw new ShoppingError('Ongeldige aanvraag.');
 const list=await shoppingList(week),line=list.lines.find(l=>l.ingredientId===ingredientId);
 if(!line)throw new ShoppingError('Dit staat niet (meer) op de boodschappenlijst. Ververs de lijst.',409);
 const loaded=await loadOps('none'),next:Ops=structuredClone(loaded.state),id=shoppingId(week,ingredientId),o=next.incoming.find(x=>x.id===id);
 if(checked){
  if(line.quantity===null)throw new ShoppingError('Tel eerst de voorraad van '+line.name+' in Inkoop & voorraad; dan weet de lijst hoeveel er nodig is.',409);
  if(o&&o.status==='confirmed')return {ok:true,already:true};
  if(o&&o.status==='received')throw new ShoppingError('Dit is al ontvangen.',409);
  const due=week>today()?week:today(),row={id,ingredientId,quantity:line.quantity,remaining:line.quantity,due,status:'confirmed' as const,supplier:(line.supplier||'Boodschappen').slice(0,200)};
  if(o)Object.assign(o,row);else next.incoming.push(row);
 }else{
  if(!o||o.status==='geannuleerd')return {ok:true,already:true};
  if(o.status==='received'||o.remaining<o.quantity)throw new ShoppingError('Hier is al iets van ontvangen; uitvinken kan niet meer.',409);
  o.status='geannuleerd';o.remaining=0;
 }
 const r=await saveOps(loaded,next,requestId,checked?'boodschap-besteld:'+by:'boodschap-terug:'+by);
 if(r==='conflict')throw new ShoppingError('De voorraad is net gewijzigd. Probeer het nog eens.',409);
 return {ok:true,duplicate:r==='duplicate'};
}

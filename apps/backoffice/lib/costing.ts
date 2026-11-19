// Cost price per unit, margin and ingredient suggestions for purchase invoices.
// Purchase amounts are always excluding VAT: input VAT is reclaimed, so it is no cost.
// The guest pays VAT on the selling price; the margin compares that price excluding VAT with the cost price.
import type {Ingredient,PurchaseLine,Unit} from './operations-core';

/** Net price per kg, litre or piece for one invoice line (excluding VAT). */
export function unitPriceCents(l:Pick<PurchaseLine,'netCents'|'quantity'>){return l.quantity>0?l.netCents/l.quantity:null}

/** Selling price incl. VAT → excl. VAT, VAT amount and margin over the cost price (all per portion). */
export function margin(priceCentsIncl:number,vat:string,costCents:number|null){
 if(!['9','21'].includes(vat)||!Number.isFinite(priceCentsIncl)||priceCentsIncl<=0)return null;
 const exclCents=priceCentsIncl/(1+Number(vat)/100),vatCents=priceCentsIncl-exclCents;
 if(costCents===null)return {exclCents,vatCents,marginCents:null,marginPct:null};
 const marginCents=exclCents-costCents;
 return {exclCents,vatCents,marginCents,marginPct:100*marginCents/exclCents};
}

const words=(s:string)=>s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9 ]+/g,' ').split(/\s+/).filter(w=>w.length>2&&!/^\d/.test(w)&&!STOP.has(w));
const STOP=new Set(['bio','biologisch','biologische','per','stuk','stuks','doos','pak','fles','zak','emmer','liter','gram','kilo','ltr','krat','tray','cart','karton','vers','verse']);

/** Proposes an existing ingredient for an invoice line: same supplier article first, otherwise the best name match.
 * Ingredients "van eigen boerderij" are never proposed: our own milk must not be mixed up with wholesale milk. */
export function suggestIngredient(l:Pick<PurchaseLine,'article'|'description'|'unit'>,supplier:string,all:Ingredient[]):{ingredientId:string;reason:'artikel'|'naam'}|null{
 const ingredients=all.filter(i=>i.origin!=='eigen');
 const byArticle=ingredients.find(i=>i.article.trim()&&i.article.trim()===l.article.trim()&&i.supplier.trim().toLowerCase()===supplier.trim().toLowerCase());
 if(byArticle)return {ingredientId:byArticle.id,reason:'artikel'};
 const want=new Set(words(l.description));if(!want.size)return null;
 let best:{i:Ingredient;score:number}|null=null;
 for(const i of ingredients){if(i.unit!==l.unit)continue;const have=words(i.name);if(!have.length)continue;
  const hits=have.filter(w=>want.has(w)).length,score=hits/have.length;
  if(hits&&score>=0.99&&(!best||score>best.score||(score===best.score&&have.length>words(best.i.name).length)))best={i,score}}
 return best?{ingredientId:best.i.id,reason:'naam'}:null;
}

/** A readable ingredient name from an invoice description: drops article codes, pack sizes and shouting capitals. */
export function cleanName(description:string){
 const t=description.replace(/\b\d+([.,]\d+)?\s*(x|×)\s*\d+([.,]\d+)?\s*(kg|gr|g|l|ltr|ml|cl|st|stuks?)?\b/gi,' ').replace(/\b\d+([.,]\d+)?\s*(kg|gr|g|l|ltr|ml|cl|st|stuks?)\b/gi,' ').replace(/\s{2,}/g,' ').trim();
 const lower=t===t.toUpperCase()?t.toLowerCase():t;
 return (lower.charAt(0).toUpperCase()+lower.slice(1)).slice(0,200)||'Nieuw ingrediënt';
}

/** Draft for a new ingredient based on an invoice line; the owner checks and saves it. Allergens stay unchecked. */
export function draftIngredient(l:PurchaseLine,supplier:string,id:string):Ingredient{
 const pack=l.packSize&&l.packSize>0?l.packSize:l.quantity>0?l.quantity:1;
 return {id,name:cleanName(l.description),unit:l.unit as Unit,supplier:supplier.trim(),article:l.article.trim(),stock:0,known:false,countedAt:'',pack,min:0,leadDays:1,shelfDays:0,allergens:[],checked:false,notes:'Aangemaakt vanuit factuurregel: '+l.description.slice(0,300),origin:'inkoop',ownCents:null};
}

/** Best existing ingredient for a free name (a recipe proposal or a shop product): all words of the ingredient name
 * appear in the name, or all words of the name appear in the ingredient name. Optionally only one unit. */
export function matchByName(name:string,ingredients:Ingredient[],unit?:Unit):Ingredient|null{
 const want=new Set(words(name));if(!want.size)return null;
 let best:{i:Ingredient;score:number}|null=null;
 for(const i of ingredients){if(unit&&i.unit!==unit)continue;const have=words(i.name);if(!have.length)continue;
  const hits=have.filter(w=>want.has(w)).length;const full=hits===have.length||[...want].every(w=>have.includes(w));
  if(!full||!hits)continue;const score=hits/Math.max(have.length,want.size);
  if(!best||score>best.score)best={i,score}}
 return best?.i??null;
}

/** Resale proposal for a shop product without a recipe: sold exactly as bought, so the recipe is 1 piece of one ingredient.
 * Uses an existing ingredient sold per piece when the name matches; otherwise a new ingredient with the product name. */
export type ResaleProposal={productId:string;name:string;ingredientId:string|null;newName:string};
export function resaleProposals(products:{id:string;name:string;department:string}[],recipes:{productId:string}[],ingredients:Ingredient[]):ResaleProposal[]{
 const has=new Set(recipes.map(r=>r.productId));
 return products.filter(p=>p.department==='Winkel'&&!has.has(p.id)&&p.name.trim()).map(p=>{const i=matchByName(p.name,ingredients,'st');return {productId:p.id,name:p.name.trim(),ingredientId:i?.id??null,newName:i?'':p.name.trim().slice(0,200)}}).sort((a,b)=>a.name.localeCompare(b.name,'nl'));
}

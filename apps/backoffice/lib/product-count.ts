// Voorraad als getal in de productentabel (wens eigenaar 3 november 2026: „bij voorraad een getal kunnen invoeren”).
// Er komt geen tweede voorraadlijst: een getelde verkoopproduct haalt zijn voorraad uit de ingrediëntenvoorraad
// (lib/shop-stock.ts). Typt het team een aantal in:
// - heeft het product nog geen recept, dan wordt het een doorverkoopproduct: één ingrediënt per stuk met dezelfde naam
//   (zoals „Producten zonder recept” bij Inkoop), recept als concept;
// - is het al doorverkoop, dan wordt dat ingrediënt geteld;
// - heeft het een echt recept (meer ingrediënten), dan wordt het niet hier geteld maar via de ingrediënten bij Inkoop;
// - daarna staat het product op „geteld” (concept én gepubliceerde versie, zoals de snelle voorraadinstellingen).
import {getDb} from '@/db';
import {products} from '@/db/schema';
import {and,eq} from 'drizzle-orm';
import {loadOps,saveOps,isProcessed} from './operations-store';
import {resaleIngredient} from './shop-stock';
import type {Ingredient} from './operations-core';

export class CountError extends Error{status:number;constructor(m:string,status=400){super(m);this.status=status}}
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date());
export const MAX_COUNT=100000;

/** Legt het aantal stuks vast dat er nu ligt. Herhaalbaar met hetzelfde requestId. Geeft de nieuwe productversie. */
export async function setProductCount(id:string,version:number,count:number,requestId:string){
 if(!Number.isInteger(count)||count<0||count>MAX_COUNT)throw new CountError('Vul een heel aantal in (0 of meer).');
 const db=getDb();
 const row=(await db.select().from(products).where(eq(products.id,id)))[0];
 if(!row)throw new CountError('Product niet gevonden.',404);
 if(row.version!==version)throw new CountError('Dit product is intussen gewijzigd. Ververs de lijst en probeer opnieuw.',409);
 const name=String((JSON.parse(row.draft) as {name?:string}).name||'').trim().slice(0,200)||'Product';
 if(!await isProcessed(requestId)){
  const loaded=await loadOps('none'),s=structuredClone(loaded.state),day=today();
  let recipe=s.recipes.find(r=>r.productId===id);
  if(recipe&&!resaleIngredient(s,id))throw new CountError('Dit product heeft een recept met ingrediënten: tel de ingrediënten bij Inkoop & voorraad.',409);
  if(!recipe){
   const same=s.ingredients.find(i=>i.unit==='st'&&i.name.trim().toLowerCase()===name.toLowerCase()&&i.origin==='inkoop');
   const ing:Ingredient=same??{id:crypto.randomUUID(),name,unit:'st',supplier:'',article:'',stock:0,known:false,countedAt:'',pack:1,min:0,leadDays:1,shelfDays:0,allergens:[],checked:false,notes:'Aangemaakt bij het tellen in Gerechten & prijzen ('+day+'). Leverancier en allergenen nog invullen.',origin:'inkoop',ownCents:null};
   if(!same)s.ingredients.push(ing);
   recipe={productId:id,name,yield:1,lines:[{ingredientId:ing.id,quantity:1}],method:'Doorverkoop: ingekocht of van eigen boerderij en ongewijzigd verkocht.',lossPct:0,packagingCents:0,version:1,reviewed:false};
   s.recipes.push(recipe);
  }
  const i=s.ingredients.find(x=>x.id===recipe!.lines[0].ingredientId)!;
  s.moves.push({id:crypto.randomUUID(),ingredientId:i.id,quantity:count-i.stock,date:day,reason:i.known?'Telling / correctie':'Beginvoorraad',reference:'Telling'});
  i.stock=count;i.known=true;i.countedAt=day;
  const saved=await saveOps(loaded,s,requestId,'count');
  if(saved==='conflict')throw new CountError('Er is elders iets gewijzigd in de voorraad. Ververs en probeer opnieuw.',409);
 }
 // Product op „geteld”, in het concept én (als die er is) in de gepubliceerde versie, zodat het meteen voor gasten geldt.
 const mark=(json:string)=>JSON.stringify({...JSON.parse(json) as Record<string,unknown>,stockMode:'geteld'});
 if((JSON.parse(row.draft) as {stockMode?:string}).stockMode==='geteld'&&(!row.published||(JSON.parse(row.published) as {stockMode?:string}).stockMode==='geteld'))return row.version;
 const done=await db.update(products).set({draft:mark(row.draft),...(row.published?{published:mark(row.published)}:{}),version:row.version+1}).where(and(eq(products.id,id),eq(products.version,version))).returning({id:products.id});
 if(!done.length)throw new CountError('Dit product is intussen gewijzigd. Ververs de lijst en probeer opnieuw.',409);
 return row.version+1;
}

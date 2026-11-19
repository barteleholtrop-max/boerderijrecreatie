// Voorraad van verkoopproducten (besluit eigenaar 3 november 2026, „Voorraad en winkelprijzen”).
// - Een product staat op „onbeperkt” (standaard, er wordt niets geteld) of op „geteld”.
// - Een geteld product haalt zijn voorraad uit de bestaande ingrediëntenvoorraad via zijn recept. Bij doorverkoop is dat
//   1 stuk van één ingrediënt, dus de productvoorraad is gewoon de ingrediëntvoorraad. Er is geen tweede voorraadlijst.
// - Bij 0 stuks is het product uitverkocht: de website toont „Uitverkocht” en bestellen kan niet.
// - Een verkoop (kassa direct, online na betaling) haalt de voorraad af met reden „Verkoop”.
// Alleen pure rekenregels; database en API staan in stock-sales.ts en de routes.

export type StockMode='onbeperkt'|'geteld';
export const STOCK_MODES:StockMode[]=['onbeperkt','geteld'];
type IngredientLike={id:string;name:string;stock:number;known:boolean;min:number};
type RecipeLike={productId:string;yield:number;lossPct:number;lines:{ingredientId:string;quantity:number}[]};
export type StockSource={ingredients:IngredientLike[];recipes:RecipeLike[]};
export type ProductStock=
 |{tracked:false}
 |{tracked:true;stock:number;low:boolean;resale:IngredientLike|null}
 |{tracked:true;stock:null;problem:string};

/** Staat dit product op tellen? Bestaande producten zonder instelling zijn onbeperkt. */
export const isTracked=(p:{stockMode?:unknown}|null|undefined)=>p?.stockMode==='geteld';

/** Hoeveel van elk ingrediënt één verkocht stuk gebruikt (verlies meegerekend, zoals bij receptverbruik). */
export function perUnit(r:RecipeLike){return r.lines.map(l=>({ingredientId:l.ingredientId,quantity:l.quantity/r.yield/(1-r.lossPct/100)}))}

/** Doorverkoop: precies 1 stuk van één ingrediënt, zonder verlies. Dan is de productvoorraad de ingrediëntvoorraad. */
export function resaleIngredient(src:StockSource,productId:string){
 const r=src.recipes.find(r=>r.productId===productId);
 if(!r||r.lines.length!==1||r.yield!==1||r.lossPct!==0||r.lines[0].quantity!==1)return null;
 return src.ingredients.find(i=>i.id===r.lines[0].ingredientId)??null;
}

/** Voorraad in verkoopbare stuks. Afgerond naar beneden: een half stuk kun je niet verkopen. */
export function productStock(src:StockSource,product:{id:string;stockMode?:unknown}):ProductStock{
 if(!isTracked(product))return {tracked:false};
 const r=src.recipes.find(r=>r.productId===product.id);
 if(!r||!r.lines.length)return {tracked:true,stock:null,problem:'Koppel eerst een ingrediënt (recept) om te kunnen tellen.'};
 let stock=Infinity,low=false;
 for(const u of perUnit(r)){
  const i=src.ingredients.find(i=>i.id===u.ingredientId);
  if(!i)return {tracked:true,stock:null,problem:'Een ingrediënt van het recept bestaat niet meer.'};
  if(!i.known)return {tracked:true,stock:null,problem:'Leg eerst de voorraad vast (tellen).'};
  stock=Math.min(stock,Math.max(0,Math.floor(i.stock/u.quantity+1e-9)));
  if(i.min>0&&i.stock<=i.min)low=true;
 }
 return {tracked:true,stock,low,resale:resaleIngredient(src,product.id)};
}

/** Voorraad per product-ID, alleen voor getelde producten waarvan de stand bekend is. */
export function stockMap(src:StockSource,products:{id:string;stockMode?:unknown}[]){
 const m=new Map<string,number>();
 for(const p of products){const s=productStock(src,p);if(s.tracked&&s.stock!==null)m.set(p.id,s.stock)}
 return m;
}

/** Controle vóór het vastleggen van een bestelling: genoeg op voorraad? Geeft een melding voor de gast of de kassa. */
export function stockProblem(lines:{productId:string;name:string;quantity:number}[],stock:Map<string,number>){
 const wanted=new Map<string,{name:string;quantity:number}>();
 for(const l of lines){const w=wanted.get(l.productId);wanted.set(l.productId,{name:l.name,quantity:(w?.quantity??0)+l.quantity})}
 for(const [id,w] of wanted){
  const left=stock.get(id);if(left===undefined)continue;
  if(left<=0)return w.name+' is uitverkocht.';
  if(w.quantity>left)return `Van ${w.name} is er nog maar ${left} op voorraad.`;
 }
 return null;
}

/** Wat een verkoop van de voorraad afhaalt: per ingrediënt de hoeveelheid, en het tekort als er minder lag. */
export function saleMoves(src:StockSource,lines:{productId:string;quantity:number}[]){
 const need=new Map<string,number>();
 for(const l of lines){const r=src.recipes.find(r=>r.productId===l.productId);if(!r)continue;for(const u of perUnit(r))need.set(u.ingredientId,(need.get(u.ingredientId)??0)+u.quantity*l.quantity)}
 return [...need].flatMap(([ingredientId,quantity])=>{
  const i=src.ingredients.find(i=>i.id===ingredientId);if(!i||!i.known)return [];
  const take=Math.min(quantity,Math.max(0,i.stock));
  return [{ingredientId,quantity:Math.round(take*1e6)/1e6,shortage:Math.round((quantity-take)*1e6)/1e6}];
 });
}

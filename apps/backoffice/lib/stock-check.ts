// Werkplek → Voorraad controleren (wens eigenaar 6 november 2026: „Voorraad controleren … als apart onderdeel”).
// Alleen rekenwerk op de bestaande voorraad (lib/shop-stock.ts): welke producten worden geteld, wat de lijst zegt en of het
// vandaag al gecontroleerd is. „Gecontroleerd” = het ingrediënt van het product is vandaag geteld (countedAt), ook als het
// aantal klopte. Er is geen tweede voorraad: tellen gaat via de bestaande telling (set-stock → Inkoop & voorraad).
import {productStock,resaleIngredient,type StockSource} from './shop-stock';
export type CheckProduct={id:string;version:number;published:{name:string;station?:string;stockMode?:unknown;available?:boolean}|null};
export type CheckRow={id:string;version:number;name:string;station:string;stock:number;countedAt:string;checkedToday:boolean};
type Ingredient={id:string;countedAt?:string};

/** Rows to check (resale products: one product = one ingredient), plus products counted elsewhere and unlimited ones. */
export function checkList(products:CheckProduct[],src:StockSource&{ingredients:Ingredient[]},today:string,station=''){
 const rows:CheckRow[]=[],viaInkoop:string[]=[],unlimited:string[]=[];
 for(const p of products){
  const pub=p.published;if(!pub||(station&&pub.station!==station))continue;
  const s=productStock(src,{id:p.id,stockMode:pub.stockMode});
  if(!s.tracked){unlimited.push(pub.name);continue}
  const one=resaleIngredient(src,p.id) as Ingredient|null; // alleen doorverkoop (1 stuk = 1 ingrediënt) kan hier geteld worden
  if(s.stock===null||!one){viaInkoop.push(pub.name);continue}
  const countedAt=one.countedAt||'';
  rows.push({id:p.id,version:p.version,name:pub.name,station:pub.station||'',stock:s.stock,countedAt,checkedToday:countedAt===today});
 }
 const byName=(a:string,b:string)=>a.localeCompare(b,'nl');
 rows.sort((a,b)=>Number(a.checkedToday)-Number(b.checkedToday)||byName(a.name,b.name));
 return {rows,viaInkoop:viaInkoop.sort(byName),unlimited:unlimited.sort(byName),done:rows.filter(r=>r.checkedToday).length,total:rows.length};
}

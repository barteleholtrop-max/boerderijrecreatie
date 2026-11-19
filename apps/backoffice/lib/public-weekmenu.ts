// Guest-facing weekmenu: only CONFIRMED menus (from the Weekassistent), from this week on, and only dishes whose
// product is published. Name, price and photo come from the same public product view as the menu card; expected
// portions and anything internal are never shared.
import type {PublicProduct} from './public-products';
export type ConfirmedMenu={week:string;items:{productId:string;day:string;note:string}[]};
export type PublicWeekMenu={week:string;items:{productId:string;name:string;day:string;note:string;priceCents:number;vat:string;available:boolean;photo:string|null}[]};
const DAYS=['','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag','zondag'];
export function publicWeekMenus(menus:ConfirmedMenu[],products:PublicProduct[],thisWeek:string):PublicWeekMenu[]{
 const byId=new Map(products.map(p=>[p.id,p]));
 return menus.filter(m=>/^\d{4}-\d{2}-\d{2}$/.test(m.week)&&m.week>=thisWeek).sort((a,b)=>a.week.localeCompare(b.week)).slice(0,2).map(m=>({week:m.week,
  items:m.items.flatMap(i=>{const p=byId.get(i.productId);if(!p)return [];
   return [{productId:p.id,name:p.name,day:DAYS.includes(i.day)?i.day:'',note:String(i.note||'').slice(0,300),priceCents:p.priceCents,vat:p.vat,available:p.available,photo:p.photo}]})}))
  .filter(m=>m.items.length>0);
}

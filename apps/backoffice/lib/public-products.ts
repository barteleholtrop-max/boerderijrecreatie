import {categorize,CATEGORIES} from './price-advice';
import {priceCheckOpen} from './orders';
import {currentPrice} from './offer-core';
// Guest-facing view of the central product data: only published products and only fields meant for guests.
// Concepts, internal notes, checks, source IDs and work stations are never exposed.
type Choice={id?:unknown;label?:unknown;extraCents?:unknown};type Group={id?:unknown;title?:unknown;required?:unknown;choices?:Choice[]};
export type PublicProduct={barcodes:string[];supplier:string|null;supplierCompany:string|null;tile:boolean;id:string;version:number;name:string;department:string;menuCategory:string;route:'eten-drinken'|'winkel';priceCents:number;wasCents:number|null;vat:string;available:boolean;photo:string|null;allergens:string[]|null;allergensChecked:boolean;organic:boolean;skal:boolean;soldOut:boolean;customerPrice:boolean;optionGroups:{id:string;title:string;required:boolean;choices:{id:string;label:string;extraCents:number}[]}[]};
const MEDIA=/^\/api\/media\/([a-f0-9-]{36})$/;
/** The beeldbank id behind a product photo, or null. */
export function mediaId(photo:unknown){return typeof photo==='string'?MEDIA.exec(photo)?.[1]??null:null}
/** Guest-facing photo address: https as is, beeldbank photo via /api/public/media/…, anything else none. */
export function publicPhoto(photo:unknown){const id=mediaId(photo);if(id)return '/api/public/media/'+id;return typeof photo==='string'&&/^https:\/\//i.test(photo)?photo:null}
/** Beeldbank ids that may be shown publicly: only photos of published products. */
export function publicMediaIds(rows:{published:string|null}[]){const ids=new Set<string>();for(const r of rows){if(!r.published)continue;try{const id=mediaId((JSON.parse(r.published) as Record<string,unknown>).photo);if(id)ids.add(id)}catch{}}return ids}
// stock: voorraad in stuks van getelde producten (lib/stock-sales.ts). Bij 0 is het product uitverkocht en niet te bestellen.
export function publicProducts(rows:{id:string;version:number;published:string|null}[],stock:Map<string,number>=new Map(),suppliers:Map<string,string>=new Map(),companies:Map<string,string>=new Map()):PublicProduct[]{
 return rows.flatMap(r=>{
  if(!r.published)return [];
  const p=JSON.parse(r.published) as Record<string,unknown>;
  if(typeof p.name!=='string'||!Number.isSafeInteger(p.priceCents)||!['9','21'].includes(String(p.vat)))return [];
  const checked=p.allergensChecked===true;
  const soldOut=p.stockMode==='geteld'&&stock.has(r.id)&&stock.get(r.id)!<=0;
  return [{id:r.id,version:r.version,name:p.name,department:String(p.department||''),menuCategory:CATEGORIES[categorize(p.name)||'']?.label||( /koekje/i.test(p.name)?'Taart en gebak':'Overig'),priceCents:currentPrice({priceCents:Number(p.priceCents),offer:p.offer,deal:p.deal}).priceCents,
   // Zondagaanbieding (wens eigenaar 5 november 2026): de gewone prijs erbij, zodat de website de korting kan tonen.
   wasCents:currentPrice({priceCents:Number(p.priceCents),offer:p.offer,deal:p.deal}).wasCents,vat:String(p.vat),
   // Which guest basket: shop products are handled by the shop, everything else by kitchen or coffee bar.
   route:(p.station==='winkel'?'winkel':'eten-drinken') as PublicProduct['route'],
   // Only orderable when a work station is set (kok, barista or winkel); otherwise an order would be refused.
   available:!soldOut&&p.available!==false&&!priceCheckOpen(p)&&['kok','barista','winkel'].includes(String(p.station)),
   // Public https images as they are; a beeldbank photo of a published product via the public, read-only photo address.
   photo:publicPhoto(p.photo),
   // Allergens are only shown once checked; otherwise the website must ask guests to check with staff.
   allergens:checked&&Array.isArray(p.allergens)?p.allergens.map(String):null,allergensChecked:checked,organic:p.organic===true||p.skal===true,skal:p.skal===true,
   // Uitverkocht (getelde voorraad 0). De website toont dan „Uitverkocht” in plaats van „niet beschikbaar”.
   soldOut,
   // Klant voert prijs in (etiket, bijvoorbeeld rundvlees per gewicht): de website vraagt dan om het bedrag. priceCents is een richtprijs.
   customerPrice:p.customerPrice===true,
   // Op het startscherm (wens eigenaar 9 november 2026): false = geen toets op de kassa, wel te scannen of via een etiket te kopen.
   tile:p.onStartscherm!==false,
   // Streepjescodes (EAN) van de verpakking: de zelfkassa herkent het product aan de code (9 november 2026).
   barcodes:Array.isArray(p.barcodes)?(p.barcodes as unknown[]).filter((b):b is string=>typeof b==='string'&&/^\d{6,14}$/.test(b)).slice(0,20):[],
   // Wie levert het (9 november 2026): alleen een voornaam of de naam van de pot (lib/product-suppliers.ts).
   supplier:suppliers.get(r.id)??null,
   // Bedrijfsnaam van dat lid (17 november 2026), bijvoorbeeld Nijemoed Bloemen: zo toont een landingspagina alleen diens producten.
   supplierCompany:companies.get(r.id)??null,
   // Group and choice IDs are random keys from the product form; the website sends them back when ordering.
   optionGroups:(Array.isArray(p.optionGroups)?p.optionGroups as Group[]:[]).map(g=>({id:String(g.id||''),title:String(g.title||''),required:g.required===true,choices:(g.choices||[]).map(c=>({id:String(c.id||''),label:String(c.label||''),extraCents:Number(c.extraCents)||0}))}))}];
 }).sort((a,b)=>a.department.localeCompare(b.department,'nl')||a.name.localeCompare(b.name,'nl'));
}

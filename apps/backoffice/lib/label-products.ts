// Onbekend etiket → nieuw product (wens eigenaar 9 november 2026): „Als een product nog niet bestaat, kun je het toevoegen aan de
// productlijst (niet in het startscherm). Zo krijgen we een mooi overzicht van wat we verkocht hebben.”
// Fotografeert iemand bij de zelfkassa (of de kok op de werkplek) een etiket van een product dat nog niet in de backoffice staat,
// dan maken we het aan in Gerechten & prijzen: afdeling Winkel, station winkel, prijs van het etiket (de etiketprijs is een
// richtprijs), btw 9% (voedsel), niet op het startscherm van de kassa (onStartscherm false) en met het kenmerk „nieuw via
// zelfkassa” (zelfkassa) om na te kijken. Een product met dezelfde naam wordt hergebruikt. Hooguit MAX_PER_DAY nieuwe producten
// per dag (per serverinstantie), zodat een openbaar scherm de productlijst niet kan volschrijven.
import {getDb} from '@/db';
import {products} from '@/db/schema';
import {and,eq} from 'drizzle-orm';
import {sameEan,NEW_PRODUCT_MARGIN_PCT,type PackageCost} from './package-read-core';
import {sameName} from './label-read-core';
import {isDeleted} from './product-trash';
import {publicProducts,type PublicProduct} from './public-products';

export const MAX_PER_DAY=30;
let day='',made=0;
export type LabelProduct={ok:true;product:PublicProduct;created:boolean}|{ok:false;reason:string};

export async function ensureLabelProduct(name:string,labelName:string,priceCents:number,now=new Date()):Promise<LabelProduct>{
 const db=getDb(),rows=await db.select().from(products);
 for(const r of rows){
  const draft=JSON.parse(r.draft) as Record<string,unknown>;if(isDeleted(draft))continue;
  const pub=r.published?JSON.parse(r.published) as Record<string,unknown>:null;
  if(!sameName(String((pub??draft).name||''),name))continue;
  const shown=pub?publicProducts([{id:r.id,version:r.version,published:r.published}])[0]:null;
  if(shown&&shown.route==='winkel')return {ok:true,product:shown,created:false};
  return {ok:false,reason:`${name} staat al in de productlijst, maar is nu niet te koop in de winkel. Vraag het even aan een van ons.`};
 }
 const today=now.toISOString().slice(0,10);if(today!==day){day=today;made=0}
 if(made>=MAX_PER_DAY)return {ok:false,reason:'Dit product staat nog niet in de lijst. Vraag het even aan een van ons.'};
 const id=crypto.randomUUID(),at=now.toISOString();
 const data={name,department:'Winkel',priceCents,vat:'9',station:'winkel',available:true,photo:'',note:'',check:'',sourceId:'',optionGroups:[],
  customerPrice:true,onStartscherm:false,zelfkassa:{at,labelName:labelName.slice(0,80)},
  // Blijvend kenmerk (bonvraag, 9 november 2026): „zelfkassa” gaat eraf bij nakijken, dit niet. Zo blijft de weekafsluiting vragen
  // bij wie een verkoop hoort zolang het product geen eigenaar heeft.
  viaEtiket:at};
 const json=JSON.stringify(data);
 await db.insert(products).values({id,draft:json,published:json,version:1});
 made++;
 return {ok:true,product:publicProducts([{id,version:1,published:json}])[0],created:true};
}

/** Iemand anders heeft deze streepjescode al (niet verwijderd)? Dan niet nog een keer koppelen. */
async function barcodeOwner(barcode:string,except=''){
 for(const r of await getDb().select().from(products)){
  if(r.id===except)continue;const d=JSON.parse(r.draft) as {barcodes?:unknown}&Record<string,unknown>;if(isDeleted(d))continue;
  if(Array.isArray(d.barcodes)&&(d.barcodes as unknown[]).some(b=>typeof b==='string'&&sameEan(b,barcode)))return r.id;
 }
 return null;
}

/** Streepjescode erbij zetten bij een bestaand product (concept en gepubliceerde versie), zodat het de volgende keer meteen wordt
 *  herkend zonder Claude. Niets doen als het product hem al heeft, of als hij bij een ander product hoort. */
export async function attachBarcode(productId:string,barcode:string){
 if(await barcodeOwner(barcode,productId))return false;
 const db=getDb(),[row]=await db.select().from(products).where(eq(products.id,productId));if(!row)return false;
 const add=(json:string)=>{const d=JSON.parse(json) as Record<string,unknown>;const list=Array.isArray(d.barcodes)?(d.barcodes as string[]):[];
  if(list.some(b=>sameEan(b,barcode)))return null;return JSON.stringify({...d,barcodes:[...list,barcode].slice(0,20)})};
 const draft=add(row.draft);if(!draft)return false;
 const published=row.published?add(row.published)??row.published:null;
 const done=await db.update(products).set({draft,published,version:row.version+1}).where(and(eq(products.id,productId),eq(products.version,row.version))).returning({id:products.id});
 return done.length===1;
}

/** Nieuw verpakt product uit een foto (wens eigenaar 10 november 2026): vaste prijs = het prijsvoorstel (inkoopprijs + 20% marge +
 *  btw), meteen te koop (keuze A van de eigenaar), met de streepjescode erbij. Kenmerk „nieuw via zelfkassa” met de inkoopprijs en de
 *  marge, zodat het bij Gerechten & prijzen → Nieuw via zelfkassa na te kijken is. Niet op het startscherm van de kassa. Een product met
 *  dezelfde naam of dezelfde streepjescode wordt hergebruikt. Zelfde daglimiet als bij etiketten. */
export async function ensurePackagedProduct(name:string,labelName:string,barcode:string|null,priceCents:number,cost:PackageCost|null,now=new Date()):Promise<LabelProduct>{
 const owner=barcode?await barcodeOwner(barcode):null;
 if(owner){const [r]=await getDb().select().from(products).where(eq(products.id,owner));const shown=r?.published?publicProducts([{id:r.id,version:r.version,published:r.published}])[0]:null;
  if(shown&&shown.route==='winkel')return {ok:true,product:shown,created:false};
  return {ok:false,reason:'Dit product staat al in de productlijst, maar is nu niet te koop in de winkel. Vraag het even aan een van ons.'};}
 const same=await ensureByName(name);if(same)return same;
 const today=now.toISOString().slice(0,10);if(today!==day){day=today;made=0}
 if(made>=MAX_PER_DAY)return {ok:false,reason:'Dit product staat nog niet in de lijst. Vraag het even aan een van ons.'};
 const id=crypto.randomUUID(),at=now.toISOString();
 const data={name,department:'Winkel',priceCents,vat:'9',station:'winkel',available:true,photo:'',note:'',check:'',sourceId:'',optionGroups:[],
  customerPrice:false,onStartscherm:false,barcodes:barcode?[barcode]:[],ledger:'7110',...(cost?{targetMarginPct:NEW_PRODUCT_MARGIN_PCT}:{}),
  // Met inkoopregel: het voorstel (inkoopprijs, marge, leverancier) om na te kijken. Zonder: de prijs is op de werkplek ingevuld.
  zelfkassa:{at,labelName:labelName.slice(0,80),...(cost?{voorstel:{inkoopCents:cost.unitCostCents,margePct:NEW_PRODUCT_MARGIN_PCT,leverancier:cost.supplier.slice(0,80),factuur:cost.date,regel:cost.description.slice(0,120)}}:{handmatig:true})},
  viaEtiket:at};
 const json=JSON.stringify(data);
 await getDb().insert(products).values({id,draft:json,published:json,version:1});
 made++;
 return {ok:true,product:publicProducts([{id,version:1,published:json}])[0],created:true};
}
/** Bestaand product met dezelfde naam (zoals bij etiketten), of null. */
async function ensureByName(name:string):Promise<LabelProduct|null>{
 for(const r of await getDb().select().from(products)){
  const draft=JSON.parse(r.draft) as Record<string,unknown>;if(isDeleted(draft))continue;
  const pub=r.published?JSON.parse(r.published) as Record<string,unknown>:null;
  if(!sameName(String((pub??draft).name||''),name))continue;
  const shown=pub?publicProducts([{id:r.id,version:r.version,published:r.published}])[0]:null;
  if(shown&&shown.route==='winkel')return {ok:true,product:shown,created:false};
  return {ok:false,reason:`${name} staat al in de productlijst, maar is nu niet te koop in de winkel. Vraag het even aan een van ons.`};
 }
 return null;
}


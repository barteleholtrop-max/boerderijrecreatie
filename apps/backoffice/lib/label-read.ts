// Etiket lezen voor de zelfkassa (wens eigenaar 9 november 2026): één verzoek aan Claude met de foto en de lijst winkelproducten.
// Regels en controle in lib/label-read-core.ts. De sleutel komt uit Systeem & koppelingen (lib/integrations.ts) en komt nooit in
// een foutmelding. De foto wordt niet bewaard.
import Anthropic from '@anthropic-ai/sdk';
import {anthropicKey,anthropicHeaders} from './integrations';
import {getDb} from '@/db';
import {products,invoices,invoiceLines} from '@/db/schema';
import {isNotNull,eq,and,gte,desc} from 'drizzle-orm';
import {publicProducts} from './public-products';
import {labelSchema,labelPrompt,checkLabel,type LabelCandidate,type LabelResult} from './label-read-core';
import {ensureLabelProduct,ensurePackagedProduct,attachBarcode} from './label-products';
import {readSchema,readPrompt,checkPackage,normalizeEan,sameEan,proposalCents,NEW_PRODUCT_MARGIN_PCT,type PurchaseLine,type PackageCost} from './package-read-core';
import type {PublicProduct} from './public-products';

export class LabelReadOff extends Error{constructor(){super('Etiketten lezen staat nog niet aan.')}}
/** Model: standaard Claude Opus 5.5 op lage inspanning; LABEL_AI_MODEL kan dat overschrijven. */
export const LABEL_MODEL=()=>process.env.LABEL_AI_MODEL?.trim()||'claude-opus-5-5';

export async function readLabel(image:{mediaType:'image/jpeg'|'image/png'|'image/webp';data:string},candidates:LabelCandidate[]):Promise<LabelResult>{
 if(!candidates.length)return {ok:false,reason:'Er staan nu geen winkelproducten klaar.'};
 const raw=await askClaude(image,labelSchema(candidates),labelPrompt(candidates));
 if(raw===REFUSED)return {ok:false,reason:'Het etiket kon nu niet worden gelezen. Typ het bedrag zelf in.'};
 return checkLabel(raw,candidates);
}
const REFUSED=Symbol('geweigerd');
async function askClaude(image:{mediaType:'image/jpeg'|'image/png'|'image/webp';data:string},schema:{[key:string]:unknown},prompt:string):Promise<unknown>{
 const key=await anthropicKey();if(!key)throw new LabelReadOff();
 const client=new Anthropic({apiKey:key,maxRetries:1,timeout:30000,defaultHeaders:await anthropicHeaders()});
 const response=await client.beta.messages.create({
  model:LABEL_MODEL(),max_tokens:4000,
  // Weigert het model, dan neemt de server een ander model over (server-side fallback, zelfde verzoek).
  betas:['server-side-fallback-2026-07-01'],fallbacks:'default',
  output_config:{effort:'low',format:{type:'json_schema',schema}},
  messages:[{role:'user',content:[{type:'image',source:{type:'base64',media_type:image.mediaType,data:image.data}},{type:'text',text:prompt}]}],
 });
 if(response.stop_reason==='refusal'||response.stop_reason==='max_tokens')return REFUSED;
 const text=response.content.flatMap(b=>b.type==='text'?[b.text]:[]).join('');
 let parsed:unknown=null;try{parsed=JSON.parse(text)}catch{}
 return parsed;
}

/** De gepubliceerde winkelproducten waaruit Claude kiest (id en naam). */
export async function shopLabelCandidates(){
 const rows=await getDb().select({id:products.id,version:products.version,published:products.published}).from(products).where(isNotNull(products.published));
 return publicProducts(rows).filter(p=>p.route==='winkel').map(p=>({id:p.id,name:p.name}));
}

/** De laatste inkoopregels (producten, niet statiegeld) van het afgelopen jaar, nieuwste eerst, één per omschrijving; hooguit 150. */
export async function recentPurchaseLines(now=new Date()):Promise<PurchaseLine[]>{
 const since=new Date(now.getTime()-365*86400000).toISOString().slice(0,10);
 const rows=await getDb().select({supplier:invoices.supplier,date:invoices.date,article:invoiceLines.article,description:invoiceLines.description,quantity:invoiceLines.quantity,unit:invoiceLines.unit,netCents:invoiceLines.netCents,kind:invoiceLines.kind})
  .from(invoiceLines).innerJoin(invoices,eq(invoiceLines.invoiceId,invoices.id)).where(and(eq(invoiceLines.kind,'product'),gte(invoices.date,since))).orderBy(desc(invoices.date)).limit(600);
 const seen=new Set<string>(),out:PurchaseLine[]=[];
 for(const r of rows){const key=(r.supplier+'|'+r.description).toLocaleLowerCase('nl-NL');if(seen.has(key)||!r.description.trim())continue;seen.add(key);
  out.push({id:'r'+(out.length+1),supplier:r.supplier,date:r.date,article:r.article,description:r.description,quantity:r.quantity,unit:r.unit,netCents:r.netCents});if(out.length>=150)break}
 return out;
}

type Image={mediaType:'image/jpeg'|'image/png'|'image/webp';data:string};
export type ProductRead=(Extract<LabelResult,{ok:true}>&{productId:string;product:PublicProduct|null;created:boolean;barcode?:string|null;proposal?:{unitCostCents:number;marginPct:number;supplier:string}})
 |{ok:false;reason:string;code?:'geen-inkoopprijs';newName?:string;barcode?:string|null};
const fixed=(p:PublicProduct,labelName:string,extra:object={})=>({ok:true as const,productId:p.id,product:p,created:false,labelName,totalCents:p.priceCents,weightGrams:null,unitPriceCents:null,checked:true,...extra});

/** Etiket of verpakking lezen en, als het product nog niet bestaat, het aanmaken.
 *  1. Streepjescode meegegeven (de tablet of telefoon las hem al uit de foto) en bekend: meteen dat product, zonder Claude.
 *  2. Anders leest Claude de foto. Met een bedrag op het etiket: zoals voorheen (lib/label-products.ts ensureLabelProduct).
 *  3. Een verpakt product zonder etiketbedrag: bekend product → zijn prijs (en de streepjescode erbij); nieuw → prijsvoorstel uit de
 *     inkoopfactuur (inkoopprijs + 20% marge + btw) en meteen te koop. Geen inkoopprijs gevonden → niet aanmaken (code geen-inkoopprijs).
 *  product: het (nieuwe) product zoals de website het kent, zodat het meteen in het mandje kan; created: net aangemaakt. */
export async function readLabelProduct(image:Image,barcodeIn?:unknown):Promise<ProductRead>{
 const shop=await shopProducts(),code=normalizeEan(barcodeIn);
 if(code){const hit=shop.find(p=>p.barcodes.some(b=>sameEan(b,code)));if(hit&&!hit.customerPrice&&hit.available)return fixed(hit,hit.name,{barcode:code})}
 const candidates=shop.map(p=>({id:p.id,name:p.name}));
 if(!candidates.length)return {ok:false,reason:'Er staan nu geen winkelproducten klaar.'};
 const lines=await recentPurchaseLines();
 const raw=await askClaude(image,readSchema(candidates,lines),readPrompt(candidates,lines));
 if(raw===REFUSED)return {ok:false,reason:'Het etiket kon nu niet worden gelezen. Typ het bedrag zelf in.'};
 const total=(raw as {totalCents?:unknown}|null)?.totalCents;
 if(typeof total==='number'&&total>0){
  const r=checkLabel(raw,candidates);if(!r.ok)return r;
  if(r.productId)return {...r,productId:r.productId,product:null,created:false};
  const made=await ensureLabelProduct(r.newName!,r.labelName,r.totalCents);
  if(!made.ok)return made;
  return {...r,productId:made.product.id,product:made.product,created:made.created};
 }
 const pkg=checkPackage(raw,candidates,lines);if(!pkg.ok)return pkg;
 const barcode=code??pkg.barcode;
 if(pkg.productId){
  const p=shop.find(x=>x.id===pkg.productId)!;
  if(p.customerPrice)return {ok:false,reason:`Op ${p.name} hoort een prijsetiket. Fotografeer het etiket met het bedrag.`};
  if(!p.available)return {ok:false,reason:`${p.name} is nu niet te koop. Vraag het even aan een van ons.`};
  if(barcode&&!p.barcodes.some(b=>sameEan(b,barcode)))await attachBarcode(p.id,barcode).catch(()=>false);
  return fixed(p,pkg.labelName||p.name,{barcode});
 }
 if(!pkg.cost)return {ok:false,code:'geen-inkoopprijs',newName:pkg.newName!,barcode,reason:`${pkg.newName} staat nog niet in de lijst en we vinden geen inkoopprijs op een factuur. Vraag het even aan een van ons.`};
 return createPackaged(pkg.newName!,pkg.labelName,barcode,proposalCents(pkg.cost.unitCostCents,9),pkg.cost);
}
async function createPackaged(name:string,labelName:string,barcode:string|null,priceCents:number,cost:PackageCost|null):Promise<ProductRead>{
 const made=await ensurePackagedProduct(name,labelName,barcode,priceCents,cost);
 if(!made.ok)return made;
 return fixed(made.product,labelName||name,{created:made.created,barcode,proposal:made.created&&cost?{unitCostCents:cost.unitCostCents,marginPct:NEW_PRODUCT_MARGIN_PCT,supplier:cost.supplier}:undefined});
}
/** Werkplek, als er geen inkoopprijs was: een medewerker vult zelf de verkoopprijs in. */
export async function createPackagedByHand(name:string,barcodeIn:unknown,priceCents:number){
 const barcode=normalizeEan(barcodeIn);
 return createPackaged(name,name,barcode,priceCents,null);
}
async function shopProducts(){
 const rows=await getDb().select({id:products.id,version:products.version,published:products.published}).from(products).where(isNotNull(products.published));
 return publicProducts(rows).filter(p=>p.route==='winkel');
}

import {isSameOrigin} from '@/lib/portable/origin';
import {getDb} from '@/db';
import {orders,orderLines,payments,products} from '@/db/schema';
import {eq,inArray,desc,and,gte,lt,sql} from 'drizzle-orm';
import {buildLine,orderTotals,lineRecords,orderPeriod,type RequestedLine,type SaleProduct} from '@/lib/orders';
import {stockProblem} from '@/lib/shop-stock';
import {recordSale,availableForWebsite,hasTracked} from '@/lib/stock-sales';
import {env,inTransaction} from '@/lib/portable/env';
import {loadOps} from '@/lib/operations-store';
import {recipeCost} from '@/lib/operations-core';
import {inView} from '@/lib/product-trash';
import {countsAsRevenue,paidAmounts,statusLabel} from '@/lib/order-revenue';
import {INTERNAL_MODE,INTERNAL_PRICE_CHOICE,MANUAL_PRICE_CHOICE,LABEL_PRICE_CHOICE,internalReference,internalUnitCents,internalLabelUnitCents,manualUnitCents} from '@/lib/stock-count-core';
export const dynamic='force-dynamic';
const fail=(error:string,status=400)=>Response.json({error},{status});
type LinePaid={orderId:number;position:number;paidCents:number|null;paidVatCents:number|null};
// Geslaagde betalingen per bestelling (12 november 2026): waarmee is betaald (bunq, contant, BB-saldo …; lib/sales-overview.ts).
type OrderPaid={orderId:number;method:string;provider:string;cents:number};
// The status comes from the columns (single source); the JSON keeps the historical lines. Each order also carries what was
// actually paid and whether it counts as revenue (lib/order-revenue.ts), so no screen has to work that out itself.
const shape=(r:typeof orders.$inferSelect,paid:LinePaid[]=[],paidWith:OrderPaid[]=[])=>{const d=JSON.parse(r.data),p=paidAmounts(r);
 return {...d,id:r.id,number:'P'+String(r.id).padStart(5,'0'),created:r.created,status:r.status,paymentStatus:r.paymentStatus,statusLabel:statusLabel(r),counted:countsAsRevenue(r),
  paidCents:p.cents,paidVat9Cents:p.vat9,paidVat21Cents:p.vat21,paidWith:paidWith.filter(x=>x.orderId===r.id).map(({method,provider,cents})=>({method,provider,cents})),
  lines:(d.lines||[]).map((l:{totalCents:number;vatCents:number},i:number)=>{const x=paid.find(q=>q.orderId===r.id&&q.position===i);return {...l,paidCents:x?.paidCents??l.totalCents,paidVatCents:x?.paidVatCents??l.vatCents}})}};
// Without a period: the latest 100 orders (kassa). With ?van=YYYY-MM-DD&tot=YYYY-MM-DD: every order in that period (overviews), without a limit.
export async function GET(req:Request){
 const params=new URL(req.url).searchParams;
 // Onderling inkopen (wens eigenaar 6 november 2026): de winkelproducten met hun eigenaar, en wat er vandaag al is gehaald.
 if(params.get('onderling')==='1')return Response.json(await internalChoices(),{headers:{'Cache-Control':'private, no-store'}});let period;try{period=orderPeriod(params.get('van'),params.get('tot'))}catch(e){return fail((e as Error).message)}
 const query=getDb().select().from(orders);
 const rows=period?await query.where(and(gte(orders.created,period.from),lt(orders.created,period.until))).orderBy(desc(orders.id)):await query.orderBy(desc(orders.id)).limit(100);
 const paid=rows.length?await getDb().select({orderId:orderLines.orderId,position:orderLines.position,paidCents:orderLines.paidCents,paidVatCents:orderLines.paidVatCents}).from(orderLines).where(inArray(orderLines.orderId,rows.map(r=>r.id))):[];
 const paidWith=rows.length?await getDb().select({orderId:payments.orderId,method:payments.method,provider:payments.provider,cents:payments.amountCents}).from(payments).where(and(inArray(payments.orderId,rows.map(r=>r.id)),eq(payments.status,'betaald'))):[];
 return Response.json(rows.map(r=>shape(r,paid,paidWith)),{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(req:Request){
 if(!isSameOrigin(req))return fail('Ongeldige herkomst.',403);
 try{
 const b=await req.json() as {requestId:string,mode:string,reference:string,lines:RequestedLine[],taker?:string,by?:string};
 // Onderling inkopen: de referentie is altijd „Keuken · naam” (wie haalt het, voor welke afdeling).
 if(b.mode===INTERNAL_MODE){try{b.reference=internalReference(b.taker,b.by)}catch(e){return fail((e as Error).message)}}
 if(!/^[a-f0-9-]{36}$/.test(b.requestId)||!['yte','zelfservice','winkel',INTERNAL_MODE].includes(b.mode)||typeof b.reference!=='string'||b.reference.length>80||!Array.isArray(b.lines)||b.lines.length<1||b.lines.length>50)return fail('Gebruik een kort tafel- of afhaalnummer (mag leeg) en kies maximaal 50 bestelregels.');
 if(b.lines.some(l=>!l||typeof l.productId!=='string'||l.productId.length>100||!Number.isInteger(l.version)))return fail('Ongeldige productregel.');
 const db=getDb();const request=JSON.stringify({mode:b.mode,reference:b.reference.trim(),lines:b.lines});
 const previous=await db.select().from(orders).where(eq(orders.requestId,b.requestId));if(previous[0])return previous[0].request===request?Response.json(shape(previous[0])):fail('Deze aanvraag is al gebruikt. Herlaad de kassa.',409);
 const source=await db.select().from(products).where(inArray(products.id,[...new Set(b.lines.map(l=>l.productId))]));
 // Onderling inkopen: de keuken betaalt de inkoopprijs (besluit eigenaar 6 november 2026), altijd door de server berekend.
 const internal=b.mode===INTERNAL_MODE?await internalPrices(source):null;
 const lines=b.lines.map(l=>{const row=source.find(p=>p.id===l.productId);if(!row?.published)throw Error('Dit product is nog niet gepubliceerd.');if(row.version!==l.version)throw Error('Een product is intussen gewijzigd. Herlaad de kassa en stel de bestelling opnieuw samen.');
  const p=JSON.parse(row.published) as SaleProduct;if(!internal)return buildLine(p,l);
  if(p.optionGroups?.length)throw Error(p.name+' kan niet onderling worden gehaald.');
  // Etiketprijs (besluit eigenaar 9 november 2026): priceCents is het bedrag op het etiket; de keuken betaalt dat min het
  // coöperatiedeel en de winkelpot van de eigenaar (zonder eigenaar: het volle bedrag). Eén etiket is één stuk.
  if(p.customerPrice){
   if(l.quantity!==1)throw Error('Leg elk stuk '+p.name+' apart vast: elk etiket heeft een eigen bedrag.');
   const who={owner:false,bp:null};
   const unit=internalLabelUnitCents(l.priceCents,{name:p.name,owner:who.owner,ownerBp:who.bp});
   const line=buildLine({...p,customerPrice:false,priceCents:unit,offer:undefined,deal:undefined},{...l,priceCents:undefined});line.choices.push(LABEL_PRICE_CHOICE(l.priceCents as number,who.owner));return line;
  }
  // Bekende inkoopprijs gaat altijd voor; alleen als die onbekend is, mag de keuken zelf een prijs per stuk invullen.
  const known=internal.prices.get(row.id)??null;if(known!==null&&l.priceCents!==undefined&&l.priceCents!==null)throw Error('Van '+p.name+' is de inkoopprijs bekend; die geldt.');
  const unit=known??manualUnitCents(l.priceCents,p.name),rest={...l,priceCents:undefined};
  const line=buildLine({...p,priceCents:unit,offer:undefined,deal:undefined},rest);line.choices.push(known===null?MANUAL_PRICE_CHOICE:INTERNAL_PRICE_CHOICE);return line});
 const totals=orderTotals(lines);if(totals.totalCents>100000000)return fail('Bestelbedrag te hoog.');
 // Getelde producten: niet meer verkopen dan er ligt (besluit eigenaar 3 november 2026). Onbeperkte producten tellen niet mee.
 // Getelde producten (systeemtest 5 november 2026): ook wat websitegasten aan het betalen zijn telt als weg (#141), en
 // controleren, opslaan en van de voorraad afboeken gebeuren samen onder hetzelfde slot als de website. Zo kunnen twee
 // tablets, of een tablet en een websitegast, niet allebei het laatste stuk verkopen.
 const tracked=hasTracked(source);
 const short=stockProblem(lines,await availableForWebsite(source));if(short)return fail(short,409);
 // Tafel- of afhaalnummer is niet verplicht (wens eigenaar 4 november 2026); leeg = „Kassa”.
 const reference=b.reference.trim()||'Kassa';
 const data=JSON.stringify({mode:b.mode,reference,lines,totalCents:totals.totalCents,test:true,paymentStatus:'Niet gekoppeld',status:'Proefbestelling vastgelegd'});
 // Order and order lines are written in one transaction; a repeated requestId changes nothing.
 const orderId=sql`(SELECT ${orders.id} FROM ${orders} WHERE ${orders.requestId}=${b.requestId})`;
 // Geen producteigenaren (geen coöperatie): de verkoop hoort bij het bedrijf zelf.
 const owners=new Map<string,string|null>();
 const late=await inTransaction(async()=>{
  if(tracked){
   await env.DB.prepare('SELECT pg_advisory_xact_lock(hashtext(?))').bind('voorraad:website').first();
   const again=(await db.select({id:orders.id}).from(orders).where(eq(orders.requestId,b.requestId)))[0];
   if(!again){const problem=stockProblem(lines,await availableForWebsite(source));if(problem)return problem}
  }
  await db.batch([
   db.insert(orders).values({requestId:b.requestId,request,data,created:new Date().toISOString(),mode:b.mode,reference,status:'vastgelegd',paymentStatus:'niet-gekoppeld',test:1,...totals}).onConflictDoNothing(),
   db.insert(orderLines).values(lineRecords(lines).map(l=>({...l,orderId,ownerId:owners.get(l.productId)??null}))).onConflictDoNothing(),
  ]);
  // Binnen het slot afboeken, zodat de volgende verkoop de nieuwe voorraad ziet.
  if(tracked){const row=(await db.select({id:orders.id}).from(orders).where(eq(orders.requestId,b.requestId)))[0];if(row)await recordSale('P'+String(row.id).padStart(5,'0'),lines)}
  return null;
 });
 if(late)return fail(late,409);
 const saved=await db.select().from(orders).where(eq(orders.requestId,b.requestId));if(!saved[0]||saved[0].request!==request)return fail('Deze aanvraag bestaat met andere gegevens.',409);
 // Kassa: direct van de voorraad af. Herhaalbaar per bestelnummer; een fout hierin blokkeert de verkoop nooit.
 await recordSale('P'+String(saved[0].id).padStart(5,'0'),lines);
 return Response.json(shape(saved[0]));
 }catch(e){return fail(e instanceof Error?e.message:'Bestelling kon niet worden opgeslagen.')}
}

// Onderling inkopen: gepubliceerde, beschikbare producten met (als die er is) de eigenaar uit de coöperatieve winkel. Producten
// met een eigenaar staan bovenaan: daar gaat het om. Zonder eigenaar hoort de verkoop bij de coöperatie zelf.
async function internalChoices(){
 const db=getDb(),today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date()),from=orderPeriod(today,today)!.from;
 const [rows,recent]=await Promise.all([db.select().from(products),
  db.select().from(orders).where(and(eq(orders.mode,INTERNAL_MODE),gte(orders.created,from))).orderBy(desc(orders.id))]);
 const shown=inView(rows,false),{prices}=await internalPrices(shown);
 const list=shown.flatMap(r=>{if(!r.published)return [];const p=JSON.parse(r.published) as SaleProduct;if(!p.available||p.optionGroups?.length)return [];
  return [{id:r.id,version:r.version,name:p.name,shopCents:p.priceCents,priceCents:p.customerPrice?null:prices.get(r.id)??null,department:p.department||'',owner:null as string|null,
   ...(p.customerPrice?{label:true,labelBp:0}:{})}]})
  .sort((a,b)=>(a.owner?0:1)-(b.owner?0:1)||(a.owner||'').localeCompare(b.owner||'','nl')||a.name.localeCompare(b.name,'nl'));
 return {products:list,today:recent.map(r=>shape(r))};
}

// Inkoopprijs per product (incl. btw) voor onderling inkopen; regels in lib/stock-count-core.ts (internalUnitCents).
// Zonder leden als producteigenaar: laatste factuurprijs plus btw; onbekend = zelf invullen.
async function internalPrices(rows:{id:string;published:string|null}[]){
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date());
 const ops=rows.length?(await loadOps('none')).state:null;
 const out=new Map<string,number|null>();
 for(const r of rows){if(!r.published)continue;const p=JSON.parse(r.published) as SaleProduct;
  const recipe=ops?ops.recipes.find(x=>x.productId===r.id):undefined;
  out.set(r.id,internalUnitCents({priceCents:p.priceCents,vat:p.vat,owner:false,ownerBp:null,costExclCents:recipe&&ops?invoiceCost(ops,recipe,today):null}));}
 return {prices:out};
}
// Kostprijs alleen uit factuurprijzen: elk ingrediënt moet een laatste factuurprijs hebben (geen schatting of eigen prijs).
function invoiceCost(ops:Parameters<typeof recipeCost>[0],recipe:Parameters<typeof recipeCost>[1],today:string){
 const c=recipeCost(ops,recipe,today);return c.portionCents===null||c.estimated.length||c.own.length?null:c.portionCents;
}

import { getDb } from '@/db';
import {env} from '@/lib/portable/env';
import {productSuppliers} from '@/lib/product-suppliers';
import { products, media } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import source from '@/lib/source-products.json';
import {configuration,exportProduct,SheetError} from '@/lib/sheets';
import {base,same} from '@/lib/sheet-core';
import {authorizeSheet} from '@/lib/sheet-access';
import {STOCK_MODES} from '@/lib/shop-stock';
import {LEDGERS} from '@/lib/shop-price-advice';
import {setProductCount,CountError} from '@/lib/product-count';
import {isDeleted,trashDraft,restoreDraft,inView} from '@/lib/product-trash';
import {sharedGroups,withShared,type Group} from '@/lib/option-groups';

export const dynamic = 'force-dynamic';
const fail=(message:string,status=400)=>Response.json({error:message},{status});
function validGroups(v:unknown){return v===undefined||(Array.isArray(v)&&v.length<=20&&JSON.stringify(v).length<=45000&&v.every(g=>g&&typeof g.id==='string'&&g.id.length<=100&&typeof g.title==='string'&&g.title.trim().length>0&&g.title.length<=100&&typeof g.required==='boolean'&&Array.isArray(g.choices)&&g.choices.length>0&&g.choices.length<=30&&g.choices.every((c:unknown)=>{if(!c||typeof c!=='object')return false;const a=c as Record<string,unknown>;return typeof a.id==='string'&&a.id.length<=100&&typeof a.label==='string'&&a.label.trim().length>0&&a.label.length<=100&&Number.isInteger(a.extraCents)&&Number(a.extraCents)>=0&&Number(a.extraCents)<=1000000})));}
// Voorraad en winkelprijzen (besluit eigenaar 3 november 2026). Alle velden zijn optioneel: bestaande producten blijven onbeperkt.
function validStock(x:Record<string,unknown>){
 return (x.stockMode===undefined||STOCK_MODES.includes(x.stockMode as never))&&(x.ledger===undefined||x.ledger===''||LEDGERS.some(l=>l.id===x.ledger))&&(x.fasterSale===undefined||typeof x.fasterSale==='boolean')&&(x.targetMarginPct===undefined||(Number.isInteger(x.targetMarginPct)&&Number(x.targetMarginPct)>=0&&Number(x.targetMarginPct)<=90))
  // lowAt: vanaf dit aantal licht het product op het werkplekscherm op als „bijna op” (leeg = standaard 10).
  &&(x.lowAt===undefined||(Number.isInteger(x.lowAt)&&Number(x.lowAt)>=0&&Number(x.lowAt)<=9999))
  // customerPrice: de klant voert de prijs van het etiket in (wens eigenaar 5 november 2026).
  &&(x.customerPrice===undefined||typeof x.customerPrice==='boolean')
  // Op het startscherm van de kassa (wens eigenaar 9 november 2026); zelfkassa: „nieuw via zelfkassa”, alleen weghalen (null).
  // Streepjescodes (EAN) van de verpakking (wens eigenaar 9 november 2026): de zelfkassa herkent het product dan aan de code.
  &&(x.barcodes===undefined||(Array.isArray(x.barcodes)&&x.barcodes.length<=20&&x.barcodes.every(b=>typeof b==='string'&&/^\d{6,14}$/.test(b))))
  &&(x.onStartscherm===undefined||typeof x.onStartscherm==='boolean')&&(x.zelfkassa===undefined||x.zelfkassa===null||(typeof x.zelfkassa==='object'&&!Array.isArray(x.zelfkassa)))
  // Biologisch geteeld en SKAL-gecertificeerd (wens eigenaar 8 november 2026).
  &&(x.organic===undefined||typeof x.organic==='boolean')&&(x.skal===undefined||typeof x.skal==='boolean');
}
function valid(x: Record<string, unknown>) {
 return validStock(x) && typeof x.name==='string' && x.name.trim().length>0 && x.name.length<=180 && typeof x.department==='string' && x.department.length<=100 && Number.isInteger(x.priceCents) && Number(x.priceCents)>=0 && Number(x.priceCents)<=10000000 && ['','9','21'].includes(String(x.vat)) && ['','kok','barista','winkel','geen'].includes(String(x.station)) && typeof x.available==='boolean' && typeof x.photo==='string' && (x.photo==='' || /^https:\/\//i.test(x.photo) || /^\/api\/media\/[a-f0-9-]{36}$/.test(x.photo)) && x.photo.length<2000 && typeof x.note==='string' && x.note.length<5000 && typeof x.check==='string' && x.check.length<100 && validGroups(x.optionGroups) && typeof x.sourceId==='string' && x.sourceId.length<2000 && (x.allergens===undefined || (Array.isArray(x.allergens) && x.allergens.length<=14 && x.allergens.every((v: unknown)=>typeof v==='string' && v.length<=40))) && (x.allergensChecked===undefined || typeof x.allergensChecked==='boolean') && (x.orderOptions===undefined || (typeof x.orderOptions==='string' && x.orderOptions.length<=3000))
  // Telt voor pot (wens eigenaar 5 november 2026): de omzet van dit product (de entree) vult de pot van de speelboerderij.
  && (x.pot===undefined || x.pot==='' || x.pot==='speelboerderij');
}
function publishedProduct(p:Record<string,unknown>){return {...p,...(p.check==='Prijs controleren'?{sourceCheck:p.sourceCheck||p.check}:{}),check:''};}
// Eén product naar de prullenbak: concept bewaard met verwijdermoment, uit de gastweergave, versie +1.
async function trashOne(db:ReturnType<typeof getDb>,id:string,version:number):Promise<{ok:true,name:string,inSheet:boolean}|{ok:false,reason:string,status:number}>{
 const row=(await db.select().from(products).where(eq(products.id,id)))[0];if(!row)return {ok:false,reason:'Product niet gevonden.',status:404};
 if(row.version!==version)return {ok:false,reason:'Intussen gewijzigd; ververs de lijst.',status:409};
 const draft=JSON.parse(row.draft) as Record<string,unknown>;if(isDeleted(draft))return {ok:false,reason:'Staat al in de prullenbak.',status:409};
 const done=await db.update(products).set({draft:JSON.stringify(trashDraft(draft)),published:null,version:row.version+1}).where(and(eq(products.id,id),eq(products.version,version))).returning({id:products.id});
 if(!done.length)return {ok:false,reason:'Intussen gewijzigd; ververs de lijst.',status:409};
 return {ok:true,name:String(draft.name||'Product'),inSheet:!!draft.sourceId};
}
// Gedeelde keuzegroepen (besluit eigenaar 5 november 2026, zie lib/option-groups.ts): wie een gedeelde groep opslaat,
// past hem meteen aan bij alle andere producten die hem gebruiken, in het concept én de gepubliceerde versie.
// Elk product apart, met de gewone versiecontrole; bij een gelijktijdige wijziging wordt het opnieuw geprobeerd.
async function spreadShared(db:ReturnType<typeof getDb>,fromId:string,groups:Map<string,Group>){
 if(!groups.size)return 0;let n=0;
 for(const r of await db.select({id:products.id}).from(products)){
  if(r.id===fromId)continue;
  for(let attempt=0;attempt<3;attempt++){
   const row=(await db.select().from(products).where(eq(products.id,r.id)))[0];if(!row)break;
   const draft=JSON.parse(row.draft) as Record<string,unknown>;if(isDeleted(draft))break;
   const d=withShared(draft,groups),pub=row.published?withShared(JSON.parse(row.published) as Record<string,unknown>,groups):null;
   if(!d&&!pub)break;
   const done=await db.update(products).set({...(d?{draft:JSON.stringify(d)}:{}),...(pub?{published:JSON.stringify(pub)}:{}),version:row.version+1}).where(and(eq(products.id,row.id),eq(products.version,row.version))).returning({id:products.id});
   if(done.length){n++;break}
  }
 }
 return n;
}
// Verwijderde producten (prullenbak) staan standaard niet in de lijst; ?prullenbak=1 geeft alleen de prullenbak.
// Van wie het product is (wens eigenaar 8 november 2026: in de kassa klein „geleverd door Bindert”). Een product van een
// onderdeelpot (zoals de eieren van de kippenpot) toont de beheerder van die pot, anders de naam van de pot.
const suppliers=productSuppliers;
export async function GET(request:Request){ try {const trash=new URL(request.url).searchParams.get('prullenbak')==='1';const rows=inView(await getDb().select().from(products),trash);const by=await suppliers().catch(()=>new Map<string,string>());return Response.json(rows.map(r=>({id:r.id,version:r.version,draft:JSON.parse(r.draft),published:r.published?JSON.parse(r.published):null,supplier:by.get(r.id)||null})));} catch {return fail('Producten konden niet worden geladen.',500)} }
// The backoffice is the leading source: a change is always saved here first. A connected spreadsheet is updated afterwards;
// if that fails, the saved change waits for the next synchronisation (Spreadsheet koppelen → Verversen).
export async function POST(request:Request){try {
 authorizeSheet(request,true);
 const connected=!!await configuration();
 const b=await request.json() as {action:string,id:string,version:number,product:Record<string, unknown>}; const db=getDb();
 // Product verwijderen en terugzetten (wens eigenaar 5 november 2026; zie lib/product-trash.ts). Nooit echt wissen:
 // bestellingen, recepten, voorraad en de coöperatieve winkel blijven kloppen. Verwijderen haalt het product ook uit de
 // gastweergave, zodat website en kassa het niet meer verkopen. De spreadsheet wordt niet aangepast.
 if(b.action==='delete-many'){
  // Meerdere aangevinkte producten in één keer naar de prullenbak (wens eigenaar 5 november 2026). Per product met versiecontrole.
  const changes=(b as unknown as {changes:unknown}).changes;
  if(!Array.isArray(changes)||!changes.length||changes.length>1000||changes.some(c=>!c||typeof c.id!=='string'||c.id.length>100||!Number.isInteger(c.version)))return fail('Ongeldige lijst met producten.');
  let deleted=0;const skipped:{id:string,reason:string}[]=[];let inSheet=false;
  for(const c of changes as {id:string,version:number}[]){const r=await trashOne(db,c.id,c.version);if(r.ok){deleted++;inSheet||=r.inSheet}else skipped.push({id:c.id,reason:r.reason})}
  return Response.json({ok:true,deleted,skipped,message:`${deleted} product${deleted===1?'':'en'} verwijderd en in de prullenbak gezet. Website en kassa tonen ze niet meer.${skipped.length?` ${skipped.length} overgeslagen.`:''}${inSheet&&connected?' In de spreadsheet blijven de regels staan; haal ze daar zelf weg als dat nodig is.':''}`});
 }
 if(b.action==='delete'||b.action==='restore'){
  if(typeof b.id!=='string'||b.id.length>100||!Number.isInteger(b.version))return fail('Ongeldig product.');
  if(b.action==='delete'){
   const r=await trashOne(db,b.id,b.version);if(!r.ok)return fail(r.reason,r.status);
   return Response.json({ok:true,message:`„${r.name}” is verwijderd en staat in de prullenbak. Website en kassa tonen het niet meer.${r.inSheet&&connected?' In de spreadsheet blijft de regel staan; haal hem daar zelf weg als dat nodig is.':''}`});
  }
  const row=(await db.select().from(products).where(eq(products.id,b.id)))[0];if(!row)return fail('Product niet gevonden.',404);
  if(row.version!==b.version)return fail('Dit product is intussen gewijzigd. Ververs en probeer opnieuw.',409);
  const draft=JSON.parse(row.draft) as Record<string,unknown>,name=String(draft.name||'Product');
  if(!isDeleted(draft))return fail('Dit product staat niet in de prullenbak.',409);
  const done=await db.update(products).set({draft:JSON.stringify(restoreDraft(draft)),version:row.version+1}).where(and(eq(products.id,b.id),eq(products.version,b.version))).returning({id:products.id});
  if(!done.length)return fail('Dit product is intussen gewijzigd. Ververs en probeer opnieuw.',409);
  return Response.json({ok:true,message:`„${name}” is teruggezet als concept. Publiceer het opnieuw als het weer te koop is.`});
 }
 // Een product in de prullenbak kan niet worden gewijzigd of gepubliceerd: eerst terugzetten.
 if(typeof b.id==='string'){const row=(await db.select({draft:products.draft}).from(products).where(eq(products.id,b.id)))[0];if(row&&isDeleted(JSON.parse(row.draft) as Record<string,unknown>))return fail('Dit product staat in de prullenbak. Zet het eerst terug.',409);}
 if(b.action==='import') { if(connected)return fail('De spreadsheet is verbonden. Gebruik Synchroniseren met spreadsheet bij Systeem & koppelingen.',409); const batch=source.map(p=>({id:p.id,draft:JSON.stringify(p),version:1})); for(let i=0;i<batch.length;i+=10) await db.insert(products).values(batch.slice(i,i+10)).onConflictDoNothing(); return Response.json({ok:true,count:batch.length}); }
 if(b.action==='create'||b.action==='create-publish') {const p=b.product; if(!valid(p))return fail('Controleer naam, prijs en overige gegevens.');if(p.sourceId)return fail('Een nieuw product krijgt geen bestaand bron-ID.');if(b.action==='create-publish'&&!p.vat)return fail('Vul eerst het btw-tarief in.');const id=crypto.randomUUID();const data=b.action==='create-publish'?publishedProduct(p):p;const json=JSON.stringify(data);await db.insert(products).values({id,draft:json,published:b.action==='create-publish'?json:null,version:1});const spread=await spreadShared(db,id,sharedGroups(data));return Response.json({ok:true,id,...(spread?{shared:spread}:{}),...(connected?{sheet:'niet-in-spreadsheet',message:'Opgeslagen in de backoffice. Nieuwe producten staan alleen in de backoffice; de spreadsheetkoppeling kan nog geen rijen toevoegen.'}:{})});}
 // Fill in missing VAT rates in the drafts after the owner reviewed the list (decision 2 November 2026: 9%, alcohol 21%).
 // Never overwrites an existing rate and never publishes. A connected spreadsheet picks the change up at the next synchronisation.
 if(b.action==='set-vat'){
  const changes=(b as unknown as {changes:unknown}).changes;
  if(!Array.isArray(changes)||!changes.length||changes.length>1000||changes.some(c=>!c||typeof c.id!=='string'||c.id.length>100||!Number.isInteger(c.version)||!['9','21'].includes(c.vat)))return fail('Ongeldige lijst met btw-tarieven.');
  let updated=0,skipped=0;
  for(const c of changes as {id:string,version:number,vat:string}[]){
   const row=(await db.select().from(products).where(eq(products.id,c.id)))[0];
   const draft=row&&JSON.parse(row.draft) as Record<string,unknown>;
   if(!row||!draft||row.version!==c.version||draft.vat){skipped++;continue}
   const done=await db.update(products).set({draft:JSON.stringify({...draft,vat:c.vat}),version:row.version+1}).where(and(eq(products.id,c.id),eq(products.version,c.version))).returning({id:products.id});
   if(done.length)updated++;else skipped++;
  }
  return Response.json({ok:true,updated,skipped,message:`Btw-tarief ingevuld bij ${updated} product${updated===1?'':'en'} (concept, niet gepubliceerd).${skipped?` ${skipped} overgeslagen omdat ze intussen gewijzigd zijn of al een tarief hadden.`:''}${connected?' De spreadsheet wordt bijgewerkt bij de volgende synchronisatie.':''}`});
 }
 // Prijzen & verkoopklaar (owner request, 2 November 2026): apply the proposals the owner ticked, per product:
 // new price, VAT, work station, "prijs gecontroleerd" (clears both price-check marks) and optionally publish.
 // Each product is checked against its version; nothing else in the product changes. Never automatic.
 if(b.action==='apply-advice'){
  const changes=(b as unknown as {changes:unknown}).changes;
  type Change={id:string,version:number,priceCents?:number,vat?:string,station?:string,confirmPrice?:boolean,publish?:boolean};
  const ok=(c:Change)=>c&&typeof c.id==='string'&&c.id.length<=100&&Number.isInteger(c.version)&&(c.priceCents===undefined||(Number.isInteger(c.priceCents)&&c.priceCents>0&&c.priceCents<=10000000))&&(c.vat===undefined||['9','21'].includes(c.vat))&&(c.station===undefined||['kok','barista','winkel'].includes(c.station))&&(c.confirmPrice===undefined||typeof c.confirmPrice==='boolean')&&(c.publish===undefined||typeof c.publish==='boolean');
  if(!Array.isArray(changes)||!changes.length||changes.length>1000||!changes.every(ok))return fail('Ongeldige lijst met voorstellen.');
  let updated=0,published=0;const skipped:{id:string,reason:string}[]=[];
  for(const c of changes as Change[]){
   const row=(await db.select().from(products).where(eq(products.id,c.id)))[0];
   if(!row){skipped.push({id:c.id,reason:'Product niet gevonden.'});continue}
   if(row.version!==c.version){skipped.push({id:c.id,reason:'Intussen gewijzigd; ververs de lijst.'});continue}
   const draft:Record<string,unknown>={...JSON.parse(row.draft) as Record<string,unknown>,...(c.priceCents!==undefined?{priceCents:c.priceCents}:{}),...(c.vat?{vat:c.vat}:{}),...(c.station?{station:c.station}:{})};
   if(c.confirmPrice){draft.check=draft.check==='Prijs controleren'?'':draft.check;delete draft.sourceCheck;}
   if(!valid(draft)){skipped.push({id:c.id,reason:'Productgegevens zijn niet compleet.'});continue}
   const update:{draft:string,published?:string,version:number}={draft:JSON.stringify(draft),version:row.version+1};
   if(c.publish){
    const reason=!draft.vat?'Btw ontbreekt.':!['kok','barista','winkel'].includes(String(draft.station))?'Werkafdeling ontbreekt.':(draft.check==='Prijs controleren'||draft.sourceCheck==='Prijs controleren')?'Prijs is nog niet gecontroleerd.':null;
    if(reason){skipped.push({id:c.id,reason:'Niet gepubliceerd: '+reason});continue}
    const json=JSON.stringify(publishedProduct(draft));update.draft=json;update.published=json;
   }
   const done=await db.update(products).set(update).where(and(eq(products.id,c.id),eq(products.version,c.version))).returning({id:products.id});
   if(!done.length){skipped.push({id:c.id,reason:'Intussen gewijzigd; ververs de lijst.'});continue}
   updated++;if(update.published)published++;
  }
  return Response.json({ok:true,updated,published,skipped,message:`${updated} product${updated===1?'':'en'} bijgewerkt, waarvan ${published} gepubliceerd.${skipped.length?` ${skipped.length} overgeslagen.`:''}${connected?' De spreadsheet wordt bijgewerkt bij de volgende synchronisatie.':''}`});
 }
 // Snel aanpassen vanuit Gerechten & prijzen: beschikbaar voor de gast, tellen of onbeperkt, grootboekrekening,
 // „mag sneller weg” en eigen doelmarge. Alleen deze velden veranderen, in het concept én (als die er is) in de
 // gepubliceerde versie, zodat het meteen voor gasten geldt. Andere conceptwijzigingen worden niet meegepubliceerd.
 if(b.action==='stock-settings'){
  const set=(b as unknown as {settings:unknown}).settings as Record<string,unknown>|null;
  const keys=['available','stockMode','ledger','fasterSale','targetMarginPct','lowAt','customerPrice','onStartscherm','zelfkassa','barcodes'];
  if(typeof b.id!=='string'||!Number.isInteger(b.version)||!set||typeof set!=='object'||Array.isArray(set)||!Object.keys(set).length||Object.keys(set).some(k=>!keys.includes(k))||(set.available!==undefined&&typeof set.available!=='boolean'))return fail('Ongeldige aanvraag.');
  if(set.zelfkassa!==undefined&&set.zelfkassa!==null)return fail('Ongeldige aanvraag.');
  const patch={...set};if(patch.targetMarginPct===null)patch.targetMarginPct=undefined;if(patch.lowAt===null)patch.lowAt=undefined;if(patch.zelfkassa===null)patch.zelfkassa=undefined;
  if(!validStock(patch))return fail('Controleer voorraad, grootboekrekening en doelmarge.');
  const row=(await db.select().from(products).where(eq(products.id,b.id)))[0];if(!row)return fail('Product niet gevonden.',404);
  if(row.version!==b.version)return fail('Dit product is intussen gewijzigd. Ververs de lijst en probeer opnieuw.',409);
  // Een streepjescode hoort bij één product.
  if(Array.isArray(patch.barcodes)&&patch.barcodes.length){
   const ean=(v:string)=>v.replace(/^0+/,''),mine=new Set((patch.barcodes as string[]).map(ean));
   for(const other of await db.select().from(products)){if(other.id===b.id)continue;const d=JSON.parse(other.draft) as {name?:string;barcodes?:unknown;deletedAt?:string};if(d.deletedAt)continue;
    const hit=Array.isArray(d.barcodes)?(d.barcodes as string[]).find(c=>mine.has(ean(String(c)))):undefined;if(hit)return fail(`Streepjescode ${hit} hoort al bij ${d.name||'een ander product'}.`,409)}
  }
  const merge=(json:string)=>{const p={...JSON.parse(json) as Record<string,unknown>,...patch};for(const k of keys)if(p[k]===undefined)delete p[k];return JSON.stringify(p)};
  const update={draft:merge(row.draft),...(row.published?{published:merge(row.published)}:{}),version:row.version+1};
  const done=await db.update(products).set(update).where(and(eq(products.id,b.id),eq(products.version,b.version))).returning({id:products.id});
  if(!done.length)return fail('Dit product is intussen gewijzigd. Ververs de lijst en probeer opnieuw.',409);
  return Response.json({ok:true,version:row.version+1});
 }
 // Voorraad als getal in de tabel (3 november 2026): tellen, zo nodig als doorverkoopproduct. Zie lib/product-count.ts.
 if(b.action==='set-stock'){
  const c=b as unknown as {id:unknown;version:unknown;count:unknown;requestId:unknown};
  if(typeof c.id!=='string'||!Number.isInteger(c.version)||typeof c.requestId!=='string'||!/^[a-f0-9-]{36}$/.test(c.requestId))return fail('Ongeldige aanvraag.');
  try{const v=await setProductCount(c.id,c.version as number,Number(c.count),c.requestId);return Response.json({ok:true,version:v})}
  catch(e){if(e instanceof CountError)return fail(e.message,e.status);throw e}
 }
 // Beelden koppelen (wens eigenaar 3 november 2026): alleen de foto/tekening verandert, in het concept én (als die er is)
 // de gepubliceerde versie, zodat hij meteen op kassa, tafel en website staat. Alleen beelden uit de eigen beeldbibliotheek.
 if(b.action==='set-photo'){
  const changes=(b as unknown as {changes:unknown}).changes as {id:unknown;version:unknown;photo:unknown}[];
  if(!Array.isArray(changes)||!changes.length||changes.length>500||changes.some(c=>!c||typeof c.id!=='string'||c.id.length>100||!Number.isInteger(c.version)||typeof c.photo!=='string'||!/^\/api\/media\/[a-f0-9-]{36}$/.test(c.photo)))return fail('Ongeldige lijst met beelden.');
  const known=new Set((await db.select({id:media.id}).from(media)).map(m=>'/api/media/'+m.id));
  const versions:Record<string,number>={};const skipped:{id:string;reason:string}[]=[];
  for(const c of changes as {id:string;version:number;photo:string}[]){
   if(!known.has(c.photo)){skipped.push({id:c.id,reason:'Beeld niet gevonden.'});continue}
   const row=(await db.select().from(products).where(eq(products.id,c.id)))[0];
   if(!row){skipped.push({id:c.id,reason:'Product niet gevonden.'});continue}
   if(row.version!==c.version){skipped.push({id:c.id,reason:'Intussen gewijzigd; ververs de lijst.'});continue}
   const put=(json:string)=>JSON.stringify({...JSON.parse(json) as Record<string,unknown>,photo:c.photo});
   const done=await db.update(products).set({draft:put(row.draft),...(row.published?{published:put(row.published)}:{}),version:row.version+1}).where(and(eq(products.id,c.id),eq(products.version,c.version))).returning({id:products.id});
   if(!done.length){skipped.push({id:c.id,reason:'Intussen gewijzigd; ververs de lijst.'});continue}
   versions[c.id]=row.version+1;
  }
  const n=Object.keys(versions).length;
  return Response.json({ok:true,versions,skipped,message:`${n} ${n===1?'beeld':'beelden'} gekoppeld.${skipped.length?` ${skipped.length} overgeslagen.`:''}${connected?' De spreadsheet wordt bijgewerkt bij de volgende synchronisatie.':''}`});
 }
 if(!['save','publish','unpublish'].includes(b.action) || typeof b.id!=='string' || !Number.isInteger(b.version))return fail('Ongeldige aanvraag.');
 const rows=await db.select().from(products).where(eq(products.id,b.id));const row=rows[0]; if(!row)return fail('Product niet gevonden.',404);if(row.version!==b.version)return fail('Dit product is intussen gewijzigd. Ververs de lijst en probeer opnieuw.',409);
 const before=JSON.parse(row.draft) as Record<string,unknown>;
 let update:{draft?:string,published?:string|null,version:number}={version:row.version+1};
 if(b.action==='save'){if(!valid(b.product))return fail('Controleer naam, prijs en overige gegevens.');update.draft=JSON.stringify(b.product);
  // Een gedeelde keuzegroep geldt meteen overal, dus ook in de gepubliceerde versie van dit product.
  const pub=row.published?withShared(JSON.parse(row.published) as Record<string,unknown>,sharedGroups(b.product)):null;if(pub)update.published=JSON.stringify(pub);}
 if(b.action==='publish'){const p=b.product??before;if(!valid(p))return fail('Controleer naam, prijs en overige gegevens.');if(!p.vat)return fail('Vul eerst het btw-tarief in.');const json=JSON.stringify(publishedProduct(p));update.draft=json;update.published=json;}
 if(b.action==='unpublish') update.published=null;
 if(update.draft&&(JSON.parse(update.draft).sourceId||'')!==(before.sourceId||''))return fail('Het vaste bron-ID mag niet worden gewijzigd.',409);
 const changed=await db.update(products).set(update).where(and(eq(products.id,b.id),eq(products.version,b.version))).returning({id:products.id});if(!changed.length)return fail('Dit product is intussen gewijzigd. Ververs de lijst en probeer opnieuw.',409);
 const sheet=connected&&update.draft&&!same(base(before),base(JSON.parse(update.draft)))?await exportProduct(row.id,JSON.parse(update.draft)):null;
 const spread=update.draft?await spreadShared(db,row.id,sharedGroups(JSON.parse(update.draft))):0;
 return Response.json({ok:true,version:update.version,...(spread?{shared:spread}:{}),...(sheet??{})});
 }catch(e){return fail(e instanceof SheetError?e.message:'Opslaan is niet gelukt. Ververs de lijst en probeer opnieuw.',e instanceof SheetError?e.status:500)} }

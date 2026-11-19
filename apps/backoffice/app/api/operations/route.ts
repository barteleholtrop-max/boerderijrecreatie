import {getDb} from '@/db';
import {products} from '@/db/schema';
import {eq,inArray} from 'drizzle-orm';
import {loadOps,saveOps,isProcessed,countAndSaleMoves,warehouseMoves,slipBooked} from '@/lib/operations-store';
import {checkBooking,applySlip,slipReference} from '@/lib/packing-slip-core';
import {checkCount,countReference,deviationReport,MAX_COUNTS} from '@/lib/stock-count-core';
import {checkRequest,isWarehouse,openRequests,requestReference,REQUEST_REASON} from '@/lib/warehouse-core';
import {authorizeSheet} from '@/lib/sheet-access';
import {SheetError} from '@/lib/sheets';
import {validIngredient,validInvoice,validRecipe,applyMovement,finite,text,day,type Ingredient,type Invoice,type Recipe,type Demand,shoppingPlan,recipeCost,priceInfo,priceIndex} from '@/lib/operations-core';
// Redenen voor extra verbruik zonder verkoop (besluit eigenaar 4 november 2026).
const EXTRA_USE={groep:'groep buiten de kassa',personeel:'eten voor leden',proeverij:'proeverij',verspilling:'verspilling'} as const;
export const dynamic='force-dynamic';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(req:Request){try{authorizeSheet(req);
 // Afwijkingen van de werkplektelling (wens eigenaar 6 november 2026), standaard de laatste 30 dagen, hooguit een jaar.
 const q=new URL(req.url).searchParams;if(q.get('afwijkingen')==='1'){const days=Math.min(366,Math.max(1,Number(q.get('dagen'))||30));
  const since=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date(Date.now()-days*86400000));
  const {state}=await loadOps('none');const own=new Set(state.ingredients.filter(isWarehouse).map(i=>i.id));
  return json({since,rows:deviationReport((await countAndSaleMoves(since)).filter(m=>!own.has(m.ingredientId)),state.ingredients)});}
 // Magazijn (wens eigenaar 8 november 2026): de artikelen en de open bestelverzoeken, voor de tablet en voor Rianne.
 if(q.get('magazijn')==='1'){const {state,version}=await loadOps('none');const items=state.ingredients.filter(isWarehouse);
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date());
  const moves=items.length?await warehouseMoves(items.map(i=>i.id)):[];
  return json({version,today,items:items.map(i=>({id:i.id,name:i.name,unit:i.unit,stock:i.stock,known:i.known,countedAt:i.countedAt,min:i.min,supplier:i.supplier})),requests:openRequests(moves,items)});}
 const loaded=await loadOps('recent'),state=loaded.state,index=priceIndex(state);const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date());return json({state,version:loaded.version,moveCount:loaded.moveCount,today,prices:Object.fromEntries(state.ingredients.map(i=>[i.id,priceInfo(state,i.id,today,index)])),costs:Object.fromEntries(state.recipes.map(r=>[r.productId,recipeCost(state,r,today,index)]))});}catch(e){return json({error:e instanceof SheetError?e.message:'Gegevens konden niet worden geladen. Probeer opnieuw.'},e instanceof SheetError?e.status:500)}}
export async function POST(req:Request){try{
 authorizeSheet(req,true);const raw=await req.text();if(raw.length>1500000)throw Error('De aanvraag is te groot.');const parsed=JSON.parse(raw);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('Ongeldige aanvraag.');const b=parsed as Record<string,unknown>;const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date());
 if(b.action==='plan'){const s=(await loadOps()).state;const demand=b.demand as Demand[];if(!Array.isArray(demand)||!demand.length||demand.length>100||demand.some(d=>!d||!text(d.productId,100)||!finite(d.portions,0.001,100000))||!day(b.due)||b.due<today)throw Error('Kies een datum vanaf vandaag en vul geldige aantallen in.');return json({plan:shoppingPlan(s,demand,b.due,today)});}
 if(!text(b.requestId,100)||!b.requestId||!Number.isInteger(b.version))throw Error('Ongeldige aanvraag.');if(await isProcessed(b.requestId))return json({ok:true,duplicate:true});
 const loaded=await loadOps(b.action==='consume-recipe'&&typeof b.note==='string'?{consumeNote:b.note}:'none');
 // The core rules work on a copy; only rows that differ from the loaded state are written.
 const s=structuredClone(loaded.state);if(b.version!==loaded.version)return json({error:'Er is elders iets gewijzigd. Ververs en probeer opnieuw.'},409);
 const uid=()=>crypto.randomUUID();
 switch(b.action){
 case 'ingredient':{// Older callers send no origin or own price: they mean a bought-in ingredient without an estimate.
  const i={origin:'inkoop',ownCents:null,...(b.ingredient as object)} as Ingredient;if(i.kind!=='magazijn')i.kind=undefined;if(!validIngredient(i))throw Error('Controleer naam, eenheid en verpakking.');if(i.supplier.trim()&&i.article.trim()&&s.ingredients.some(x=>x.id!==i.id&&x.supplier.trim().toLowerCase()===i.supplier.trim().toLowerCase()&&x.article.trim()===i.article.trim()))throw Error('Dit leveranciersartikel is al aan een ander ingrediënt gekoppeld.');const old=s.ingredients.find(x=>x.id===i.id);if(old){const invoiced=s.invoices.some(v=>v.lines.some(l=>l.ingredientId===i.id));if(old.unit!==i.unit&&invoiced)throw Error('Een gebruikte basiseenheid mag niet worden veranderd. Maak een nieuw ingrediënt.');if(i.origin==='eigen'&&invoiced)throw Error('Dit ingrediënt staat al op inkoopfacturen. Maak voor de eigen boerderij een apart ingrediënt, zodat eigen en ingekochte producten niet door elkaar lopen.');Object.assign(old,i,{stock:old.stock,known:old.known,countedAt:old.countedAt,kind:i.kind});for(const r of s.recipes.filter(r=>r.lines.some(l=>l.ingredientId===i.id)))r.reviewed=false;}else{s.ingredients.push({...i,stock:0,known:false,countedAt:''});}break;}
 case 'invoice':{const v=b.invoice as Invoice;if(!validInvoice(v))throw Error('Controleer leverancier, factuurnummer, datum, aantallen en nettobedragen.');if(s.invoices.some(i=>i.supplier.trim().toLowerCase()===v.supplier.trim().toLowerCase()&&i.number.trim().toLowerCase()===v.number.trim().toLowerCase()))throw Error('Deze leverancier en dit factuurnummer zijn al verwerkt.');for(const l of v.lines){if(l.kind==='product'){const i=s.ingredients.find(i=>i.id===l.ingredientId);if(!i||i.unit!==l.unit)throw Error('Koppel iedere productregel aan een ingrediënt met dezelfde basiseenheid.');if(i.origin==='eigen')throw Error(i.name+' is van eigen boerderij en hoort niet op een inkoopfactuur. Kies een ingekocht ingrediënt of maak er een nieuw aan.');}l.received=false;}s.invoices.push({...v,reviewed:true});break;}
 case 'count':{const i=s.ingredients.find(x=>x.id===b.ingredientId);if(!i||!finite(b.quantity)||!day(b.date)||b.date!==today)throw Error('Tel de huidige voorraad en gebruik de datum van vandaag.');s.moves.push({id:uid(),ingredientId:i.id,quantity:b.quantity-i.stock,date:b.date,reason:i.known?'Telling / correctie':'Beginvoorraad',reference:'Telling'});i.stock=b.quantity;i.known=true;i.countedAt=b.date;break;}
 // Voorraad tellen op de werkplek (wens eigenaar 6 november 2026): meerdere regels tegelijk, met een reden bij elk verschil.
 // Gewone tellingen in de voorraadlijst; de reden, de oude en de nieuwe stand en wie telde staan in de referentie.
 case 'werkplek-telling':{const counts=b.counts;if(!Array.isArray(counts)||!counts.length||counts.length>MAX_COUNTS)throw Error('Tel 1 tot '+MAX_COUNTS+' regels tegelijk.');
  if(!text(b.by,60)||!String(b.by).trim())throw Error('Vul in wie er telt.');
  const seen=new Set<string>();for(const raw of counts){const i=s.ingredients.find(x=>x.id===(raw as {ingredientId?:unknown})?.ingredientId);if(!i)throw Error('Een voorraadregel bestaat niet meer. Ververs de lijst.');if(seen.has(i.id))throw Error(i.name+' staat er twee keer in.');seen.add(i.id);
   // Nog nooit geteld (bijvoorbeeld net gefotografeerd, wens eigenaar 17 november 2026): de eerste telling is de beginvoorraad, zonder reden.
   let c;try{c=checkCount(raw,i.stock,isWarehouse(i)||!i.known)}catch(e){throw Error(i.name+': '+(e as Error).message)}
   s.moves.push({id:uid(),ingredientId:i.id,quantity:c.quantity-i.stock,date:today,reason:i.known?'Telling / correctie':'Beginvoorraad',reference:countReference({oldStock:i.stock,quantity:c.quantity,reason:c.reason,note:c.note,by:String(b.by)})});
   i.stock=c.quantity;i.known=true;i.countedAt=today;}
  break;}
 // Magazijn (wens eigenaar 8 november 2026): „Bijna op” of „Op” vanaf de tablet, „Besteld” of „Afgehandeld” door inkoop.
 // Een gewone voorraadbeweging met reden Bestelverzoek. Bij „Op” gaat de voorraad naar 0 (dat is dan ook de telling).
 case 'magazijn-melding':{const r=checkRequest(b,b.from==='werkplek');const i=s.ingredients.find(x=>x.id===r.ingredientId);
  if(!i)throw Error('Dit magazijnartikel bestaat niet meer. Ververs de lijst.');if(!isWarehouse(i))throw Error(i.name+' is geen magazijnartikel.');
  const empty=r.status==='op';s.moves.push({id:uid(),ingredientId:i.id,quantity:empty&&i.stock?-i.stock:0,date:today,reason:REQUEST_REASON,reference:requestReference(r)});
  if(empty){i.stock=0;i.known=true;i.countedAt=today}
  break;}
 // Pakbon en kassabon fotograferen (wens eigenaar 17 november 2026): de gecontroleerde regels van één bon in de voorraad;
 // een kassabon komt meteen als inkoopbon bij Inkoop (prijs). Nieuwe
 // ingrediënten krijgen de leverancier en het artikelnummer van de pakbon, zodat de factuur er later aan koppelt (prijs).
 case 'pakbon':{const p=checkBooking(b);if(p.stock&&p.number&&await slipBooked(slipReference(p.supplier,p.number,p.kind)))throw Error(`Deze ${p.kind} is al in de voorraad verwerkt.`);applySlip(s,p,{today,newId:uid});break;}
 case 'move':{if(!['Bederf','Eigen gebruik','Verbruik','Correctie'].includes(String(b.reason))||!text(b.note,500))throw Error('Vul een reden in.');applyMovement(s,String(b.ingredientId),Number(b.quantity),today,String(b.reason),String(b.note),uid());break;}
 case 'receive':{const invoice=s.invoices.find(v=>v.id===b.invoiceId);if(!invoice)throw Error('Factuur niet gevonden.');if(!day(b.date)||b.date!==today)throw Error('Bevestig alleen een vandaag gecontroleerde levering. Oude facturen zijn uitsluitend voor prijsanalyse.');const allocations=b.allocations as {lineId:string;quantity:number;orderId:string}[];if(!Array.isArray(allocations)||!allocations.length||allocations.length>300||new Set(allocations.map(a=>a.lineId)).size!==allocations.length)throw Error('Selecteer de ontvangen regels.');for(const a of allocations){const l=invoice.lines.find(l=>l.id===a.lineId);if(!l||l.kind!=='product'||l.received||!finite(a.quantity,0.000001)||Math.abs(a.quantity-l.quantity)>0.000001)throw Error('Deze regel is al ontvangen of het aantal wijkt af. Corrigeer afwijkingen via een voorraadbeweging.');applyMovement(s,l.ingredientId,a.quantity,b.date,'Levering',invoice.supplier+' / '+invoice.number,uid());if(a.orderId){const o=s.incoming.find(o=>o.id===a.orderId&&o.ingredientId===l.ingredientId&&o.status==='confirmed');if(!o||o.remaining<a.quantity)throw Error('De gekoppelde bestelling heeft onvoldoende openstaand aantal.');o.remaining=Math.round((o.remaining-a.quantity)*1e6)/1e6;if(o.remaining===0)o.status='received';}l.received=true;}break;}
 case 'recipe':{const r=b.recipe as Recipe;if(!validRecipe(r,s))throw Error('Controleer ingrediënten, hoeveelheden, opbrengst en verliespercentage.');if(!(await getDb().select({id:products.id}).from(products).where(eq(products.id,r.productId))).length)throw Error('Verkoopproduct niet gevonden.');const old=s.recipes.find(x=>x.productId===r.productId);if(old)s.recipeHistory.push({recipe:old,date:today,portionCents:recipeCost(s,old,today).portionCents});const next={...r,version:(old?.version||0)+1};s.recipes=s.recipes.filter(x=>x.productId!==r.productId);s.recipes.push(next);break;}
 case 'consume-recipe':{
  // Extra verbruik (niet verkocht) — besluit eigenaar 4 november 2026 (keuze C). Verkopen via kassa, website en groepen
  // worden al automatisch afgeboekt (lib/stock-sales.ts); hier alleen verbruik zonder verkoop, met een verplichte reden.
  const kind=typeof b.kind==='string'&&Object.hasOwn(EXTRA_USE,b.kind)?EXTRA_USE[b.kind as keyof typeof EXTRA_USE]:null;if(!kind)throw Error('Kies waarom dit verbruik niet via een verkoop loopt: groep buiten de kassa, eten voor leden, proeverij of verspilling.');
  const r=s.recipes.find(x=>x.productId===b.productId);if(!r||!r.reviewed||!finite(b.portions,0.001,100000)||!text(b.note,500)||!String(b.note).trim())throw Error('Kies een gecontroleerd recept, aantal porties en een herkenbare referentie.');if(s.moves.some(m=>m.reason==='Receptverbruik'&&m.reference.endsWith(' / '+b.note)))throw Error('Deze verbruiksreferentie is al verwerkt. Kies alleen een nieuwe referentie voor werkelijk nieuw verbruik.');for(const l of r.lines)applyMovement(s,l.ingredientId,-l.quantity/r.yield*b.portions/(1-r.lossPct/100),today,'Receptverbruik',r.name+' v'+r.version+' · '+kind+' / '+b.note,uid());break;}
 case 'incoming':{const i=s.ingredients.find(i=>i.id===b.ingredientId);if(!i||!finite(b.quantity,0.000001)||!day(b.due)||b.due<today||!text(b.supplier)||!String(b.supplier).trim())throw Error('Vul ingrediënt, hoeveelheid, leverancier en aankomstdatum in.');s.incoming.push({id:uid(),ingredientId:i.id,quantity:b.quantity,remaining:b.quantity,due:b.due,status:'confirmed',supplier:String(b.supplier)});break;}
 // Shop products sold exactly as bought: recipe = 1 piece of one ingredient. Saved as concept (not reviewed).
 case 'resale':{const items=b.items as {productId:string;ingredientId?:string;newIngredient?:{name:string;origin:string;ownCents:number|null}}[];
  if(!Array.isArray(items)||!items.length||items.length>200||new Set(items.map(x=>x?.productId)).size!==items.length)throw Error('Kies 1 tot 200 producten.');
  const ids=items.map(x=>String(x.productId));const known=new Map((await getDb().select({id:products.id,draft:products.draft}).from(products).where(inArray(products.id,ids))).map(r=>[r.id,String((JSON.parse(r.draft) as {name?:string}).name||'').trim().slice(0,200)||'Product']));
  for(const it of items){
   if(!text(it.productId,100)||!known.has(it.productId))throw Error('Verkoopproduct niet gevonden.');
   if(s.recipes.some(r=>r.productId===it.productId))continue;
   const name=known.get(it.productId)!;
   let ingredientId=it.ingredientId;
   if(ingredientId){const i=s.ingredients.find(i=>i.id===ingredientId);if(!i||i.unit!=='st')throw Error('Kies voor '+name+' een ingrediënt dat per stuk gaat.');}
   else{const n=it.newIngredient;if(!n||!text(n.name)||!n.name.trim()||!['inkoop','eigen'].includes(n.origin)||!(n.ownCents===null||finite(n.ownCents,0,10000000)))throw Error('Controleer naam, herkomst en prijs van het nieuwe ingrediënt voor '+name+'.');
    const same=s.ingredients.find(i=>i.unit==='st'&&i.name.trim().toLowerCase()===n.name.trim().toLowerCase()&&i.origin===n.origin);
    if(same)ingredientId=same.id;else{const i:Ingredient={id:uid(),name:n.name.trim(),unit:'st',supplier:n.origin==='eigen'?'Eigen boerderij':'',article:'',stock:0,known:false,countedAt:'',pack:1,min:0,leadDays:1,shelfDays:0,allergens:[],checked:false,notes:'Aangemaakt als doorverkoopproduct ('+today+'). Leverancier en allergenen nog invullen.',origin:n.origin as Ingredient['origin'],ownCents:n.ownCents};s.ingredients.push(i);ingredientId=i.id;}}
   s.recipes.push({productId:it.productId,name,yield:1,lines:[{ingredientId:ingredientId!,quantity:1}],method:'Doorverkoop: ingekocht of van eigen boerderij en ongewijzigd verkocht.',lossPct:0,packagingCents:0,version:1,reviewed:false});
  }break;}
 default:throw Error('Onbekende actie.');}
 const result=await saveOps(loaded,s,b.requestId,String(b.action));
 if(result==='duplicate')return json({ok:true,duplicate:true});
 if(result==='conflict')return json({error:'Er is elders iets gewijzigd. Ververs en controleer opnieuw.'},409);
 return json({ok:true});
 }catch(e){return json({error:e instanceof Error?e.message:'Opslaan mislukt. Ververs eerst om de actuele stand te controleren.'},400)}}

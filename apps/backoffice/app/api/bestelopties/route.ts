import {authorizeSheet} from '@/lib/sheet-access';
import {SheetError} from '@/lib/sheets';
import {validSetting,validGroupInput,MAX_ORDER_CENTS,SALES_CONTEXTS,type SalesContext} from '@/lib/order-options';
import {getSetting,saveSetting,listGroups,createGroup,updateGroup,groupOrders} from '@/lib/order-options-store';
import type {SaleLine} from '@/lib/orders';
import {orderPageUrl} from '@/lib/public-orders';
export const dynamic='force-dynamic';
// Backoffice (owner only): eigen bedrag per verkoopcontext and group codes with a maximum budget.
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
const fail=(e:unknown)=>e instanceof SheetError?json({error:e.message},e.status):json({error:'Er ging iets mis. Ververs en probeer opnieuw.'},500);
const bad=(m='Ongeldige aanvraag.')=>new SheetError(m,400);
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const day=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'));

export async function GET(req:Request){try{
 authorizeSheet(req);
 const id=new URL(req.url).searchParams.get('groep');
 if(id){ // The host's bill: every order on this group code.
  if(!ID.test(id))throw bad();
  const rows=await groupOrders(id);
  return json(rows.map(r=>{const d=JSON.parse(r.data) as {lines:SaleLine[]};return {number:'P'+String(r.id).padStart(5,'0'),created:r.created,totalCents:r.totalCents,lines:d.lines.map(l=>({name:l.name,quantity:l.quantity,totalCents:l.totalCents}))}}));
 }
 const settings=await Promise.all((Object.keys(SALES_CONTEXTS) as SalesContext[]).map(async c=>({...await getSetting(c),label:SALES_CONTEXTS[c]})));
 return json({settings,groups:await listGroups(),orderPage:orderPageUrl()});
}catch(e){return fail(e)}}

export async function POST(req:Request){try{
 authorizeSheet(req,true);
 const raw=await req.text();if(raw.length>5000)throw bad('De aanvraag is te groot.');
 let b:Record<string,unknown>;try{b=JSON.parse(raw)}catch{throw bad()}
 if(!b||typeof b!=='object')throw bad();
 const by=req.headers.get('x-boer-bart-account')||'';
 if(b.action==='instelling'){
  if(!validSetting(b.setting)||!Number.isInteger(b.version)||(b.version as number)<0)throw bad('Kies een maximum tussen 100% en 1000%.');
  if(!await saveSetting(b.setting,b.version as number,by))throw new SheetError('Iemand anders heeft dit net gewijzigd. Ververs en probeer opnieuw.',409);
  return json({ok:true});
 }
 if(b.action==='nieuwe-groep'){
  if(typeof b.id!=='string'||!ID.test(b.id))throw bad();
  if(!validGroupInput(b.group))throw bad('Vul een naam, een maximumbedrag tot € '+(MAX_ORDER_CENTS/100).toLocaleString('nl-NL')+' en geldige data in.');
  return json({ok:true,code:await createGroup(b.id,b.group,by)});
 }
 if(b.action==='wijzig-groep'){
  if(typeof b.id!=='string'||!ID.test(b.id)||!Number.isInteger(b.version))throw bad();
  const c:{status?:'actief'|'gesloten';budgetCents?:number;validUntil?:string}={};
  if(b.status!==undefined){if(b.status!=='actief'&&b.status!=='gesloten')throw bad();c.status=b.status}
  if(b.budgetCents!==undefined){if(!Number.isSafeInteger(b.budgetCents)||(b.budgetCents as number)<=0||(b.budgetCents as number)>MAX_ORDER_CENTS)throw bad('Kies een geldig maximumbedrag.');c.budgetCents=b.budgetCents as number}
  if(b.validUntil!==undefined){if(!day(b.validUntil))throw bad('Kies een geldige datum.');c.validUntil=b.validUntil as string}
  if(!await updateGroup(b.id,b.version as number,c))throw new SheetError('Dit is intussen gewijzigd, of de einddatum ligt vóór de begindatum. Ververs en probeer opnieuw.',409);
  return json({ok:true});
 }
 throw bad();
}catch(e){return fail(e)}}

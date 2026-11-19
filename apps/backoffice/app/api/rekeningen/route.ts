import {isSameOrigin} from '@/lib/portable/origin';
import {withConnectionSettings} from '@/lib/connection-settings';
import {openBills,overdueBills,invoicedBills,groupById,billDetail,startSettlement,shareById,payShareAtRegister,payShareOnline,refreshShare,queueBillMail,BillError} from '@/lib/group-bill';
import {getDb} from '@/db';
import {groupCodes} from '@/db/schema';
import {eq} from 'drizzle-orm';
import {orderPageUrl} from '@/lib/public-orders';
import {PaymentsOff} from '@/lib/online-payments';
import {MollieError} from '@/lib/mollie';
export const dynamic='force-dynamic';
// Gezamenlijke rekeningen voor medewerkers (wens eigenaar 5 november 2026): de kassa rekent af (in één keer of gesplitst,
// per deel contant, pin of QR), Financiën toont de facturen en wat nog naar de rekeninghouder moet. Niet openbaar.
const no={'Cache-Control':'private, no-store'};
const fail=(error:string,status=400)=>Response.json({error},{status,headers:no});
const failure=(e:unknown)=>e instanceof PaymentsOff?fail(e.message,503):e instanceof BillError||e instanceof MollieError?fail(e.message,e.status<500?e.status:502)
 :e instanceof Error&&/^(Kies|Er staat|Het bedrag)/.test(e.message)?fail(e.message):fail('Dat lukt nu niet. Probeer het opnieuw.',500);
export async function GET(req:Request){
 const q=new URL(req.url).searchParams;
 try{return await withConnectionSettings(async()=>{
  const id=q.get('id');
  if(id){const g=await groupById(id);if(!g)return fail('Deze rekening is niet gevonden.',404);
   // Lopende iDEAL-betalingen van delen eerst nakijken, zodat de kassa vanzelf ziet dat er betaald is.
   for(const s of (await billDetail(g)).shares)if(s.busy){const row=await shareById(s.id);if(row)try{await refreshShare(row)}catch{}}
   return Response.json(await billDetail((await groupById(id))!),{headers:no})}
  const soort=q.get('soort');
  return Response.json(soort==='facturen'?await invoicedBills():soort==='achterstallig'?await overdueBills():await openBills(),{headers:no});
 })}catch(e){return failure(e)}
}
export async function POST(req:Request){
 if(!isSameOrigin(req))return fail('Ongeldige herkomst.',403);
 const b=await req.json().catch(()=>null) as {id?:unknown;count?:unknown;shareId?:unknown;method?:unknown;action?:unknown}|null;
 if(!b)return fail('Ongeldige aanvraag.');
 const who=req.headers.get('x-boer-bart-account')||'medewerker';
 try{return await withConnectionSettings(async()=>{
  if(typeof b.shareId==='string'){
   const s=await shareById(b.shareId);if(!s)return fail('Dit deel is niet gevonden.',404);
   // QR aan de kassa: de gast betaalt op de eigen telefoon en komt daarna op de bestelpagina met dit betaalverzoek.
   if(b.method==='qr'){const back=new URL(orderPageUrl());back.searchParams.set('deel',s.id);
    const r=await payShareOnline(s,back.toString());return Response.json('paid' in r?{paid:true}:{checkoutUrl:r.checkoutUrl},{headers:no})}
   if(b.method!=='contant'&&b.method!=='pin')return fail('Kies contant, pin of QR.');
   await payShareAtRegister(s,b.method,who);
   return Response.json(await billDetail((await groupById(s.groupCodeId))!),{headers:no});
  }
  // Factuurmail (opnieuw) versturen aan de rekeninghouder, vanaf de mailbox van Gesprekken.
  if(typeof b.id==='string'&&b.action==='mail'){const g=await groupById(b.id);if(!g)return fail('Deze rekening is niet gevonden.',404);if(!g.holderEmail)return fail('Van deze rekening is geen e-mailadres bekend.');
   const kind=g.paidAt?'voldaan':'open';await getDb().update(groupCodes).set(kind==='voldaan'?{mailPaid:'',mailError:''}:{mailOpen:'',mailError:''}).where(eq(groupCodes.id,g.id));
   await queueBillMail(g.id,kind,String(Date.now()));return Response.json({ok:true,kind},{headers:no})}
  if(typeof b.id==='string'){const g=await groupById(b.id);if(!g)return fail('Deze rekening is niet gevonden.',404);
   await startSettlement(g,Number(b.count));return Response.json(await billDetail((await groupById(b.id))!),{headers:no})}
  return fail('Ongeldige aanvraag.');
 })}catch(e){return failure(e)}
}

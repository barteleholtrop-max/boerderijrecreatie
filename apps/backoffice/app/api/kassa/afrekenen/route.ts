import {isSameOrigin} from '@/lib/portable/origin';
import {getDb} from '@/db';
import {orders} from '@/db/schema';
import {eq} from 'drizzle-orm';
import {payAtRegister,registerState,startPayment,PaymentsOff} from '@/lib/online-payments';
import {MollieError} from '@/lib/mollie';
import {allowedOrigins} from '@/lib/public-orders';
import {withConnectionSettings} from '@/lib/connection-settings';
export const dynamic='force-dynamic';
// Afrekenen aan de medewerkerskassa (wens eigenaar 4 november 2026): contant, pin of QR (iDEAL via Mollie).
// Alleen voor medewerkers (niet openbaar). GET ?bestelling=<id> geeft de stand; POST {orderId,method} rekent af.
const no={'Cache-Control':'private, no-store'};
const fail=(error:string,status=400)=>Response.json({error},{status,headers:no});
const failure=(e:unknown)=>e instanceof PaymentsOff?fail(e.message,503):e instanceof MollieError?fail(e.message+(e.detail?' (Mollie: '+e.detail+')':''),e.status<500?e.status:502):fail('Afrekenen lukt nu niet. Probeer het opnieuw.',500);
const byId=async(id:number)=>(await getDb().select().from(orders).where(eq(orders.id,id)))[0]??null;
const orderId=(v:unknown)=>Number.isInteger(v)&&Number(v)>0&&Number(v)<1e9?Number(v):0;

export async function GET(req:Request){
 const id=orderId(Number(new URL(req.url).searchParams.get('bestelling')));if(!id)return fail('Onbekende bestelling.');
 try{return await withConnectionSettings(async()=>{const o=await byId(id);if(!o)return fail('Deze bestelling is niet gevonden.',404);return Response.json(await registerState(o),{headers:no})})}catch(e){return failure(e)}
}
export async function POST(req:Request){
 if(!isSameOrigin(req))return fail('Ongeldige herkomst.',403);
 const b=await req.json().catch(()=>null) as {orderId?:unknown;method?:unknown}|null;
 const id=orderId(b?.orderId);if(!id)return fail('Onbekende bestelling.');
 if(!['contant','pin','qr'].includes(b?.method as string))return fail('Kies contant, pin of QR.');
 const who=req.headers.get('x-boer-bart-account')||'medewerker';
 try{return await withConnectionSettings(async()=>{
  const o=await byId(id);if(!o)return fail('Deze bestelling is niet gevonden.',404);
  if(b!.method==='qr'){
   if(o.status!=='vastgelegd')return fail('Deze bestelling kan niet aan de kassa worden afgerekend.',409);
   // Na het betalen komt de gast op de bestelpagina van de website en ziet „Betaald!”.
   const back=new URL('/bestellen.html',allowedOrigins()[0]||'http://localhost:3002');back.searchParams.set('bestelling',o.requestId);
   const r=await startPayment(o,back.toString(),{register:true});
   return Response.json('paid' in r?{paid:true}:{checkoutUrl:r.checkoutUrl},{headers:no});
  }
  await payAtRegister(o,b!.method as 'contant'|'pin',who);
  return Response.json({paid:true,...await registerState((await byId(id))!)},{headers:no});
 })}catch(e){return failure(e)}
}

import Anthropic from '@anthropic-ai/sdk';
import {corsHeaders,originAllowed,createRateLimit,clientKey} from '@/lib/public-orders';
import {parseImage} from '@/lib/label-read-core';
import {readLabelProduct,LabelReadOff} from '@/lib/label-read';
import {withConnectionSettings} from '@/lib/connection-settings';
export const dynamic='force-dynamic';
// Etiket lezen (wens eigenaar 9 november 2026): de zelfkassa (tablet of telefoon) stuurt een foto van een prijsetiket; Claude leest
// product en bedrag. Openbaar, zonder login (zie proxy.ts), alleen vanaf de eigen website. Elke foto kost Claude-gebruik, dus
// strakke limieten: per apparaat 6 per minuut en 60 per dag, samen 60 per minuut en 1.000 per dag. Er wordt niets bewaard.
const minute=createRateLimit({perClient:6,total:60}),day=createRateLimit({perClient:60,total:1000,windowMs:86_400_000});
const reply=(origin:string|null,body:unknown,status=200)=>Response.json(body,{status,headers:corsHeaders(origin)});
export function OPTIONS(req:Request){const origin=req.headers.get('origin');return new Response(null,{status:originAllowed(origin)?204:403,headers:corsHeaders(origin)})}
export async function POST(req:Request){
 const origin=req.headers.get('origin');
 if(!originAllowed(origin))return reply(origin,{error:'Etiketten lezen kan alleen via de website van Boerderijrecreatie.'},403);
 if(!(req.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))return reply(origin,{error:'Ongeldige aanvraag.'},415);
 const text=await req.text().catch(()=>'');
 if(text.length>2_100_000)return reply(origin,{error:'De foto is te groot.'},413);
 let body:{image?:unknown;barcode?:unknown};try{body=JSON.parse(text)}catch{return reply(origin,{error:'Ongeldige aanvraag.'},400)}
 const image=parseImage(body?.image);if(!image)return reply(origin,{error:'Geen geldige foto.'},400);
 const who=clientKey(req.headers);
 if(!minute(who)||!day(who))return reply(origin,{error:'Even te veel foto’s. Typ het bedrag zelf in, of probeer het zo opnieuw.'},429);
 try{return await withConnectionSettings(async()=>{
  const result=await readLabelProduct(image,body?.barcode);
  return result.ok?reply(origin,result):reply(origin,{error:result.reason},422);
 })}catch(e){
  if(e instanceof LabelReadOff)return reply(origin,{error:e.message,unavailable:true},503);
  if(e instanceof Anthropic.RateLimitError)return reply(origin,{error:'Het lezen is even druk. Typ het bedrag zelf in, of probeer het zo opnieuw.'},429);
  return reply(origin,{error:'Het etiket kon nu niet worden gelezen. Typ het bedrag zelf in.'},503);
 }
}

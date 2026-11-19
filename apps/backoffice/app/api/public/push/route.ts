import {corsHeaders,originAllowed,createRateLimit,clientKey,GUEST_REQUEST_ID} from '@/lib/public-orders';
import {parseSubscription,testOrigins,RETENTION_MS,readyStations} from '@/lib/push-core';
import {getDb} from '@/db';
import {workStatus} from '@/db/schema';
import {like} from 'drizzle-orm';
import {vapidKeys,subscribe} from '@/lib/push';
import {orderByRequest} from '@/lib/online-payments';
export const dynamic='force-dynamic';
// Pushmelding "Je bestelling staat klaar" (akkoord eigenaar 3 november 2026). Openbaar, zonder login; zie proxy.ts.
// GET: de openbare sleutel voor de browser. POST {requestId, subscription}: aanmelden voor één bestelling.
// GET ?bestelling=<requestId> (melding eigenaar 14 november 2026: „melding voor de gast werkt nog niet”): welke werkplekken deze
// bestelling klaar hebben. De open bestelapp vraagt dit elke paar seconden en toont dan zelf de melding, ook zonder pushmelding.
// Licht: alleen de database, geen bank of Mollie. Alleen bestellingen van de afgelopen dag; geen interne gegevens.
// Het aanvraagnummer kent alleen de browser van de gast. Aanmeldingen worden na 1 dag verwijderd.
const limit=createRateLimit({perClient:10,total:300});
const reply=(origin:string|null,body:unknown,status=200)=>Response.json(body,{status,headers:{...corsHeaders(origin),'Cache-Control':'no-store'}});
export function OPTIONS(req:Request){
 const origin=req.headers.get('origin');
 return new Response(null,{status:originAllowed(origin)?204:403,headers:corsHeaders(origin)});
}
const statusLimit=createRateLimit({perClient:120,total:3000});
export async function GET(req:Request){
 const requestId=new URL(req.url).searchParams.get('bestelling');
 if(requestId!==null)return readyStatus(req,requestId);
 try{return Response.json({available:true,publicKey:vapidKeys().publicKey},{headers:{'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}})}
 catch{return Response.json({available:false},{status:503,headers:{'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}})}
}
export async function POST(req:Request){
 const origin=req.headers.get('origin');
 if(!originAllowed(origin))return reply(origin,{error:'Aanmelden kan alleen via de website van Boer Bart.'},403);
 if(!(req.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))return reply(origin,{error:'Ongeldige aanvraag.'},415);
 const text=await req.text().catch(()=>'');if(text.length>4000)return reply(origin,{error:'Ongeldige aanvraag.'},413);
 if(!limit(clientKey(req.headers)))return reply(origin,{error:'Even geduld, probeer het over een minuut opnieuw.'},429);
 let body:{requestId?:unknown;subscription?:unknown};try{body=JSON.parse(text)}catch{return reply(origin,{error:'Ongeldige aanvraag.'},400)}
 const requestId=typeof body?.requestId==='string'?body.requestId:'';
 if(!GUEST_REQUEST_ID.test(requestId))return reply(origin,{error:'Onbekende bestelling.'},400);
 let sub;try{sub=parseSubscription(body.subscription,testOrigins())}catch(e){return reply(origin,{error:(e as Error).message},400)}
 try{
  const order=await orderByRequest(requestId);
  if(!order||Date.now()-Date.parse(order.created)>RETENTION_MS)return reply(origin,{error:'Deze bestelling is niet gevonden.'},404);
  await subscribe(order.id,sub);
  return reply(origin,{ok:true});
 }catch{return reply(origin,{error:'Aanmelden lukt nu niet. Probeer het zo opnieuw.'},503)}
}

async function readyStatus(req:Request,requestId:string){
 const origin=req.headers.get('origin');
 if(!GUEST_REQUEST_ID.test(requestId))return reply(origin,{error:'Onbekende bestelling.'},400);
 if(!statusLimit(clientKey(req.headers)))return reply(origin,{error:'Even geduld.'},429);
 try{
  const order=await orderByRequest(requestId);
  if(!order||Date.now()-Date.parse(order.created)>RETENTION_MS)return reply(origin,{error:'Deze bestelling is niet gevonden.'},404);
  const rows=await getDb().select({id:workStatus.id,status:workStatus.status,version:workStatus.version}).from(workStatus).where(like(workStatus.id,order.id+':%'));
  const status=Object.fromEntries(rows.map(r=>[r.id.slice(String(order.id).length+1),r.status]));
  const rounds=Object.fromEntries(rows.map(r=>[r.id.slice(String(order.id).length+1),Number(r.version)||1]));
  const lines=(JSON.parse(order.data) as {lines?:{station?:string}[]}).lines||[];
  return reply(origin,{ready:readyStations(lines,status,'P'+String(order.id).padStart(5,'0'),rounds).map(({station,title,body,tag})=>({station,title,body,tag}))});
 }catch{return reply(origin,{error:'Even geen stand.'},503)}
}

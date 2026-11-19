import {withConnectionSettings} from '@/lib/connection-settings';
import {corsHeaders,originAllowed,createRateLimit,clientKey,guestReceipt,returnPage,GUEST_REQUEST_ID} from '@/lib/public-orders';
import {orderByRequest,startPayment,refreshOrder,paymentState,PaymentsOff,requestCash} from '@/lib/online-payments';
import {MollieError} from '@/lib/mollie';
import {signupByRequest,startSignupPayment,refreshSignup,signupReceipt} from '@/lib/signup-payments';
export const dynamic='force-dynamic';
// Online betalen van een gastbestelling (Mollie). Openbaar, zonder login; zie proxy.ts en lib/online-payments.ts.
// POST {requestId,page}: start of hervat het betalen en geeft de betaalpagina van Mollie.
// GET ?bestelling=<requestId>: stand van bestelling en betaling, na terugkomst van Mollie. Het aanvraagnummer is het
// willekeurige nummer dat alleen de browser van de gast kent; het antwoord bevat alleen de bon, geen interne gegevens.
// Aanmelding voor een betaald evenement (sinds 3 november 2026): POST {aanmelding,page} en GET ?aanmelding=<requestId>,
// met terugkeer naar de agenda op de website (index.html).
const startLimit=createRateLimit({perClient:10,total:120}),statusLimit=createRateLimit({perClient:60,total:600});
const reply=(origin:string|null,body:unknown,status=200)=>Response.json(body,{status,headers:corsHeaders(origin)});
// Terug naar de websitepagina met de agenda: alleen een eigen pad naar index.html (of de map zelf).
const agendaPage=(v:unknown)=>typeof v==='string'&&/^\/(?:[a-z0-9-]+\/)*(?:index\.html)?$/.test(v)?v:'/';
const failure=(origin:string|null,e:unknown)=>e instanceof PaymentsOff?reply(origin,{error:e.message,unavailable:true},503)
 :e instanceof MollieError?reply(origin,{error:e.message,...(e.detail?{detail:e.detail}:{})},e.status):reply(origin,{error:'Betalen lukt nu niet. Probeer het zo opnieuw.'},503);

export function OPTIONS(req:Request){
 const origin=req.headers.get('origin');
 return new Response(null,{status:originAllowed(origin)?204:403,headers:corsHeaders(origin)});
}

export async function GET(req:Request){
 const origin=req.headers.get('origin'),q=new URL(req.url).searchParams;
 if(q.has('aanmelding'))return signupStatus(req,origin,q.get('aanmelding')||'');
 const requestId=q.get('bestelling')||'';
 if(!GUEST_REQUEST_ID.test(requestId))return reply(origin,{error:'Onbekende bestelling.'},400);
 if(!statusLimit(clientKey(req.headers)))return reply(origin,{error:'Even geduld, probeer het over een minuut opnieuw.'},429);
 try{return await withConnectionSettings(async()=>{
  let order=await orderByRequest(requestId);
  if(!order)return reply(origin,{error:'Deze bestelling is niet gevonden.'},404);
  // Stand bij Mollie ophalen; lukt dat niet, dan tonen we wat de backoffice al weet.
  try{await refreshOrder(order);order=(await orderByRequest(requestId))!}catch{}
  return reply(origin,{...guestReceipt(order),payment:await paymentState(order)});
 })}catch(e){return failure(origin,e)}
}

export async function POST(req:Request){
 const origin=req.headers.get('origin');
 if(!originAllowed(origin))return reply(origin,{error:'Betalen kan alleen via de website van Boerderijrecreatie.'},403);
 if(!(req.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))return reply(origin,{error:'Ongeldige aanvraag.'},415);
 const text=await req.text().catch(()=>'');
 if(text.length>1000)return reply(origin,{error:'Ongeldige aanvraag.'},413);
 let body:{requestId?:unknown;aanmelding?:unknown;page?:unknown;method?:unknown;dividend?:unknown;saldoEerst?:unknown};try{body=JSON.parse(text)}catch{return reply(origin,{error:'Ongeldige aanvraag.'},400)}
 if(body&&'aanmelding' in body)return signupStart(req,origin,body);
 const requestId=typeof body?.requestId==='string'?body.requestId:'';
 if(!GUEST_REQUEST_ID.test(requestId))return reply(origin,{error:'Onbekende bestelling.'},400);
 if(!startLimit(clientKey(req.headers)))return reply(origin,{error:'Er wordt nu veel betaald. Probeer het over een minuut opnieuw.'},429);
 try{return await withConnectionSettings(async()=>{
  const order=await orderByRequest(requestId);
  if(!order)return reply(origin,{error:'Deze bestelling is niet gevonden.'},404);
  // Zelfservicekassa: contant betalen bij een medewerker (geen Mollie nodig). Zie lib/online-payments.ts requestCash.
  if(body.method==='contant'){const r=await requestCash(order);if('paid' in r){const fresh=(await orderByRequest(requestId))!;return reply(origin,{paid:true,receipt:{...guestReceipt(fresh),payment:await paymentState(fresh)}})}return reply(origin,r)}
  if(body.method==='bb')return reply(origin,{error:'Betalen met saldo kan hier niet. Betaal met iDEAL.',reason:'dividend'},400);
  const back=new URL(returnPage(body.page),origin!);back.searchParams.set('bestelling',requestId);
  const result=await startPayment(order,back.toString());
  if('paid' in result){const fresh=(await orderByRequest(requestId))!;return reply(origin,{paid:true,receipt:{...guestReceipt(fresh),payment:await paymentState(fresh)}})}
  return reply(origin,{checkoutUrl:result.checkoutUrl});
 })}catch(e){return failure(origin,e)}
}

async function signupStatus(req:Request,origin:string|null,requestId:string){
 if(!GUEST_REQUEST_ID.test(requestId))return reply(origin,{error:'Onbekende aanmelding.'},400);
 if(!statusLimit(clientKey(req.headers)))return reply(origin,{error:'Even geduld, probeer het over een minuut opnieuw.'},429);
 try{return await withConnectionSettings(async()=>{
  let s=await signupByRequest(requestId);
  if(!s)return reply(origin,{error:'Deze aanmelding is niet gevonden.'},404);
  try{await refreshSignup(s);s=(await signupByRequest(requestId))!}catch{}
  return reply(origin,await signupReceipt(s));
 })}catch(e){return failure(origin,e)}
}

async function signupStart(req:Request,origin:string|null,body:{aanmelding?:unknown;page?:unknown}){
 const requestId=typeof body.aanmelding==='string'?body.aanmelding:'';
 if(!GUEST_REQUEST_ID.test(requestId))return reply(origin,{error:'Onbekende aanmelding.'},400);
 if(!startLimit(clientKey(req.headers)))return reply(origin,{error:'Er wordt nu veel betaald. Probeer het over een minuut opnieuw.'},429);
 try{return await withConnectionSettings(async()=>{
  const s=await signupByRequest(requestId);
  if(!s)return reply(origin,{error:'Deze aanmelding is niet gevonden.'},404);
  const back=new URL(agendaPage(body.page),origin!);back.searchParams.set('aanmelding',requestId);
  const result=await startSignupPayment(s,back.toString());
  if('paid' in result)return reply(origin,{paid:true,receipt:await signupReceipt((await signupByRequest(requestId))!)});
  return reply(origin,{checkoutUrl:result.checkoutUrl});
 })}catch(e){return failure(origin,e)}
}

import {corsHeaders,originAllowed,createRateLimit,clientKey} from '@/lib/public-orders';
import {loadGuest,editGuest,guestProcessed} from '@/lib/guest-store';
import {groupIndication,groupRequestSchema,addGroupRequest,MAX_REQUEST_BYTES,type Indication} from '@/lib/group-request';
import {queueStaffNotice} from '@/lib/staff-push';
import {groupMessage} from '@/lib/staff-push-core';
export const dynamic='force-dynamic';
// Groepen & feesten op de website (openbaar, zonder login; zie proxy.ts en lib/group-request.ts).
// GET ?datum=JJJJ-MM-DD&personen=N: direct antwoord (indicatie) uit de centrale planning; er wordt niets vastgehouden.
// POST: de aanvraag komt in Gesprekken, aanvragen & klanten, met een concept-aanvraag in Planning. Eén keer per requestId.
const checkLimit=createRateLimit({perClient:40,total:600}),sendLimit=createRateLimit({perClient:5,total:60});
const reply=(origin:string|null,body:unknown,status=200)=>Response.json(body,{status,headers:corsHeaders(origin)});
export function OPTIONS(req:Request){const origin=req.headers.get('origin');return new Response(null,{status:originAllowed(origin)?204:403,headers:corsHeaders(origin)})}

export async function GET(req:Request){
 const origin=req.headers.get('origin'),q=new URL(req.url).searchParams;
 if(!checkLimit(clientKey(req.headers)))return reply(origin,{error:'Even geduld, probeer het over een minuut opnieuw.'},429);
 const date=q.get('datum')||'',people=q.get('personen')?Number(q.get('personen')):1;
 let state;try{state=(await loadGuest()).state}catch{return reply(origin,{error:'De planning is nu niet bereikbaar. Stuur je aanvraag gerust, dan kijken we het na.'},503)}
 try{return reply(origin,groupIndication(state,date,people))}catch(e){return reply(origin,{error:(e as Error).message},400)}
}

export async function POST(req:Request){
 const origin=req.headers.get('origin');
 if(!originAllowed(origin))return reply(origin,{error:'Een aanvraag kan alleen via de website van Boer Bart.'},403);
 if(!(req.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))return reply(origin,{error:'Ongeldige aanvraag.'},415);
 const text=await req.text().catch(()=>'');
 if(new TextEncoder().encode(text).length>MAX_REQUEST_BYTES)return reply(origin,{error:'Je aanvraag is te lang. Verkort je wensen een beetje.'},413);
 let request;try{request=groupRequestSchema.parse(JSON.parse(text))}catch(e){const issue=(e as {issues?:{message:string}[]}).issues?.[0]?.message;return reply(origin,{error:issue&&!/^(Invalid|Expected)/.test(issue)?issue:'Controleer je gegevens.'},400)}
 try{
  if(await guestProcessed(request.requestId))return reply(origin,{ok:true,duplicate:true});
  if(!sendLimit(clientKey(req.headers)))return reply(origin,{error:'Er worden nu veel aanvragen verstuurd. Probeer het over een minuut opnieuw.'},429);
  let indication:Indication|null=null;
  await editGuest(s=>{indication=addGroupRequest(s,request).indication},request.requestId);
  await queueStaffNotice(groupMessage(request)); // melding in de backoffice-app voor Rianne en Bartele
  return reply(origin,{ok:true,indication},201);
 }catch{return reply(origin,{error:'Je aanvraag kon nu niet worden verstuurd. Probeer het opnieuw; je tekst blijft staan.'},503)}
}

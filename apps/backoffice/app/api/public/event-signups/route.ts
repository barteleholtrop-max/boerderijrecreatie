import {corsHeaders,originAllowed,createRateLimit,clientKey} from '@/lib/public-orders';
import {parseSignup,MAX_SIGNUP_BYTES} from '@/lib/event-signups-core';
import {createSignup,SignupError} from '@/lib/event-signups';
import {withConnectionSettings} from '@/lib/connection-settings';
export const dynamic='force-dynamic';
// Public write endpoint: guests sign up for an event on the website (no login; see proxy.ts). Same safeguards as
// guest orders: only from the website's own origin, JSON only, size and rate limit, idempotent per requestId.
// The team sees the sign-up in Planning. Paid event with online payment (Mollie): the answer says pay:true and the
// website then starts the payment via /api/public/payments ({aanmelding}); the place is held meanwhile.
const limit=createRateLimit({perClient:5,total:60});
const reply=(origin:string|null,body:unknown,status=200)=>Response.json(body,{status,headers:corsHeaders(origin)});
export function OPTIONS(req:Request){const origin=req.headers.get('origin');return new Response(null,{status:originAllowed(origin)?204:403,headers:corsHeaders(origin)})}
export async function POST(req:Request){
 const origin=req.headers.get('origin');
 if(!originAllowed(origin))return reply(origin,{error:'Aanmelden kan alleen via de website van Boerderijrecreatie.'},403);
 if(!(req.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))return reply(origin,{error:'Ongeldige aanmelding.'},415);
 const text=await req.text().catch(()=>'');
 if(new TextEncoder().encode(text).length>MAX_SIGNUP_BYTES)return reply(origin,{error:'Je aanmelding is te groot.'},413);
 let signup;try{signup=parseSignup(JSON.parse(text))}catch(e){return reply(origin,{error:e instanceof SyntaxError?'Ongeldige aanmelding.':(e as Error).message},400)}
 if(!limit(clientKey(req.headers)))return reply(origin,{error:'Er worden nu veel aanmeldingen tegelijk verstuurd. Probeer het over een minuut opnieuw.'},429);
 try{const r=await withConnectionSettings(()=>createSignup(signup));return reply(origin,{ok:true,people:r.signup.people,name:r.signup.name,pay:r.pay,amountCents:r.signup.amountCents},r.duplicate?200:201)}
 catch(e){return e instanceof SignupError?reply(origin,{error:e.message},e.status):reply(origin,{error:'Je aanmelding kon nu niet worden verstuurd. Probeer het opnieuw.'},503)}
}

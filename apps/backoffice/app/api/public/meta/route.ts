import {withConnectionSettings} from '@/lib/connection-settings';
import {createRateLimit} from '@/lib/public-orders';
import {ingestWebhook,metaConfig} from '@/lib/meta-store';
import {validSignature} from '@/lib/meta-signature';
export const dynamic='force-dynamic';
// Webhook van Meta (akkoord eigenaar 9 november 2026): WhatsApp, Messenger en Instagram sturen elk nieuw bericht hierheen.
// Openbaar, zonder login (zie proxy.ts). GET is de eenmalige controle van Meta bij het instellen (verify token);
// POST telt alleen met een geldige handtekening van Meta (X-Hub-Signature-256 met het app-geheim). Een herhaalde melding
// is onschadelijk: elk bericht wordt één keer opgeslagen. Lukt opslaan niet, dan 500 en probeert Meta het later opnieuw.
const limit=createRateLimit({perClient:1200,total:1200});
const plain=(body:string,status:number)=>new Response(body,{status,headers:{'Cache-Control':'no-store','Content-Type':'text/plain; charset=utf-8'}});
export async function GET(req:Request){
 const q=new URL(req.url).searchParams,challenge=q.get('hub.challenge')||'';
 return withConnectionSettings(async()=>{
  const token=metaConfig().verifyToken;
  if(q.get('hub.mode')==='subscribe'&&token&&q.get('hub.verify_token')===token&&/^[A-Za-z0-9_-]{1,200}$/.test(challenge))return plain(challenge,200);
  return plain('',403);
 }).catch(()=>plain('',503));
}
export async function POST(req:Request){
 if(!limit('meta'))return plain('',429);
 const raw=await req.text().catch(()=>'');
 if(raw.length>2_000_000)return plain('',413);
 try{
  return await withConnectionSettings(async()=>{
   if(!validSignature(raw,req.headers.get('x-hub-signature-256'),metaConfig().appSecret))return plain('',401);
   let body:unknown;try{body=JSON.parse(raw)}catch{return plain('',400)}
   await ingestWebhook(body);
   return plain('',200);
  });
 }catch(e){console.error('[meta-webhook]',e instanceof Error?e.message:e);return plain('',500)}
}

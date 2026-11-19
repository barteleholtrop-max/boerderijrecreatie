import {requestOrigin} from '@/lib/member-origin';
import {cookies} from 'next/headers';
import {isSameOrigin} from '@/lib/portable/origin';
import {sessionSecret,cookieSecure} from '@/lib/login-core';
import {redeemPairing,TabletError} from '@/lib/werkplek-pas';
import {signWerkplek,WERKPLEK_COOKIE,WERKPLEK_DEVICE_COOKIE,WERKPLEK_MINUTES,DEVICE_DAYS,WERKPLEK_START} from '@/lib/werkplek-pas-core';
export const dynamic='force-dynamic';
// De tablet wisselt de koppelcode uit de QR-code in (POST, nooit bij het openen van de link: zo kan een voorvertoning of
// virusscanner de code niet opmaken). Daarna krijgt de tablet het apparaatbewijs en de eerste werkplekpas.
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
let recent:number[]=[];
export async function POST(req:Request){try{
 if(!isSameOrigin(req))return json({error:'Ongeldige herkomst.'},403);
 const secret=sessionSecret();if(!secret)return json({error:'Inloggen is nog niet ingesteld op deze server.'},503);
 // Een ruwe rem tegen raden (de code is 256 bits, raden is zinloos, maar we houden de database rustig).
 const t=Date.now();recent=recent.filter(x=>x>t-60000);if(recent.length>=30)return json({error:'Even te veel pogingen. Probeer het over een minuut opnieuw.'},429);recent.push(t);
 const raw=await req.text();if(raw.length>500)return json({error:'Ongeldige aanvraag.'},400);
 let code:unknown;try{code=(JSON.parse(raw) as {code?:unknown}).code}catch{return json({error:'Ongeldige aanvraag.'},400)}
 const d=await redeemPairing(code),origin=requestOrigin(req),secure=cookieSecure(process.env,origin),jar=await cookies();
 jar.set(WERKPLEK_DEVICE_COOKIE,d.secret,{httpOnly:true,secure,sameSite:'lax',path:'/',maxAge:DEVICE_DAYS*86400});
 jar.set(WERKPLEK_COOKIE,signWerkplek({id:d.id,name:d.name,exp:Date.now()+WERKPLEK_MINUTES*60000},secret),{httpOnly:true,secure,sameSite:'lax',path:'/',maxAge:WERKPLEK_MINUTES*60});
 return json({ok:true,name:d.name,naar:WERKPLEK_START});
}catch(e){if(e instanceof TabletError)return json({error:e.message},e.status);console.error('[tablet koppelen]',e instanceof Error?e.message:e);return json({error:'Koppelen lukt nu even niet. Probeer het opnieuw.'},500)}}

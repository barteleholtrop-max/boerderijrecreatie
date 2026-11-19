import {requestOrigin} from '@/lib/member-origin';
import {cookies} from 'next/headers';
import {isSameOrigin} from '@/lib/portable/origin';
import {sessionSecret,cookieSecure} from '@/lib/login-core';
import {deviceBySecret} from '@/lib/werkplek-pas';
import {signWerkplek,WERKPLEK_COOKIE,WERKPLEK_DEVICE_COOKIE,WERKPLEK_MINUTES,WERKPLEK_START} from '@/lib/werkplek-pas-core';
export const dynamic='force-dynamic';
// Een nieuwe werkplekpas (60 minuten) met het apparaatbewijs, zolang de tablet niet is ontkoppeld.
// GET: de proxy stuurt een tablet met een verlopen pas hierheen en daarna terug naar het scherm.
// POST: de werkplekschermen vernieuwen zelf op de achtergrond (app/werkplek-vernieuwen.tsx).
async function renew(req:Request){
 const secret=sessionSecret();if(!secret)return {status:503 as const};
 const jar=await cookies(),device=await deviceBySecret(jar.get(WERKPLEK_DEVICE_COOKIE)?.value);
 const secure=cookieSecure(process.env,requestOrigin(req));
 if(!device){jar.delete(WERKPLEK_COOKIE);if(jar.get(WERKPLEK_DEVICE_COOKIE))jar.delete(WERKPLEK_DEVICE_COOKIE);return {status:401 as const}}
 jar.set(WERKPLEK_COOKIE,signWerkplek({id:device.id,name:device.name,exp:Date.now()+WERKPLEK_MINUTES*60000},secret),{httpOnly:true,secure,sameSite:'lax',path:'/',maxAge:WERKPLEK_MINUTES*60});
 return {status:200 as const,name:device.name};
}
const safe=(v:string|null)=>v&&/^\/(werkplek|opnemen)(\/[A-Za-z0-9_-]*)*(\?[A-Za-z0-9=&_.-]*)?$/.test(v)?v:WERKPLEK_START;
export async function GET(req:Request){
 const origin=requestOrigin(req),r=await renew(req).catch(()=>({status:500 as const}));
 if(r.status===200)return Response.redirect(new URL(safe(new URL(req.url).searchParams.get('terug')),origin),302);
 // Ontkoppeld of onbekend: naar het koppelscherm (daar staat uitgelegd hoe je opnieuw koppelt).
 return Response.redirect(new URL('/tablet/koppelen?ontkoppeld=1',origin),302);
}
export async function POST(req:Request){
 if(!isSameOrigin(req))return Response.json({error:'Ongeldige herkomst.'},{status:403});
 const r=await renew(req).catch(()=>({status:500 as const}));
 return Response.json(r.status===200?{ok:true,name:r.name}:{ok:false},{status:r.status,headers:{'Cache-Control':'private, no-store'}});
}

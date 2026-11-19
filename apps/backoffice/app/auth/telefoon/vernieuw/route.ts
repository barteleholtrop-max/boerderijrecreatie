import {requestOrigin} from '@/lib/member-origin';
import {cookies} from 'next/headers';
import {isSameOrigin} from '@/lib/portable/origin';
import {sessionSecret,cookieSecure} from '@/lib/login-core';
import {phoneBySecret} from '@/lib/telefoon-pas';
import {signTelefoon,TELEFOON_COOKIE,TELEFOON_DEVICE_COOKIE,TELEFOON_MINUTES,TELEFOON_START} from '@/lib/telefoon-pas-core';
export const dynamic='force-dynamic';
// Managerapp altijd ingelogd op de eigen telefoon (wens eigenaar 10 november 2026): een nieuwe telefoonpas (60 minuten) met
// het apparaatbewijs, zolang de telefoon niet is ontkoppeld en de persoon de managerapp nog mag openen.
// GET: de proxy stuurt een telefoon met een verlopen pas hierheen (bijvoorbeeld de volgende ochtend) en daarna terug.
// POST: de managerapp vernieuwt zelf op de achtergrond (app/telefoon-vernieuwen.tsx).
async function renew(req:Request){
 const secret=sessionSecret();if(!secret)return {status:503 as const};
 const jar=await cookies(),phone=await phoneBySecret(jar.get(TELEFOON_DEVICE_COOKIE)?.value);
 const secure=cookieSecure(process.env,requestOrigin(req));
 if(!phone){jar.delete(TELEFOON_COOKIE);if(jar.get(TELEFOON_DEVICE_COOKIE))jar.delete(TELEFOON_DEVICE_COOKIE);return {status:401 as const}}
 jar.set(TELEFOON_COOKIE,signTelefoon({id:phone.id,email:phone.email,role:phone.role,exp:Date.now()+TELEFOON_MINUTES*60000},secret),{httpOnly:true,secure,sameSite:'lax',path:'/',maxAge:TELEFOON_MINUTES*60});
 return {status:200 as const};
}
const safe=(v:string|null)=>v&&/^\/((gesprekken|assistent|planning|taken)\/telefoon|apps)(\/[A-Za-z0-9_:%-]*)*(\?[A-Za-z0-9=&_.:%-]*)?$/.test(v)?v:TELEFOON_START;
export async function GET(req:Request){
 const origin=requestOrigin(req),terug=safe(new URL(req.url).searchParams.get('terug'));
 const r=await renew(req).catch(()=>({status:500 as const}));
 if(r.status===200)return Response.redirect(new URL(terug,origin),302);
 // Ontkoppeld, onbekend of geen toegang meer: gewoon inloggen, daarna terug naar de app.
 const to=new URL('/inloggen',origin);to.searchParams.set('terug',terug);return Response.redirect(to,302);
}
export async function POST(req:Request){
 if(!isSameOrigin(req))return Response.json({error:'Ongeldige herkomst.'},{status:403});
 const r=await renew(req).catch(()=>({status:500 as const}));
 return Response.json({ok:r.status===200},{status:r.status,headers:{'Cache-Control':'private, no-store'}});
}

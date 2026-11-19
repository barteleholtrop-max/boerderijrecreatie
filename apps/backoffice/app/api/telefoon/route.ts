import {requestOrigin} from '@/lib/member-origin';
import {cookies} from 'next/headers';
import {authorizeSheet} from '@/lib/sheet-access';
import {SheetError} from '@/lib/sheets';
import {requireFreshCode,noteSensitive} from '@/lib/gevoelig';
import {sessionSecret,cookieSecure} from '@/lib/login-core';
import {rememberPhone,phoneBySecret,forgetPhone,PhoneError} from '@/lib/telefoon-pas';
import {signTelefoon,phoneLabel,TELEFOON_COOKIE,TELEFOON_DEVICE_COOKIE,TELEFOON_MINUTES,TELEFOON_DEVICE_DAYS} from '@/lib/telefoon-pas-core';
export const dynamic='force-dynamic';
// Managerapp altijd ingelogd op de eigen telefoon (wens eigenaar 10 november 2026: „Die app moet altijd bij die telefoon
// passen.”). GET: hoe staat deze telefoon ervoor. POST onthouden: na gewoon inloggen (met een recente code) deze telefoon
// ingelogd houden. POST uitloggen: deze telefoon vergeten. De proxy zet x-boer-bart-telefoon alleen bij een telefoonpas.
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
const fail=(e:unknown)=>e instanceof Response?e:e instanceof SheetError||e instanceof PhoneError?json({error:e.message},e.status):(console.error('[telefoon]',e instanceof Error?e.message:e),json({error:'Er ging iets mis. Probeer het opnieuw.'},500));
const viaPas=(req:Request)=>!!req.headers.get('x-boer-bart-telefoon');
export async function GET(req:Request){try{
 authorizeSheet(req);
 if(viaPas(req))return json({stand:'onthouden'});
 const phone=await phoneBySecret((await cookies()).get(TELEFOON_DEVICE_COOKIE)?.value);
 return json({stand:phone&&phone.email===(req.headers.get('x-boer-bart-email')||'')?'onthouden':'niet'});
}catch(e){return fail(e)}}
export async function POST(req:Request){try{
 authorizeSheet(req,true);
 const raw=await req.text();if(raw.length>500)throw new PhoneError('Ongeldige aanvraag.');
 let b:Record<string,unknown>={};try{b=JSON.parse(raw)}catch{throw new PhoneError('Ongeldige aanvraag.')}
 const jar=await cookies(),secure=cookieSecure(process.env,requestOrigin(req));
 if(b.action==='onthouden'){
  if(viaPas(req))return json({ok:true,stand:'onthouden'});
  const email=req.headers.get('x-boer-bart-email')||'',secret=sessionSecret();
  if(!email||!secret)throw new PhoneError('Log eerst gewoon in op deze telefoon.',401);
  // Alleen vlak na het inloggen of met een nieuwe code: wie een telefoon onthoudt, bewijst het met de Authenticator.
  requireFreshCode(req);
  const p=await rememberPhone(email,phoneLabel(req.headers.get('user-agent')),jar.get(TELEFOON_DEVICE_COOKIE)?.value);
  jar.set(TELEFOON_DEVICE_COOKIE,p.secret,{httpOnly:true,secure,sameSite:'lax',path:'/',maxAge:TELEFOON_DEVICE_DAYS*86400});
  jar.set(TELEFOON_COOKIE,signTelefoon({id:p.id,email:p.email,role:p.role,exp:Date.now()+TELEFOON_MINUTES*60000},secret),{httpOnly:true,secure,sameSite:'lax',path:'/',maxAge:TELEFOON_MINUTES*60});
  await noteSensitive(req,'telefoon:onthouden',{id:p.id});
  return json({ok:true,stand:'onthouden'});
 }
 if(b.action==='uitloggen'){
  await forgetPhone(jar.get(TELEFOON_DEVICE_COOKIE)?.value,req.headers.get('x-boer-bart-account')||'telefoon');
  jar.delete(TELEFOON_COOKIE);jar.delete(TELEFOON_DEVICE_COOKIE);
  return json({ok:true,stand:'niet'});
 }
 throw new PhoneError('Onbekende actie.');
}catch(e){return fail(e)}}

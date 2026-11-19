import {cookies} from 'next/headers';
import {authConfig,codeAttempt,readSession,sessionSecret,signSession,validCode,SESSION_COOKIE} from '@/lib/login-core';
import {refreshTokens,verifyTotp,AuthFail} from '@/lib/supabase-auth';
import {answer,currentReverify,failText,readJson,setSession,writeReverify} from '@/lib/login-flow';
export const dynamic='force-dynamic';
// Opnieuw de code bij een gevoelige handeling (besluit eigenaar 6 november 2026). Alleen met een geldige sessie; Supabase
// controleert de code opnieuw. Daarna geldt de sessie weer 10 minuten als „net bevestigd” (lib/gevoelig.ts). De sessie
// zelf wordt niet langer: de eindtijd blijft gelijk.
const AGAIN={error:'Log opnieuw in om dit te bevestigen.',opnieuw:true};
export async function POST(req:Request){try{
 const b=await readJson(req),cfg=authConfig()!,secret=sessionSecret();
 const session=readSession((await cookies()).get(SESSION_COOKIE)?.value,secret),r=await currentReverify();
 if(!session||!r||r.email!==session.email)return answer(AGAIN,401);
 if(!validCode(b.code))return answer({error:'Vul de 6 cijfers uit je Authenticator-app in.'},400);
 if(!codeAttempt(session.email,null))return answer({error:'Te veel onjuiste codes. Wacht 10 minuten.'},429);
 const fresh=await refreshTokens(cfg,r.refresh).catch(()=>null);
 if(!fresh||fresh.user.id!==r.authId)return answer(AGAIN,401);
 const maxAge=Math.max(60,Math.floor((session.exp-Date.now())/1000));
 // Het vernieuwingsbewijs is eenmalig: meteen het nieuwe bewaren, ook als de code hierna niet klopt.
 if(fresh.refresh_token)await writeReverify(req,{...r,refresh:fresh.refresh_token},maxAge);
 let verified;
 try{verified=await verifyTotp(cfg,fresh.access_token,r.factor,b.code)}
 catch(e){if(e instanceof AuthFail&&e.code==='code-onjuist'){codeAttempt(session.email,false);return answer({error:'Die code klopt niet. Kijk in je Authenticator-app en probeer opnieuw.'},400)}throw e}
 codeAttempt(session.email,true);
 if(verified.refresh_token)await writeReverify(req,{...r,refresh:verified.refresh_token},maxAge);
 const {quick:_,...rest}=session;await setSession(req,signSession({...rest,mfa:Date.now()},secret),maxAge);
 return answer({ok:true});
}catch(e){return failText(e)}}

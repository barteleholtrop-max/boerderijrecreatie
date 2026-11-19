import {authConfig,normalizeEmail,passwordProblem,validCode,codeAttempt} from '@/lib/login-core';
import {activeAccount} from '@/lib/access-store';
import {getUser,updatePassword,verifiedTotp,verifyTotp,AuthFail} from '@/lib/supabase-auth';
import {answer,failText,readJson} from '@/lib/login-flow';
export const dynamic='force-dynamic';
// Nieuw wachtwoord na de herstelmail. Het herstelbewijs van Supabase komt uit de link (het deel na #, dat nooit in
// serverlogs belandt). Heeft iemand al een Authenticator gekoppeld, dan is ook de code nodig: een gestolen mailbox
// alleen is niet genoeg. Daarna gewoon inloggen (opnieuw met de code).
export async function POST(req:Request){try{
 const b=await readJson(req,6000),cfg=authConfig()!;
 const token=b.token;if(typeof token!=='string'||token.length<20||token.length>4000)return answer({error:'Deze link is verlopen. Vraag een nieuwe herstelmail aan.'},400);
 const problem=passwordProblem(b.password);if(problem)return answer({error:problem},400);
 const user=await getUser(cfg,token).catch(()=>null);
 const email=normalizeEmail(user?.email);
 if(!user||!email||!await activeAccount(email))return answer({error:'Deze link is verlopen. Vraag een nieuwe herstelmail aan.'},400);
 let use=token;const factor=verifiedTotp(user);
 if(factor){
  if(!validCode(b.code))return answer({error:'Vul ook de code uit je Authenticator-app in.',code:true},400);
  if(!codeAttempt(email,null))return answer({error:'Te veel onjuiste codes. Wacht 10 minuten.',code:true},429);
  try{use=(await verifyTotp(cfg,token,factor,b.code)).access_token;codeAttempt(email,true)}
  catch(e){if(e instanceof AuthFail&&e.code==='code-onjuist'){codeAttempt(email,false);return answer({error:'Die code klopt niet. Kijk in je Authenticator-app en probeer opnieuw.',code:true},400)}throw e}
 }
 await updatePassword(cfg,use,b.password as string);
 return answer({ok:true});
}catch(e){return failText(e)}}

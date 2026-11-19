import {allowed,firstPage} from '@/lib/onderdelen';
import {authConfig,codeAttempt,sessionSecret,signSession,validCode,sessionLength} from '@/lib/login-core';
import {noteLogin} from '@/lib/access-store';
import {enrollTotp,getUser,verifiedTotp,verifyTotp,AuthFail} from '@/lib/supabase-auth';
import {answer,currentStep,endStep,failText,readJson,setSession,writeReverify,writeStep} from '@/lib/login-flow';
export const dynamic='force-dynamic';
// Tweede stap (besluit eigenaar 6 november 2026): voor iedereen in de backoffice de code uit de Authenticator-app
// (Google Authenticator, Microsoft Authenticator, 1Password). De eerste keer koppel je de app met een QR-code.
const AGAIN={error:'Je inlogpoging is verlopen. Log opnieuw in.',opnieuw:true};

/** Wat er nodig is: de app koppelen (met QR-code) of alleen de code invullen. */
export async function GET(req:Request){try{
 const cfg=authConfig(),step=await currentStep();
 if(!cfg)return answer({error:'Inloggen is nog niet ingesteld op deze server.'},503);
 if(!step)return answer(AGAIN,401);
 const user=await getUser(cfg,step.token).catch(()=>null);
 if(!user||user.id!==step.authId)return answer(AGAIN,401);
 if(verifiedTotp(user))return answer({stap:'code',naam:step.name});
 const e=await enrollTotp(cfg,step.token,user);
 await writeStep(req,{...step,factor:e.factor});
 return answer({stap:'koppelen',naam:step.name,qr:e.qr,geheim:e.secret});
}catch(e){return failText(e)}}

export async function POST(req:Request){try{
 const b=await readJson(req),cfg=authConfig()!,step=await currentStep();
 if(!step)return answer(AGAIN,401);
 if(!validCode(b.code))return answer({error:'Vul de 6 cijfers uit je Authenticator-app in.'},400);
 if(!codeAttempt(step.email,null))return answer({error:'Te veel onjuiste codes. Wacht 10 minuten en log opnieuw in.'},429);
 const user=await getUser(cfg,step.token).catch(()=>null);
 if(!user||user.id!==step.authId)return answer(AGAIN,401);
 const factor=verifiedTotp(user)||step.factor;
 if(!factor)return answer(AGAIN,401);
 let verified;
 try{verified=await verifyTotp(cfg,step.token,factor,b.code)}
 catch(e){if(e instanceof AuthFail&&e.code==='code-onjuist'){codeAttempt(step.email,false);return answer({error:'Die code klopt niet. Kijk in je Authenticator-app en probeer opnieuw.'},400)}throw e}
 codeAttempt(step.email,true);
 const now=Date.now(),len=sessionLength(step.remember),exp=now+len; // „Onthoud deze telefoon”: 30 dagen, anders 8 uur
 await setSession(req,signSession({email:step.email,name:step.name,role:step.role,modules:step.role==='eigenaar'?undefined:step.modules||[],exp,mfa:now,...(step.remember?{lang:true as const}:{})},sessionSecret()),len/1000);
 await endStep();
 if(verified.refresh_token)await writeReverify(req,{email:step.email,authId:step.authId,factor,refresh:verified.refresh_token,exp},len/1000);
 await noteLogin(step.email,step.authId);
 // Een medewerker gaat naar een pagina die hij mag openen (anders zijn eerste onderdeel).
 const next=step.next||'/',mods=step.modules||[];
 if(step.role==='eigenaar'||next.startsWith('http')||allowed(step.role,mods,next.split('?')[0],'GET'))return answer({naar:next});
 return answer({naar:firstPage(step.role,mods)||'/geen-onderdelen'});
}catch(e){return failText(e)}}

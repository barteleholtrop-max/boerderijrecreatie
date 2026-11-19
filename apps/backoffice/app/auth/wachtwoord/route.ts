import {authConfig,normalizeEmail,safeNext,validEmail} from '@/lib/login-core';
import {passwordLogin,AuthFail} from '@/lib/supabase-auth';
import {answer,beginStep,failText,quickLogin,readJson} from '@/lib/login-flow';
export const dynamic='force-dynamic';
// Inloggen met e-mail en wachtwoord (voor wie geen Google-account gebruikt). Supabase controleert het wachtwoord; de
// backoffice bewaart geen wachtwoorden. Daarna altijd de Authenticator-code.
const WRONG='E-mailadres of wachtwoord klopt niet, of dit adres heeft geen toegang.';
export async function POST(req:Request){try{
 const b=await readJson(req),email=normalizeEmail(b.email),password=b.password;
 if(!validEmail(email)||typeof password!=='string'||!password||password.length>128)return answer({error:WRONG},400);
 const t=await passwordLogin(authConfig()!,email,password).catch(e=>{if(e instanceof AuthFail&&e.code==='onjuist')return null;throw e});
 if(!t)return answer({error:WRONG},400);
 const step=await beginStep(req,t,safeNext(b.terug),b.onthouden===true);if(!step)return answer({error:WRONG},400);
 // Zonder code binnen als dit account dat mag (Toegang); anders de code (wens eigenaar 13 november 2026).
 return answer({naar:await quickLogin(req,t,step)||'/inloggen/code'});
}catch(e){
 if(e instanceof AuthFail&&e.code==='onbevestigd')return answer({error:'Bevestig eerst je e-mailadres met de link in de mail die je kreeg toen je je account aanmaakte.'},400);
 return failText(e);
}}

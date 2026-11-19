// Gedeelde stappen van de inlogroutes (app/auth/*). Server only.
// Volgorde (besluit eigenaar 6 november 2026): eerst Google of e-mail en wachtwoord, dan ALTIJD de Authenticator-code.
// Pas na de code komt er een sessie. Wie niet (actief) op de toegangslijst staat, komt niet verder dan de eerste stap.
import {cookies} from 'next/headers';
import {isSameOrigin} from './portable/origin';
import {requestOrigin} from './member-origin';
import {activeAccount} from './access-store';
import {authConfig,cookieDomain,cookieSecure,normalizeEmail,readStep,sealStep,sessionSecret,shortName,STEP_COOKIE,STEP_MINUTES,SESSION_COOKIE,REVERIFY_COOKIE,sealReverify,readReverify,type Step,type Reverify} from './login-core';
import {AuthFail,type Tokens} from './supabase-auth';

// Het adres waarop je inlogt (backoffice, management of het Google-adres): daar horen de cookies bij (lib/member-origin.ts).
export const appOrigin=(req:Request)=>requestOrigin(req);
export const noStore={'Cache-Control':'private, no-store'};
export const answer=(v:unknown,status=200)=>Response.json(v,{status,headers:noStore});

/** Zelfde herkomst en JSON, klein. Gooit een Response bij een ongeldige aanvraag. */
export async function readJson(req:Request,max=4000):Promise<Record<string,unknown>>{
 if(!isSameOrigin(req))throw answer({error:'Ongeldige herkomst.'},403);
 if(!authConfig())throw answer({error:'Inloggen is nog niet ingesteld op deze server.'},503);
 const raw=await req.text();if(raw.length>max)throw answer({error:'Ongeldige aanvraag.'},400);
 try{const b=JSON.parse(raw);if(b&&typeof b==='object'&&!Array.isArray(b))return b}catch{}
 throw answer({error:'Ongeldige aanvraag.'},400);
}

const cookieBase=(req:Request)=>({httpOnly:true,secure:cookieSecure(process.env,appOrigin(req)),sameSite:'lax' as const,path:'/'});

/**
 * Na Google of wachtwoord: staat dit (bevestigde) adres actief op de lijst? Dan de versleutelde tussenstap zetten.
 * Geeft null als deze persoon geen toegang heeft.
 */
export async function beginStep(req:Request,t:Tokens,next:string,remember=false){
 const email=normalizeEmail(t.user.email);
 if(!email||!t.user.email_confirmed_at)return null;
 const account=await activeAccount(email);if(!account)return null;
 const step:Step={email,name:account.name||shortName(email),role:account.role,modules:account.modules,authId:t.user.id,token:t.access_token,next,exp:Date.now()+STEP_MINUTES*60000,...(remember?{remember:true}:{})};
 await writeStep(req,step);
 return {...step,quick:account.quick};
}
/**
 * Binnenkomen zonder code (wens eigenaar 13 november 2026: „de authentificatie om in de backoffice te komen is zeer vertragend”;
 * instelling per account bij Toegang). Alleen als dit account dat mag én al een gekoppelde Authenticator heeft: dan meteen een
 * sessie met quick, en het bewijs om later de code te vragen (/auth/opnieuw). Elke gevoelige handeling vraagt nog steeds eerst de
 * code (lib/gevoelig.ts codeAt). Geeft de pagina om naartoe te gaan, of null: dan gewoon de code invullen (/inloggen/code).
 */
export async function quickLogin(req:Request,t:Tokens,step:Step&{quick?:boolean}):Promise<string|null>{
 if(!step.quick||!t.refresh_token)return null;
 const cfg=authConfig();if(!cfg)return null;
 const {getUser,verifiedTotp}=await import('./supabase-auth'),user=await getUser(cfg,t.access_token).catch(()=>null);
 const factor=user&&user.id===step.authId?verifiedTotp(user):null;if(!factor)return null;
 const {signSession,sessionLength}=await import('./login-core'),{noteLogin}=await import('./access-store'),{allowed,firstPage}=await import('./onderdelen');
 const now=Date.now(),len=sessionLength(step.remember),exp=now+len;
 await setSession(req,signSession({email:step.email,name:step.name,role:step.role,modules:step.role==='eigenaar'?undefined:step.modules||[],exp,mfa:now,quick:true,...(step.remember?{lang:true as const}:{})},sessionSecret()),len/1000);
 await writeReverify(req,{email:step.email,authId:step.authId,factor,refresh:t.refresh_token,exp},len/1000);
 await endStep();await noteLogin(step.email,step.authId);
 const next=step.next||'/',mods=step.modules||[];
 return step.role==='eigenaar'||next.startsWith('http')||allowed(step.role,mods,next.split('?')[0],'GET')?next:firstPage(step.role,mods)||'/geen-onderdelen';
}
export async function writeStep(req:Request,step:Step){
 (await cookies()).set(STEP_COOKIE,sealStep(step,sessionSecret()),{...cookieBase(req),maxAge:STEP_MINUTES*60});
}
export async function currentStep(){return readStep((await cookies()).get(STEP_COOKIE)?.value,sessionSecret())}
export async function endStep(){(await cookies()).delete({name:STEP_COOKIE,path:'/'})}

export async function setSession(req:Request,value:string,maxAge:number){
 (await cookies()).set(SESSION_COOKIE,value,{...cookieBase(req),maxAge,domain:cookieDomain()});
}
export async function writeReverify(req:Request,r:Reverify,maxAge:number){
 (await cookies()).set(REVERIFY_COOKIE,sealReverify(r,sessionSecret()),{...cookieBase(req),path:'/auth',maxAge});
}
export async function currentReverify(){return readReverify((await cookies()).get(REVERIFY_COOKIE)?.value,sessionSecret())}
export async function clearSession(){
 const jar=await cookies(),domain=cookieDomain();
 jar.delete({name:SESSION_COOKIE,path:'/',...(domain?{domain}:{})});
 if(domain)jar.delete({name:SESSION_COOKIE,path:'/'});
 jar.delete({name:STEP_COOKIE,path:'/'});
 jar.delete({name:REVERIFY_COOKIE,path:'/auth'});
}

/** Vriendelijke tekst bij een fout van Supabase; nooit details over wie er wel of niet op de lijst staat. */
export function failText(e:unknown){
 if(e instanceof Response)return e;
 const code=e instanceof AuthFail?e.code:'';
 if(code==='niet-ingesteld')return answer({error:'Inloggen is nog niet ingesteld op deze server.'},503);
 if(code==='over_email_send_rate_limit'||code==='over_request_rate_limit'||(e instanceof AuthFail&&e.status===429))return answer({error:'Even te veel pogingen. Probeer het over een paar minuten opnieuw.'},429);
 console.error('[inloggen]',e instanceof Error?e.message:e);
 return answer({error:'Inloggen lukt nu even niet. Probeer het over een paar minuten opnieuw.'},502);
}

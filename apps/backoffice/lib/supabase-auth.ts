// Gesprekken met Supabase Auth (server only). Supabase controleert wie iemand is: Google, e-mail en wachtwoord, en de
// Authenticator-code (TOTP). Alleen de adressen van Supabase Auth zelf; geen pakket nodig. Zie lib/login-core.ts.
import {authConfig} from './login-core';

export type AuthConfig=NonNullable<ReturnType<typeof authConfig>>;
export type AuthUser={id:string;email?:string;email_confirmed_at?:string|null;factors?:{id:string;factor_type:string;status:string}[]};
export type Tokens={access_token:string;refresh_token?:string;user:AuthUser};
export class AuthFail extends Error{code:string;status:number;constructor(code:string,status=0,message=code){super(message);this.code=code;this.status=status}}

async function call(cfg:AuthConfig,path:string,init:{method?:string;body?:unknown;token?:string;service?:boolean}={}){
 const key=init.service?cfg.serviceKey:cfg.key;
 if(!key)throw new AuthFail('niet-ingesteld');
 let r:Response;
 try{
  r=await fetch(cfg.url+'/auth/v1'+path,{method:init.method||(init.body===undefined?'GET':'POST'),redirect:'error',signal:AbortSignal.timeout(15000),
   headers:{apikey:key,Authorization:'Bearer '+(init.token||key),...(init.body!==undefined?{'Content-Type':'application/json'}:{})},
   body:init.body===undefined?undefined:JSON.stringify(init.body)});
 }catch{throw new AuthFail('storing')}
 const text=await r.text();let data:Record<string,unknown>={};try{data=text?JSON.parse(text):{}}catch{}
 if(!r.ok){
  const code=String(data.error_code||data.code||data.error||'');
  throw new AuthFail(code||'fout',r.status,String(data.msg||data.message||data.error_description||code||r.status));
 }
 return data;
}
const tokens=(d:Record<string,unknown>):Tokens=>{
 const t=d as unknown as Tokens;if(typeof t.access_token!=='string'||!t.user||typeof t.user.id!=='string')throw new AuthFail('fout');return t;
};

/** Google: de code van Supabase (met de PKCE-verifier) inwisselen. */
export async function exchangeCode(cfg:AuthConfig,code:string,verifier:string){return tokens(await call(cfg,'/token?grant_type=pkce',{body:{auth_code:code,code_verifier:verifier}}))}
/** E-mail en wachtwoord. Fout: 'onjuist' (verkeerd of onbekend), 'onbevestigd' (adres nog niet bevestigd) of 'storing'. */
export async function passwordLogin(cfg:AuthConfig,email:string,password:string){
 try{return tokens(await call(cfg,'/token?grant_type=password',{body:{email,password}}))}
 catch(e){
  if(e instanceof AuthFail&&e.code==='email_not_confirmed')throw new AuthFail('onbevestigd');
  if(e instanceof AuthFail&&(e.status===400||e.status===401||e.status===422))throw new AuthFail('onjuist');
  throw e instanceof AuthFail&&e.code==='niet-ingesteld'?e:new AuthFail('storing');
 }
}
/** Eigen account aanmaken (zonder Google). Supabase stuurt een mail om het adres te bevestigen. */
export async function signUp(cfg:AuthConfig,email:string,password:string,redirectTo:string){
 await call(cfg,'/signup?redirect_to='+encodeURIComponent(redirectTo),{body:{email,password}});
}
/** Wachtwoord vergeten: Supabase stuurt een mail met een link naar redirectTo. */
export async function recover(cfg:AuthConfig,email:string,redirectTo:string){
 await call(cfg,'/recover?redirect_to='+encodeURIComponent(redirectTo),{body:{email}});
}
/** Nieuw toegangsbewijs met het (eenmalige) vernieuwingsbewijs; Supabase geeft ook een nieuw vernieuwingsbewijs. */
export async function refreshTokens(cfg:AuthConfig,refresh:string){return tokens(await call(cfg,'/token?grant_type=refresh_token',{body:{refresh_token:refresh}}))}
export async function getUser(cfg:AuthConfig,token:string){const u=await call(cfg,'/user',{token}) as unknown as AuthUser;if(typeof u.id!=='string')throw new AuthFail('fout');return u}
export async function updatePassword(cfg:AuthConfig,token:string,password:string){await call(cfg,'/user',{method:'PUT',token,body:{password}})}

/** Authenticator: de gekoppelde (geverifieerde) app, als die er is. */
export const verifiedTotp=(u:AuthUser)=>(u.factors||[]).find(f=>f.factor_type==='totp'&&f.status==='verified')?.id||'';
/** Een nieuwe Authenticator koppelen: eerst half-gekoppelde pogingen opruimen, dan een QR-code laten maken. */
export async function enrollTotp(cfg:AuthConfig,token:string,user:AuthUser){
 for(const f of user.factors||[])if(f.factor_type==='totp'&&f.status!=='verified')await call(cfg,'/factors/'+encodeURIComponent(f.id),{method:'DELETE',token}).catch(()=>{});
 const d=await call(cfg,'/factors',{token,body:{factor_type:'totp',issuer:'Boer Bart',friendly_name:'Authenticator '+new Date().toISOString().slice(0,16)}}) as {id?:string;totp?:{qr_code?:string;secret?:string;uri?:string}};
 if(typeof d.id!=='string'||typeof d.totp?.qr_code!=='string'||typeof d.totp?.secret!=='string')throw new AuthFail('fout');
 return {factor:d.id,qr:await qrImage(d.totp.uri,d.totp.qr_code),secret:d.totp.secret};
}
/** QR-code voor de Authenticator-app (6 november 2026: de QR van Supabase werkte niet bij het scannen). We maken hem zelf uit het
 *  otpauth-adres als een PNG (base64), dat elke browser goed toont; lukt dat niet, dan het plaatje van Supabase. */
export async function qrImage(uri:string|undefined,fallback:string){
 if(typeof uri!=='string'||!uri.startsWith('otpauth://totp/')||uri.length>1000)return fallback;
 try{const QRCode=(await import('qrcode')).default;return await QRCode.toDataURL(uri,{errorCorrectionLevel:'M',margin:2,width:240,color:{dark:'#000000',light:'#ffffff'}})}catch{return fallback}
}
/** De code uit de app controleren. Geeft een nieuw toegangsbewijs (niveau aal2) terug, of gooit 'code-onjuist'. */
export async function verifyTotp(cfg:AuthConfig,token:string,factor:string,code:string){
 const f='/factors/'+encodeURIComponent(factor);
 const c=await call(cfg,f+'/challenge',{token,body:{}}) as {id?:string};
 if(typeof c.id!=='string')throw new AuthFail('fout');
 try{return tokens(await call(cfg,f+'/verify',{token,body:{challenge_id:c.id,code}}))}
 catch(e){if(e instanceof AuthFail&&e.status>=400&&e.status<500&&e.status!==429)throw new AuthFail('code-onjuist');throw e}
}
/**
 * Telefoon kwijt (besluit eigenaar 6 november 2026): een andere eigenaar haalt de Authenticator van iemand weg. Bij de
 * volgende keer inloggen koppelt die persoon een nieuwe. Vereist SUPABASE_SERVICE_ROLE_KEY (alleen op de server).
 */
export async function adminRemoveTotp(cfg:AuthConfig,authId:string){
 if(!cfg.serviceKey)throw new AuthFail('niet-ingesteld');
 const u=await call(cfg,'/admin/users/'+encodeURIComponent(authId),{service:true}) as unknown as AuthUser;
 let removed=0;
 for(const f of u.factors||[])if(f.factor_type==='totp'){await call(cfg,'/admin/users/'+encodeURIComponent(authId)+'/factors/'+encodeURIComponent(f.id),{method:'DELETE',service:true});removed++}
 return removed;
}

// ---- Ledenlogin zonder bevestigingsmail (wens eigenaar 12 november 2026) ------------------------------------------------
// De eigenaar koppelt een e-mailadres aan de ledenkaart; het lid kiest via zijn persoonlijke link zelf een wachtwoord. De
// backoffice maakt dat account met de beheersleutel aan (al bevestigd), zodat er geen mail nodig is. Zie lib/member-account.ts.
export type AdminUser=AuthUser&{app_metadata?:Record<string,unknown>};
/** Het Supabase-account met precies dit e-mailadres, of null. */
export async function adminFindUser(cfg:AuthConfig,email:string):Promise<AdminUser|null>{
 if(!cfg.serviceKey)throw new AuthFail('niet-ingesteld');
 const d=await call(cfg,'/admin/users?per_page=50&filter='+encodeURIComponent(email),{service:true}) as {users?:AdminUser[]};
 return (d.users||[]).find(u=>(u.email||'').toLowerCase()===email.toLowerCase())||null;
}
/** Alle accounts (voor „iedereen uitnodigen”, 13 november 2026): per pagina van 1000, hooguit 20 pagina's. */
export async function adminListUsers(cfg:AuthConfig):Promise<AdminUser[]>{
 if(!cfg.serviceKey)throw new AuthFail('niet-ingesteld');
 const all:AdminUser[]=[];
 for(let page=1;page<=20;page++){const d=await call(cfg,`/admin/users?page=${page}&per_page=1000`,{service:true}) as {users?:AdminUser[]};const users=d.users||[];all.push(...users);if(users.length<1000)break}
 return all;
}
export async function adminCreateUser(cfg:AuthConfig,email:string,password:string,appMetadata:Record<string,unknown>){
 if(!cfg.serviceKey)throw new AuthFail('niet-ingesteld');
 const u=await call(cfg,'/admin/users',{service:true,body:{email,password,email_confirm:true,app_metadata:appMetadata}}) as unknown as AdminUser;
 if(typeof u.id!=='string')throw new AuthFail('fout');return u;
}
export async function adminUpdateUser(cfg:AuthConfig,id:string,change:{password?:string;email_confirm?:boolean;app_metadata?:Record<string,unknown>}){
 if(!cfg.serviceKey)throw new AuthFail('niet-ingesteld');
 const u=await call(cfg,'/admin/users/'+encodeURIComponent(id),{method:'PUT',service:true,body:change}) as unknown as AdminUser;
 if(typeof u.id!=='string')throw new AuthFail('fout');return u;
}

// Inloggen via Supabase (besluiten eigenaar 4 en 6 november 2026; docs/INLOGGEN-BIJ-LIVEGANG.md). Pure regels, zonder
// database of netwerk: sessie en tussenstap (gedeeld met het planbord in tools/auth/sessie.mjs), PKCE, adressen en rollen.
// Supabase controleert wie iemand is (Google, of e-mail en wachtwoord, en de Authenticator-code); de backoffice
// bepaalt met zijn eigen toegangslijst wat die persoon mag.
import {createHash,randomBytes} from 'node:crypto';
import * as S from '../../../tools/auth/sessie.mjs';

export const SESSION_COOKIE=S.SESSION_COOKIE,STEP_COOKIE=S.STEP_COOKIE,VERIFIER_COOKIE='bb_inlog',REVERIFY_COOKIE='bb_herbevestig';
export const SESSION_HOURS=S.SESSION_HOURS,STEP_MINUTES=S.STEP_MINUTES,REMEMBER_DAYS=S.REMEMBER_DAYS;
/** Hoe lang een backoffice-sessie geldt: 30 dagen met „Onthoud deze telefoon”, anders 8 uur (in ms). */
export const sessionLength=(remember?:boolean)=>remember?REMEMBER_DAYS*86400000:SESSION_HOURS*3600000;
export const ROLES=['eigenaar','medewerker'] as const;
export type Role=typeof ROLES[number];
// quick (wens eigenaar 13 november 2026): binnengekomen zonder Authenticator-code (instelling per account bij Toegang). Een
// gevoelige handeling vraagt dan altijd eerst de code; daarna is quick weg (app/auth/opnieuw).
export type Session={email:string;name:string;role:Role;exp:number;mfa:number;mfaUsed?:number;quick?:true;lang?:true;modules?:string[]};
/** De tussenstap na het eerste inloggen, vóór de Authenticator-code. */
export type Step={email:string;name:string;role:Role;modules:string[];authId:string;token:string;refresh?:string;factor?:string;next:string;exp:number;remember?:boolean};

export const normalizeEmail=(v:unknown)=>typeof v==='string'?v.trim().toLowerCase():'';
export const validEmail=(v:unknown):v is string=>S.validEmail(v);
export const validRole=(v:unknown):v is Role=>S.validRole(v);
/** Korte naam voor „wie deed dit” (zoals voorheen de loginnaam): het deel vóór de @. */
export const shortName=(email:string)=>email.split('@')[0].replace(/[^a-z0-9._-]/g,'').slice(0,40)||'gebruiker';

export const sessionSecret=(env:Record<string,string|undefined>=process.env)=>S.sessionSecret(env);
export const cookieSecure=(env:Record<string,string|undefined>=process.env,origin='')=>S.cookieSecure(env,origin);
export const cookieDomain=(env:Record<string,string|undefined>=process.env)=>S.cookieDomain(env);
export const signSession=(s:Session,secret:string)=>S.signSession(s,secret);
export const readSession=(token:string|undefined|null,secret:string,now=Date.now()):Session|null=>S.readSession(token,secret,now) as Session|null;
export const sealStep=(s:Step,secret:string)=>S.seal(s,secret);
export function readStep(token:string|undefined|null,secret:string,now=Date.now()):Step|null{
 const s=S.unseal(token,secret,now) as Step|null;
 return s&&validEmail(s.email)&&validRole(s.role)&&typeof s.token==='string'&&typeof s.authId==='string'&&typeof s.next==='string'?s:null;
}

/** PKCE (zoals Supabase het verwacht): een geheime verifier in een cookie, de afgeleide challenge naar Supabase. */
export function pkce(){const verifier=randomBytes(32).toString('base64url');return {verifier,challenge:createHash('sha256').update(verifier).digest('base64url')}}
export function authorizeUrl(supabaseUrl:string,redirectTo:string,challenge:string){
 const u=new URL(supabaseUrl.replace(/\/+$/,'')+'/auth/v1/authorize');
 u.searchParams.set('provider','google');u.searchParams.set('redirect_to',redirectTo);
 u.searchParams.set('code_challenge',challenge);u.searchParams.set('code_challenge_method','s256');
 return u.toString();
}
/**
 * Alleen terug naar een eigen pagina van de backoffice (geen open doorverwijzing), of naar een pagina van het planbord
 * op precies het ingestelde PLANBORD_ORIGIN (één login voor beide).
 */
export function safeNext(v:unknown,env:Record<string,string|undefined>=process.env){
 if(typeof v!=='string')return '/';
 if(/^\/[A-Za-z0-9/_?=&%.-]*$/.test(v)&&!v.startsWith('//')&&!v.startsWith('/auth/')&&!v.startsWith('/inloggen'))return v;
 const board=planbordOrigin(env);
 if(board&&v.length<=500){try{const u=new URL(v);if(u.origin===board&&!u.username&&!u.password)return u.toString()}catch{}}
 return '/';
}
export function planbordOrigin(env:Record<string,string|undefined>=process.env){
 try{const u=new URL(env.PLANBORD_ORIGIN||'');return /^https?:$/.test(u.protocol)?u.origin:''}catch{return ''}
}
/** Instellingen voor inloggen via Supabase; null = niet ingesteld (met de login aan is de backoffice dan dicht). */
export function authConfig(env:Record<string,string|undefined>=process.env){
 const url=(env.SUPABASE_URL||'').replace(/\/+$/,''),key=env.SUPABASE_ANON_KEY||'';
 if(!url||!key)return null;
 return {url,key,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY||''};
}
/** Wachtwoordregel voor een eigen account (geen Google): minstens 10 tekens (backoffice), niet alleen cijfers of één teken. */
export function passwordProblem(p:unknown,min=10){
 if(typeof p!=='string'||p.length<min)return `Kies een wachtwoord van minstens ${min} tekens.`;
 if(p.length>128)return 'Kies een wachtwoord van hoogstens 128 tekens.';
 if(/^\d+$/.test(p)||new Set(p).size<4)return 'Kies een minder voorspelbaar wachtwoord.';
 return '';
}
// Leden (wens eigenaar 13 november 2026: „minimaal 10 tekens is vervelend, verlaag naar 6”). De backoffice houdt 10 tekens plus de
// Authenticator-code; leden zien alleen hun eigen gegevens en hebben de persoonlijke link nodig.
export const MEMBER_PASSWORD_MIN=6;
export const validCode=(v:unknown):v is string=>typeof v==='string'&&/^\d{6}$/.test(v);

/** Pogingen voor de Authenticator-code per account: na 5 fouten 10 minuten wachten (naast de limiet van Supabase zelf). */
const tries=new Map<string,{n:number;until:number}>();
export function codeAttempt(email:string,ok:boolean|null,now=Date.now()){
 const t=tries.get(email);
 if(t&&t.until>now&&t.n>=5)return false;
 if(ok===true){tries.delete(email);return true}
 if(ok===false){const cur=t&&t.until>now?t:{n:0,until:now+600000};cur.n++;tries.set(email,cur)}
 if(tries.size>5000)for(const [k,v] of tries)if(v.until<=now)tries.delete(k);
 return true;
}
/** Om later opnieuw de code te kunnen vragen (gevoelige handelingen): versleuteld, alleen voor /auth, net zo lang als de sessie. */
export type Reverify={email:string;authId:string;factor:string;refresh:string;exp:number};
export const sealReverify=(r:Reverify,secret:string)=>S.seal(r,secret);
export function readReverify(token:string|undefined|null,secret:string,now=Date.now()):Reverify|null{
 const r=S.unseal(token,secret,now) as Reverify|null;
 return r&&validEmail(r.email)&&typeof r.authId==='string'&&typeof r.factor==='string'&&typeof r.refresh==='string'?r:null;
}

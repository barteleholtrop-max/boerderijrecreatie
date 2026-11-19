// Koppeling met het Google Bedrijfsprofiel (besluit eigenaar 4 november 2026, stap 2). Server only.
// - Koppelen met het Google-account dat het profiel beheert (bedrijfsprofiel@example.nl), alleen het recht „business.manage”.
//   Hetzelfde terugkeeradres als Gmail; de koppelpoging onthoudt het doel ('google-profiel').
// - Openingstijden en afwijkende dagen uit Planning gaan naar het profiel, alleen als ze veranderd zijn (hash).
// - Evenementen uit Planning komen als bericht (EVENT) op het profiel; bijgewerkt of weggehaald als het evenement verandert.
// - Werkt pas nadat Google de toegang tot de Business Profile API's heeft goedgekeurd; tot die tijd een duidelijke melding.
import {getDb} from '@/db';
import {gbpLink,gbpPosts,mailOauthStates} from '@/db/schema';
import {and,eq,lt,lte} from 'drizzle-orm';
import {seal,unseal} from './sheets';
import {connectionSetting} from './connection-runtime';
import {authorizationUrl,exchangeCode,oauthClient,revoke,forgetToken,googleAccessToken} from './gmail-api';
import {loadGuest} from './guest-store';
import {allowedOrigins} from './public-orders';
import {BUSINESS_SCOPE,hash,hoursPayload,planPosts,googleProblem} from './google-profile-core';

export class ProfileError extends Error{constructor(message:string,public status=400){super(message)}}
const ID='main',now=()=>new Date().toISOString();
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date());
const INFO='https://mybusinessbusinessinformation.googleapis.com/v1/',ACCOUNTS='https://mybusinessaccountmanagement.googleapis.com/v1/',V4='https://mybusiness.googleapis.com/v4/';
const EMAIL_SCOPE='https://www.googleapis.com/auth/userinfo.email';
export const profileAccountHint=()=>(connectionSetting('GOOGLE_PROFILE_ACCOUNT')||'bedrijfsprofiel@example.nl').trim().toLowerCase();
/** Website voor de knop „Meer informatie” bij een evenement: alleen een echt https-adres. */
export function websiteUrl(){const v=(connectionSetting('PUBLIC_WEBSITE_ORIGIN')||process.env.PUBLIC_WEBSITE_ORIGIN||allowedOrigins().find(o=>o.startsWith('https://'))||'').replace(/\/+$/,'');return /^https:\/\//.test(v)?v+'/':''}

async function link(){return (await getDb().select().from(gbpLink).where(eq(gbpLink.id,ID)))[0]||null}
async function save(patch:Partial<typeof gbpLink.$inferInsert>){await getDb().insert(gbpLink).values({id:ID,...patch}).onConflictDoUpdate({target:gbpLink.id,set:patch})}

// ---- Koppelen --------------------------------------------------------------------------------------------------
export async function startProfileOAuth(by:string){
 if(!oauthClient())throw new ProfileError('Google OAuth is nog niet ingesteld. Vul de client-ID en het clientgeheim in bij Systeem & koppelingen → Gmail.',503);
 const db=getDb(),state=crypto.randomUUID();
 await db.delete(mailOauthStates).where(lt(mailOauthStates.expires,Date.now()));
 await db.insert(mailOauthStates).values({state,account:by,expires:Date.now()+10*60000,purpose:'google-profiel'});
 return authorizationUrl(state,profileAccountHint(),[BUSINESS_SCOPE,EMAIL_SCOPE]);
}
export async function finishProfileOAuth(code:string,state:string,by:string){
 const db=getDb();
 const used=await db.delete(mailOauthStates).where(and(eq(mailOauthStates.state,state),eq(mailOauthStates.purpose,'google-profiel'))).returning();
 if(!used[0]||used[0].expires<Date.now())throw new ProfileError('Deze koppelpoging is verlopen of al gebruikt. Begin opnieuw.');
 if(used[0].account!==by)throw new ProfileError('Rond het koppelen af met dezelfde login als waarmee je begon.',403);
 const t=await exchangeCode(code);
 if(!(t.scope||'').split(/\s+/).includes(BUSINESS_SCOPE)){if(t.refresh_token)await revoke(t.refresh_token);throw new ProfileError('Het recht om het bedrijfsprofiel te beheren is niet toegestaan. Koppel opnieuw en sta het toe.')}
 if(!t.refresh_token)throw new ProfileError('Google gaf geen blijvende toegang terug. Verwijder de toegang bij myaccount.google.com → Beveiliging → Apps van derden en koppel opnieuw.');
 const who=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+t.access_token},signal:AbortSignal.timeout(15000)}).then(r=>r.ok?r.json():{}).catch(()=>({})) as {email?:string};
 const old=await link();if(old?.refreshSealed)forgetToken(await unseal(old.refreshSealed).catch(()=>''));
 await save({accountEmail:(who.email||'').toLowerCase(),refreshSealed:await seal(t.refresh_token),connectedBy:by,connectedAt:now(),lastError:null,hoursHash:''});
}
export async function disconnectProfile(){
 const l=await link();if(!l?.refreshSealed)return;
 const token=await unseal(l.refreshSealed).catch(()=>'');if(token){await revoke(token);forgetToken(token)}
 await save({refreshSealed:null,lastError:null,hoursHash:''});
}

// ---- Google aanroepen ------------------------------------------------------------------------------------------
async function call<T>(url:string,init:{method?:string;body?:unknown}={}):Promise<T>{
 const l=await link();if(!l?.refreshSealed)throw new ProfileError('Het Google Bedrijfsprofiel is nog niet gekoppeld.',409);
 const refresh=await unseal(l.refreshSealed);
 for(let attempt=0;attempt<2;attempt++){
  const token=await googleAccessToken(refresh,attempt>0);
  const r=await fetch(url,{method:init.method||'GET',headers:{Authorization:'Bearer '+token,...(init.body!==undefined?{'Content-Type':'application/json'}:{})},body:init.body!==undefined?JSON.stringify(init.body):undefined,signal:AbortSignal.timeout(30000)});
  if(r.status===401&&attempt===0)continue;
  if(!r.ok){const d=await r.json().catch(()=>({})) as {error?:{message?:string}};throw new ProfileError(googleProblem(r.status,d.error?.message),r.status===429?429:r.status>=500?503:409)}
  return (r.status===204?{}:await r.json().catch(()=>({}))) as T;
 }
 throw new ProfileError(googleProblem(401),409);
}
/** De bedrijfsprofielen die dit Google-account beheert, om er één te kiezen. */
export async function profileLocations(){
 const accounts=(await call<{accounts?:{name:string;accountName?:string}[]}>(ACCOUNTS+'accounts')).accounts||[];
 const out:{account:string;location:string;title:string;address:string}[]=[];
 for(const a of accounts.slice(0,10)){
  const r=await call<{locations?:{name:string;title?:string;storefrontAddress?:{addressLines?:string[];locality?:string}}[]}>(INFO+a.name+'/locations?readMask=name,title,storefrontAddress&pageSize=100');
  for(const l of r.locations||[])out.push({account:a.name,location:l.name,title:l.title||'(zonder naam)',address:[...(l.storefrontAddress?.addressLines||[]),l.storefrontAddress?.locality].filter(Boolean).join(', ')});
 }
 return out;
}
const validName=(v:unknown,prefix:string):v is string=>typeof v==='string'&&new RegExp('^'+prefix+'/[0-9]{1,30}$').test(v);
export async function chooseLocation(account:string,location:string,title:string){
 if(!validName(account,'accounts')||!validName(location,'locations'))throw new ProfileError('Ongeldig bedrijfsprofiel.');
 await save({account,location,locationTitle:title.slice(0,200),hoursHash:''});
 await getDb().delete(gbpPosts); // berichten horen bij het vorige profiel
}
export async function profileSettings(syncHours:boolean,syncEvents:boolean){await save({syncHours:syncHours?1:0,syncEvents:syncEvents?1:0})}

export async function profileStatus(){
 const l=await link();
 return {oauthConfigured:!!oauthClient(),connected:!!l?.refreshSealed,accountEmail:l?.accountEmail||'',accountHint:profileAccountHint(),location:l?.location||'',locationTitle:l?.locationTitle||'',
  syncHours:l?l.syncHours===1:true,syncEvents:l?l.syncEvents===1:true,lastSync:l?.lastSync||null,lastError:l?.lastError||null,website:websiteUrl(),
  posts:(await getDb().select({eventId:gbpPosts.eventId}).from(gbpPosts)).length};
}
export async function profileReady(){const l=await link();return !!l?.refreshSealed&&!!l.location&&(l.syncHours===1||l.syncEvents===1)}

// ---- Bijwerken ---------------------------------------------------------------------------------------------------
/** Openingstijden (als veranderd) en evenementberichten naar Google. Herhaalbaar; één tegelijk. */
export async function syncProfile(force=false){
 const l=await link();if(!l?.refreshSealed||!l.location)return {ok:false,skipped:'niet-gekoppeld'};
 const db=getDb(),until=Date.now()+5*60000;
 const got=await db.update(gbpLink).set({lockUntil:until}).where(and(eq(gbpLink.id,ID),lte(gbpLink.lockUntil,Date.now()))).returning({id:gbpLink.id});
 if(!got.length)return {ok:false,skipped:'bezig'};
 const done:string[]=[];
 try{
  const {state}=await loadGuest(),day=today();
  if(l.syncHours===1){
   const body=hoursPayload(state,day),h=hash(body);
   if(force||h!==l.hoursHash){await call(INFO+l.location+'?updateMask=regularHours,specialHours',{method:'PATCH',body});await save({hoursHash:h});done.push('openingstijden bijgewerkt')}
  }
  if(l.syncEvents===1){
   const posted=await db.select().from(gbpPosts);
   const plan=planPosts(state.events,posted.map(p=>({eventId:p.eventId,postName:p.postName,hash:p.hash})),websiteUrl(),day);
   for(const c of plan.create){const r=await call<{name?:string}>(V4+l.account+'/'+l.location+'/localPosts',{method:'POST',body:c.body});if(r.name)await db.insert(gbpPosts).values({eventId:c.eventId,postName:r.name,hash:c.hash,updated:now()}).onConflictDoNothing()}
   for(const u of plan.update){await call(V4+u.postName+'?updateMask=summary,event,callToAction',{method:'PATCH',body:u.body});await db.update(gbpPosts).set({hash:u.hash,updated:now()}).where(eq(gbpPosts.eventId,u.eventId))}
   for(const d of plan.remove){await call(V4+d.postName,{method:'DELETE'}).catch(e=>{if(!(e instanceof ProfileError&&/niet gevonden/.test(e.message)))throw e});await db.delete(gbpPosts).where(eq(gbpPosts.eventId,d.eventId))}
   const n=plan.create.length+plan.update.length+plan.remove.length;if(n)done.push(`${n} evenementbericht${n===1?'':'en'} bijgewerkt`);
  }
  await save({lastSync:now(),lastError:null});
  return {ok:true,done};
 }catch(e){
  const msg=e instanceof ProfileError?e.message:'Bijwerken naar Google mislukt.';
  if(!(e instanceof ProfileError))console.error('[google-profiel]',e instanceof Error?e.message:e);
  await save({lastError:msg});
  return {ok:false,error:msg,done};
 }finally{await db.update(gbpLink).set({lockUntil:0}).where(eq(gbpLink.id,ID))}
}

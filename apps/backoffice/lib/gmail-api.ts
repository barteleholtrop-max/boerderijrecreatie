// Server-side Gmail and Google OAuth client (fetch only, no extra dependency). Tokens never leave the server.
// Base URLs can be pointed at a local test server (GMAIL_API_BASE, GOOGLE_OAUTH_BASE) for automated tests; only
// http://127.0.0.1 or http://localhost is accepted there, so a wrong setting can never send tokens elsewhere.
import {OAUTH_SCOPES,METADATA_HEADERS,type GmailThread,type GmailMessage} from './mail-core';
import {connectionSetting} from './connection-runtime';

export class GmailError extends Error{constructor(message:string,public status=502,public code=''){super(message)}}
/** Google refused the stored access (revoked, password change, expired consent): reconnect needed. */
export class GmailAuthError extends GmailError{constructor(){super('De toegang tot Gmail is verlopen of ingetrokken. Koppel Gmail opnieuw.',409,'toegang-verlopen')}}

const local=(v:string|undefined)=>v&&/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(v.replace(/\/+$/,''))?v.replace(/\/+$/,''):null;
export const gmailBase=()=>local(process.env.GMAIL_API_BASE)??'https://gmail.googleapis.com';
const calendarBase=()=>local(process.env.GOOGLE_CALENDAR_API_BASE)??'https://www.googleapis.com';
const driveBase=()=>local(process.env.GOOGLE_DRIVE_API_BASE)??'https://www.googleapis.com';
const oauthBase=()=>local(process.env.GOOGLE_OAUTH_BASE);
const authUrl=()=>(oauthBase()??'https://accounts.google.com')+'/o/oauth2/v2/auth';
const tokenUrl=()=>(oauthBase()??'https://oauth2.googleapis.com')+'/token';
const revokeUrl=()=>(oauthBase()??'https://oauth2.googleapis.com')+'/revoke';

// OAuth client from the central connection settings (Systeem & koppelingen → Gmail), with the server environment as fallback.
export function oauthClient(){const id=connectionSetting('GUEST_GOOGLE_CLIENT_ID')||'',secret=connectionSetting('GUEST_GOOGLE_CLIENT_SECRET')||'';return id&&secret?{id,secret}:null}
export const redirectUri=()=>new URL('/api/mail/oauth/callback',process.env.APP_ORIGIN||'http://localhost:3001').toString();
// scopes: standaard die van de klantgesprekken; de factuurmailbox vraagt alleen leesrechten (lib/invoice-mail.ts).
export function authorizationUrl(state:string,mailbox:string,scopes:string[]=OAUTH_SCOPES){
 const c=oauthClient();if(!c)throw new GmailError('Google OAuth is nog niet ingesteld. Vul de client-ID en het clientgeheim in bij Systeem & koppelingen → Gmail.',503);
 const q=new URLSearchParams({client_id:c.id,redirect_uri:redirectUri(),response_type:'code',scope:scopes.join(' '),access_type:'offline',prompt:'consent',include_granted_scopes:'true',login_hint:mailbox,state});
 return authUrl()+'?'+q.toString();
}

const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const transient=(s:number)=>s===429||s===500||s===502||s===503||s===504;
/** POST to the token endpoint. invalid_grant means the refresh token is no longer valid. */
async function tokenRequest(body:Record<string,string>){
 const c=oauthClient();if(!c)throw new GmailError('Google OAuth is nog niet ingesteld.',503);
 for(let attempt=0;;attempt++){
  let r:Response;
  try{r=await fetch(tokenUrl(),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...body,client_id:c.id,client_secret:c.secret}),signal:AbortSignal.timeout(20000)})}
  catch{if(attempt<2){await sleep(500*2**attempt);continue}throw new GmailError('Google is tijdelijk niet bereikbaar. Probeer het later opnieuw.',503,'tijdelijk')}
  const data=await r.json().catch(()=>({})) as Record<string,unknown>;
  if(r.ok&&typeof data.access_token==='string')return data as {access_token:string;expires_in?:number;refresh_token?:string;scope?:string};
  if(data.error==='invalid_grant')throw new GmailAuthError();
  if(transient(r.status)&&attempt<2){await sleep(500*2**attempt);continue}
  throw new GmailError('Google weigerde de aanmelding ('+String(data.error||r.status)+').',r.status>=500?503:400);
 }
}
export const exchangeCode=(code:string)=>tokenRequest({grant_type:'authorization_code',code,redirect_uri:redirectUri()});
export async function revoke(token:string){try{await fetch(revokeUrl()+'?token='+encodeURIComponent(token),{method:'POST',signal:AbortSignal.timeout(10000)})}catch{/* best effort */}}

// Access tokens live only in memory, per refresh token, until shortly before they expire.
const cache=new Map<string,{token:string;until:number}>();
async function accessToken(refresh:string,force=false){
 const hit=cache.get(refresh);if(hit&&!force&&hit.until>Date.now())return hit.token;
 const t=await tokenRequest({grant_type:'refresh_token',refresh_token:refresh});
 cache.set(refresh,{token:t.access_token,until:Date.now()+Math.max(60,(t.expires_in||3600)-120)*1000});return t.access_token;
}
export function forgetToken(refresh:string){cache.delete(refresh)}
/** Toegangssleutel voor andere Google-koppelingen met dezelfde OAuth-client (bijvoorbeeld het Google Bedrijfsprofiel). */
export const googleAccessToken=(refresh:string,force=false)=>accessToken(refresh,force);

export type Gmail=ReturnType<typeof gmailClient>;
/** Client for one mailbox. `token` is either a refresh token (normal use) or a fresh access token (right after connecting). */
export function gmailClient(auth:{refresh:string}|{access:string}){
 const base=gmailBase()+'/gmail/v1/users/me';
 async function call<T>(path:string,init:{method?:string;body?:unknown;query?:Record<string,string|string[]|undefined>;headers?:Record<string,string>;root?:string}={},raw=false):Promise<T>{
  const q=new URLSearchParams();for(const [k,v] of Object.entries(init.query||{}))for(const x of Array.isArray(v)?v:v===undefined?[]:[v])q.append(k,x);
  const url=(init.root??base)+path+(q.size?'?'+q.toString():'');let refreshed=false;
  for(let attempt=0;;attempt++){
   const token='access' in auth?auth.access:await accessToken(auth.refresh,refreshed);
   let r:Response;
   try{r=await fetch(url,{method:init.method||'GET',headers:{Authorization:'Bearer '+token,...(init.body!==undefined?{'Content-Type':'application/json'}:{}),...init.headers},body:init.body!==undefined?JSON.stringify(init.body):undefined,signal:AbortSignal.timeout(30000)})}
   catch{if(attempt<2&&(init.method||'GET')==='GET'){await sleep(500*2**attempt);continue}throw new GmailError('Gmail is tijdelijk niet bereikbaar.',503,'tijdelijk')}
   if(r.status===401&&'refresh' in auth&&!refreshed){refreshed=true;continue}
   if(r.status===401)throw new GmailAuthError();
   // Only reads are retried automatically. A write (create/update/send) is never repeated blindly.
   if(transient(r.status)&&attempt<2&&(init.method||'GET')==='GET'){const wait=Number(r.headers.get('retry-after'));await sleep(Number.isFinite(wait)&&wait>0?Math.min(wait,10)*1000:500*2**attempt);continue}
   if(!r.ok){const d=await r.json().catch(()=>({})) as {error?:{message?:string}};throw new GmailError(r.status===404?'Niet gevonden in Gmail.':'Gmail gaf een foutmelding ('+r.status+(d.error?.message?': '+d.error.message:'')+').',r.status===404?404:transient(r.status)?503:r.status===403?403:502,transient(r.status)?'tijdelijk':String(r.status))}
   if(r.status===204)return {} as T;
   return (raw?await r.arrayBuffer():await r.json()) as T;
  }
 }
 return {
  profile:()=>call<{emailAddress:string;historyId:string}>('/profile'),
  labels:()=>call<{labels?:{id:string;name:string;type?:string}[]}>('/labels'),
  threads:(labelId:string,pageToken?:string)=>call<{threads?:{id:string;historyId?:string}[];nextPageToken?:string}>('/threads',{query:{labelIds:labelId,maxResults:'100',pageToken}}),
  thread:(id:string,format:'full'|'metadata'|'minimal'='metadata')=>call<GmailThread>('/threads/'+encodeURIComponent(id),{query:{format,...(format==='metadata'?{metadataHeaders:METADATA_HEADERS}:{})}}),
  history:(startHistoryId:string,pageToken?:string)=>call<{history?:{messages?:{id:string;threadId:string}[];messagesAdded?:{message:{id:string;threadId:string}}[];messagesDeleted?:{message:{id:string;threadId:string}}[];labelsAdded?:{message:{id:string;threadId:string}}[];labelsRemoved?:{message:{id:string;threadId:string}}[]}[];historyId?:string;nextPageToken?:string}>('/history',{query:{startHistoryId,maxResults:'500',pageToken}}),
  drafts:(pageToken?:string)=>call<{drafts?:{id:string;message:{id:string;threadId:string}}[];nextPageToken?:string}>('/drafts',{query:{maxResults:'100',pageToken}}),
  draft:(id:string,format:'full'|'minimal'='full')=>call<{id:string;message:GmailMessage}>('/drafts/'+encodeURIComponent(id),{query:{format}}),
  createDraft:(raw:string,threadId:string)=>call<{id:string;message:{id:string;threadId:string}}>('/drafts',{method:'POST',body:{message:{raw,threadId}}}),
  updateDraft:(id:string,raw:string,threadId:string)=>call<{id:string;message:{id:string;threadId:string}}>('/drafts/'+encodeURIComponent(id),{method:'PUT',body:{id,message:{raw,threadId}}}),
  sendDraft:(id:string)=>call<{id:string;threadId:string;labelIds?:string[]}>('/drafts/send',{method:'POST',body:{id}}),
  calendars:(pageToken?:string)=>call<{items?:{id:string;summary?:string;summaryOverride?:string;accessRole?:string;primary?:boolean}[];nextPageToken?:string}>('/calendar/v3/users/me/calendarList',{root:calendarBase(),query:{maxResults:'250',pageToken,minAccessRole:'writer'}}),
  // Google Agenda (scope calendar.events): only used for concept requests and options, see lib/mail-calendar.ts.
  event:(calendarId:string,id:string)=>call<{id:string;etag:string;status?:string;extendedProperties?:{private?:Record<string,string>}}>('/calendar/v3/calendars/'+encodeURIComponent(calendarId)+'/events/'+encodeURIComponent(id),{root:calendarBase()}),
  putEvent:(calendarId:string,id:string,body:unknown,etag?:string,exists=false)=>call<{id:string}>('/calendar/v3/calendars/'+encodeURIComponent(calendarId)+'/events'+(exists?'/'+encodeURIComponent(id):''),{root:calendarBase(),method:exists?'PUT':'POST',body:exists?body:{...(body as object),id},headers:etag?{'If-Match':etag}:{}}),
  deleteEvent:(calendarId:string,id:string,etag:string)=>call<unknown>('/calendar/v3/calendars/'+encodeURIComponent(calendarId)+'/events/'+encodeURIComponent(id),{root:calendarBase(),method:'DELETE',headers:{'If-Match':etag}}),
  sendMessage:(raw:string)=>call<{id:string;threadId:string}>('/messages/send',{method:'POST',body:{raw}}),
  findMessages:(q:string)=>call<{messages?:{id:string;threadId:string}[]}>('/messages',{query:{q,maxResults:'5'}}),
  // Factuurmail: berichten met een label (nieuwste eerst) en één bericht met de opbouw van zijn bijlagen.
  messages:(labelId:string,q:string,pageToken?:string)=>call<{messages?:{id:string;threadId:string}[];nextPageToken?:string}>('/messages',{query:{labelIds:labelId,q,maxResults:'100',pageToken}}),
  message:(id:string)=>call<GmailMessage>('/messages/'+encodeURIComponent(id),{query:{format:'full'}}),
  attachment:(messageId:string,attachmentId:string)=>call<{data:string;size:number}>('/messages/'+encodeURIComponent(messageId)+'/attachments/'+encodeURIComponent(attachmentId)),
  // Google Drive (scope drive.readonly): de beeldbank-map lezen en foto's downloaden (lib/drive.ts). Nooit schrijven.
  driveFile:(id:string)=>call<{id:string;name:string;mimeType:string;trashed?:boolean}>('/drive/v3/files/'+encodeURIComponent(id),{root:driveBase(),query:{fields:'id,name,mimeType,trashed',supportsAllDrives:'true'}}),
  driveList:(q:string,pageToken?:string)=>call<{files?:{id:string;name:string;mimeType:string;size?:string;modifiedTime?:string}[];nextPageToken?:string}>('/drive/v3/files',{root:driveBase(),query:{q,fields:'nextPageToken,files(id,name,mimeType,size,modifiedTime)',pageSize:'200',pageToken,supportsAllDrives:'true',includeItemsFromAllDrives:'true'}}),
  driveDownload:(id:string)=>call<ArrayBuffer>('/drive/v3/files/'+encodeURIComponent(id),{root:driveBase(),query:{alt:'media',supportsAllDrives:'true'}},true),
 };
}

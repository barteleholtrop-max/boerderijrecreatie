// Klantgesprekken: connection, synchronisation and actions for the Gmail mailbox (server only).
// Gmail is the source for messages, conversations, drafts and send status. The backoffice keeps an index with
// metadata (for a fast list without calling Gmail on every page view), its own status 'afgehandeld', links to
// orders/reservations and a record of every send request (against double sending). Message text is read live.
import {getDb} from '@/db';
import {mailAccounts,mailOauthStates,mailThreads,mailMessages,mailDrafts,mailDraftRequests,mailThreadState,mailThreadLinks,mailSends,orders} from '@/db/schema';
import {connectionSetting} from './connection-runtime';
import {loadGuest,withGuestLock} from './guest-store';
import {and,eq,lte,lt,desc,inArray,notInArray,sql} from 'drizzle-orm';
import {seal,unseal} from './sheets';
import {gmailClient,exchangeCode,authorizationUrl,oauthClient,revoke,forgetToken,GmailError,GmailAuthError,type Gmail} from './gmail-api';
import {CUSTOMER_LABEL_DEFAULT,MAILBOX_DEFAULT,GMAIL_SCOPES,mailRef,summarizeThread,messageContent,simpleTextDraft,replyContext,buildReply,replaceDraftText,sendBlocker,waiting,header,parseAddress,isDraft,isFromUs,isAutomated,gmailThreadUrl,type GmailThread,type ThreadSummary,type LinkKind,removedFromInbox} from './mail-core';
import {isNewGuestMail,mailMessage} from './staff-push-core';

export class MailError extends Error{constructor(message:string,public status=400){super(message)}}
// Mailbox and label come from the central connection settings (Systeem & koppelingen → Gmail), environment as fallback.
export const mailbox=()=>(connectionSetting('GMAIL_MAILBOX')||MAILBOX_DEFAULT).trim().toLowerCase();
export const labelName=()=>(connectionSetting('GMAIL_CUSTOMER_LABEL')||CUSTOMER_LABEL_DEFAULT).trim();
/** Who may use the customer conversations. Without GUEST_ACCESS every backoffice login may (Bartele and Rianne);
 * with GUEST_ACCESS only accounts listed there with a mailbox, and sending only with "send": true. */
export function mailAccess(account:string){
 const raw=process.env.GUEST_ACCESS;if(!raw)return {view:!!account,send:!!account};
 let p:{mailboxes?:unknown;send?:unknown}|undefined;try{p=JSON.parse(raw)[account]}catch{return {view:false,send:false}}
 const view=Array.isArray(p?.mailboxes)&&p!.mailboxes.length>0;return {view,send:view&&p?.send===true};
}
export function requireMailAccess(account:string,send=false){const a=mailAccess(account);if(!a.view)throw new MailError('Je hebt geen toegang tot de klantgesprekken.',403);if(send&&!a.send)throw new MailError('Je hebt geen toestemming om te verzenden. Er is niets verzonden.',403);return a}
/** Sending is off unless MAIL_SEND_ENABLED=1, so test and review environments never send real customer mail. */
export const sendEnabled=()=>process.env.MAIL_SEND_ENABLED==='1';
const now=()=>new Date().toISOString();
const unique=(e:unknown)=>/UNIQUE|PRIMARY KEY|duplicate key/i.test(String((e as Error)?.message)+String((e as {cause?:Error})?.cause?.message||''));
const MAX_THREADS=5000,MAX_DRAFT_PAGES=20,MAX_HISTORY_PAGES=50;

async function account(){return (await getDb().select().from(mailAccounts).where(eq(mailAccounts.mailbox,mailbox())))[0]||null}
/** Gmail client for other server modules (e.g. event confirmations); same checks as for conversations. */
export const mailClient=()=>client();
async function client():Promise<Gmail>{
 const a=await account();if(!a?.refreshToken)throw new MailError('Gmail is nog niet gekoppeld.',409);
 if(a.status==='toegang-verlopen')throw new MailError('De toegang tot Gmail is verlopen. Koppel Gmail opnieuw.',409);
 return gmailClient({refresh:await unseal(a.refreshToken)});
}
async function inIndex(threadId:string){
 const t=(await getDb().select().from(mailThreads).where(and(eq(mailThreads.mailbox,mailbox()),eq(mailThreads.threadId,threadId))))[0];
 // Only conversations with the customer label are reachable here: the backoffice cannot be used to read other mail.
 if(!t||!t.labeled)throw new MailError('Dit gesprek staat niet (meer) onder het label '+labelName()+'.',404);
 return t;
}
/** Remembers that Google refused the access, so the page shows "opnieuw koppelen" instead of failing repeatedly. */
async function noteFailure(e:unknown){
 if(e instanceof GmailAuthError)await getDb().update(mailAccounts).set({status:'toegang-verlopen',lastError:e.message}).where(eq(mailAccounts.mailbox,mailbox()));
}

// ---- Status and connecting ------------------------------------------------------------------------------------
export async function accountStatus(){
 const a=await account();
 const counts=(await getDb().select({n:sql<number>`count(*)`,open:sql<number>`sum(case when last_from_us=0 then 1 else 0 end)`}).from(mailThreads).where(and(eq(mailThreads.mailbox,mailbox()),eq(mailThreads.labeled,1))))[0];
 return {mailbox:mailbox(),label:labelName(),calendarConfigured:!!calendarId(),calendarAllowed:!!a?.scopes.includes('calendar.events'),oauthConfigured:!!oauthClient(),connected:!!a?.refreshToken,status:a?.refreshToken?a.status:'niet-verbonden',
  labelFound:!!a?.labelId,lastSyncOk:a?.lastSyncOk||null,lastSyncAttempt:a?.lastSyncAttempt||null,lastError:a?.lastError||null,connectedBy:a?.connectedBy||'',connectedAt:a?.connectedAt||null,
  syncing:!!a&&a.lockUntil>Date.now(),sendEnabled:sendEnabled(),threads:Number(counts?.n||0)};
}
export const calendarId=()=>(connectionSetting('GOOGLE_CALENDAR_ID')||'').trim();
export async function startOAuth(by:string){
 const db=getDb(),state=crypto.randomUUID();
 await db.delete(mailOauthStates).where(lt(mailOauthStates.expires,Date.now()));
 await db.insert(mailOauthStates).values({state,account:by,expires:Date.now()+10*60000});
 return authorizationUrl(state,mailbox());
}
export async function finishOAuth(code:string,state:string,by:string){
 const db=getDb();
 const used=await db.delete(mailOauthStates).where(eq(mailOauthStates.state,state)).returning();
 if(!used[0]||used[0].expires<Date.now())throw new MailError('Deze koppelpoging is verlopen of al gebruikt. Begin opnieuw.',400);
 if(used[0].account!==by)throw new MailError('Rond het koppelen af met dezelfde login als waarmee je begon.',403);
 const t=await exchangeCode(code);
 const granted=(t.scope||'').split(/\s+/);
 if(!GMAIL_SCOPES.every(s=>granted.includes(s))){if(t.refresh_token)await revoke(t.refresh_token);throw new MailError('Niet alle benodigde Gmail-rechten zijn toegestaan (lezen en concepten/verzenden). Koppel opnieuw en sta beide toe.',400)}
 const g=gmailClient({access:t.access_token});
 const profile=await g.profile();
 if(profile.emailAddress.toLowerCase()!==mailbox()){await revoke(t.refresh_token||t.access_token);throw new MailError(`Je koppelde ${profile.emailAddress}. Koppel de mailbox ${mailbox()}.`,400)}
 if(!t.refresh_token)throw new MailError('Google gaf geen blijvende toegang terug. Verwijder de toegang bij myaccount.google.com → Beveiliging → Apps van derden en koppel opnieuw.',400);
 const label=await findLabel(g);
 const old=await account();
 const values={refreshToken:await seal(t.refresh_token),scopes:granted.join(' '),labelName:labelName(),labelId:label?.id||null,historyId:null,status:'verbonden',lastError:label?null:`Het label ${labelName()} is niet gevonden in ${mailbox()}.`,connectedBy:by,connectedAt:now()};
 if(old?.refreshToken)forgetToken(await unseal(old.refreshToken).catch(()=>''));
 await db.insert(mailAccounts).values({mailbox:mailbox(),...values}).onConflictDoUpdate({target:mailAccounts.mailbox,set:values});
 return {labelFound:!!label};
}
export async function disconnect(){
 const a=await account();if(!a?.refreshToken)return;
 const token=await unseal(a.refreshToken).catch(()=>'');if(token){await revoke(token);forgetToken(token)}
 await getDb().update(mailAccounts).set({refreshToken:null,status:'niet-verbonden',historyId:null,lastError:null}).where(eq(mailAccounts.mailbox,mailbox()));
}
/** Label by name, looked up in the connected account (never a hardcoded label ID). */
async function findLabel(g:Gmail){const name=labelName().toLowerCase();return ((await g.labels()).labels||[]).find(l=>l.name.toLowerCase()===name)||null}

// ---- Synchronisation ------------------------------------------------------------------------------------------
async function acquire(){
 const token=crypto.randomUUID();
 const got=await getDb().update(mailAccounts).set({lockToken:token,lockUntil:Date.now()+15*60000,lastSyncAttempt:now()}).where(and(eq(mailAccounts.mailbox,mailbox()),lte(mailAccounts.lockUntil,Date.now()))).returning({m:mailAccounts.mailbox});
 return got.length?token:null;
}
async function release(token:string){await getDb().update(mailAccounts).set({lockToken:null,lockUntil:0}).where(and(eq(mailAccounts.mailbox,mailbox()),eq(mailAccounts.lockToken,token)))}

async function storeThread(t:GmailThread,labelId:string,notify=false){
 const db=getDb(),m=mailbox(),{summary,messages}=summarizeThread(t,m,labelId);
 // Meldingen voor medewerkers (wens eigenaar 9 november 2026): alleen bij een echt nieuw bericht van een gast, en alleen in de
 // gewone ronde (niet bij de eerste volledige synchronisatie, anders komt er een melding voor elk oud gesprek).
 const prev=notify?(await db.select({lastMessageId:mailThreads.lastMessageId}).from(mailThreads).where(and(eq(mailThreads.mailbox,m),eq(mailThreads.threadId,t.id))))[0]:null;
 const values={...summary,mailbox:m,synced:now()};
 const stmts:any[]=[db.insert(mailThreads).values(values).onConflictDoUpdate({target:[mailThreads.mailbox,mailThreads.threadId],set:values}),
  db.delete(mailMessages).where(and(eq(mailMessages.mailbox,m),eq(mailMessages.threadId,t.id))),
  ...messages.map(x=>db.insert(mailMessages).values({...x,mailbox:m}).onConflictDoUpdate({target:[mailMessages.mailbox,mailMessages.messageId],set:{...x}}))];
 await db.batch(stmts as [any,...any[]]);
 if(notify&&isNewGuestMail(prev,summary)){const {notifyStaff}=await import('./staff-push');await notifyStaff(mailMessage(summary))}
 return summary;
}
async function forgetThread(threadId:string){
 const db=getDb(),m=mailbox();
 await db.batch([db.delete(mailMessages).where(and(eq(mailMessages.mailbox,m),eq(mailMessages.threadId,threadId))),db.delete(mailDrafts).where(and(eq(mailDrafts.mailbox,m),eq(mailDrafts.threadId,threadId))),
  db.update(mailThreads).set({labeled:0,synced:now()}).where(and(eq(mailThreads.mailbox,m),eq(mailThreads.threadId,threadId)))]);
}
/** Re-reads one conversation from Gmail. A conversation that no longer exists in Gmail leaves the overview. */
async function refreshThread(g:Gmail,threadId:string,labelId:string,onlyIfLabeled=false,notify=false){
 try{const t=await g.thread(threadId,'metadata');const s=summarizeThread(t,mailbox(),labelId).summary;if(onlyIfLabeled&&!s.labeled)return null;return await storeThread(t,labelId,notify)}
 catch(e){if(e instanceof GmailError&&e.status===404){await forgetThread(threadId);return null}throw e}
}
async function knownThreadIds(){return new Set((await getDb().select({id:mailThreads.threadId}).from(mailThreads).where(eq(mailThreads.mailbox,mailbox()))).map(r=>r.id))}

async function fullSync(g:Gmail,labelId:string){
 const startHistory=(await g.profile()).historyId,seen=new Set<string>();let page:string|undefined;
 do{const r=await g.threads(labelId,page);for(const t of r.threads||[]){if(seen.size>=MAX_THREADS)break;seen.add(t.id);await refreshThread(g,t.id,labelId)}page=r.nextPageToken}while(page&&seen.size<MAX_THREADS);
 // Conversations whose label was removed elsewhere leave the overview; their backoffice status and links stay.
 const db=getDb(),gone=[...await knownThreadIds()].filter(id=>!seen.has(id));
 if(gone.length)await db.update(mailThreads).set({labeled:0,synced:now()}).where(and(eq(mailThreads.mailbox,mailbox()),inArray(mailThreads.threadId,gone)));
 return startHistory;
}
async function incrementalSync(g:Gmail,labelId:string,start:string){
 const known=await knownThreadIds(),touched=new Set<string>();let page:string|undefined,latest=start,pages=0;
 do{
  const r=await g.history(start,page);latest=r.historyId||latest;
  for(const h of r.history||[]){
   for(const x of h.messagesAdded||[])if(known.has(x.message.threadId)||(x.message as {labelIds?:string[]}).labelIds?.includes(labelId))touched.add(x.message.threadId);
   for(const x of [...(h.labelsAdded||[]),...(h.labelsRemoved||[]),...(h.messagesDeleted||[])])if(known.has(x.message.threadId)||((x as {labelIds?:string[]}).labelIds||[]).includes(labelId))touched.add(x.message.threadId);
   for(const x of h.messages||[])if(known.has(x.threadId))touched.add(x.threadId);
  }
  page=r.nextPageToken;
 }while(page&&++pages<MAX_HISTORY_PAGES);
 for(const id of touched)await refreshThread(g,id,labelId,!known.has(id),true);
 return latest;
}
/** Drafts of the customer conversations, as they are in Gmail now (made in Gmail, by the daily ChatGPT task or here). */
async function syncDrafts(g:Gmail){
 const db=getDb(),m=mailbox(),known=await knownThreadIds(),live:{id:string;messageId:string;threadId:string}[]=[];let page:string|undefined,pages=0;
 do{const r=await g.drafts(page);for(const d of r.drafts||[])if(known.has(d.message.threadId))live.push({id:d.id,messageId:d.message.id,threadId:d.message.threadId});page=r.nextPageToken}while(page&&++pages<MAX_DRAFT_PAGES);
 const ids=live.map(d=>d.id);
 await db.delete(mailDrafts).where(and(eq(mailDrafts.mailbox,m),...(ids.length?[notInArray(mailDrafts.draftId,ids)]:[])));
 for(const d of live)await db.insert(mailDrafts).values({mailbox:m,draftId:d.id,threadId:d.threadId,messageId:d.messageId,seen:now()}).onConflictDoUpdate({target:[mailDrafts.mailbox,mailDrafts.draftId],set:{threadId:d.threadId,messageId:d.messageId,seen:now()}});
}
/** A send whose outcome was unclear (connection lost) is settled from Gmail: draft still there = not sent. */
async function settleUncertainSends(g:Gmail){
 const db=getDb(),rows=await db.select().from(mailSends).where(and(eq(mailSends.mailbox,mailbox()),eq(mailSends.status,'onzeker')));
 for(const r of rows){
  let exists=true;try{await g.draft(r.draftId,'minimal')}catch(e){if(e instanceof GmailError&&e.status===404)exists=false;else throw e}
  if(exists){await db.update(mailSends).set({status:'mislukt',error:'Niet verzonden: het concept staat nog in Gmail.',updated:now()}).where(eq(mailSends.requestId,r.requestId));continue}
  const t=await g.thread(r.threadId,'minimal').catch(()=>null);
  const sent=t?.messages?.find(m=>m.labelIds?.includes('SENT')&&Number(m.internalDate||0)>=Date.parse(r.created)-60000);
  await db.update(mailSends).set(sent?{status:'verzonden',sentMessageId:sent.id,error:null,updated:now()}:{status:'mislukt',error:'Het concept is niet meer in Gmail en er is geen verzonden bericht gevonden. Controleer Gmail.',updated:now()}).where(eq(mailSends.requestId,r.requestId));
 }
}

/** Synchronises the mailbox. First time: all labelled conversations; afterwards only changes since the last run. */
export async function syncMailbox({full=false}:{full?:boolean}={}){
 const a=await account();if(!a?.refreshToken||a.status==='toegang-verlopen')return {ok:false,skipped:'niet-verbonden'};
 const token=await acquire();if(!token)return {ok:false,skipped:'bezig'};
 try{
  const g=gmailClient({refresh:await unseal(a.refreshToken)});
  let labelId=a.labelId;
  if(!labelId||full||!a.historyId){const l=await findLabel(g);if(!l)throw new MailError(`Het label ${labelName()} is niet gevonden in ${mailbox()}. Maak het label aan of controleer de naam (GMAIL_CUSTOMER_LABEL).`,409);labelId=l.id}
  let history:string;
  if(full||!a.historyId)history=await fullSync(g,labelId);
  else{try{history=await incrementalSync(g,labelId,a.historyId)}catch(e){if(e instanceof GmailError&&e.status===404)history=await fullSync(g,labelId);else throw e}} // history too old: start over
  await syncDrafts(g);await settleUncertainSends(g);
  await getDb().update(mailAccounts).set({labelId,historyId:history,lastSyncOk:now(),lastError:null,status:'verbonden'}).where(eq(mailAccounts.mailbox,mailbox()));
  return {ok:true};
 }catch(e){
  await noteFailure(e);
  const msg=e instanceof GmailError||e instanceof MailError?e.message:'Synchroniseren mislukt.';
  await getDb().update(mailAccounts).set({lastError:msg}).where(eq(mailAccounts.mailbox,mailbox()));
  if(!(e instanceof GmailError||e instanceof MailError))console.error('[gmail] synchronisatie:',e instanceof Error?e.message:e);
  return {ok:false,error:msg};
 }finally{await release(token)}
}
export async function isConnected(){const a=await account();return !!a?.refreshToken&&a.status!=='toegang-verlopen'}

// ---- Overview and conversation ----------------------------------------------------------------------------------
export type ThreadFilter='open'|'klant-wacht'|'wij-wachten'|'afgehandeld'|'alles';
export async function listThreads(filter:ThreadFilter='open'){
 const db=getDb(),m=mailbox();
 // Separate queries instead of a join: both tables have mailbox/thread_id columns, which the portable SQLite adapter would merge.
 const threads=await db.select().from(mailThreads).where(and(eq(mailThreads.mailbox,m),eq(mailThreads.labeled,1))).orderBy(desc(mailThreads.lastMessageAt)).limit(1000);
 const states=new Map((await db.select().from(mailThreadState).where(eq(mailThreadState.mailbox,m))).map(x=>[x.threadId,x]));
 const rows=threads.map(t=>({t,s:states.get(t.threadId)||null})).filter(({t,s})=>!removedFromInbox(t,s));
 const drafts=await db.select({threadId:mailDrafts.threadId,n:sql<number>`count(*)`}).from(mailDrafts).where(eq(mailDrafts.mailbox,m)).groupBy(mailDrafts.threadId);
 const links=await db.select({threadId:mailThreadLinks.threadId,n:sql<number>`count(*)`}).from(mailThreadLinks).where(eq(mailThreadLinks.mailbox,m)).groupBy(mailThreadLinks.threadId);
 return rows.map(({t,s})=>({threadId:t.threadId,subject:t.subject,customerEmail:t.customerEmail,customerName:t.customerName,lastMessageAt:t.lastMessageAt,unread:!!t.unread,automated:!!t.automated,
  messageCount:t.messageCount,attachmentCount:t.attachmentCount,drafts:Number(drafts.find(d=>d.threadId===t.threadId)?.n||0),links:Number(links.find(l=>l.threadId===t.threadId)?.n||0),
  snippet:t.snippet,waiting:waiting(t,s),status:s?.status||'open',statusVersion:s?.version||0,assigned:s?.assigned||'',customerId:s?.customerId||'',ref:mailRef(t.threadId)}))
  .filter(t=>filter==='alles'||(filter==='open'?t.waiting!=='afgehandeld':filter==='afgehandeld'?t.waiting==='afgehandeld':t.waiting===filter||(filter==='klant-wacht'&&t.waiting==='opnieuw-open')));
}
const shortDate=(ms?:string)=>{const n=Number(ms);return Number.isFinite(n)&&n>0?new Date(n).toISOString():''};
/** The full conversation, read live from Gmail (reading does not mark anything as read). Also refreshes the index. */
export async function threadDetail(threadId:string){
 const indexed=await inIndex(threadId),g=await client(),a=(await account())!;
 if(!a.labelId)throw new MailError('Synchroniseer eerst: het label is nog niet gevonden.',409);
 let t:GmailThread;try{t=await g.thread(threadId,'full')}catch(e){await noteFailure(e);if(e instanceof GmailError&&e.status===404){await forgetThread(threadId);throw new MailError('Dit gesprek bestaat niet meer in Gmail.',404)}throw e}
 const summary=await storeThread(t,a.labelId);
 await refreshThreadDrafts(g,threadId);
 const db=getDb(),m=mailbox();
 const [draftRows,state,links,sends]=await Promise.all([
  db.select().from(mailDrafts).where(and(eq(mailDrafts.mailbox,m),eq(mailDrafts.threadId,threadId))),
  db.select().from(mailThreadState).where(and(eq(mailThreadState.mailbox,m),eq(mailThreadState.threadId,threadId))),
  db.select().from(mailThreadLinks).where(and(eq(mailThreadLinks.mailbox,m),eq(mailThreadLinks.threadId,threadId))),
  db.select().from(mailSends).where(and(eq(mailSends.mailbox,m),eq(mailSends.threadId,threadId))).orderBy(desc(mailSends.created)).limit(10),
 ]);
 const all=[...(t.messages||[])].sort((x,y)=>Number(x.internalDate||0)-Number(y.internalDate||0));
 const view=(msg:typeof all[number])=>{const h=msg.payload?.headers,c=messageContent(msg);return {id:msg.id,from:header(h,'From'),to:header(h,'To'),cc:header(h,'Cc'),bcc:header(h,'Bcc'),subject:header(h,'Subject'),date:shortDate(msg.internalDate),text:c.text,fromHtml:c.html,attachments:c.attachments.map(x=>({partId:x.partId,filename:x.filename,mimeType:x.mimeType,size:x.size})),fromUs:isFromUs(msg,m),unread:!!msg.labelIds?.includes('UNREAD'),automated:isAutomated(msg)}};
 let reply:{to:string[];cc:string[];subject:string}|null=null;try{const r=replyContext(t,m);reply={to:r.to,cc:r.cc,subject:r.subject}}catch{}
 return {
  thread:{...summary,ref:mailRef(threadId),waiting:waiting(summary,state[0]),status:state[0]?.status||'open',assigned:state[0]?.assigned||'',customerId:state[0]?.customerId||'',statusVersion:state[0]?.version||0,statusBy:state[0]?.updatedBy||'',statusAt:state[0]?.updated||null},
  reservations:(await loadGuest()).state.reservations.filter(r=>r.threadId===mailRef(threadId)).map(r=>({id:r.id,name:r.name,activity:r.activity,date:r.date,from:r.from,to:r.to,people:r.people,status:r.status})),
  messages:all.filter(x=>!isDraft(x)).map(view),
  drafts:all.filter(isDraft).map(x=>{const d=draftRows.find(r=>r.messageId===x.id);return {...view(x),draftId:d?.draftId||null,messageId:x.id,source:d?.source||'gmail',createdBy:d?.createdBy||'',editable:simpleTextDraft(x)}}),
  reply,links,sends:sends.map(s=>({requestId:s.requestId,status:s.status,error:s.error,created:s.created,by:s.by})),
  gmailUrl:gmailThreadUrl(m,threadId),sendEnabled:sendEnabled(),indexedAt:indexed.synced,
 };
}
async function refreshThreadDrafts(g:Gmail,threadId:string){
 const db=getDb(),m=mailbox(),found:{id:string;messageId:string}[]=[];let page:string|undefined,pages=0;
 do{const r=await g.drafts(page);for(const d of r.drafts||[])if(d.message.threadId===threadId)found.push({id:d.id,messageId:d.message.id});page=r.nextPageToken}while(page&&++pages<MAX_DRAFT_PAGES);
 const ids=found.map(d=>d.id);
 await db.delete(mailDrafts).where(and(eq(mailDrafts.mailbox,m),eq(mailDrafts.threadId,threadId),...(ids.length?[notInArray(mailDrafts.draftId,ids)]:[])));
 for(const d of found)await db.insert(mailDrafts).values({mailbox:m,draftId:d.id,threadId,messageId:d.messageId,seen:now()}).onConflictDoUpdate({target:[mailDrafts.mailbox,mailDrafts.draftId],set:{messageId:d.messageId,seen:now()}});
}
/** Streams one attachment. The part is looked up again in the conversation, because Gmail attachment IDs can change. */
export async function attachment(threadId:string,messageId:string,partId:string){
 await inIndex(threadId);const g=await client();
 const t=await g.thread(threadId,'full'),msg=t.messages?.find(x=>x.id===messageId);if(!msg)throw new MailError('Bijlage niet gevonden.',404);
 let part:{filename?:string;mimeType?:string;body?:{attachmentId?:string}}|null=null;
 const walk=(p:any)=>{if(!p)return;if(p.partId===partId)part=p;for(const c of p.parts||[])walk(c)};walk(msg.payload);
 const p=part as {filename?:string;mimeType?:string;body?:{attachmentId?:string}}|null;
 if(!p?.body?.attachmentId)throw new MailError('Bijlage niet gevonden.',404);
 const a=await g.attachment(messageId,p.body.attachmentId);
 return {filename:p.filename||'bijlage',bytes:Buffer.from(a.data.replace(/-/g,'+').replace(/_/g,'/'),'base64')};
}

// ---- Drafts ---------------------------------------------------------------------------------------------------
/** New draft in the same Gmail conversation. Refused when Gmail already holds a draft for it (edit that one instead). */
export async function createDraft(threadId:string,body:string,requestId:string,by:string,baseLastMessageId?:string){
 return withGuestLock('gmail-draft:'+mailbox()+':'+threadId,()=>createDraftLocked(threadId,body,requestId,by,baseLastMessageId));
}
async function createDraftLocked(threadId:string,body:string,requestId:string,by:string,baseLastMessageId?:string){
 await inIndex(threadId);const db=getDb(),m=mailbox();
 try{await db.insert(mailDraftRequests).values({requestId,mailbox:m,threadId,created:now()})}
 catch(e){if(!unique(e))throw e;const r=(await db.select().from(mailDraftRequests).where(eq(mailDraftRequests.requestId,requestId)))[0];if(r?.draftId&&r.threadId===threadId)return {draftId:r.draftId,duplicate:true};throw new MailError('Dit concept wordt al opgeslagen. Ververs het gesprek.',409)}
 try{
  const g=await client(),t=await g.thread(threadId,'full');
  if(baseLastMessageId&&summarizeThread(t,m,'').summary.lastMessageId!==baseLastMessageId)throw new MailError('Er is een nieuw bericht. Ververs en controleer je antwoord; je tekst blijft behouden.',409);
  if(t.messages?.some(isDraft))throw new MailError('Er staat al een concept voor dit gesprek in Gmail. Bewerk of verstuur dat concept; er is geen tweede gemaakt.',409);
  const raw=buildReply({...replyContext(t,m),from:m,body});
  const d=await g.createDraft(raw,threadId);
  await db.update(mailDraftRequests).set({draftId:d.id}).where(eq(mailDraftRequests.requestId,requestId));
  await db.insert(mailDrafts).values({mailbox:m,draftId:d.id,threadId,messageId:d.message.id,source:'backoffice',createdBy:by,seen:now()}).onConflictDoNothing();
  return {draftId:d.id,messageId:d.message.id};
 }catch(e){await db.delete(mailDraftRequests).where(and(eq(mailDraftRequests.requestId,requestId),sql`draft_id IS NULL`));await noteFailure(e);throw e}
}
/** Changes the text of an existing simple text draft, only if nobody changed it in the meantime. */
export async function updateDraft(threadId:string,draftId:string,baseMessageId:string,body:string,by:string,baseLastMessageId?:string){
 await inIndex(threadId);const g=await client(),db=getDb(),m=mailbox();
 if(baseLastMessageId&&summarizeThread(await g.thread(threadId,'metadata'),m,'').summary.lastMessageId!==baseLastMessageId)throw new MailError('Er is een nieuw bericht. Ververs en controleer je antwoord; je tekst blijft behouden.',409);
 let d;try{d=await g.draft(draftId,'full')}catch(e){await noteFailure(e);if(e instanceof GmailError&&e.status===404)throw new MailError('Dit concept bestaat niet meer in Gmail (verzonden of verwijderd). Ververs het gesprek.',409);throw e}
 if(d.message.threadId!==threadId)throw new MailError('Dit concept hoort bij een ander gesprek.',409);
 if(d.message.id!==baseMessageId)throw new MailError('Het concept is intussen elders gewijzigd. De nieuwe versie wordt getoond; je wijziging is niet opgeslagen.',409);
 if(!simpleTextDraft(d.message))throw new MailError('Dit concept bevat opmaak of bijlagen. Bewerk het in Gmail zodat er niets verloren gaat.',409);
 const r=await g.updateDraft(draftId,replaceDraftText(d.message,body),threadId);
 const old=(await db.select().from(mailDrafts).where(and(eq(mailDrafts.mailbox,m),eq(mailDrafts.draftId,draftId))))[0];
 await db.insert(mailDrafts).values({mailbox:m,draftId,threadId,messageId:r.message.id,source:old?.source||'gmail',createdBy:old?.createdBy||by,seen:now()}).onConflictDoUpdate({target:[mailDrafts.mailbox,mailDrafts.draftId],set:{messageId:r.message.id,seen:now()}});
 return {draftId,messageId:r.message.id};
}

// ---- Sending --------------------------------------------------------------------------------------------------
export type SendInput={threadId:string;draftId:string;draftMessageId:string;lastMessageId:string;requestId:string;by:string};
/** Sends a Gmail draft from the mailbox, after an explicit confirmation, at most once. */
export async function sendDraft(i:SendInput){
 if(!sendEnabled())throw new MailError('Verzenden is in deze omgeving uitgeschakeld (MAIL_SEND_ENABLED). Er is niets verzonden.',403);
 await inIndex(i.threadId);const db=getDb(),m=mailbox(),stamp=now();
 const previous=(await db.select().from(mailSends).where(eq(mailSends.requestId,i.requestId)))[0];
 if(previous)return replay(previous,i);
 try{await db.insert(mailSends).values({requestId:i.requestId,mailbox:m,threadId:i.threadId,draftId:i.draftId,draftMessageId:i.draftMessageId,status:'bezig',created:stamp,updated:stamp,by:i.by})}
 catch(e){if(!unique(e))throw e;const again=(await db.select().from(mailSends).where(eq(mailSends.requestId,i.requestId)))[0];if(again)return replay(again,i);
  throw new MailError('Dit concept wordt al verzonden of is al verzonden. Er is geen tweede bericht verstuurd.',409)}
 const finish=(status:string,extra:{error?:string|null;sentMessageId?:string}={})=>db.update(mailSends).set({status,updated:now(),...extra}).where(eq(mailSends.requestId,i.requestId));
 let g!:Gmail;
 try{
  g=await client();
  const t=await g.thread(i.threadId,'metadata');const live=summarizeThread(t,m,'').summary;
  let draft:{id:string;message:{id:string;threadId:string;payload?:unknown}}|null=null;
  try{draft=await g.draft(i.draftId,'full')}catch(e){if(!(e instanceof GmailError&&e.status===404))throw e}
  const blocker=sendBlocker({lastMessageId:live.lastMessageId,draftMessageId:draft?.message.id||null,draftThreadId:draft?.message.threadId||null},{lastMessageId:i.lastMessageId,draftMessageId:i.draftMessageId,threadId:i.threadId});
  if(blocker){await finish('geweigerd',{error:blocker});throw new MailError(blocker,409)}
  const to=header((draft!.message as {payload?:{headers?:{name:string;value:string}[]}}).payload?.headers,'To');
  if(!parseAddress(to).email){await finish('geweigerd',{error:'Het concept heeft geen ontvanger.'});throw new MailError('Het concept heeft geen ontvanger. Vul die in Gmail aan.',409)}
 }catch(e){if(e instanceof MailError)throw e;await finish('mislukt',{error:e instanceof Error?e.message:'Controle vóór verzenden mislukt.'});await noteFailure(e);throw e}
 try{
  const sent=await g.sendDraft(i.draftId);
  await finish('verzonden',{sentMessageId:sent.id,error:null});
  await db.delete(mailDrafts).where(and(eq(mailDrafts.mailbox,m),eq(mailDrafts.draftId,i.draftId)));
  const a=await account();if(a?.labelId)await refreshThread(g,i.threadId,a.labelId).catch(()=>null);
  return {status:'verzonden',messageId:sent.id};
 }catch(e){
  // Gmail answered with a clear refusal: nothing was sent. Otherwise the outcome is unknown and this draft stays blocked until synchronisation settles it.
  const definite=e instanceof GmailError&&e.status>=400&&e.status<500;
  await finish(definite?'mislukt':'onzeker',{error:e instanceof Error?e.message:'Onbekende fout'});await noteFailure(e);
  throw new MailError(definite?'Gmail heeft het bericht niet verzonden: '+(e as Error).message:'Onzeker of het bericht is verzonden (verbinding onderbroken). Controleer Gmail; dit concept wordt niet nogmaals verzonden tot de synchronisatie het heeft vastgesteld.',definite?502:503);
 }
}
function replay(r:typeof mailSends.$inferSelect,i:SendInput){
 if(r.threadId!==i.threadId||r.draftId!==i.draftId)throw new MailError('Deze aanvraag hoort bij een ander bericht.',409);
 if(r.status==='verzonden')return {status:'verzonden',messageId:r.sentMessageId,duplicate:true};
 if(r.status==='bezig')throw new MailError('Dit bericht wordt al verzonden. Wacht even en ververs.',409);
 if(r.status==='onzeker')throw new MailError('Onzeker of dit bericht is verzonden. Controleer Gmail; het wordt niet nogmaals verzonden.',409);
 throw new MailError(r.error||'Deze verzendpoging is niet gelukt. Start een nieuwe poging.',409);
}

// ---- Backoffice status and links ---------------------------------------------------------------------------------
export type ThreadWork={status:'open'|'afgehandeld';assigned:string;customerId:string};
/** Backoffice work on a conversation: status, responsible employee and customer card, protected by a version. */
export async function setWork(threadId:string,work:ThreadWork,version:number,by:string){
 await inIndex(threadId);const db=getDb(),m=mailbox(),stamp=now();
 const old=(await db.select().from(mailThreadState).where(and(eq(mailThreadState.mailbox,m),eq(mailThreadState.threadId,threadId))))[0];
 if((old?.version||0)!==version)throw new MailError('Dit gesprek is intussen door iemand anders bijgewerkt. Ververs het gesprek.',409);
 const values={...work,version:(old?.version||0)+1,updated:stamp,updatedBy:by};
 const ok=old?await db.update(mailThreadState).set(values).where(and(eq(mailThreadState.mailbox,m),eq(mailThreadState.threadId,threadId),eq(mailThreadState.version,version))).returning()
  :await db.insert(mailThreadState).values({mailbox:m,threadId,...values}).onConflictDoNothing().returning();
 if(!ok.length)throw new MailError('Dit gesprek is intussen door iemand anders bijgewerkt. Ververs het gesprek.',409);
 return {...work,version:values.version};
}
/** Verwijderen uit Gesprekken (wens eigenaar 8 november 2026). Alleen de backoffice: het gesprek krijgt de stand
 *  „verwijderd” en verdwijnt uit de lijst; Gmail, het label en koppelingen blijven ongewijzigd. Schrijft de klant daarna
 *  opnieuw, dan staat het gesprek weer open. Beschermd met dezelfde versie als setWork. */
export async function removeThread(threadId:string,version:number,by:string){
 await inIndex(threadId);const db=getDb(),m=mailbox(),stamp=now();
 const old=(await db.select().from(mailThreadState).where(and(eq(mailThreadState.mailbox,m),eq(mailThreadState.threadId,threadId))))[0];
 if((old?.version||0)!==version)throw new MailError('Dit gesprek is intussen door iemand anders bijgewerkt. Ververs het gesprek.',409);
 const values={status:'verwijderd',assigned:old?.assigned||'',customerId:old?.customerId||'',version:(old?.version||0)+1,updated:stamp,updatedBy:by};
 const ok=old?await db.update(mailThreadState).set(values).where(and(eq(mailThreadState.mailbox,m),eq(mailThreadState.threadId,threadId),eq(mailThreadState.version,version))).returning()
  :await db.insert(mailThreadState).values({mailbox:m,threadId,...values}).onConflictDoNothing().returning();
 if(!ok.length)throw new MailError('Dit gesprek is intussen door iemand anders bijgewerkt. Ververs het gesprek.',409);
 return {ok:true};
}
/** The customer conversations as entries for the central customer cards and reservations (never stored there). */
export async function mailConversations(){
 const db=getDb(),m=mailbox();if(!(await account()))return [];
 const threads=await db.select().from(mailThreads).where(and(eq(mailThreads.mailbox,m),eq(mailThreads.labeled,1))).orderBy(desc(mailThreads.lastMessageAt)).limit(1000);
 const states=new Map((await db.select().from(mailThreadState).where(eq(mailThreadState.mailbox,m))).map(x=>[x.threadId,x]));
 return threads.filter(t=>!removedFromInbox(t,states.get(t.threadId))).map(t=>{const st=states.get(t.threadId);return {id:mailRef(t.threadId),mailbox:'gmail',externalId:t.threadId,channel:'gmail' as const,subject:t.subject,sender:t.customerName?`${t.customerName} <${t.customerEmail}>`:t.customerEmail,status:st?.status==='afgehandeld'?'afgehandeld' as const:t.lastFromUs?'wacht op gast' as const:'nieuw' as const,assigned:st?.assigned||'',messages:[],draft:'',draftId:'',draftBase:'',draftVersion:0,editingBy:'',editingUntil:0,summary:t.snippet,transcript:'',customer:'',customerId:st?.customerId||undefined,updated:t.lastMessageAt}});
}
export async function mailThreadExists(ref:string){const id=ref.startsWith('gmail:')?ref.slice(6):'';if(!id)return false;const t=(await getDb().select({l:mailThreads.labeled}).from(mailThreads).where(and(eq(mailThreads.mailbox,mailbox()),eq(mailThreads.threadId,id))))[0];return !!t?.l}
/** Existing orders a conversation can be linked to (reservations are linked in Planning). No records are made from a mail. */
export async function linkable(){
 const recent=await getDb().select({id:orders.id,created:orders.created,reference:orders.reference}).from(orders).orderBy(desc(orders.id)).limit(50);
 return {bestellingen:recent.map(o=>({ref:String(o.id),label:'P'+String(o.id).padStart(5,'0')+' · '+o.reference+' · '+o.created.slice(0,10)}))};
}
export async function addLink(threadId:string,kind:LinkKind,ref:string,by:string){
 await inIndex(threadId);let label='';
 if(kind!=='bestelling')throw new MailError('Onbekende koppeling.');
 const id=Number(ref);const o=Number.isSafeInteger(id)?(await getDb().select().from(orders).where(eq(orders.id,id)))[0]:null;if(!o)throw new MailError('Bestelling niet gevonden.',404);label='P'+String(o.id).padStart(5,'0')+' · '+o.reference;
 await getDb().insert(mailThreadLinks).values({mailbox:mailbox(),threadId,kind,ref,label,created:now(),createdBy:by}).onConflictDoNothing();
}
export async function removeLink(threadId:string,kind:LinkKind,ref:string){await inIndex(threadId);await getDb().delete(mailThreadLinks).where(and(eq(mailThreadLinks.mailbox,mailbox()),eq(mailThreadLinks.threadId,threadId),eq(mailThreadLinks.kind,kind),eq(mailThreadLinks.ref,ref)))}

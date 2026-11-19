// Facturen uit de mail (besluit eigenaar 3 november 2026, in plaats van de SnelStart-koppeling).
// - De factuurmailbox (standaard administratie@boerbart.nl) wordt gekoppeld met ALLEEN leesrechten.
// - Alleen mails met het label „Inkoop” (de mailassistent zet dat label) zijn zichtbaar; andere mail niet.
// - De backoffice bewaart per mail alleen afzender, onderwerp, datum, de kenmerken van de PDF-bijlagen en de
//   verwerkstatus (nieuw, verwerkt, overgeslagen). De PDF wordt bij „Inlezen” live uit Gmail gehaald en in de browser
//   gelezen, net als een geüploade PDF; hij wordt nergens opgeslagen. SnelStart blijft het factuurarchief.
// - Het account staat in dezelfde tabel als de klantgesprekken (mail_accounts, één rij per mailbox); de koppelpoging
//   onthoudt waarvoor ze is (mail_oauth_states.purpose = 'factuurmail').
import {getDb} from '@/db';
import {mailAccounts,mailOauthStates,invoiceMails} from '@/db/schema';
import {and,eq,lte,lt,desc,inArray,sql} from 'drizzle-orm';
import {connectionSetting} from './connection-runtime';
import {seal,unseal} from './sheets';
import {gmailClient,exchangeCode,authorizationUrl,oauthClient,revoke,forgetToken,GmailError,GmailAuthError,type Gmail} from './gmail-api';
import {INVOICE_MAILBOX_DEFAULT,INVOICE_LABEL_DEFAULT,INVOICE_SCOPES,DRIVE_SCOPE,INVOICE_QUERY,MAX_PDF_BYTES,summarizeInvoiceMail,type InvoiceMailStatus,type PdfAttachment} from './invoice-mail-core';

export class InvoiceMailError extends Error{constructor(message:string,public status=400){super(message)}}
export const invoiceMailbox=()=>(connectionSetting('GMAIL_INVOICE_MAILBOX')||INVOICE_MAILBOX_DEFAULT).trim().toLowerCase();
export const invoiceLabel=()=>(connectionSetting('GMAIL_INVOICE_LABEL')||INVOICE_LABEL_DEFAULT).trim();
const now=()=>new Date().toISOString();
const MAX_PAGES=3;

async function account(){return (await getDb().select().from(mailAccounts).where(eq(mailAccounts.mailbox,invoiceMailbox())))[0]||null}
async function client():Promise<Gmail>{
 const a=await account();if(!a?.refreshToken)throw new InvoiceMailError('De factuurmailbox is nog niet gekoppeld.',409);
 if(a.status==='toegang-verlopen')throw new InvoiceMailError('De toegang tot de factuurmailbox is verlopen. Koppel opnieuw.',409);
 return gmailClient({refresh:await unseal(a.refreshToken)});
}
async function noteFailure(e:unknown){if(e instanceof GmailAuthError)await getDb().update(mailAccounts).set({status:'toegang-verlopen',lastError:e.message}).where(eq(mailAccounts.mailbox,invoiceMailbox()))}
/** Voor de Drive-beeldbank (lib/drive.ts): hetzelfde Google-account, alleen als het Drive-leesrecht is gegeven. */
export async function driveAccess(){
 const a=await account();
 return {mailbox:invoiceMailbox(),connected:!!a?.refreshToken&&a.status!=='toegang-verlopen',expired:a?.status==='toegang-verlopen',driveAllowed:!!a?.scopes.split(/\s+/).includes(DRIVE_SCOPE),
  client:async()=>{if(!a?.refreshToken)throw new InvoiceMailError('Het Google-account voor Drive is nog niet gekoppeld.',409);return gmailClient({refresh:await unseal(a.refreshToken)})},
  noteFailure:(e:unknown)=>noteFailure(e)};
}
export async function isInvoiceMailConnected(){const a=await account();return !!a?.refreshToken&&a.status!=='toegang-verlopen'}

// ---- Koppelen --------------------------------------------------------------------------------------------------
// purpose 'drive': hetzelfde account, met daarbij het leesrecht voor Google Drive (beeldbank, lib/drive.ts).
type Purpose='factuurmail'|'drive';
const scopesFor=(p:Purpose)=>p==='drive'?[...INVOICE_SCOPES,DRIVE_SCOPE]:INVOICE_SCOPES;
export async function startInvoiceOAuth(by:string,purpose:Purpose='factuurmail'){
 if(!oauthClient())throw new InvoiceMailError('Google OAuth is nog niet ingesteld. Vul de client-ID en het clientgeheim in bij Systeem & koppelingen → Gmail.',503);
 const db=getDb(),state=crypto.randomUUID();
 await db.delete(mailOauthStates).where(lt(mailOauthStates.expires,Date.now()));
 await db.insert(mailOauthStates).values({state,account:by,expires:Date.now()+10*60000,purpose});
 return authorizationUrl(state,invoiceMailbox(),scopesFor(purpose));
}
/** Waarvoor een koppelpoging is, zonder hem te gebruiken (de callback kiest zo de juiste afhandeling). */
export async function oauthPurpose(state:string){return (await getDb().select({p:mailOauthStates.purpose}).from(mailOauthStates).where(eq(mailOauthStates.state,state)))[0]?.p??null}
export async function finishInvoiceOAuth(code:string,state:string,by:string,purpose:Purpose='factuurmail'){
 const db=getDb();
 const used=await db.delete(mailOauthStates).where(and(eq(mailOauthStates.state,state),eq(mailOauthStates.purpose,purpose))).returning();
 if(!used[0]||used[0].expires<Date.now())throw new InvoiceMailError('Deze koppelpoging is verlopen of al gebruikt. Begin opnieuw.');
 if(used[0].account!==by)throw new InvoiceMailError('Rond het koppelen af met dezelfde login als waarmee je begon.',403);
 const t=await exchangeCode(code);
 const granted=(t.scope||'').split(/\s+/);
 if(!scopesFor(purpose).every(s=>granted.includes(s))){if(t.refresh_token)await revoke(t.refresh_token);throw new InvoiceMailError(purpose==='drive'&&!granted.includes(DRIVE_SCOPE)?'Het leesrecht voor Google Drive is niet toegestaan. Koppel opnieuw en zet het vinkje bij Google Drive aan.':'Het leesrecht voor Gmail is niet toegestaan. Koppel opnieuw en sta het toe.')}
 const g=gmailClient({access:t.access_token});
 const profile=await g.profile();
 if(profile.emailAddress.toLowerCase()!==invoiceMailbox()){await revoke(t.refresh_token||t.access_token);throw new InvoiceMailError(`Je koppelde ${profile.emailAddress}. Koppel de factuurmailbox ${invoiceMailbox()}.`)}
 if(!t.refresh_token)throw new InvoiceMailError('Google gaf geen blijvende toegang terug. Verwijder de toegang bij myaccount.google.com → Beveiliging → Apps van derden en koppel opnieuw.');
 const label=await findLabel(g),old=await account();
 const values={refreshToken:await seal(t.refresh_token),scopes:granted.join(' '),labelName:invoiceLabel(),labelId:label?.id||null,historyId:null,status:'verbonden',lastError:label?null:`Het label ${invoiceLabel()} is niet gevonden in ${invoiceMailbox()}.`,connectedBy:by,connectedAt:now()};
 if(old?.refreshToken)forgetToken(await unseal(old.refreshToken).catch(()=>''));
 await db.insert(mailAccounts).values({mailbox:invoiceMailbox(),...values}).onConflictDoUpdate({target:mailAccounts.mailbox,set:values});
 return {labelFound:!!label};
}
export async function disconnectInvoiceMail(){
 const a=await account();if(!a?.refreshToken)return;
 const token=await unseal(a.refreshToken).catch(()=>'');if(token){await revoke(token);forgetToken(token)}
 await getDb().update(mailAccounts).set({refreshToken:null,status:'niet-verbonden',lastError:null}).where(eq(mailAccounts.mailbox,invoiceMailbox()));
}
async function findLabel(g:Gmail){const name=invoiceLabel().toLowerCase();return ((await g.labels()).labels||[]).find(l=>l.name.toLowerCase()===name)||null}

// ---- Ophalen ---------------------------------------------------------------------------------------------------
async function acquire(){
 const token=crypto.randomUUID();
 const got=await getDb().update(mailAccounts).set({lockToken:token,lockUntil:Date.now()+10*60000,lastSyncAttempt:now()}).where(and(eq(mailAccounts.mailbox,invoiceMailbox()),lte(mailAccounts.lockUntil,Date.now()))).returning({m:mailAccounts.mailbox});
 return got.length?token:null;
}
async function release(token:string){await getDb().update(mailAccounts).set({lockToken:null,lockUntil:0}).where(and(eq(mailAccounts.mailbox,invoiceMailbox()),eq(mailAccounts.lockToken,token)))}

/** Nieuwe mails met het label in de index zetten. Een mail die er al staat, verandert niet (ook niet zijn status). */
export async function syncInvoiceMail(){
 const a=await account();if(!a?.refreshToken||a.status==='toegang-verlopen')return {ok:false,skipped:'niet-verbonden'};
 const token=await acquire();if(!token)return {ok:false,skipped:'bezig'};
 const box=invoiceMailbox(),db=getDb();
 try{
  const g=gmailClient({refresh:await unseal(a.refreshToken)});
  const label=await findLabel(g);
  if(!label)throw new InvoiceMailError(`Het label ${invoiceLabel()} is niet gevonden in ${box}. Maak het label aan of controleer de naam (GMAIL_INVOICE_LABEL).`,409);
  const ids:string[]=[];let page:string|undefined;
  for(let i=0;i<MAX_PAGES;i++){const r=await g.messages(label.id,INVOICE_QUERY,page);ids.push(...(r.messages||[]).map(m=>m.id));page=r.nextPageToken;if(!page)break}
  const known=ids.length?new Set((await db.select({id:invoiceMails.messageId}).from(invoiceMails).where(and(eq(invoiceMails.mailbox,box),inArray(invoiceMails.messageId,ids)))).map(r=>r.id)):new Set<string>();
  let added=0;
  for(const id of ids.filter(id=>!known.has(id))){
   const m=summarizeInvoiceMail(await g.message(id));
   await db.insert(invoiceMails).values({mailbox:box,messageId:m.messageId,threadId:m.threadId,fromEmail:m.fromEmail,fromName:m.fromName,subject:m.subject,received:m.received,attachments:JSON.stringify(m.attachments.map(({partId,filename,size})=>({partId,filename,size}))),status:'nieuw',updated:now()}).onConflictDoNothing();
   added++;
  }
  await db.update(mailAccounts).set({labelId:label.id,lastSyncOk:now(),lastError:null,status:'verbonden'}).where(eq(mailAccounts.mailbox,box));
  return {ok:true,added};
 }catch(e){
  await noteFailure(e);
  const msg=e instanceof GmailError||e instanceof InvoiceMailError?e.message:'Ophalen van factuurmail mislukt.';
  await db.update(mailAccounts).set({lastError:msg}).where(eq(mailAccounts.mailbox,box));
  if(!(e instanceof GmailError||e instanceof InvoiceMailError))console.error('[factuurmail] ophalen:',e instanceof Error?e.message:e);
  return {ok:false,error:msg};
 }finally{await release(token)}
}

// ---- Overzicht en acties ---------------------------------------------------------------------------------------
export type InvoiceMailRow={messageId:string;fromEmail:string;fromName:string;subject:string;received:string;attachments:Omit<PdfAttachment,'attachmentId'>[];status:InvoiceMailStatus;invoiceId:string|null;updated:string;updatedBy:string};
export async function invoiceMailOverview(){
 const a=await account(),box=invoiceMailbox();
 const rows=await getDb().select().from(invoiceMails).where(eq(invoiceMails.mailbox,box)).orderBy(desc(invoiceMails.received)).limit(200);
 return {
  mailbox:box,label:invoiceLabel(),oauthConfigured:!!oauthClient(),connected:!!a?.refreshToken,status:a?.refreshToken?a.status:'niet-verbonden',labelFound:!!a?.labelId,
  lastSyncOk:a?.lastSyncOk||null,lastError:a?.lastError||null,connectedBy:a?.connectedBy||'',syncing:!!a&&a.lockUntil>Date.now(),
  mails:rows.map((r):InvoiceMailRow=>({messageId:r.messageId,fromEmail:r.fromEmail,fromName:r.fromName,subject:r.subject,received:r.received,attachments:JSON.parse(r.attachments),status:r.status as InvoiceMailStatus,invoiceId:r.invoiceId,updated:r.updated,updatedBy:r.updatedBy})),
 };
}
async function inIndex(messageId:string){
 const r=(await getDb().select().from(invoiceMails).where(and(eq(invoiceMails.mailbox,invoiceMailbox()),eq(invoiceMails.messageId,messageId))))[0];
 // Alleen mails die met het label binnenkwamen zijn bereikbaar: via de backoffice is andere mail niet op te vragen.
 if(!r)throw new InvoiceMailError('Deze mail staat niet bij de factuurmail.',404);
 return r;
}
export async function setInvoiceMailStatus(messageId:string,status:InvoiceMailStatus,by:string,invoiceId:string|null=null){
 await inIndex(messageId);
 await getDb().update(invoiceMails).set({status,invoiceId:status==='verwerkt'?invoiceId:null,updated:now(),updatedBy:by}).where(and(eq(invoiceMails.mailbox,invoiceMailbox()),eq(invoiceMails.messageId,messageId)));
}
/** De PDF live uit Gmail (bijlage-ID's van Gmail zijn niet vast, dus het bericht wordt opnieuw opgehaald). */
export async function invoicePdf(messageId:string,partId:string){
 const row=await inIndex(messageId);
 if(!(JSON.parse(row.attachments) as {partId:string}[]).some(a=>a.partId===partId))throw new InvoiceMailError('Deze bijlage hoort niet bij de factuur.',404);
 try{
  const g=await client();
  const part=summarizeInvoiceMail(await g.message(messageId)).attachments.find(a=>a.partId===partId);
  if(!part)throw new InvoiceMailError('De PDF staat niet meer in de mail.',404);
  if(part.size>MAX_PDF_BYTES)throw new InvoiceMailError('Deze PDF is groter dan 15 MB.',413);
  const a=await g.attachment(messageId,part.attachmentId);
  return {filename:part.filename,bytes:Buffer.from(a.data.replace(/-/g,'+').replace(/_/g,'/'),'base64')};
 }catch(e){await noteFailure(e);throw e}
}
export const invoiceMailCounts=async()=>Number((await getDb().select({n:sql<number>`count(*)`}).from(invoiceMails).where(and(eq(invoiceMails.mailbox,invoiceMailbox()),eq(invoiceMails.status,'nieuw'))))[0]?.n||0);

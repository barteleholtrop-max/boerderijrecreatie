// Klantgesprekken: pure rules for Gmail data. No database, no network, no secrets, so everything here is testable.
// Gmail stays the source; these functions only read Gmail's answers and build the text of a reply.

export type GmailHeader={name:string;value:string};
export type GmailPart={partId?:string;mimeType?:string;filename?:string;headers?:GmailHeader[];body?:{size?:number;data?:string;attachmentId?:string};parts?:GmailPart[]};
export type GmailMessage={id:string;threadId:string;labelIds?:string[];snippet?:string;internalDate?:string;payload?:GmailPart};
export type GmailThread={id:string;historyId?:string;messages?:GmailMessage[]};

export const CUSTOMER_LABEL_DEFAULT='TODO Klanten';
// Gastenmailbox: info@boerbart.nl (besluit eigenaar 9 november 2026; bevestigd 11 november 2026). Instelbaar met GMAIL_MAILBOX.
export const MAILBOX_DEFAULT='info@boerbart.nl';
// Least privilege: read mail and labels, create/update/send drafts. Without gmail.modify this connection cannot
// archive, delete, relabel or mark anything as read.
export const GMAIL_SCOPES=['https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/gmail.compose'];
// Google Agenda: only to place concept requests/options in the shared calendar (never confirmed bookings: the daily task does those).
export const CALENDAR_SCOPE='https://www.googleapis.com/auth/calendar.events';
// Read-only list of the account's calendars, so linking a calendar is choosing it from a list (no IDs to copy).
export const CALENDAR_LIST_SCOPE='https://www.googleapis.com/auth/calendar.calendarlist.readonly';
export const OAUTH_SCOPES=[...GMAIL_SCOPES,CALENDAR_SCOPE,CALENDAR_LIST_SCOPE];
export const METADATA_HEADERS=['From','To','Cc','Reply-To','Subject','Date','Message-ID','References','In-Reply-To','Auto-Submitted','Precedence','List-Id','List-Unsubscribe','X-Autoreply','X-Autorespond','Content-Type'];

export const header=(headers:GmailHeader[]|undefined,name:string)=>headers?.find(h=>h.name.toLowerCase()===name.toLowerCase())?.value??'';

/** First address of a header: "Naam <a@b.nl>", "a@b.nl" or '"Achternaam, Voornaam" <a@b.nl>'. */
export function parseAddress(value:string):{name:string;email:string}{
 const list=splitAddresses(value);const first=list[0]||'';
 const m=first.match(/^\s*(?:"?([^"<]*?)"?\s*)?<\s*([^>\s]+@[^>\s]+)\s*>\s*$/);
 if(m)return {name:(m[1]||'').trim(),email:m[2].toLowerCase()};
 const plain=first.match(/[^\s<>",;]+@[^\s<>",;]+/);return {name:'',email:plain?plain[0].toLowerCase():''};
}
/** Splits an address list on commas outside quotes and angle brackets. */
export function splitAddresses(value:string){const out:string[]=[];let cur='',quote=false,angle=false;for(const c of value||''){if(c==='"')quote=!quote;else if(c==='<')angle=true;else if(c==='>')angle=false;if(c===','&&!quote&&!angle){if(cur.trim())out.push(cur.trim());cur=''}else cur+=c}if(cur.trim())out.push(cur.trim());return out}
export const addressEmails=(value:string)=>splitAddresses(value).map(a=>parseAddress(a).email).filter(Boolean);

const has=(m:GmailMessage,label:string)=>!!m.labelIds?.includes(label);
export const isDraft=(m:GmailMessage)=>has(m,'DRAFT');
export function isFromUs(m:GmailMessage,mailbox:string){return has(m,'SENT')||parseAddress(header(m.payload?.headers,'From')).email===mailbox.toLowerCase()}

/** Automatic messages (booking confirmations, notifications, newsletters, auto-replies) never get an automatic draft. */
export function isAutomated(m:GmailMessage){
 const h=m.payload?.headers,auto=header(h,'Auto-Submitted').toLowerCase(),prec=header(h,'Precedence').toLowerCase();
 if(auto&&auto!=='no')return true;
 if(['bulk','list','junk','auto_reply'].includes(prec))return true;
 if(header(h,'List-Id')||header(h,'List-Unsubscribe')||header(h,'X-Autoreply')||header(h,'X-Autorespond'))return true;
 const local=parseAddress(header(h,'From')).email.split('@')[0]||'';
 return /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounces?|notifications?|notificaties|automat)/i.test(local);
}
const multipartMixed=(m:GmailMessage)=>/multipart\/mixed/i.test(header(m.payload?.headers,'Content-Type'))||countAttachments(m.payload)>0;

export type ThreadSummary={threadId:string;subject:string;customerEmail:string;customerName:string;lastMessageAt:string;lastMessageId:string;lastFromUs:number;lastCustomerAt:string;unread:number;labeled:number;messageCount:number;attachmentCount:number;draftCount:number;automated:number;snippet:string};
export type MessageIndex={messageId:string;threadId:string;internalDate:string;fromEmail:string;fromUs:number;isDraft:number;unread:number;attachments:number;labelIds:string};
const iso=(ms:string|undefined)=>{const n=Number(ms);return Number.isFinite(n)&&n>0?new Date(n).toISOString():''};
const byDate=(a:GmailMessage,b:GmailMessage)=>Number(a.internalDate||0)-Number(b.internalDate||0);

/** Index rows for one thread (metadata only, no message text). */
export function summarizeThread(t:GmailThread,mailbox:string,labelId:string):{summary:ThreadSummary;messages:MessageIndex[]}{
 const all=[...(t.messages||[])].sort(byDate),sent=all.filter(m=>!isDraft(m)),drafts=all.filter(isDraft);
 const ours=(m:GmailMessage)=>isFromUs(m,mailbox),customer=sent.filter(m=>!ours(m)),last=sent[sent.length-1];
 const first=sent[0]||all[0];
 const who=customer[0]?parseAddress(header(customer[0].payload?.headers,'Reply-To')||header(customer[0].payload?.headers,'From')):parseAddress(header(first?.payload?.headers,'To'));
 return {
  summary:{threadId:t.id,subject:header(first?.payload?.headers,'Subject')||'(geen onderwerp)',customerEmail:who.email,customerName:who.name,
   lastMessageAt:iso(last?.internalDate),lastMessageId:last?.id||'',lastFromUs:last&&ours(last)?1:0,lastCustomerAt:iso(customer[customer.length-1]?.internalDate),
   unread:sent.some(m=>has(m,'UNREAD'))?1:0,labeled:all.some(m=>has(m,labelId))?1:0,messageCount:sent.length,attachmentCount:sent.filter(multipartMixed).length,draftCount:drafts.length,
   automated:customer.length>0&&customer.every(isAutomated)?1:0,snippet:(last?.snippet||'').slice(0,300)},
  messages:all.map(m=>({messageId:m.id,threadId:t.id,internalDate:iso(m.internalDate),fromEmail:parseAddress(header(m.payload?.headers,'From')).email,fromUs:ours(m)?1:0,isDraft:isDraft(m)?1:0,unread:has(m,'UNREAD')?1:0,attachments:multipartMixed(m)?1:0,labelIds:JSON.stringify(m.labelIds||[])})),
 };
}

export type Waiting='klant-wacht'|'wij-wachten'|'afgehandeld'|'opnieuw-open';
/** Who waits for whom. A handled conversation opens again when the customer writes after it was handled. */
export function waiting(t:{lastFromUs:number;lastCustomerAt:string},state?:{status:string;updated:string}|null):Waiting{
 if(state?.status==='afgehandeld'||state?.status==='verwijderd')return t.lastCustomerAt&&t.lastCustomerAt>state.updated&&!t.lastFromUs?'opnieuw-open':'afgehandeld';
 return t.lastFromUs?'wij-wachten':'klant-wacht';
}
/** Verwijderd uit Gesprekken (wens eigenaar 8 november 2026): weg uit de lijst, tenzij de klant daarna opnieuw schrijft.
 *  Gmail zelf blijft onaangeroerd; de mail staat daar nog. */
export const removedFromInbox=(t:{lastFromUs:number;lastCustomerAt:string},state?:{status:string;updated:string}|null)=>state?.status==='verwijderd'&&waiting(t,state)!=='opnieuw-open';

// ---- Message text and attachments -------------------------------------------------------------------------
export function decodeBase64Url(data:string,charset='utf-8'){const buf=Buffer.from(data.replace(/-/g,'+').replace(/_/g,'/'),'base64');return /^(iso-8859-1|latin1|windows-1252|us-ascii)$/i.test(charset)?buf.toString('latin1'):buf.toString('utf8')}
export const encodeBase64Url=(s:string|Buffer)=>Buffer.from(s).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const charsetOf=(p:GmailPart)=>(/charset="?([^";\s]+)/i.exec(header(p.headers,'Content-Type'))?.[1])||'utf-8';
const isAttachment=(p:GmailPart)=>!!p.filename||/^attachment/i.test(header(p.headers,'Content-Disposition'));
function walk(p:GmailPart|undefined,fn:(p:GmailPart)=>void){if(!p)return;fn(p);for(const c of p.parts||[])walk(c,fn)}
export function countAttachments(p:GmailPart|undefined){let n=0;walk(p,x=>{if(isAttachment(x)&&(x.body?.attachmentId||x.body?.data))n++});return n}

const entities:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
/** Shown as plain text only: the backoffice never renders mail HTML. */
export function htmlToText(html:string){
 return html.replace(/<(script|style|head)[\s\S]*?<\/\1>/gi,'').replace(/<br\s*\/?>/gi,'\n').replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi,'\n').replace(/<li[^>]*>/gi,'• ').replace(/<[^>]+>/g,'')
  .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi,(m,e:string)=>e[0]==='#'?String.fromCodePoint(e[1].toLowerCase()==='x'?parseInt(e.slice(2),16):Number(e.slice(1))):entities[e.toLowerCase()]??m)
  .replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
export type Attachment={partId:string;filename:string;mimeType:string;size:number;attachmentId:string};
export function messageContent(m:GmailMessage):{text:string;attachments:Attachment[];html:boolean}{
 const plain:string[]=[],html:string[]=[],attachments:Attachment[]=[];
 walk(m.payload,p=>{
  if(isAttachment(p)){if(p.body?.attachmentId)attachments.push({partId:p.partId||'',filename:(p.filename||'bijlage').slice(0,200),mimeType:p.mimeType||'application/octet-stream',size:p.body.size||0,attachmentId:p.body.attachmentId});return}
  if(!p.body?.data)return;
  if(p.mimeType==='text/plain')plain.push(decodeBase64Url(p.body.data,charsetOf(p)));
  else if(p.mimeType==='text/html')html.push(decodeBase64Url(p.body.data,charsetOf(p)));
 });
 return {text:(plain.length?plain.join('\n'):htmlToText(html.join('\n'))).replace(/\r\n/g,'\n').trim(),attachments,html:!plain.length&&html.length>0};
}
/** A draft can be edited in the backoffice only when it is a simple text draft; otherwise editing would lose formatting or attachments. */
export function simpleTextDraft(m:GmailMessage){let ok=true,text=0;walk(m.payload,p=>{if(isAttachment(p))ok=false;else if(p.mimeType==='text/html')ok=false;else if(p.mimeType==='text/plain')text++});return ok&&text===1}

// ---- Replies ------------------------------------------------------------------------------------------------
export type ReplyContext={to:string[];cc:string[];subject:string;inReplyTo:string;references:string};
/** Recipients and threading headers for an answer in the same Gmail conversation. */
export function replyContext(t:GmailThread,mailbox:string):ReplyContext{
 const sent=[...(t.messages||[])].filter(m=>!isDraft(m)).sort(byDate),last=sent[sent.length-1],me=mailbox.toLowerCase();
 if(!last)throw Error('Dit gesprek heeft nog geen bericht om op te antwoorden.');
 const h=last.payload?.headers,lastCustomer=[...sent].reverse().find(m=>!isFromUs(m,mailbox));
 const to=isFromUs(last,mailbox)?addressEmails(header(h,'To')):addressEmails(header(h,'Reply-To')||header(h,'From'));
 const fallback=lastCustomer?addressEmails(header(lastCustomer.payload?.headers,'Reply-To')||header(lastCustomer.payload?.headers,'From')):[];
 const recipients=[...new Set((to.length?to:fallback).filter(e=>e!==me))];
 const cc=isFromUs(last,mailbox)?addressEmails(header(h,'Cc')).filter(e=>e!==me&&!recipients.includes(e)):[];
 const subject=header(sent[0].payload?.headers,'Subject')||'';
 const messageId=header(h,'Message-ID');
 return {to:recipients,cc,subject:/^(re|antw):/i.test(subject)?subject:'Re: '+subject,inReplyTo:messageId,references:[header(h,'References'),messageId].filter(Boolean).join(' ').trim()};
}
const encodeWord=(s:string)=>/^[\x20-\x7e]*$/.test(s)?s:'=?UTF-8?B?'+Buffer.from(s).toString('base64')+'?=';
const safeHeader=(s:string)=>s.replace(/[\r\n]+/g,' ').trim();
/** RFC 2822 message (plain text, UTF-8) for drafts.create/update; Gmail puts it in the thread given by threadId. */
export function buildReply(c:ReplyContext&{from:string;body:string}){
 if(!c.to.length)throw Error('Er is geen ontvanger gevonden voor dit antwoord.');
 const lines=[`From: ${safeHeader(c.from)}`,`To: ${c.to.map(safeHeader).join(', ')}`,...(c.cc.length?[`Cc: ${c.cc.map(safeHeader).join(', ')}`]:[]),`Subject: ${encodeWord(safeHeader(c.subject))}`,
  ...(c.inReplyTo?[`In-Reply-To: ${safeHeader(c.inReplyTo)}`]:[]),...(c.references?[`References: ${safeHeader(c.references)}`]:[]),
  'MIME-Version: 1.0','Content-Type: text/plain; charset="UTF-8"','Content-Transfer-Encoding: base64','',
  Buffer.from(c.body.replace(/\r?\n/g,'\r\n')).toString('base64').replace(/.{76}/g,'$&\r\n')];
 return encodeBase64Url(lines.join('\r\n'));
}
/** A new plain-text message (not a reply), e.g. a confirmation. The fixed Message-ID makes the send findable, so it is never sent twice. */
export type MailAttachment={filename:string;mimeType:string;data:Uint8Array};
const b64lines=(b:Uint8Array|Buffer)=>Buffer.from(b).toString('base64').replace(/.{76}/g,'$&\r\n');
/** Simple text mail; with attachments (e.g. the invoice PDF) as multipart/mixed. */
export function buildMessage(c:{from:string;to:string;subject:string;body:string;messageId:string;attachments?:MailAttachment[]}){
 if(!parseAddress(c.to).email)throw Error('Geen geldig e-mailadres.');
 const head=[`From: ${safeHeader(c.from)}`,`To: ${safeHeader(c.to)}`,`Subject: ${encodeWord(safeHeader(c.subject))}`,`Message-ID: ${safeHeader(c.messageId)}`,'Auto-Submitted: auto-generated','MIME-Version: 1.0'];
 const text=Buffer.from(c.body.replace(/\r?\n/g,'\r\n'));
 if(!c.attachments?.length)return encodeBase64Url([...head,'Content-Type: text/plain; charset="UTF-8"','Content-Transfer-Encoding: base64','',b64lines(text)].join('\r\n'));
 const boundary='bb-part-'+Buffer.from(c.messageId).toString('hex').slice(0,48); // base64 bevat nooit '-', dus de grens komt niet in de inhoud voor
 const parts=[`--${boundary}`,'Content-Type: text/plain; charset="UTF-8"','Content-Transfer-Encoding: base64','',b64lines(text),
  ...c.attachments.flatMap(a=>{const name=safeHeader(a.filename).replace(/["\\]/g,'_');return [`--${boundary}`,`Content-Type: ${safeHeader(a.mimeType)}; name="${name}"`,`Content-Disposition: attachment; filename="${name}"`,'Content-Transfer-Encoding: base64','',b64lines(a.data)]}),`--${boundary}--`,''];
 return encodeBase64Url([...head,`Content-Type: multipart/mixed; boundary="${boundary}"`,'',...parts].join('\r\n'));
}
/** Keeps the headers of an existing simple text draft and only replaces the text (for editing a draft made elsewhere). */
export function replaceDraftText(m:GmailMessage,body:string){
 const h=m.payload?.headers||[],keep=['From','To','Cc','Bcc','Subject','In-Reply-To','References'];
 const lines=keep.flatMap(n=>{const v=header(h,n);return v?[`${n}: ${safeHeader(v)}`]:[]});
 return encodeBase64Url([...lines,'MIME-Version: 1.0','Content-Type: text/plain; charset="UTF-8"','Content-Transfer-Encoding: base64','',Buffer.from(body.replace(/\r?\n/g,'\r\n')).toString('base64').replace(/.{76}/g,'$&\r\n')].join('\r\n'));
}

// ---- Validation -----------------------------------------------------------------------------------------------
export const validThreadId=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9]{6,32}$/.test(v);
export const validGmailId=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(v);
export const validRequestId=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v);
export const validReplyText=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=20000;
export const LINK_KINDS=['bestelling'] as const;
/** Gmail conversations appear in the central guest workspace (customers, reservations) as 'gmail:<threadId>'. */
export const mailRef=(threadId:string)=>'gmail:'+threadId;
export const mailThreadOf=(ref:string)=>ref.startsWith('gmail:')&&validThreadId(ref.slice(6))?ref.slice(6):null;
export type LinkKind=typeof LINK_KINDS[number];
export const gmailThreadUrl=(mailbox:string,threadId:string)=>`https://mail.google.com/mail/u/${encodeURIComponent(mailbox)}/#all/${threadId}`;

// ---- Send rules -----------------------------------------------------------------------------------------------
/** Final check just before sending: nothing new in the conversation and the draft unchanged since it was shown. */
export function sendBlocker(live:{lastMessageId:string;draftMessageId:string|null;draftThreadId:string|null},seen:{lastMessageId:string;draftMessageId:string;threadId:string}){
 if(!live.draftMessageId)return 'Dit concept bestaat niet meer in Gmail. Mogelijk is het al verzonden of verwijderd. Ververs het gesprek.';
 if(live.draftThreadId&&live.draftThreadId!==seen.threadId)return 'Dit concept hoort bij een ander gesprek.';
 if(live.lastMessageId!==seen.lastMessageId)return 'Er is intussen een nieuw bericht in dit gesprek. Lees het eerst; er is niets verzonden.';
 if(live.draftMessageId!==seen.draftMessageId)return 'Het concept is intussen elders gewijzigd. Bekijk de nieuwe versie; er is niets verzonden.';
 return null;
}

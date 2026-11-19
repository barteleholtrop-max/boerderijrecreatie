// Facturen uit de mail: pure regels (geen database, geen netwerk), zodat alles testbaar is. Zie lib/invoice-mail.ts.
import {header,parseAddress,type GmailMessage,type GmailPart} from './mail-core';

export const INVOICE_MAILBOX_DEFAULT='administratie@example.nl';
export const INVOICE_LABEL_DEFAULT='Inkoop';
// Alleen lezen: de backoffice kan in deze mailbox niets verzenden, verwijderen, labelen of als gelezen markeren.
export const INVOICE_SCOPES=['https://www.googleapis.com/auth/gmail.readonly'];
// Google Drive als beeldbank (akkoord eigenaar 3 november 2026): alleen lezen, via hetzelfde account (administratie@).
export const DRIVE_SCOPE='https://www.googleapis.com/auth/drive.readonly';
// Eerste keer ophalen: alleen recente mail. Daarna gaat het label vanzelf mee met nieuwe facturen.
export const INVOICE_QUERY='newer_than:120d';
export const MAX_PDF_BYTES=15*1024*1024;
export const STATUSES=['nieuw','verwerkt','overgeslagen'] as const;
export type InvoiceMailStatus=typeof STATUSES[number];
export type PdfAttachment={partId:string;filename:string;size:number;attachmentId:string};

function walk(p:GmailPart|undefined,fn:(p:GmailPart)=>void){if(!p)return;fn(p);for(const c of p.parts||[])walk(c,fn)}
/** PDF-bijlagen van een bericht (op type of bestandsnaam). Andere bijlagen tellen niet mee. */
export function pdfAttachments(m:GmailMessage):PdfAttachment[]{
 const out:PdfAttachment[]=[];
 walk(m.payload,p=>{
  const name=(p.filename||'').trim(),pdf=/pdf/i.test(p.mimeType||'')||/\.pdf$/i.test(name);
  if(pdf&&p.body?.attachmentId)out.push({partId:p.partId||'',filename:(name||'factuur.pdf').slice(0,200),size:p.body.size||0,attachmentId:p.body.attachmentId});
 });
 return out;
}
/** Wat de backoffice van een factuurmail onthoudt: afzender, onderwerp, datum en de PDF-bijlagen. Geen mailtekst. */
export function summarizeInvoiceMail(m:GmailMessage){
 const h=m.payload?.headers,from=parseAddress(header(h,'From'));const ms=Number(m.internalDate);
 return {messageId:m.id,threadId:m.threadId,fromEmail:from.email,fromName:from.name.slice(0,200),subject:(header(h,'Subject')||'(geen onderwerp)').slice(0,300),
  received:Number.isFinite(ms)&&ms>0?new Date(ms).toISOString():new Date(0).toISOString(),attachments:pdfAttachments(m)};
}
/** Leverancier als voorstel bij het inlezen: de naam van de afzender, anders het domein van het mailadres. */
export function supplierGuess(fromName:string,fromEmail:string){
 const name=fromName.replace(/\b(facturatie|facturen|factuur|administratie|debiteuren|invoice|noreply|no-reply)\b/gi,'').replace(/\s{2,}/g,' ').replace(/^[\s\-–|:,.]+|[\s\-–|:,.]+$/g,'').trim();
 if(name)return name.slice(0,200);
 const domain=(fromEmail.split('@')[1]||'').split('.').slice(-2,-1)[0]||'';
 return domain?domain[0].toUpperCase()+domain.slice(1):'';
}
/** Herkenbare bron bij een factuur, zodat de mail na „Beoordeelde regels bewaren” op verwerkt gaat. */
export const mailSource=(messageId:string,fromName:string,received:string)=>`Mail ${fromName||'leverancier'} ${received.slice(0,10)} (gmail:${messageId})`;
export const sourceMessageId=(source:string)=>/\(gmail:([A-Za-z0-9_-]{1,80})\)/.exec(source||'')?.[1]??null;
export const validMessageId=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(v);

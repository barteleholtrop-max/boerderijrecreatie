import {authorizeSheet} from '@/lib/sheet-access';
import {SheetError} from '@/lib/sheets';
import {GmailError} from '@/lib/gmail-api';
import {withConnectionSettings} from '@/lib/connection-settings';
import {enqueue} from '@/lib/outbox';
import {tick} from '@/lib/assistant-jobs';
import {invoiceMailOverview,setInvoiceMailStatus,disconnectInvoiceMail,InvoiceMailError} from '@/lib/invoice-mail';
import {validMessageId,STATUSES,type InvoiceMailStatus} from '@/lib/invoice-mail-core';
export const dynamic='force-dynamic';
// Facturen uit de mail (Inkoop › Facturen): overzicht, nu ophalen, overslaan/terugzetten/verwerkt en ontkoppelen.
// Alleen voor de eigenaar (zelfde controle als Inkoop & voorraad); schrijfacties alleen vanaf de eigen backoffice.
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
function failure(e:unknown){
 if(e instanceof SheetError||e instanceof InvoiceMailError||e instanceof GmailError)return json({error:e.message},e.status);
 console.error('[factuurmail]',e instanceof Error?e.message:e);return json({error:'Er ging iets mis. Ververs en probeer opnieuw.'},500);
}
export async function GET(req:Request){try{authorizeSheet(req);return json(await withConnectionSettings(()=>invoiceMailOverview()))}catch(e){return failure(e)}}
export async function POST(req:Request){try{
 authorizeSheet(req,true);const by=req.headers.get('x-boer-bart-account')||'eigenaar';
 const b=await req.json() as {action?:unknown;messageId?:unknown;status?:unknown;invoiceId?:unknown};
 return await withConnectionSettings(async()=>{
  if(b.action==='sync'){await enqueue('factuurmail-sync:handmatig:'+Date.now(),'factuurmail-sync');void tick();return json({ok:true,message:'Ophalen gestart. Ververs over een paar seconden.'})}
  if(b.action==='disconnect'){await disconnectInvoiceMail();return json({ok:true,message:'Factuurmailbox ontkoppeld. Er wordt niets meer opgehaald.'})}
  if(b.action==='status'){
   if(!validMessageId(b.messageId)||!STATUSES.includes(b.status as InvoiceMailStatus)||(b.invoiceId!==undefined&&(typeof b.invoiceId!=='string'||b.invoiceId.length>100)))throw new InvoiceMailError('Ongeldige aanvraag.');
   await setInvoiceMailStatus(b.messageId,b.status as InvoiceMailStatus,by,typeof b.invoiceId==='string'?b.invoiceId:null);return json({ok:true});
  }
  throw new InvoiceMailError('Onbekende actie.');
 });
}catch(e){return failure(e)}}

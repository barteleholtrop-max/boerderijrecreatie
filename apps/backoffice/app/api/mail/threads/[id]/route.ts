import {z} from 'zod';
import {isOwnerRequest} from '@/lib/owner';
import {groupDossier,prepareGroupAdvice,editGroupAdvice,createGuestDraft} from '@/lib/guest-ai';
import {json,who,handle} from '@/lib/mail-http';
import {threadDetail,createDraft,updateDraft,sendDraft,setWork,removeThread,addLink,removeLink,mailAccess,MailError} from '@/lib/mail-store';
import {validThreadId,validGmailId,validRequestId,validReplyText,LINK_KINDS,type LinkKind} from '@/lib/mail-core';
export const dynamic='force-dynamic';
type Body={note?:unknown;approveId?:unknown;assigned?:unknown;customerId?:unknown;action?:string;draftId?:unknown;baseMessageId?:unknown;draftMessageId?:unknown;lastMessageId?:unknown;body?:unknown;requestId?:unknown;confirm?:unknown;status?:unknown;version?:unknown;kind?:unknown;ref?:unknown};
async function id(params:Promise<{id:string}>){const {id}=await params;if(!validThreadId(id))throw new MailError('Ongeldig gesprek.',404);return id}
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){return handle(async()=>{const by=who(req);const d=await threadDetail(await id(params));return json({...d,sendEnabled:d.sendEnabled&&mailAccess(by).send})})}
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){return handle(async()=>{
 const threadId=await id(params);
 const raw=await req.text();if(raw.length>100000)throw new MailError('Het bericht is te lang.');
 let b:Body;try{b=JSON.parse(raw)}catch{throw new MailError('Ongeldige aanvraag.')}
 const by=who(req,true,b.action==='send');
 switch(b.action){
  case 'advice-status':return json(await groupDossier(by,'gmail:'+threadId));
  case 'advice-prepare':return json(await prepareGroupAdvice(by,'gmail:'+threadId));
  case 'advice-text':return json({text:await createGuestDraft(by,'gmail:'+threadId)});
  case 'advice-edit':return json({dossier:await editGroupAdvice(by,'gmail:'+threadId,z.number().int().min(0).parse(b.version),z.string().max(12000).parse(b.note),z.string().max(100).optional().parse(b.approveId),isOwnerRequest(req))});
  case 'draft-create':if(b.lastMessageId!==undefined&&!validGmailId(b.lastMessageId))throw new MailError('Ongeldig basisbericht.');if(!validReplyText(b.body)||!validRequestId(b.requestId))throw new MailError('Schrijf eerst een antwoord.');return json(await createDraft(threadId,b.body,b.requestId,by,b.lastMessageId as string|undefined));
  case 'draft-update':if(b.lastMessageId!==undefined&&!validGmailId(b.lastMessageId))throw new MailError('Ongeldig basisbericht.');if(!validReplyText(b.body)||!validGmailId(b.draftId)||!validGmailId(b.baseMessageId))throw new MailError('Ongeldig concept.');return json(await updateDraft(threadId,b.draftId,b.baseMessageId,b.body,by,b.lastMessageId as string|undefined));
  case 'send':
   // Sending needs an explicit confirmation in the request itself, besides the confirmation step on the page.
   if(b.confirm!==true)throw new MailError('Bevestig eerst dat dit antwoord verzonden mag worden.');
   if(!validGmailId(b.draftId)||!validGmailId(b.draftMessageId)||!validGmailId(b.lastMessageId)||!validRequestId(b.requestId))throw new MailError('Ongeldige verzendaanvraag. Ververs het gesprek.');
   return json(await sendDraft({threadId,draftId:b.draftId,draftMessageId:b.draftMessageId,lastMessageId:b.lastMessageId,requestId:b.requestId,by}));
  case 'work':
   if((b.status!=='open'&&b.status!=='afgehandeld')||!Number.isInteger(b.version)||typeof b.assigned!=='string'||b.assigned.length>100||typeof b.customerId!=='string'||b.customerId.length>400)throw new MailError('Ongeldige gegevens.');
   return json(await setWork(threadId,{status:b.status,assigned:b.assigned.trim(),customerId:b.customerId},b.version as number,by));
  case 'verwijderen':
   // Alleen uit de backoffice; Gmail blijft gelijk. Vraagt een uitdrukkelijke bevestiging in de aanvraag zelf.
   if(b.confirm!==true||!Number.isInteger(b.version))throw new MailError('Bevestig eerst dat dit gesprek uit Gesprekken mag.');
   return json(await removeThread(threadId,b.version as number,by));
  case 'link-add':case 'link-remove':
   if(!LINK_KINDS.includes(b.kind as LinkKind)||typeof b.ref!=='string'||!b.ref||b.ref.length>100)throw new MailError('Ongeldige koppeling.');
   if(b.action==='link-add')await addLink(threadId,b.kind as LinkKind,b.ref,by);else await removeLink(threadId,b.kind as LinkKind,b.ref);return json({ok:true});
  default:throw new MailError('Onbekende actie.');
 }
})}

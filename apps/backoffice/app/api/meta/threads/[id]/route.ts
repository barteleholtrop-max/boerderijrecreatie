import {json,who,handle} from '@/lib/mail-http';
import {metaThread,metaWork,metaSend,metaRelease} from '@/lib/meta-store';
import {mailAccess,MailError} from '@/lib/mail-store';
import {isOwnerRequest} from '@/lib/owner';
import {z} from 'zod';
export const dynamic='force-dynamic';
// Eén gesprek via WhatsApp, Messenger of Instagram: lezen, afhandelen en (na bevestiging) beantwoorden.
async function id(params:Promise<{id:string}>){const {id}=await params;return decodeURIComponent(id)}
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){return handle(async()=>{const by=who(req);const d=await metaThread(await id(params));return json({...d,sendEnabled:d.sendEnabled&&mailAccess(by).send})})}
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){return handle(async()=>{
 const threadId=await id(params),raw=await req.text();if(raw.length>50000)throw new MailError('Het bericht is te lang.');
 let b:Record<string,unknown>;try{b=JSON.parse(raw)}catch{throw new MailError('Ongeldige aanvraag.')}
 const by=who(req,b.action!=='advice-status',b.action==='send');
 // Antwoordvoorstel van de assistent (wens eigenaar 11 november 2026): zelfde advies als bij mail en websitechat. Er wordt niets verstuurd.
 if(typeof b.action==='string'&&b.action.startsWith('advice-')){
  const ai=await import('@/lib/guest-ai'),ref='meta:'+threadId;
  if(b.action==='advice-status')return json(await ai.groupDossier(by,ref));
  if(b.action==='advice-prepare')return json(await ai.prepareGroupAdvice(by,ref));
  if(b.action==='advice-text')return json({text:await ai.createGuestDraft(by,ref)});
  if(b.action==='advice-edit')return json({dossier:await ai.editGroupAdvice(by,ref,z.number().int().min(0).parse(b.version),z.string().max(12000).parse(b.note),z.string().max(100).optional().parse(b.approveId),isOwnerRequest(req))});
 }
 if(b.action==='work'){await metaWork(threadId,b,by);return json({ok:true})}
 if(b.action==='send')return json(await metaSend(threadId,b,by));
 if(b.action==='vrijgeven'){await metaRelease(threadId,b.requestId,b.arrived===true,by);return json({ok:true})}
 throw new MailError('Onbekende actie.');
})}

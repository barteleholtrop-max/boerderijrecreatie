import {z} from 'zod';
import {isOwnerRequest} from '@/lib/owner';
import {groupDossier,prepareGroupAdvice,editGroupAdvice,createGuestDraft} from '@/lib/guest-ai';
import {json,who,handle} from '@/lib/mail-http';
import {MailError} from '@/lib/mail-store';
export const dynamic='force-dynamic';
// Intern advies bij een websitechat of groepsaanvraag via de website (wens eigenaar 3 november 2026): dezelfde acties en
// regels als bij een Gmail-gesprek (/api/mail/threads/[id]). Er wordt niets verstuurd en niets geboekt.
const validId=(v:string)=>/^[A-Za-z0-9_:.-]{1,100}$/.test(v);
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){return handle(async()=>{
 const {id}=await params;const ref=decodeURIComponent(id);if(!validId(ref)||ref.startsWith('gmail:'))throw new MailError('Ongeldig gesprek.',404);
 const raw=await req.text();if(raw.length>20000)throw new MailError('De aanvraag is te groot.');
 let b:{action?:string;version?:unknown;note?:unknown;approveId?:unknown};try{b=JSON.parse(raw)}catch{throw new MailError('Ongeldige aanvraag.')}
 const by=who(req,b.action!=='advice-status');
 switch(b.action){
  case 'advice-status':return json(await groupDossier(by,ref));
  case 'advice-prepare':return json(await prepareGroupAdvice(by,ref));
  case 'advice-text':return json({text:await createGuestDraft(by,ref)});
  case 'advice-edit':return json({dossier:await editGroupAdvice(by,ref,z.number().int().min(0).parse(b.version),z.string().max(12000).parse(b.note),z.string().max(100).optional().parse(b.approveId),isOwnerRequest(req))});
  default:throw new MailError('Onbekende actie.');
 }
})}

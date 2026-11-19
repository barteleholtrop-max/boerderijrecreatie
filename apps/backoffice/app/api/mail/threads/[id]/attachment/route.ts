import {who,handle} from '@/lib/mail-http';
import {attachment,MailError} from '@/lib/mail-store';
import {validThreadId,validGmailId} from '@/lib/mail-core';
export const dynamic='force-dynamic';
// Downloads an attachment from Gmail (never rendered inline, never stored in the backoffice).
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){return handle(async()=>{
 who(req);const {id}=await params,u=new URL(req.url),message=u.searchParams.get('message'),part=u.searchParams.get('part')||'';
 if(!validThreadId(id)||!validGmailId(message)||!/^[0-9.]{1,40}$/.test(part))throw new MailError('Bijlage niet gevonden.',404);
 const a=await attachment(id,message,part);
 const name=a.filename.replace(/[\r\n"\\]/g,'_');
 return new Response(new Uint8Array(a.bytes),{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${name.replace(/[^\x20-\x7e]/g,'_')}"; filename*=UTF-8''${encodeURIComponent(name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
})}

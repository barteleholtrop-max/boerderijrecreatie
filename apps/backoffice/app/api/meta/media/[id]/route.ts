import {who,handle} from '@/lib/mail-http';
import {metaMedia} from '@/lib/meta-store';
export const dynamic='force-dynamic';
// Foto, spraakbericht of document bij een bericht: via de backoffice opgehaald bij Meta, nooit als losse link naar buiten.
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){return handle(async()=>{
 who(req);const {id}=await params,m=await metaMedia(decodeURIComponent(id).slice(0,300));
 const safe=/^(image|audio|video)\//.test(m.mime)&&!/svg/i.test(m.mime);
 return new Response(m.body,{headers:{'Content-Type':safe?m.mime:'application/octet-stream','Content-Disposition':(safe?'inline':'attachment')+(m.filename?`; filename="${m.filename.replace(/[^\w.\- ]/g,'_')}"`:''),'Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff'}});
})}

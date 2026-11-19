import {json,who,handle} from '@/lib/mail-http';
import {importWhatsapp,importWhatsappMedia} from '@/lib/meta-store';
import {MailError} from '@/lib/mail-store';
export const dynamic='force-dynamic';
// WhatsApp-export importeren (wens eigenaar 13 november 2026). De browser pakt de export uit en stuurt eerst de berichten
// (JSON), daarna elke bijlage los (formulier met messageId en bestand), zodat geen enkele aanvraag te groot wordt.
export async function POST(req:Request){return handle(async()=>{
 const by=who(req,true)||'backoffice';
 if((req.headers.get('content-type')||'').startsWith('multipart/form-data')){
  const f=await req.formData(),file=f.get('file');
  if(!(file instanceof File))throw new MailError('Geen bestand ontvangen.');
  return json(await importWhatsappMedia(f.get('messageId'),file));
 }
 const b=await req.json().catch(()=>null) as {phone?:unknown;name?:unknown;us?:unknown;messages?:unknown}|null;
 if(!b)throw new MailError('Ongeldige aanvraag.');
 return json(await importWhatsapp(b,by));
})}

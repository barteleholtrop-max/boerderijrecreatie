import {authorizeSheet} from '@/lib/sheet-access';
import {SheetError} from '@/lib/sheets';
import {GmailError} from '@/lib/gmail-api';
import {withConnectionSettings} from '@/lib/connection-settings';
import {invoicePdf,InvoiceMailError} from '@/lib/invoice-mail';
import {validMessageId} from '@/lib/invoice-mail-core';
export const dynamic='force-dynamic';
// De PDF van een factuurmail, live uit Gmail, voor het inlezen in de browser. Wordt niet bewaard en niet getoond als pagina.
export async function GET(req:Request){try{
 authorizeSheet(req);const u=new URL(req.url),id=u.searchParams.get('id'),part=u.searchParams.get('part')||'';
 if(!validMessageId(id)||!/^[0-9.]{1,40}$/.test(part))throw new InvoiceMailError('PDF niet gevonden.',404);
 const pdf=await withConnectionSettings(()=>invoicePdf(id,part));
 const name=pdf.filename.replace(/[\r\n"\\]/g,'_');
 return new Response(new Uint8Array(pdf.bytes),{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${name.replace(/[^\x20-\x7e]/g,'_')}"; filename*=UTF-8''${encodeURIComponent(name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}catch(e){
 const known=e instanceof SheetError||e instanceof InvoiceMailError||e instanceof GmailError;
 if(!known)console.error('[factuurmail] pdf:',e instanceof Error?e.message:e);
 return Response.json({error:known?(e as Error).message:'De PDF kon niet worden opgehaald.'},{status:known?(e as {status:number}).status:500,headers:{'Cache-Control':'private, no-store'}});
}}

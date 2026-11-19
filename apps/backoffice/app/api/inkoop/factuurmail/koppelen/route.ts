import {authorizeSheet} from '@/lib/sheet-access';
import {withConnectionSettings} from '@/lib/connection-settings';
import {startInvoiceOAuth} from '@/lib/invoice-mail';
export const dynamic='force-dynamic';
// Start het koppelen van de factuurmailbox bij Google (alleen leesrechten). Google stuurt terug naar /api/mail/oauth/callback.
export async function GET(req:Request){
 const back=(melding:string)=>{const u=new URL('/inkoop',process.env.APP_ORIGIN||'http://localhost:3001');u.searchParams.set('tab','facturen');u.searchParams.set('factuurmail','fout');u.searchParams.set('melding',melding);return Response.redirect(u.toString(),302)};
 try{authorizeSheet(req);const by=req.headers.get('x-boer-bart-account')||'eigenaar';return Response.redirect(await withConnectionSettings(()=>startInvoiceOAuth(by)),302)}
 catch(e){return back(e instanceof Error?e.message:'Koppelen kon niet starten.')}
}

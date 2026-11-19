import {authorizeSheet} from '@/lib/sheet-access';
import {withConnectionSettings} from '@/lib/connection-settings';
import {startInvoiceOAuth} from '@/lib/invoice-mail';
export const dynamic='force-dynamic';
// Koppelt het account van de factuurmail (administratie@) opnieuw, nu met het leesrecht voor Google Drive erbij.
// Google stuurt terug naar /api/mail/oauth/callback (zelfde terugkeeradres, er hoeft in Google Cloud niets bij).
export async function GET(req:Request){
 const back=(melding:string)=>{const u=new URL('/koppeling',process.env.APP_ORIGIN||'http://localhost:3001');u.searchParams.set('drive','fout');u.searchParams.set('melding',melding);return Response.redirect(u.toString(),302)};
 try{authorizeSheet(req);const by=req.headers.get('x-boer-bart-account')||'eigenaar';return Response.redirect(await withConnectionSettings(()=>startInvoiceOAuth(by,'drive')),302)}
 catch(e){return back(e instanceof Error?e.message:'Koppelen kon niet starten.')}
}

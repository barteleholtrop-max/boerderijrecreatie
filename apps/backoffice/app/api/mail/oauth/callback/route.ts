import {who} from '@/lib/mail-http';
import {withConnectionSettings} from '@/lib/connection-settings';
import {finishOAuth,MailError} from '@/lib/mail-store';
import {GmailError} from '@/lib/gmail-api';
import {enqueue} from '@/lib/outbox';
import {tick} from '@/lib/assistant-jobs';
import {authorizeSheet} from '@/lib/sheet-access';
import {oauthPurpose,finishInvoiceOAuth} from '@/lib/invoice-mail';
import {finishProfileOAuth} from '@/lib/google-profile';
export const dynamic='force-dynamic';
const back=(params:Record<string,string>)=>{const u=new URL('/koppeling',process.env.APP_ORIGIN||'http://localhost:3001');for(const [k,v] of Object.entries(params))u.searchParams.set(k,v);return Response.redirect(u.toString(),302)};
// Google sends the browser back here. The code is exchanged on the server; tokens are stored encrypted and never shown.
export async function GET(req:Request){return withConnectionSettings(()=>callback(req)).catch(()=>back({gmail:'fout',melding:'De beveiligde instellingen konden niet worden geopend.'}))}
async function callback(req:Request){
 const u=new URL(req.url),code=u.searchParams.get('code')||'',state=u.searchParams.get('state')||'',denied=u.searchParams.get('error');
 // Factuurmail (Inkoop › Facturen) gebruikt hetzelfde terugkeeradres bij Google, zodat er in Google Cloud niets bij hoeft.
 if(/^[a-f0-9-]{36}$/.test(state)&&await oauthPurpose(state)==='factuurmail')return invoiceCallback(req,code,state,denied);
 if(/^[a-f0-9-]{36}$/.test(state)&&await oauthPurpose(state)==='google-profiel')return profileCallback(req,code,state,denied);
 if(/^[a-f0-9-]{36}$/.test(state)&&await oauthPurpose(state)==='drive')return driveCallback(req,code,state,denied);
 try{
  const by=who(req);
  if(denied)throw new MailError(denied==='access_denied'?'De toestemming bij Google is geweigerd. Er is niets gekoppeld.':'Google gaf een fout: '+denied);
  if(!code||!/^[a-f0-9-]{36}$/.test(state))throw new MailError('Ongeldige terugkeer van Google. Begin opnieuw.');
  const r=await finishOAuth(code,state,by);
  await enqueue('gmail-sync:gekoppeld:'+Date.now(),'gmail-sync',{full:true});void tick();
  return back({gmail:r.labelFound?'gekoppeld':'label-ontbreekt'});
 }catch(e){return back({gmail:'fout',melding:e instanceof MailError||e instanceof GmailError?e.message:'Koppelen mislukt.'})}
}

async function invoiceCallback(req:Request,code:string,state:string,denied:string|null){
 const back=(params:Record<string,string>)=>{const u=new URL('/inkoop',process.env.APP_ORIGIN||'http://localhost:3001');u.searchParams.set('tab','facturen');for(const [k,v] of Object.entries(params))u.searchParams.set(k,v);return Response.redirect(u.toString(),302)};
 try{
  authorizeSheet(req);const by=req.headers.get('x-boer-bart-account')||'eigenaar';
  if(denied)throw new MailError(denied==='access_denied'?'De toestemming bij Google is geweigerd. Er is niets gekoppeld.':'Google gaf een fout: '+denied);
  if(!code)throw new MailError('Ongeldige terugkeer van Google. Begin opnieuw.');
  const r=await finishInvoiceOAuth(code,state,by);
  await enqueue('factuurmail-sync:gekoppeld:'+Date.now(),'factuurmail-sync');void tick();
  return back({factuurmail:r.labelFound?'gekoppeld':'label-ontbreekt'});
 }catch(e){return back({factuurmail:'fout',melding:e instanceof Error&&!(e instanceof TypeError)?e.message:'Koppelen mislukt.'})}
}

// Google Drive als beeldbank: hetzelfde account als de factuurmail, met het leesrecht voor Drive erbij. Terug naar Systeem & koppelingen.
async function driveCallback(req:Request,code:string,state:string,denied:string|null){
 const back=(params:Record<string,string>)=>{const u=new URL('/koppeling',process.env.APP_ORIGIN||'http://localhost:3001');for(const [k,v] of Object.entries(params))u.searchParams.set(k,v);return Response.redirect(u.toString(),302)};
 try{
  authorizeSheet(req);const by=req.headers.get('x-boer-bart-account')||'eigenaar';
  if(denied)throw new MailError(denied==='access_denied'?'De toestemming bij Google is geweigerd. Er is niets gekoppeld.':'Google gaf een fout: '+denied);
  if(!code)throw new MailError('Ongeldige terugkeer van Google. Begin opnieuw.');
  await finishInvoiceOAuth(code,state,by,'drive');
  await enqueue('drive-sync:gekoppeld:'+Date.now(),'drive-sync');await enqueue('factuurmail-sync:gekoppeld:'+Date.now(),'factuurmail-sync');void tick();
  return back({drive:'gekoppeld'});
 }catch(e){return back({drive:'fout',melding:e instanceof Error&&!(e instanceof TypeError)?e.message:'Koppelen mislukt.'})}
}

// Google Bedrijfsprofiel (Openingstijden & capaciteit): het account dat het profiel beheert. Terug naar /openingstijden.
async function profileCallback(req:Request,code:string,state:string,denied:string|null){
 const back=(params:Record<string,string>)=>{const u=new URL('/openingstijden',process.env.APP_ORIGIN||'http://localhost:3001');for(const [k,v] of Object.entries(params))u.searchParams.set(k,v);return Response.redirect(u.toString(),302)};
 try{
  authorizeSheet(req);const by=req.headers.get('x-boer-bart-account')||'eigenaar';
  if(denied)throw new MailError(denied==='access_denied'?'De toestemming bij Google is geweigerd. Er is niets gekoppeld.':'Google gaf een fout: '+denied);
  if(!code)throw new MailError('Ongeldige terugkeer van Google. Begin opnieuw.');
  await finishProfileOAuth(code,state,by);
  return back({googleprofiel:'gekoppeld'});
 }catch(e){return back({googleprofiel:'fout',melding:e instanceof Error&&!(e instanceof TypeError)?e.message:'Koppelen mislukt.'})}
}

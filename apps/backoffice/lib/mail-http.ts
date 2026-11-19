// Shared request handling for the Gmail customer conversations (/gesprekken, /api/mail): backoffice login,
// mail access (GUEST_ACCESS), same origin for writes, and the central connection settings for every request.
import {authorizeSheet} from './sheet-access';
import {SheetError} from './sheets';
import {MailError,requireMailAccess} from './mail-store';
import {GmailError} from './gmail-api';
import {withConnectionSettings} from './connection-settings';
export const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
export function who(req:Request,write=false,send=false){authorizeSheet(req,write);const account=req.headers.get('x-boer-bart-account')||'';requireMailAccess(account,send);return account}
export function failure(e:unknown){
 if(e instanceof SheetError||e instanceof MailError||e instanceof GmailError)return json({error:e.message},e.status);
 console.error('[gesprekken]',e instanceof Error?e.message:e);
 return json({error:'Er ging iets mis. Ververs en probeer opnieuw.'},500);
}
/** Runs a route handler with the saved connection settings (Systeem & koppelingen) and uniform error answers. */
export async function handle(fn:()=>Promise<Response>){try{return await withConnectionSettings(fn)}catch(e){return failure(e)}}

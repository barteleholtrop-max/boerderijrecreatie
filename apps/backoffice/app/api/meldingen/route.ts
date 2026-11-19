import {json,who,handle} from '@/lib/mail-http';
import {MailError} from '@/lib/mail-store';
import {staffPublicKey,subscribeStaff,unsubscribeStaff,staffHasPush} from '@/lib/staff-push';
export const dynamic='force-dynamic';
// Meldingen voor medewerkers (wens eigenaar 9 november 2026): deze telefoon aan- of afmelden voor meldingen bij nieuwe gastmail
// en nieuwe aanvragen. Alleen voor wie toegang heeft tot de klantgesprekken; de aanmelding hoort bij de eigen login.
export async function GET(req:Request){return handle(async()=>{
 const account=who(req),endpoint=new URL(req.url).searchParams.get('endpoint')||'';
 return json({publicKey:staffPublicKey(),on:await staffHasPush(account,endpoint)});
})}
export async function POST(req:Request){return handle(async()=>{
 const account=who(req);const b=await req.json().catch(()=>({})) as {action?:string;subscription?:unknown;endpoint?:unknown};
 if(b.action==='aan'){await subscribeStaff(account,b.subscription);return json({ok:true,on:true})}
 if(b.action==='uit'){await unsubscribeStaff(account,b.endpoint);return json({ok:true,on:false})}
 throw new MailError('Onbekende actie.');
})}

import {json,who,handle} from '@/lib/mail-http';
import {listMetaThreads,metaStatus,requestHistory,metaCheck,metaConnect} from '@/lib/meta-store';
import {MailError} from '@/lib/mail-store';
import {isOwnerRequest} from '@/lib/owner';
export const dynamic='force-dynamic';
// WhatsApp, Messenger en Instagram in Gesprekken: de lijst en de stand van de koppeling (alleen uit de eigen opslag).
export async function GET(req:Request){return handle(async()=>{who(req);return json({status:await metaStatus(),threads:await listMetaThreads()})})}
export async function POST(req:Request){return handle(async()=>{
 who(req,true);const b=await req.json().catch(()=>({})) as {action?:string;pin?:unknown};
 if(b.action==='geschiedenis'){if(!isOwnerRequest(req))throw new MailError('Alleen een eigenaar kan de oude gesprekken ophalen.',403);await requestHistory();return json({ok:true})}
 // Koppeling controleren (alleen opvragen bij Meta) en afronden (abonneren en nummer aanmelden; alleen een eigenaar).
 if(b.action==='controleren')return json({steps:await metaCheck()});
 if(b.action==='koppelen'){if(!isOwnerRequest(req))throw new MailError('Alleen een eigenaar kan de koppeling bij Meta afronden.',403);return json(await metaConnect({pin:b.pin}))}
 throw new MailError('Onbekende actie.');
})}

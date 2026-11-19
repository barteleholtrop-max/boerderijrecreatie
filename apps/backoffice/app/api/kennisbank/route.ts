import {json,who,handle} from '@/lib/mail-http';
import {MailError} from '@/lib/mail-store';
import {listKb,saveKb,setKbStatus,proposeFromChunk} from '@/lib/kennisbank';
export const dynamic='force-dynamic';
// Kennisbank voor gastmail (wens eigenaar 9 november 2026): voor wie toegang heeft tot de klantgesprekken.
export async function GET(req:Request){return handle(async()=>{who(req);return json({items:await listKb()})})}
export async function POST(req:Request){return handle(async()=>{
 const by=who(req,true);const b=await req.json().catch(()=>({})) as Record<string,unknown>;
 if(b.action==='opslaan'){await saveKb(by,b.item);return json({items:await listKb()})}
 if(b.action==='status'){await setKbStatus(by,b.id,b.version,b.status);return json({items:await listKb()})}
 if(b.action==='voorstellen'){const added=await proposeFromChunk(by,b.source,b.note,b.text);return json({added})}
 throw new MailError('Onbekende actie.');
})}

import {json,who,handle} from '@/lib/mail-http';
import {accountStatus,listThreads,disconnect,MailError,type ThreadFilter} from '@/lib/mail-store';
import {enqueue} from '@/lib/outbox';
import {env} from '@/lib/portable/env';
import {tick} from '@/lib/assistant-jobs';
export const dynamic='force-dynamic';
const filters:ThreadFilter[]=['open','klant-wacht','wij-wachten','afgehandeld','alles'];
// Overview from the local index only: no Gmail request on a page view. Synchronisation runs in the background worker.
export async function GET(req:Request){return handle(async()=>{
 who(req);const f=new URL(req.url).searchParams.get('filter')||'open';
 if(!filters.includes(f as ThreadFilter))throw new MailError('Onbekend filter.');
 const status=await accountStatus();
 return json({status,threads:status.connected||status.threads?await listThreads(f as ThreadFilter):[]});
})}
export async function POST(req:Request){return handle(async()=>{
 who(req,true);const b=await req.json().catch(()=>({})) as {action?:string};
 if(b.action==='sync'||b.action==='full-sync'){
  const s=await accountStatus();if(!s.connected)throw new MailError('Koppel eerst Gmail.',409);
  // Repeated clicks are harmless: no new job while one is waiting or running; the sync lock prevents overlap.
  const pending=await env.DB.prepare(`SELECT 1 AS x FROM outbox_jobs WHERE kind='gmail-sync' AND (status='bezig' OR (status='wachtend' AND run_after<=?1)) LIMIT 1`).bind(new Date().toISOString()).first();
  if(!pending)await enqueue('gmail-sync:handmatig:'+Date.now()+(b.action==='full-sync'?':volledig':''),'gmail-sync',{full:b.action==='full-sync'});
  void tick();
  return json({ok:true,queued:!pending});
 }
 if(b.action==='disconnect'){await disconnect();return json({ok:true})}
 throw new MailError('Onbekende actie.');
})}

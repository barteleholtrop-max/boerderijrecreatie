// Background work queue in the central database (outbox). Jobs are idempotent by key, survive a restart and are
// retried with increasing waiting time. The worker runs inside the backoffice server; it only waits on I/O
// (speech-to-text, AI, files), so pages stay responsive. The public website is a separate app and is untouched.
import {env} from '@/lib/portable/env';
import {CLAIM_SQL,ENQUEUE_SQL,DONE_SQL,FAIL_SQL,LOCK_MINUTES,afterFailure,errorText} from './assistant-core';

export type Job={id:number;key:string;kind:string;payload:string;attempts:number};
export type JobHandler=(payload:unknown,job:Job)=>Promise<void>;

export async function enqueue(key:string,kind:string,payload:unknown={},runAfter=new Date()){
 const now=new Date().toISOString();
 await env.DB.prepare(ENQUEUE_SQL).bind(key,kind,JSON.stringify(payload),runAfter.toISOString(),now).run();
}

/** Runs at most `limit` due jobs. Unknown kinds fail visibly instead of disappearing. */
export async function runDueJobs(handlers:Record<string,JobHandler>,limit=5,now=()=>new Date()){
 let done=0;
 for(let i=0;i<limit;i++){
  const t=now(),job=await env.DB.prepare(CLAIM_SQL).bind(new Date(t.getTime()+LOCK_MINUTES*60000).toISOString(),t.toISOString()).first() as Job|null;
  if(!job)break;
  try{
   const handler=handlers[job.kind];if(!handler)throw Error('Onbekende taak: '+job.kind);
   await handler(JSON.parse(job.payload),job);
   await env.DB.prepare(DONE_SQL).bind(job.id,now().toISOString()).run();done++;
  }catch(e){
   const next=afterFailure(job.attempts,now());
   await env.DB.prepare(FAIL_SQL).bind(job.id,next.status,next.runAfter,errorText(e),now().toISOString()).run();
   console.error(`[outbox] ${job.kind} (${job.key}) poging ${job.attempts}: ${errorText(e)}`);
  }
 }
 return done;
}

export async function outboxStatus(){
 const rows=await env.DB.prepare(`SELECT status, COUNT(*) AS n FROM outbox_jobs GROUP BY status`).all();
 const failed=await env.DB.prepare(`SELECT key, kind, attempts, last_error AS "lastError", updated FROM outbox_jobs WHERE status='mislukt' ORDER BY updated DESC LIMIT 10`).all();
 return {counts:Object.fromEntries((rows.results as {status:string;n:number}[]).map(r=>[r.status,r.n])),failed:failed.results};
}

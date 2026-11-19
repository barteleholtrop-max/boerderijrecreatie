// Database access for proposals (voorstellen) shown in Goedkeuringen. A decision is saved in one transaction,
// only when the proposal is still a concept with the expected version; the decision request id is unique.
import {env} from '@/lib/portable/env';
import {decideProposal,DecisionError,GUARD_SQL,type Decision,type Proposal} from './assistant-core';
import {approvalHandlers,canApprove} from './proposal-handlers';

const COLUMNS=`id, kind, domain, title, summary, payload, status, version, thread_id AS "threadId", created_by AS "createdBy", created, decided_by AS "decidedBy", decided_at AS "decidedAt", decision_note AS "decisionNote", decision_request_id AS "decisionRequestId"`;
export type ProposalRow=Proposal&{domain:string;title:string;summary:string;payload:string;threadId:string|null;createdBy:string;created:string};

export async function listProposals(){
 const open=await env.DB.prepare(`SELECT ${COLUMNS} FROM proposals WHERE status='concept' AND kind<>'actie' ORDER BY created`).all();
 const recent=await env.DB.prepare(`SELECT ${COLUMNS} FROM proposals WHERE status<>'concept' AND kind<>'actie' ORDER BY decided_at DESC LIMIT 20`).all();
 const view=(r:ProposalRow)=>({...r,canApprove:canApprove(r.kind)});
 return {open:(open.results as ProposalRow[]).map(view),recent:(recent.results as ProposalRow[]).map(view)};
}

export async function decide(id:string,d:Decision){
 const p=await env.DB.prepare(`SELECT ${COLUMNS} FROM proposals WHERE id=?`).bind(id).first() as ProposalRow|null;
 if(!p||p.kind==='actie')throw new DecisionError('Voorstel niet gevonden.',404);
 const outcome=decideProposal(p,d,canApprove(p.kind));
 if(outcome.result==='duplicate')return 'duplicate';
 const n=outcome.proposal;
 const extra=d.action==='goedkeuren'?await approvalHandlers[p.kind as keyof typeof approvalHandlers]!(JSON.parse(p.payload),d.by,d.now):[];
 const update=env.DB.prepare(`UPDATE proposals SET status=?, version=?, decided_by=?, decided_at=?, decision_note=?, decision_request_id=? WHERE id=? AND version=? AND status='concept'`)
  .bind(n.status,n.version,n.decidedBy,n.decidedAt,n.decisionNote,n.decisionRequestId,id,p.version);
 // The guarded update runs first; if another decision won, it changes nothing and the follow-up check aborts the batch.
 const guard=env.DB.prepare(GUARD_SQL);
 try{await env.DB.batch([update,guard,...(extra as never[])])}
 catch(e){if(/besluit-conflict/i.test(String((e as Error)?.message)))throw new DecisionError('Er is intussen al over dit voorstel beslist. Ververs de pagina.',409);if(/UNIQUE|duplicate key/i.test(String((e as Error)?.message)))return 'duplicate';throw e}
 return 'changed';
}

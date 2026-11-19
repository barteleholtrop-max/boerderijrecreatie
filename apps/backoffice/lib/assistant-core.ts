// Rules for the Weekassistent foundation (fase 1). Pure functions, no database access, so they are easy to test.
// Principle: the assistant only creates concepts. Something becomes definite only through an explicit decision
// by a logged-in person, and only for a kind of proposal that has an approved handler (see lib/proposal-handlers.ts).

export const RETENTION_DAYS=14;
export const PROPOSAL_KINDS=['weekmenu','bestelling','marketing'] as const;
export type ProposalKind=typeof PROPOSAL_KINDS[number];
export type ProposalStatus='concept'|'goedgekeurd'|'afgewezen'|'vervallen';
export type Proposal={id:string;kind:string;status:ProposalStatus;version:number;decisionRequestId:string|null;decidedBy:string|null;decidedAt:string|null;decisionNote:string};
export type Decision={action:'goedkeuren'|'afwijzen';version:number;requestId:string;by:string;note:string;now:string};

export function validDecision(v:unknown):v is Omit<Decision,'by'|'now'>&{id:string}{
 const d=v as Record<string,unknown>;
 return !!d&&typeof d==='object'&&typeof d.id==='string'&&d.id.length>0&&d.id.length<=100
  &&(d.action==='goedkeuren'||d.action==='afwijzen')&&Number.isSafeInteger(d.version)&&(d.version as number)>=1
  &&typeof d.requestId==='string'&&/^[A-Za-z0-9-]{8,100}$/.test(d.requestId)
  &&typeof d.note==='string'&&d.note.length<=1000;
}

/**
 * Decides a proposal. Returns 'duplicate' for a repeated request (nothing happens twice), throws with a
 * Dutch message for a decision that is not allowed, and returns the new state otherwise.
 */
export function decideProposal(p:Proposal,d:Decision,canApprove:boolean):{result:'duplicate'}|{result:'changed';proposal:Proposal}{
 if(p.decisionRequestId===d.requestId)return {result:'duplicate'};
 if(p.status!=='concept')throw new DecisionError('Over dit voorstel is al beslist.',409);
 if(p.version!==d.version)throw new DecisionError('Het voorstel is intussen aangepast. Ververs en bekijk de nieuwe versie.',409);
 if(!d.by)throw new DecisionError('Meld je aan om te beslissen.',403);
 if(d.action==='goedkeuren'&&!canApprove)throw new DecisionError('Dit soort voorstel kan nog niet worden uitgevoerd. Het wordt pas mogelijk in een volgende fase.',400);
 if(d.action==='afwijzen'&&!d.note.trim())throw new DecisionError('Geef kort aan waarom je afwijst, zodat de assistent het beter kan doen.',400);
 return {result:'changed',proposal:{...p,status:d.action==='goedkeuren'?'goedgekeurd':'afgewezen',version:p.version+1,decisionRequestId:d.requestId,decidedBy:d.by,decidedAt:d.now,decisionNote:d.note.trim()}};
}
export class DecisionError extends Error{status:number;constructor(message:string,status:number){super(message);this.status=status}}

// ---- Outbox (background work: speech-to-text, AI calls, cleanup). Never blocks a page or the public website.
export const MAX_ATTEMPTS=8;
export const LOCK_MINUTES=10;
/** Waiting time before the next attempt: 1, 2, 4 … minutes, at most 6 hours. */
export function retryDelayMinutes(attempts:number){return Math.min(2**Math.max(0,attempts-1),360)}
export function afterFailure(attempts:number,now:Date){
 if(attempts>=MAX_ATTEMPTS)return {status:'mislukt' as const,runAfter:now.toISOString()};
 return {status:'wachtend' as const,runAfter:new Date(now.getTime()+retryDelayMinutes(attempts)*60000).toISOString()};
}
/** Claims the oldest due job atomically, also a job whose worker stopped halfway (lock expired). */
// FOR UPDATE SKIP LOCKED: met meerdere servers (Postgres) pakt elke server een andere taak; nooit twee keer dezelfde.
export const CLAIM_SQL=`UPDATE outbox_jobs SET status='bezig', attempts=attempts+1, locked_until=?1, updated=?2
 WHERE id=(SELECT id FROM outbox_jobs WHERE (status='wachtend' AND run_after<=?2) OR (status='bezig' AND locked_until<?2) ORDER BY run_after, id LIMIT 1 FOR UPDATE SKIP LOCKED)
 RETURNING id, key, kind, payload, attempts`;
export const ENQUEUE_SQL=`INSERT INTO outbox_jobs(key, kind, payload, status, attempts, run_after, created, updated) VALUES(?1, ?2, ?3, 'wachtend', 0, ?4, ?5, ?5) ON CONFLICT(key) DO NOTHING`;
export const DONE_SQL=`UPDATE outbox_jobs SET status='klaar', locked_until=NULL, last_error='', updated=?2 WHERE id=?1 AND status='bezig'`;
export const FAIL_SQL=`UPDATE outbox_jobs SET status=?2, run_after=?3, locked_until=NULL, last_error=?4, updated=?5 WHERE id=?1 AND status='bezig'`;
export function errorText(e:unknown){return (e instanceof Error?e.message:String(e)).slice(0,500)}

// ---- Retention: conversations and voice messages are kept 14 days (besluit eigenaar 31 oktober 2026).
export function retentionCutoff(now:Date,days=RETENTION_DAYS){return new Date(now.getTime()-days*86400000).toISOString()}

// ---- Weeks are identified by their Monday (YYYY-MM-DD, Europe/Amsterdam).
export function amsterdamDate(now:Date){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(now)}
export function mondayOf(day:string){
 const d=new Date(day+'T12:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||Number.isNaN(d.getTime()))throw Error('Ongeldige datum.');
 d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);
}
export const CLEANUP_AUDIO_SQL=`SELECT audio_key AS k FROM assistant_messages WHERE created<?1 AND audio_key IS NOT NULL`;
export const CLEANUP_SQL=[
 `DELETE FROM assistant_messages WHERE created<?1`,
 `DELETE FROM assistant_threads WHERE updated<?1 AND NOT EXISTS (SELECT 1 FROM assistant_messages m WHERE m.thread_id=assistant_threads.id)`,
];
export const CLEANUP_JOBS_SQL=`DELETE FROM outbox_jobs WHERE status='klaar' AND updated<?1`;
/** Aborts a batch when the preceding guarded UPDATE changed no row (someone else decided first). */
// Bewaking in een batch: de vorige opdracht moet precies één rij hebben gewijzigd, anders stopt de hele batch met de fout
// „besluit-conflict” (zie DB.batch in lib/portable/env.ts). Vroeger SQLite changes(); nu ook geldig in Postgres.
export const GUARD_SQL=`SELECT 'besluit-conflict' AS guard`;
/** The week a new weekgesprek is about: on Monday and Tuesday the current week, from Wednesday the next one. */
export function upcomingWeek(today:string){
 const monday=mondayOf(today),weekday=(new Date(today+'T12:00:00Z').getUTCDay()+6)%7; // 0 = Monday
 if(weekday<=1)return monday;
 const d=new Date(monday+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+7);return d.toISOString().slice(0,10);
}
export function validMessageText(v:unknown):v is string{return typeof v==='string'&&v.trim().length>0&&v.length<=4000}
export const validRequestId=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9-]{8,100}$/.test(v);

// Foto bij een bericht (wens eigenaar 13 november 2026: „Er moet ook een foto kunnen uploaden om informatie uit te halen”).
// De browser verkleint de foto eerst (app/foto.ts); hier alleen een gangbaar beeldformaat en maximaal ± 3 MB.
export type Photo={mediaType:'image/jpeg'|'image/png'|'image/webp'|'image/gif';data:string};
export const PHOTO_MAX_CHARS=4_000_000;
export function validPhoto(v:unknown):Photo|null{
 if(!v||typeof v!=='object')return null;
 const p=v as Record<string,unknown>;
 if(!['image/jpeg','image/png','image/webp','image/gif'].includes(String(p.mediaType)))return null;
 if(typeof p.data!=='string'||p.data.length<100||p.data.length>PHOTO_MAX_CHARS||!/^[A-Za-z0-9+/]+={0,2}$/.test(p.data))return null;
 return {mediaType:p.mediaType as Photo['mediaType'],data:p.data};
}
/** Tekst van een bericht met foto: zonder eigen tekst vraagt de foto zelf om uitleg. */
export const photoText=(text:unknown,photo:Photo|null)=>typeof text==='string'&&text.trim()?text.trim():photo?'Wat zie je op deze foto? Haal de informatie eruit en zeg wat je ermee kunt doen.':'';
export const photoBlock=(p:Photo)=>({type:'image',source:{type:'base64',media_type:p.mediaType,data:p.data}});
/** Heeft een opgeslagen bericht een foto? (voor het pictogram in het gesprek, zonder de foto zelf mee te sturen) */
export const hasPhoto=(content:string)=>content.includes('"type":"image"');

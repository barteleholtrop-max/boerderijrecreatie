import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import './helpers/ts-resolve.mjs';
import {pgDb} from './helpers/pg-db.mjs';
import {decideProposal,validDecision,retryDelayMinutes,afterFailure,MAX_ATTEMPTS,retentionCutoff,mondayOf,CLAIM_SQL,ENQUEUE_SQL,DONE_SQL,FAIL_SQL,CLEANUP_AUDIO_SQL,CLEANUP_SQL,CLEANUP_JOBS_SQL,GUARD_SQL} from '../lib/assistant-core.ts';

// De oude wachtwoordlogins (lib/accounts.ts) zijn vervangen door inloggen via Supabase met Authenticator (besluit eigenaar
// 6 november 2026); zie tests/login.test.mjs.

const concept={id:'v1',kind:'weekmenu',status:'concept',version:1,decisionRequestId:null,decidedBy:null,decidedAt:null,decisionNote:''};
const decision=(o={})=>({action:'afwijzen',version:1,requestId:'req-00001',by:'rianne',note:'Liever soep',now:'2026-11-02T08:00:00.000Z',...o});

test('voorstellen: alleen een mens beslist, één keer, over de versie die hij zag',()=>{
 const r=decideProposal(concept,decision(),false);
 assert.equal(r.result,'changed');assert.equal(r.proposal.status,'afgewezen');assert.equal(r.proposal.version,2);assert.equal(r.proposal.decidedBy,'rianne');assert.equal(r.proposal.decisionNote,'Liever soep');
 assert.equal(decideProposal(r.proposal,decision(),false).result,'duplicate');
 assert.throws(()=>decideProposal(r.proposal,decision({requestId:'req-00002'}),false),/al beslist/);
 assert.throws(()=>decideProposal(concept,decision({version:2}),false),/aangepast/);
 assert.throws(()=>decideProposal(concept,decision({by:''}),false),/Meld je aan/);
 assert.throws(()=>decideProposal(concept,decision({note:'  '}),false),/waarom/);
});

test('goedkeuren kan alleen voor een soort voorstel waarvan de uitvoering gebouwd is',()=>{
 assert.throws(()=>decideProposal(concept,decision({action:'goedkeuren',note:''}),false),/volgende fase/);
 const ok=decideProposal(concept,decision({action:'goedkeuren',note:''}),true);assert.equal(ok.proposal.status,'goedgekeurd');
});

test('beslisaanvraag wordt streng gecontroleerd',()=>{
 const ok={id:'v1',action:'goedkeuren',version:1,requestId:'0d6f9c1e-6a2b-4c4f',note:''};
 assert.ok(validDecision(ok));
 for(const bad of [{...ok,action:'uitvoeren'},{...ok,version:0},{...ok,version:'1'},{...ok,requestId:'x'},{...ok,note:'x'.repeat(1001)},{...ok,id:''},null])assert.equal(validDecision(bad),false);
});

test('achtergrondtaken: oplopende wachttijd en na 8 pogingen zichtbaar mislukt',()=>{
 assert.deepEqual([1,2,3,4,10].map(retryDelayMinutes),[1,2,4,8,360]);
 const now=new Date('2026-11-02T08:00:00.000Z');
 assert.deepEqual(afterFailure(1,now),{status:'wachtend',runAfter:'2026-11-02T08:01:00.000Z'});
 assert.equal(afterFailure(MAX_ATTEMPTS,now).status,'mislukt');
});

test('outbox: een taak wordt één keer aangemaakt, één keer opgepakt en na een vastgelopen poging opnieuw',async t=>{
 const db=await pgDb(),t0='2026-11-02T08:00:00.000Z',later='2026-11-02T08:20:00.000Z',lock='2026-11-02T08:10:00.000Z';t.after(()=>db.close());
 await db.run(ENQUEUE_SQL,'opruimen:2026-11-02','opruimen-gesprekken','{}',t0,t0);await db.run(ENQUEUE_SQL,'opruimen:2026-11-02','opruimen-gesprekken','{}',t0,t0);
 assert.equal((await db.get('SELECT COUNT(*) AS n FROM outbox_jobs')).n,1);
 const claim=(a,b)=>db.get(CLAIM_SQL,a,b);
 assert.equal(await claim(lock,'2026-11-02T07:59:00.000Z'),undefined,'nog niet aan de beurt');
 const job=await claim(lock,t0);assert.equal(job.kind,'opruimen-gesprekken');assert.equal(job.attempts,1);
 assert.equal(await claim(lock,t0),undefined,'bezig met geldig slot: niet dubbel oppakken');
 const again=await claim('2026-11-02T08:30:00.000Z',later);assert.equal(again.id,job.id,'slot verlopen: opnieuw oppakken');assert.equal(again.attempts,2);
 await db.run(FAIL_SQL,job.id,'wachtend','2026-11-02T08:22:00.000Z','Tijdelijke storing',later);
 assert.equal(await claim(lock,later),undefined);
 const third=await claim('2026-11-02T08:40:00.000Z','2026-11-02T08:22:00.000Z');assert.equal(third.attempts,3);
 await db.run(DONE_SQL,job.id,'2026-11-02T08:23:00.000Z');
 assert.equal((await db.get('SELECT status FROM outbox_jobs')).status,'klaar');
 assert.equal(await claim('2026-11-03T09:00:00.000Z','2026-11-03T08:00:00.000Z'),undefined);
});

test('outbox: twee servers tegelijk pakken nooit dezelfde taak op',async t=>{
 const db=await pgDb(),t0='2026-11-02T08:00:00.000Z';t.after(()=>db.close());
 for(const k of ['a','b'])await db.run(ENQUEUE_SQL,k,'x','{}',t0,t0);
 const both=await Promise.all([db.tx(tx=>tx.get(CLAIM_SQL,'2026-11-02T08:10:00.000Z',t0)),db.tx(tx=>tx.get(CLAIM_SQL,'2026-11-02T08:10:00.000Z',t0))]);
 assert.deepEqual(both.map(j=>j.key).sort(),['a','b']);
});

test('bewaartermijn: gesprekken en spraak na 14 dagen weg, weekmenu en beslissingen blijven',async t=>{
 const db=await pgDb(),now=new Date('2026-11-16T08:00:00.000Z'),cutoff=retentionCutoff(now);t.after(()=>db.close());
 assert.equal(cutoff,'2026-11-02T08:00:00.000Z');
 await db.exec(`INSERT INTO assistant_threads(id,domain,week,account,title,status,created,updated) VALUES('oud','keuken','2026-10-26','rianne','',  'open','2026-10-26T07:00:00Z','2026-10-27T07:00:00Z');
  INSERT INTO assistant_threads(id,domain,week,account,title,status,created,updated) VALUES('lopend','keuken','2026-11-02','rianne','','open','2026-10-30T07:00:00Z','2026-11-15T07:00:00Z');
  INSERT INTO assistant_messages(id,thread_id,seq,role,text,audio_key,created) VALUES('m1','oud',1,'user','boerenkool','aaaaaaaa-0000-4000-8000-000000000001','2026-10-27T07:00:00Z');
  INSERT INTO assistant_messages(id,thread_id,seq,role,text,created) VALUES('m2','lopend',1,'user','oude zin','2026-10-30T07:00:00Z');
  INSERT INTO assistant_messages(id,thread_id,seq,role,text,audio_key,created) VALUES('m3','lopend',2,'user','soep','aaaaaaaa-0000-4000-8000-000000000003','2026-11-15T07:00:00Z');
  INSERT INTO week_menus(id,week,status,thread_id,created,updated) VALUES('w1','2026-10-26','bevestigd','oud','2026-10-27T07:00:00Z','2026-10-27T07:00:00Z');
  INSERT INTO proposals(id,request_id,kind,domain,title,status,created_by,created,decided_by,decided_at) VALUES('v1','r1','weekmenu','keuken','Weekmenu','afgewezen','assistent','2026-10-27T07:00:00Z','rianne','2026-10-27T08:00:00Z');
  INSERT INTO outbox_jobs(key,kind,status,run_after,created,updated) VALUES('a','x','klaar','x','x','2026-10-01T00:00:00Z'),('b','x','mislukt','x','x','2026-10-01T00:00:00Z');`);
 assert.deepEqual((await db.all(CLEANUP_AUDIO_SQL,cutoff)).map(r=>r.k),['aaaaaaaa-0000-4000-8000-000000000001']);
 for(const q of CLEANUP_SQL)await db.run(q,cutoff);
 await db.run(CLEANUP_JOBS_SQL,retentionCutoff(now,30));
 assert.deepEqual((await db.all('SELECT id FROM assistant_messages ORDER BY id')).map(r=>r.id),['m3']);
 assert.deepEqual((await db.all('SELECT id FROM assistant_threads')).map(r=>r.id),['lopend']);
 assert.equal((await db.get('SELECT COUNT(*) AS n FROM week_menus')).n,1);
 assert.equal((await db.get('SELECT COUNT(*) AS n FROM proposals')).n,1);
 assert.deepEqual((await db.all('SELECT key FROM outbox_jobs')).map(r=>r.key),['b'],'mislukte taken blijven zichtbaar');
});

test('per week kan maar één weekmenu bevestigd zijn; concepten mogen naast elkaar bestaan',async t=>{
 const db=await pgDb(),add=(...v)=>db.run(`INSERT INTO week_menus(id,week,status,created,updated) VALUES(?,?,?,'x','x')`,...v);t.after(()=>db.close());
 await add('a','2026-11-02','concept');await add('b','2026-11-02','concept');await add('c','2026-11-02','bevestigd');
 await assert.rejects(add('d','2026-11-02','bevestigd'),/duplicate key/);
 await add('e','2026-11-09','bevestigd');
});

test('besluit opslaan: als een ander net eerder besliste, wordt niets opgeslagen',async t=>{
 // Via de echte databaselaag (env.DB.batch met de bewaking), op een verse PGlite-database.
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'bb-besluit-'));process.env.APP_DATA_DIR=tmp;
 const {env,closeDatabase}=await import('../lib/portable/env.ts');t.after(async()=>{process.env.APP_DATA_DIR=tmp;await closeDatabase();fs.rmSync(tmp,{recursive:true,force:true})});
 await env.DB.prepare(`INSERT INTO proposals(id,request_id,kind,domain,title,created_by,created) VALUES('v1','r1','weekmenu','keuken','Weekmenu','assistent','x')`).run();
 const batch=id=>env.DB.batch([env.DB.prepare(`UPDATE proposals SET status='afgewezen', version=2, decision_request_id=? WHERE id='v1' AND version=1 AND status='concept'`).bind(id),env.DB.prepare(GUARD_SQL)]);
 await batch('besluit-1');
 await assert.rejects(batch('besluit-2'),/besluit-conflict/);
 assert.equal((await env.DB.prepare(`SELECT decision_request_id AS d FROM proposals`).first()).d,'besluit-1');
});

test('week wordt aangeduid met de maandag',()=>{
 assert.equal(mondayOf('2026-11-02'),'2026-11-02');assert.equal(mondayOf('2026-11-08'),'2026-11-02');assert.equal(mondayOf('2026-11-05'),'2026-11-02');
 assert.throws(()=>mondayOf('2-11-2026'));
});

test('instellingsfout: de reden van Claude staat in het gesprek, zonder sleutel',async()=>{
 const {configErrorNote}=await import('../lib/assistant-engine.ts');
 assert.match(configErrorNote(401,'invalid x-api-key','claude-opus-5-5'),/sleutel wordt geweigerd.*Systeem & koppelingen/);
 assert.match(configErrorNote(404,'model: claude-x','claude-x'),/Model claude-x is niet beschikbaar/);
 assert.match(configErrorNote(400,'400 {"type":"error","error":{"type":"invalid_request_error","message":"This API key is not scoped to a workspace, so this request must include the anthropic-workspace-id header"}}','claude-opus-5-5'),/persoonlijke sleutel.*Claude werkruimte-ID/,'zonder werkruimte: duidelijke uitleg in het Nederlands');
 const n=configErrorNote(400,'Schema is too complex for compilation. key sk-ant-api03-abcDEF_123','claude-opus-5-5');
 assert.match(n,/Reden van Claude \(400\): Schema is too complex/);
 assert.doesNotMatch(n,/sk-ant-/);
 assert.ok(configErrorNote(400,'x'.repeat(1000),'m').length<450);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {openStore} from '../tools/website-dev/store.mjs';
import {dailyMerge, mergeGithub, verifyLatestBoard} from '../tools/website-dev/daily-merge.mjs';
import {digest} from '../tools/website-dev/development.mjs';
import {ownerAPI} from '../tools/website-dev/owner-api.mjs';

const head = 'a'.repeat(40), base = 'b'.repeat(40), combined = 'c'.repeat(40), merged = 'd'.repeat(40);
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-development-')); let store = openStore(dir), counter = 0;
  const board = {revision: 55, source: 'test', topics: [{id: 'topic', title: 'Reserveren', status: 'Afgesproken', decisionDigest: digest(['', ''])}]};
  t.after(() => {store.close(); fs.rmSync(dir, {recursive: true, force: true});});
  function create() {
    let p = store.mutate({id: randomUUID(), requestId: randomUUID(), revision: 0, action: 'save', description: 'Verbetering', component: 'Knop', pageUrl: 'http://localhost:3002/', topicId: 'topic'}, 'owner', board, 'http://localhost:3002');
    return store.manage({requestId: randomUUID(), action: 'approve', items: [{id: p.id, revision: p.revision}], reference: 'Centrale beslissing', boardConfirmed: true}, 'owner', board)[0];
  }
  function assign(p, extra = {}) {
    return store.developmentUpdate({id: p.id, proposalRevision: p.revision, revision: p.development?.revision || 0, action: 'assign', developer: 'Codex', branch: 'feat/test-'+(++counter), pullRequest: counter, headSha: head, note: 'Werk toegewezen', dependencies: [], ...extra}, 'owner', board);
  }
  function advance(p, status) { return store.developmentUpdate({id: p.id, proposalRevision: p.revision, revision: p.development.revision, action: 'advance', status, note: 'Gedrag getest op de gekoppelde commit'}, 'owner', board); }
  function ready(extra = {}) { let p = assign(create(), extra); for (const s of ['Klaar om te testen','Getest','Klaar om samen te voegen']) p = advance(p, s); return p; }
  const items = ps => ps.map(p => ({id: p.id, proposalRevision: p.revision, revision: p.development.revision}));
  return {get store(){return store;}, board, create, assign, advance, ready, items, restart(){store.close();store=openStore(dir);}};
}
function fakeGithub() {
  let main = base, tests = true, valid = true, mergedResult = false, calls = 0;
  return {set mainSha(v){main=v;},set tests(v){tests=v;},set valid(v){valid=v;},get calls(){return calls;},
    async protection(){}, async main(){return main;}, async validate(){assert.ok(valid, 'PR changed');},
    async prepare(){return {head:combined, branch:'integration/test', pullRequest:100, url:'https://github.com/example/repo/pull/100'};},
    async tested(){assert.ok(tests,'tests failed');return {headSha:combined,runId:10};},
    async pull(){return {state:'open',draft:false,head:{sha:combined},base:{ref:'main',sha:base},mergeable:true,mergeable_state:'clean',merged:mergedResult,merge_commit_sha:merged};},
    async merge(){calls++;mergedResult=true;return merged;},
  };
}
const run = (f, github, action, input, extra={}) => dailyMerge({store:f.store,board:f.board,actor:'owner',github,action,input,verifyBoard:async()=>{},enabled:true,...extra});

test('development preserves board, legacy approvals and durable history; reassignment invalidates testing', t=>{
  const f=fixture(t), before=JSON.stringify(f.board), p=f.ready();
  assert.equal(f.store.collection()[0].development.developer,'Codex');
  assert.equal(f.store.collection()[0].status,'Goedgekeurd');
  assert.equal(p.development.testEvidence.headSha,head);
  assert.throws(()=>f.advance(p,'Doorgevoerd'),/uitsluitend/);
  assert.throws(()=>f.assign({...p,development:{revision:0}}),/gewijzigd/);
  assert.throws(()=>f.store.manage({action:'delete',requestId:randomUUID(),items:[{id:p.id,revision:p.revision}]},'owner',f.board),/in ontwikkeling/);
  const reset=f.assign(p,{headSha:base,developer:'Claude Code'});
  assert.equal(reset.development.status,'In ontwikkeling');assert.equal(reset.development.testEvidence,null);
  f.restart();assert.equal(f.store.collection()[0].development.history.length,5);assert.equal(JSON.stringify(f.board),before);
});

test('selection checks revisions, dependencies, cycles and unchanged board approval',t=>{
  const f=fixture(t), a=f.ready(), b=f.ready({dependencies:[a.id]});
  assert.throws(()=>f.store.developmentSelection(f.items([b]),f.board),/afhankelijkheden/);
  assert.deepEqual(f.store.developmentSelection(f.items([b,a]),f.board).map(p=>p.id),[a.id,b.id]);
  assert.throws(()=>f.store.developmentSelection(f.items([a,a]),f.board),/unieke/);
  const changed=f.assign(a,{dependencies:[b.id]});
  let circular=changed;for(const s of ['Klaar om te testen','Getest','Klaar om samen te voegen'])circular=f.advance(circular,s);
  assert.throws(()=>f.store.developmentSelection(f.items([b,circular]),f.board),/kring/);
  f.board.topics[0].decisionDigest='revoked';assert.throws(()=>f.assign(b),/planbordgoedkeuring/);
});

test('preflight creates only candidate; explicit confirmation gates one combined merge',async t=>{
  const f=fixture(t), github=fakeGithub(), p=f.ready(), b=await run(f,github,'prepare',{items:f.items([p])});
  assert.equal(b.state,'testing');assert.equal(github.calls,0);
  assert.throws(()=>f.assign(p),/samenvoegcontrole/);
  assert.equal((await run(f,github,'check',{batchId:b.id})).state,'ready');
  await assert.rejects(run(f,github,'confirm',{batchId:b.id,confirmed:true}),/expliciet/);
  assert.equal(github.calls,0);
  const result=await run(f,github,'confirm',{batchId:b.id,confirmed:true,confirmation:`SAMENVOEGEN ${b.id}`});
  assert.equal(result.state,'merged');assert.equal(github.calls,1);assert.equal(f.store.collection()[0].development.status,'Doorgevoerd');
  await assert.rejects(run(f,github,'confirm',{batchId:b.id,confirmed:true,confirmation:`SAMENVOEGEN ${b.id}`}),/nieuwe controle/);
  f.restart();assert.equal(f.store.mergeBatch(b.id).confirmedBy,'owner');assert.equal(f.store.collection()[0].development.history.at(-1).mergeCommit,merged);
});

test('disabled merges, unreachable live board, failed tests, moved main and changed PR all block',async t=>{
  const f=fixture(t), github=fakeGithub(), p=f.ready(), input={items:f.items([p])};
  await assert.rejects(run(f,github,'prepare',input,{enabled:false}),/staat uit/);
  await assert.rejects(run(f,github,'prepare',input,{verifyBoard:async()=>{throw Error('live unavailable');}}),/live unavailable/);
  const b=await run(f,github,'prepare',input);
  github.tests=false;await assert.rejects(run(f,github,'check',{batchId:b.id}),/tests failed/);
  github.tests=true;github.mainSha=head;await assert.rejects(run(f,github,'check',{batchId:b.id}),/Main is gewijzigd/);
  github.mainSha=base;github.valid=false;await assert.rejects(run(f,github,'check',{batchId:b.id}),/PR changed/);
  github.valid=true;f.board.revision++;await assert.rejects(run(f,github,'check',{batchId:b.id}),/planbord is gewijzigd/);
  assert.equal(github.calls,0);
  await run(f,github,'cancel',{batchId:b.id});assert.doesNotThrow(()=>f.assign(p));
});

test('concurrent confirmations and lost merge responses cannot replay main writes',async t=>{
  const f=fixture(t), github=fakeGithub(), p=f.ready(), b=await run(f,github,'prepare',{items:f.items([p])});
  await run(f,github,'check',{batchId:b.id});
  const realMerge=github.merge;github.merge=async()=>{await realMerge();throw Error('lost response');};
  const input={batchId:b.id,confirmed:true,confirmation:`SAMENVOEGEN ${b.id}`};
  const results=await Promise.allSettled([run(f,github,'confirm',input),run(f,github,'confirm',input)]);
  assert.equal(github.calls,1);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(f.store.mergeBatch(b.id).state,'uncertain');f.restart();
  assert.equal((await run(f,github,'recover',{batchId:b.id})).state,'merged');assert.equal(github.calls,1);
});

test('live verification requires an exact revision and decision digest, uses HTTPS and never follows redirects',async()=>{
  const env={PROPOSALS_BOARD_URL:'https://board.example/api/board',PLANBORD_LEESSLEUTEL:'s'.repeat(40)};
  const nodes=[{id:'n',title:'T',status:'Afgesproken',body:'Besluit',notes:'Notitie'}];
  const board={revision:55,topics:nodes.map(n=>({id:n.id,title:n.title,status:n.status,decisionDigest:digest([n.body,n.notes])}))};
  let options;
  const fetcher=async(url,o)=>{options=o;return {ok:true,json:async()=>({revision:55,board:{nodes}})};};
  await verifyLatestBoard(board,env,fetcher);assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer '+'s'.repeat(40));
  await assert.rejects(verifyLatestBoard({...board,revision:54},env,fetcher),/nieuwere of afwijkende/);
  await assert.rejects(verifyLatestBoard(board,{},fetcher),/Configureer/);
  await assert.rejects(verifyLatestBoard(board,{...env,PROPOSALS_BOARD_URL:'http://board.example/api/board'},fetcher),/HTTPS/);
});

test('GitHub adapter enforces protected main and exact workflow run; combines only into integration branch',async()=>{
  const calls=[], repo='example/repo';let strict=true, ciHead=head;
  const api=mergeGithub(repo,async(method,endpoint,payload)=>{
    calls.push({method,endpoint,payload});
    if(endpoint.endsWith('/protection'))return {enforce_admins:{enabled:true},required_status_checks:{strict,contexts:['build']},required_pull_request_reviews:{required_approving_review_count:1,dismiss_stale_reviews:true}};
    if(endpoint.includes('/actions/'))return {workflow_runs:[{id:5,head_sha:ciHead,event:'push',status:'completed',conclusion:'success'}]};
    if(endpoint.endsWith('/git/refs'))return {};
    if(endpoint.endsWith('/merges'))return {sha:combined};
    if(method==='POST'&&endpoint.endsWith('/pulls'))return {number:8,html_url:'https://github.com/example/repo/pull/8'};
    if(method==='PUT')return {merged:true,sha:merged};
  });
  await api.protection();strict=false;await assert.rejects(api.protection(),/Bescherm main/);
  await api.tested(head);ciHead=base;await assert.rejects(api.tested(head),/exacte commit/);
  const candidate=await api.prepare({id:randomUUID(),proposals:[{id:randomUUID(),development:{headSha:head,pullRequest:2}}]},base);
  assert.ok(calls.filter(c=>c.endpoint.endsWith('/merges')).every(c=>c.payload.base.startsWith('integration/daily-')));
  assert.equal(calls.some(c=>c.method==='PUT'),false);
  await api.merge(candidate);assert.equal(calls.at(-1).payload.sha,combined);
});

test('owner API exposes central development and exports for both tools without credentials',async t=>{
  const f=fixture(t);f.ready();
  for(const target of ['codex','claude']){
    const response=await ownerAPI({pathname:`/__dev/development/export/${target}`,method:'GET',store:f.store,board:()=>f.board});
    assert.equal(response.status,200);const text=await response.text();assert.match(text,/Codex|Claude Code/);assert.match(text,/In ontwikkeling|Klaar om samen te voegen/);assert.doesNotMatch(text,/PLANBOARD_AUTH_PASSWORD/);
  }
});

test('cancellation wins over a recheck already in progress',async t=>{
  const f=fixture(t), github=fakeGithub(), p=f.ready();
  const b=await run(f,github,'prepare',{items:f.items([p])});
  let continueTests, entered;
  const gate=new Promise(resolve=>{continueTests=resolve;});
  const started=new Promise(resolve=>{entered=resolve;});
  github.tested=async()=>{entered();await gate;return {headSha:combined};};
  const checking=run(f,github,'check',{batchId:b.id});await started;
  await run(f,github,'cancel',{batchId:b.id});continueTests();
  await assert.rejects(checking,/al gestart/);
  assert.equal(f.store.mergeBatch(b.id).state,'cancelled');assert.equal(github.calls,0);
});

// Snelle backoffice in de proefomgeving (besluit eigenaar 4 november 2026): alleen bouwen als de code veranderd is.
test('backoffice-bouw: alleen opnieuw bouwen na een update of een lokale wijziging', async () => {
  const {buildKey, needsBuild, markBuilt} = await import('../tools/backoffice-build.mjs');
  const fsm = await import('node:fs'), os = await import('node:os'), p = await import('node:path');
  const app = fsm.mkdtempSync(p.join(os.tmpdir(), 'bouw-'));
  const key = buildKey('abc123', '');
  assert.equal(key, 'abc123');
  assert.notEqual(buildKey('abc123', ' M apps/backoffice/app/page.tsx\n'), key, 'lokale wijziging geeft een andere sleutel');
  assert.equal(needsBuild(app, key), true, 'nog nooit gebouwd');
  fsm.mkdirSync(p.join(app, '.next/standalone'), {recursive: true});
  fsm.writeFileSync(p.join(app, '.next/BUILD_ID'), 'x'); fsm.writeFileSync(p.join(app, '.next/standalone/server.js'), '');
  assert.equal(needsBuild(app, key), true, 'gebouwd, maar niet door het startscript');
  markBuilt(app, key);
  assert.equal(needsBuild(app, key), false, 'actueel: direct starten');
  assert.equal(needsBuild(app, buildKey('def456', '')), true, 'na een update opnieuw bouwen');
  fsm.rmSync(p.join(app, '.next/standalone/server.js'));
  assert.equal(needsBuild(app, key), true, 'onvolledige bouw: opnieuw');
  fsm.rmSync(app, {recursive: true, force: true});
});

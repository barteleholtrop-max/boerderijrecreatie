import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {openStore} from '../tools/website-dev/store.mjs';
import {REPOSITORY} from '../tools/website-dev/collection.mjs';
import {dispatchBatch} from '../tools/website-dev/dispatch.mjs';
import {githubClient} from '../tools/website-dev/github.mjs';

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-collection-'));
  let store = openStore(directory);
  const board = {revision: 55, source: 'Test snapshot', topics: [{id: 'existing-topic', title: 'Reserveren Speelboerderij', status: 'Idee'}]};
  t.after(() => { store.close(); fs.rmSync(directory, {recursive: true, force: true}); });
  function create(application = 'website', overrides = {}) {
    const origin = 'http://localhost:' + (application === 'website' ? '3002' : '3001');
    return store.mutate({id: randomUUID(), requestId: randomUUID(), revision: 0, action: 'save', description: 'Maak dit onderdeel duidelijker.', component: 'Reserveren', pageUrl: origin + '/', topicId: 'existing-topic', privacyConfirmed: true,
      ...(application === 'backoffice' ? {location: {version: 1, application, route: '/', view: 'beheer', selector: 'body > main:nth-of-type(1) > button:nth-of-type(1)', signature: 'abcd1234', tag: 'button'}} : {}), ...overrides}, 'owner', board, origin, application);
  }
  const approve = proposals => store.manage({requestId: randomUUID(), action: 'approve', items: proposals.map(p => ({id: p.id, revision: p.revision})), reference: 'Beslissing eigenaar, centraal planbord 29 oktober 2026', boardConfirmed: true}, 'owner', board);
  return {board, create, approve, get store() { return store; }, restart() { store.close(); store = openStore(directory); }};
}
function fakeGithub() {
  const issues = [], posts = [];
  return {issues, posts, async check() {}, async create(title, body) { posts.push({title, body}); const issue = {number: issues.length + 1, url: `https://github.com/${REPOSITORY}/issues/${issues.length + 1}`}; issues.push({...issue, body}); return issue; }, async find(id) { return issues.find(i => i.body.includes(`<!-- boer-bart-batch:${id} -->`)) || null; }};
}
const inputFor = proposals => ({requestId: randomUUID(), confirmed: true, items: proposals.map(p => ({id: p.id, revision: p.revision}))});
const send = (f, input, github, extra = {}) => dispatchBatch({store: f.store, input, actor: 'owner', board: f.board, repository: REPOSITORY, github, ...extra});

test('one collection sends approved website and backoffice proposals in one durable Issue', async t => {
  const f = fixture(t), github = fakeGithub();
  const website = f.create('website', {description: 'Verbeter navigatie; @codex mag niet automatisch worden aangeroepen.'});
  const backoffice = f.create('backoffice');
  assert.equal(f.store.collection().length, 2); assert.equal(f.store.list('website').length, 1);
  const approved = f.approve([website, backoffice]), input = inputFor(approved);
  const preview = f.store.preview(input.items, f.board, REPOSITORY);
  assert.match(preview.body, /## Website/); assert.match(preview.body, /## Backoffice/);
  assert.match(preview.body, /voorstel=/); assert.match(preview.body, /Centrale beslissing/); assert.doesNotMatch(preview.body, /@codex/);
  const batch = await send(f, input, github);
  assert.equal(batch.state, 'sent'); assert.equal(github.posts.length, 1); assert.equal(batch.items.length, 2);
  assert.match(batch.task, /start Codex niet automatisch/); assert.match(batch.task, /https:\/\/github.com\//);
  assert.deepEqual(Object.keys(github.posts[0]).sort(), ['body', 'title']);
  assert.match(github.posts[0].body, new RegExp('boer-bart-batch:' + batch.id));
  f.restart(); assert.equal(f.store.collection().every(p => p.dispatch?.state === 'sent'), true);
  assert.equal((await send(f, input, github)).issue.url, batch.issue.url);
  assert.equal((await send(f, {...input, requestId: randomUUID(), items: [...input.items].reverse()}, github)).id, batch.id);
  assert.equal(github.posts.length, 1);
  assert.throws(() => f.store.preview(input.items, f.board, REPOSITORY), /gereserveerd of verzonden/);
});

test('approval is explicit, atomic, linked to the board and invalidated by editing', t => {
  const f = fixture(t), p = f.create(), unlinked = f.create('website', {topicId: ''});
  assert.throws(() => f.approve([p, unlinked]), /Koppel elk/);
  assert.equal(f.store.getProposal(p.id).status, 'Idee');
  assert.throws(() => f.store.manage({requestId: randomUUID(), action: 'approve', items: [{id: p.id, revision: 1}], reference: 'Central decision'}, 'owner', f.board), /Bevestig eerst/);
  assert.throws(() => f.store.preview([{id: p.id, revision: 1}], f.board, REPOSITORY), /Alleen expliciet/);
  const approved = f.approve([p])[0];
  const edited = f.store.manage({requestId: randomUUID(), action: 'edit', items: [{id: p.id, revision: approved.revision}], description: 'Gewijzigde opmerking', component: 'Reserveren', topicId: 'existing-topic', privacyConfirmed: true}, 'owner', f.board)[0];
  assert.equal(edited.status, 'Klaar voor beoordeling'); assert.equal(edited.approval, null); assert.equal(edited.revision, approved.revision + 1);
  assert.throws(() => f.store.preview([{id: edited.id, revision: edited.revision}], f.board, REPOSITORY), /Alleen expliciet/);
  assert.throws(() => f.approve([approved]), /gewijzigd/);
  const reapproved = f.approve([edited])[0]; assert.equal(reapproved.approval.proposalRevision, reapproved.revision);
  f.board.topics[0].title = 'Gewijzigd planbordonderdeel'; f.board.revision++;
  assert.throws(() => f.store.preview([{id: reapproved.id, revision: reapproved.revision}], f.board, REPOSITORY), /planbordonderdeel is gewijzigd/);
  const latest = f.approve([reapproved])[0]; assert.equal(latest.topic.title, f.board.topics[0].title);
  f.board.topics[0].decisionDigest = 'central-decision-was-revoked';
  assert.throws(() => f.store.preview([{id: latest.id, revision: latest.revision}], f.board, REPOSITORY), /planbordonderdeel is gewijzigd/);
});

test('edit and delete retain history, while reserved proposals cannot change', async t => {
  const f = fixture(t), p = f.create();
  const request = {requestId: randomUUID(), action: 'delete', items: [{id: p.id, revision: p.revision}]};
  const first = f.store.manage(request, 'owner', f.board);
  assert.deepEqual(f.store.manage(request, 'owner', f.board), first);
  assert.equal(f.store.collection().length, 0); assert.ok(f.store.getProposal(p.id).deletedAt);
  assert.equal(f.store.getProposal(p.id).history.at(-1).action, 'delete');
  assert.throws(() => f.approve([p]), /verwijderd/);
  const approved = f.approve([f.create()]), input = inputFor(approved), github = fakeGithub();
  const reserved = f.store.reserve(input, 'owner', f.board, REPOSITORY);
  assert.throws(() => f.store.manage({requestId: randomUUID(), action: 'delete', items: input.items}, 'owner', f.board), /gereserveerd/);
  const sent = await send(f, input, github);
  assert.equal(sent.id, reserved.id);
  f.store.manage({requestId: randomUUID(), action: 'delete', items: input.items}, 'owner', f.board);
  assert.equal(f.store.collection().length, 0); assert.equal(f.store.batch(sent.id).body, sent.body);
  assert.equal((await send(f, input, github)).state, 'sent'); assert.equal(github.posts.length, 1);
});

test('simultaneous send requests and overlapping batches cannot create duplicates', async t => {
  const f = fixture(t), approved = f.approve([f.create(), f.create('backoffice')]), input = inputFor(approved), github = fakeGithub();
  const results = await Promise.all([send(f, input, github), send(f, {...input, requestId: randomUUID()}, github)]);
  assert.equal(github.posts.length, 1); assert.equal(results[0].id, results[1].id);
  const another = f.approve([f.create()])[0];
  await assert.rejects(send(f, inputFor([approved[0], another]), github), /gereserveerd of verzonden/);
  assert.equal(github.posts.length, 1);
});

test('sent content stays immutable while existing development statuses can still progress', async t => {
  const f = fixture(t), approved = f.approve([f.create()])[0], github = fakeGithub();
  const sent = await send(f, inputFor([approved]), github);
  const next = f.store.mutate({id: approved.id, requestId: randomUUID(), revision: approved.revision, action: 'advance', status: 'In ontwikkeling', decision: 'Eigenaar heeft de ontwikkeling gestart.'}, 'owner', f.board, 'http://localhost:3002');
  assert.equal(next.status, 'In ontwikkeling'); assert.equal(f.store.getProposal(next.id).dispatch.issue.url, sent.issue.url);
  assert.equal(f.store.batch(sent.id).body, sent.body); assert.equal(github.posts.length, 1);
});

test('lost GitHub response is reconciled after restart without another POST', async t => {
  const f = fixture(t), approved = f.approve([f.create()]), github = fakeGithub(), create = github.create.bind(github);
  github.create = async (...args) => { await create(...args); throw new Error('Connection lost after remote commit'); };
  const first = await send(f, inputFor(approved), github);
  assert.equal(first.state, 'uncertain'); assert.equal(github.issues.length, 1);
  f.restart();
  const recovered = await send(f, {batchId: first.id}, github, {recoverOnly: true});
  assert.equal(recovered.state, 'sent'); assert.equal(github.posts.length, 1);
  assert.equal(f.store.collection()[0].dispatch.issue.url, recovered.issue.url);
});

test('unknown outcomes stay locked; read-only checks never silently resend', async t => {
  const f = fixture(t), approved = f.approve([f.create()]), github = fakeGithub();
  github.create = async () => { throw new Error('timeout'); };
  const first = await send(f, inputFor(approved), github); assert.equal(first.state, 'uncertain');
  f.restart();
  assert.equal((await send(f, {batchId: first.id}, github, {recoverOnly: true})).state, 'uncertain');
  assert.throws(() => f.store.cancelBatch(first.id, 'owner'), /nog niet gestarte/);
  assert.throws(() => f.approve(approved), /gereserveerd/);
});

test('missing GitHub access is resumable and a never-started reservation can be cancelled', async t => {
  const f = fixture(t), approved = f.approve([f.create()]), input = inputFor(approved), github = fakeGithub();
  github.check = async () => { throw new Error('No API permission'); };
  await assert.rejects(send(f, input, github), /No API/);
  const batch = f.store.batches()[0]; assert.equal(batch.state, 'prepared'); assert.equal(github.posts.length, 0);
  await assert.rejects(send(f, {batchId: batch.id}, github, {resume: true}), /Bevestig/);
  github.check = async () => {};
  const result = await send(f, {batchId: batch.id, confirmed: true}, github, {resume: true}); assert.equal(result.state, 'sent');
  const secondInput = inputFor(f.approve([f.create()])); const second = f.store.reserve(secondInput, 'owner', f.board, REPOSITORY);
  f.store.cancelBatch(second.id, 'owner');
  assert.equal(f.store.preview(secondInput.items, f.board, REPOSITORY).items.length, 1);
  assert.notEqual((await send(f, {...secondInput, requestId: randomUUID()}, github)).id, second.id);
});

test('confirmed GitHub rejection can be retried, but cancellation wins over an in-flight preflight', async t => {
  const f = fixture(t), approved = f.approve([f.create()]), input = inputFor(approved), github = fakeGithub();
  const create = github.create.bind(github); let attempts = 0;
  github.create = async (...args) => { if (++attempts === 1) { const error = new Error('HTTP 403'); error.definitive = true; throw error; } return create(...args); };
  const failed = await send(f, input, github); assert.equal(failed.state, 'prepared');
  assert.equal((await send(f, {batchId: failed.id, confirmed: true}, github, {resume: true})).state, 'sent'); assert.equal(github.issues.length, 1);
  const second = inputFor(f.approve([f.create()])); let release, entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  github.check = () => new Promise(resolve => { release = resolve; entered(); });
  const sending = send(f, second, github); await waiting;
  const b = f.store.batches()[0]; f.store.cancelBatch(b.id, 'owner'); release();
  assert.equal((await sending).state, 'cancelled'); assert.equal(github.issues.length, 1);
});

test('GitHub transport verifies a private repository, paginates recovery and creates only title/body', async () => {
  const calls = [], id = randomUUID();
  const github = githubClient(REPOSITORY, async (method, endpoint, payload) => {
    calls.push({method, endpoint, payload});
    if (endpoint === `repos/${REPOSITORY}`) return {private: true, has_issues: true};
    if (method === 'POST') return {number: 17, html_url: `https://github.com/${REPOSITORY}/issues/17`};
    if (endpoint.endsWith('page=1')) return Array.from({length: 100}, () => ({body: 'other'}));
    return [{number: 17, html_url: `https://github.com/${REPOSITORY}/issues/17`, body: `<!-- boer-bart-batch:${id} -->`}];
  });
  await github.check(); const issue = await github.create('Title', 'Body');
  assert.deepEqual(calls[1].payload, {title: 'Title', body: 'Body'});
  assert.deepEqual(await github.find(id, new Date().toISOString()), issue); assert.equal(calls.length, 4);
  await assert.rejects(githubClient(REPOSITORY, async () => ({private: false, has_issues: true})).check(), /private repository/);
  await assert.rejects(githubClient(REPOSITORY, async () => ({number: 1, html_url: 'https://evil.invalid/'})).create('x', 'y'), /geldige Issue/);
});

test('oversized and malformed selections are rejected before a reservation or external write', t => {
  const f = fixture(t), approved = f.approve(Array.from({length: 10}, () => f.create('website', {description: 'a'.repeat(10000)})));
  assert.throws(() => f.store.preview(inputFor(approved).items, f.board, REPOSITORY), /te groot/);
  assert.throws(() => f.store.reserve({requestId: randomUUID(), confirmed: true}, 'owner', f.board, REPOSITORY), /Ongeldige selectie/);
  assert.throws(() => f.store.reserve({...inputFor(approved), confirmed: false}, 'owner', f.board, REPOSITORY), /Bevestig/);
  assert.throws(() => f.store.reserve({...inputFor(approved), repository: 'other/repository'}, 'owner', f.board, REPOSITORY), /doelrepository/);
  assert.equal(f.store.batches().length, 0);
});

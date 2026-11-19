import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {randomUUID, createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createWebsiteServer} from '../tools/website-dev/server.mjs';
import * as localAccess from '../tools/website-dev/local-access.mjs';
import {readBoard, openStore, STATUSES} from '../tools/website-dev/store.mjs';
import {proposalPaths} from '../tools/website-dev/paths.mjs';

const password = 'only-for-isolated-tests-' + randomUUID();
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSsAAAAAASUVORK5CYII=', 'base64');
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-website-test-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const root = path.join(directory, 'public'), dataDir = path.join(directory, 'private');
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><html><body>Boer Bart</body></html>');
  const boardSnapshot = path.join(directory, 'board.json');
  fs.writeFileSync(boardSnapshot, JSON.stringify({revision: 55, board: {nodes: [{id: 'real-topic', title: 'Reserveren Speelboerderij', status: 'Idee'}]}}));
  return {directory, options: {root, dataDir, devMode: true, username: 'owner', boardSnapshot, boardDatabase: path.join(directory, 'board.sqlite'), origin: 'http://127.0.0.1:0'}};
}
async function start(t, options) {
  const server = createWebsiteServer(options);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  let closed = false;
  const stop = async () => { if (closed) return; closed = true; server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); };
  t.after(stop);
  const origin = 'http://127.0.0.1:' + server.address().port;
  const request = (route, data, overrides = {}) => fetch(origin + route, {method: data ? 'POST' : 'GET', redirect: 'manual', ...overrides, headers: { ...(data ? {'Content-Type': 'application/json', Origin: origin} : {}), ...overrides.headers}, ...(data ? {body: JSON.stringify(data)} : {})});
  // No login any more (besluit eigenaar 3 november 2026): "signing in" is a no-op kept so the tests read the same.
  const login = async () => {};
  return {server, origin, request, login, stop};
}
function draft(origin, overrides = {}) {
  return {id: randomUUID(), requestId: randomUUID(), revision: 0, action: 'save', description: 'De reserveringsknop duidelijker maken', component: 'Reserveren Speelboerderij', pageUrl: origin + '/', topicId: 'real-topic', ...overrides};
}

test('disabled mode keeps public HTML unchanged, private endpoints unavailable and creates no storage', async t => {
  const {options} = fixture(t), app = await start(t, {...options, devMode: false});
  assert.equal(await (await app.request('/')).text(), fs.readFileSync(path.join(options.root, 'index.html'), 'utf8'));
  for (const route of ['/__dev/login', '/__dev/context', '/__dev/proposals', '/__dev/client.js', '/__dev/export']) assert.equal((await app.request(route)).status, 404);
  assert.equal(fs.existsSync(options.dataDir), false);
});

test('no login card, no log-out and no password; foreign sites and other host names stay blocked', async t => {
  const {options} = fixture(t), app = await start(t, options);
  const old = await app.request('/__dev/login');
  assert.equal(old.status, 303, 'an old /__dev/login link goes straight back to the site');assert.equal(old.headers.get('www-authenticate'), null);
  assert.equal((await app.request('/__dev/login?voorstel=' + '0'.repeat(8) + '-0000-4000-8000-' + '0'.repeat(12))).headers.get('location'), '/?voorstel=00000000-0000-4000-8000-000000000000');
  for (const gone of ['/__dev/login.js', '/__dev/login.css', '/__dev/logout', '/__dev/session']) assert.equal((await app.request(gone)).status, 404, gone);
  assert.equal((await app.request('/__dev/session', {username: 'owner', password: 'x'})).status, 404);
  assert.equal((await app.request('/__dev/context')).status, 200);
  assert.match(await (await app.request('/')).text(), /\/__dev\/client.js/);
  assert.doesNotMatch(await (await app.request('/')).text(), /<link[^>]+client\.css/, 'Developer styles must stay inside the module Shadow DOM');
  assert.doesNotMatch(await (await app.request('/__dev/client.js')).text(), /Uitloggen|id="logout"/);
  assert.equal((await app.request('/__dev/proposals', draft(app.origin), {headers: {Origin: 'https://evil.invalid'}})).status, 403);
  assert.equal((await app.request('/__dev/collection/send', {}, {headers: {Origin: 'https://evil.invalid'}})).status, 403);
  const wrongHost = await new Promise((resolve, reject) => {
    http.get(app.origin + '/__dev/context', {headers: {Host: 'evil.invalid'}}, res => { res.resume(); resolve(res.statusCode); }).on('error', reject);
  });
  assert.equal(wrongHost, 403);
  assert.doesNotMatch(await new Promise((resolve, reject) => {
    http.get(app.origin + '/', {headers: {Host: 'evil.invalid'}}, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => resolve(b)); }).on('error', reject);
  }), /client.js/, 'the tools are not offered under another host name');
});

test('draft, image, topic reference and submission survive server restart without duplicate retries', async t => {
  const {options} = fixture(t), app = await start(t, options); await app.login();
  const boardHash = createHash('sha256').update(fs.readFileSync(options.boardSnapshot)).digest('hex');
  const input = draft(app.origin, {attachment: {name: 'screenshot.png', type: 'image/png', data: png.toString('base64')}});
  const result = await app.request('/__dev/proposals', input); assert.equal(result.status, 200);
  const created = await result.json();
  assert.equal(created.status, 'Idee'); assert.equal(created.author, 'owner'); assert.equal(created.topic.id, 'real-topic'); assert.equal(created.topic.boardRevision, 55);
  assert.deepEqual(await (await app.request('/__dev/proposals', input)).json(), created);
  assert.equal((await (await app.request('/__dev/proposals')).json()).proposals.length, 1);
  assert.equal((await app.request('/__dev/proposals', {...input, description: 'Other content'})).status, 409);
  const submit = {...input, requestId: randomUUID(), revision: 1, action: 'submit', attachment: null};
  const submitted = await (await app.request('/__dev/proposals', submit)).json(); assert.equal(submitted.status, 'Klaar voor beoordeling');
  assert.equal((await app.request('/__dev/proposals', {...submit, requestId: randomUUID()})).status, 409);
  await app.stop();
  // Same origin is retained in saved provenance, not silently replaced after restart.
  const second = await start(t, options); await second.login();
  const saved = (await (await second.request('/__dev/proposals')).json()).proposals[0];
  assert.equal(saved.status, 'Klaar voor beoordeling'); assert.equal(saved.id, input.id); assert.equal(saved.history.length, 2);
  assert.deepEqual(Buffer.from(await (await second.request('/__dev/attachments/' + saved.id)).arrayBuffer()), png);
  assert.equal((await (await second.request('/__dev/export')).json()).proposals[0].id, saved.id);
  assert.equal(createHash('sha256').update(fs.readFileSync(options.boardSnapshot)).digest('hex'), boardHash);
});

test('explicit decisions follow all seven statuses and approved content cannot be silently edited', async t => {
  const {options} = fixture(t), app = await start(t, options); await app.login();
  const input = draft(app.origin);
  let proposal = await (await app.request('/__dev/proposals', input)).json();
  const advance = (status, decision = 'Eigenaar heeft dit op het centrale planbord beoordeeld.') => app.request('/__dev/proposals', {id: proposal.id, requestId: randomUUID(), revision: proposal.revision, action: 'advance', status, decision});
  assert.equal((await advance('Goedgekeurd')).status, 400);
  assert.equal((await advance('In ontwerp', '')).status, 400);
  for (const status of STATUSES.slice(1)) {
    const response = await advance(status); assert.equal(response.status, 200); proposal = await response.json(); assert.equal(proposal.status, status);
    if (status === 'Goedgekeurd') assert.equal((await app.request('/__dev/proposals', {...input, requestId: randomUUID(), revision: proposal.revision, description: 'Silently changed'})).status, 409);
  }
  assert.equal(proposal.history.length, 7);
  assert.equal((await advance('Idee')).status, 400);
});

test('input validation rejects fake topics, foreign URLs, unsafe uploads and oversized bodies', async t => {
  const {options} = fixture(t), app = await start(t, options); await app.login();
  for (const overrides of [
    {topicId: 'invented-topic'}, {pageUrl: 'https://evil.invalid/'}, {pageUrl: app.origin + '/?token=secret'},
    {description: ''}, {description: 'x'.repeat(10001)},
    {attachment: {name: 'x.svg', type: 'image/svg+xml', data: Buffer.from('<svg onload="alert(1)"></svg>').toString('base64')}},
    {attachment: {name: 'fake.png', type: 'image/png', data: Buffer.from('<script>alert(1)</script>').toString('base64')}},
  ]) assert.equal((await app.request('/__dev/proposals', draft(app.origin, overrides))).status, 400);
  assert.equal((await app.request('/__dev/proposals', draft(app.origin, {description: 'x'.repeat(5 * 1024 * 1024)}))).status, 413);
  const raw = await fetch(app.origin + '/__dev/proposals', {method: 'POST', headers: {'Content-Type': 'application/json', Origin: app.origin}, body: '{'});
  assert.equal(raw.status, 400, 'broken JSON is refused (there is no login any more)');
  assert.equal((await (await app.request('/__dev/proposals')).json()).proposals.length, 0);
  for (const route of ['/var/proposals.sqlite', '/.env.local', '/%2eenv.local', '/%ZZ']) assert.ok([400, 404].includes((await app.request(route)).status));
});

test('planboard references use current local database read-only and fall back only when absent', t => {
  const {options} = fixture(t);
  assert.equal(readBoard(options).revision, 55);
  const db = new DatabaseSync(options.boardDatabase);
  db.exec('CREATE TABLE boards(id TEXT PRIMARY KEY,data TEXT,revision INTEGER)');
  db.prepare('INSERT INTO boards VALUES(?,?,?)').run('main', JSON.stringify({nodes: [{id: 'latest', title: 'Nieuwere lokale afspraak', status: 'Goedgekeurd'}]}), 56); db.close();
  const before = fs.readFileSync(options.boardDatabase);
  const actual = readBoard(options);
  assert.equal(actual.revision, 56); assert.equal(actual.topics[0].id, 'latest'); assert.equal(actual.liveVerified, false);
  assert.deepEqual(fs.readFileSync(options.boardDatabase), before);
  const writer = new DatabaseSync(options.boardDatabase);
  writer.prepare('UPDATE boards SET data=? WHERE id=?').run(JSON.stringify({nodes: [{id: 'latest', title: 'Nieuwere lokale afspraak', status: 'Goedgekeurd', notes: 'Eigenaar heeft de afspraak gewijzigd.'}]}), 'main'); writer.close();
  assert.notEqual(readBoard(options).topics[0].decisionDigest, actual.topics[0].decisionDigest);
});

test('development mode refuses unsafe storage and plain HTTP outside localhost', t => {
  const {options} = fixture(t);
  assert.throws(() => createWebsiteServer({...options, dataDir: options.root}), /publieke websitemap/);
  assert.throws(() => createWebsiteServer({...options, origin: 'http://public.example'}), /HTTPS/);
});

const anchor = application => ({version: 1, application, route: '/', view: '', selector: 'body > main:nth-of-type(1) > button:nth-of-type(1)', signature: '1234abcd', tag: 'button'});
test('selection locations reject hidden context and require a privacy confirmation', async t => {
  const {options} = fixture(t), app = await start(t, options); await app.login();
  for (const location of [{...anchor('website'), value: 'secret'}, {...anchor('website'), selector: '#customer-email'}, {...anchor('website'), view: 'personal@example.test'}, anchor('backoffice')]) {
    assert.equal((await app.request('/__dev/proposals', draft(app.origin, {location, privacyConfirmed: true}))).status, 400);
  }
  assert.equal((await app.request('/__dev/proposals', draft(app.origin, {location: anchor('website')}))).status, 400);
  const response = await app.request('/__dev/proposals', draft(app.origin, {location: anchor('website'), privacyConfirmed: true}));
  assert.equal(response.status, 200); assert.deepEqual((await response.json()).location, anchor('website'));
});

test('website and backoffice share durable storage with scoped access and no backoffice images', t => {
  const {options} = fixture(t), store = openStore(options.dataDir); t.after(() => store.close());
  const board = readBoard(options), origin = 'http://localhost:3001';
  const input = draft(origin, {location: anchor('backoffice'), privacyConfirmed: true});
  const saved = store.mutate(input, 'owner', board, origin, 'backoffice');
  assert.equal(saved.application, 'backoffice'); assert.equal(store.list('website').length, 0); assert.equal(store.list('backoffice').length, 1);
  assert.equal(store.attachment(saved.id, 'website'), null);
  assert.throws(() => store.mutate({...input, requestId: randomUUID(), revision: 1, location: anchor('website')}, 'owner', board, origin, 'website'), /niet gevonden/);
  assert.throws(() => store.mutate({...input, requestId: randomUUID(), revision: 1, attachment: {name: 'photo.png', type: 'image/png', data: png.toString('base64')}}, 'owner', board, origin, 'backoffice'), /uitgeschakeld/);
  assert.equal(store.list('backoffice')[0].revision, 1);
});

test('development and standalone backoffice resolve the same checkout storage and live board', t => {
  const {directory} = fixture(t);
  fs.mkdirSync(path.join(directory, 'tools/website-dev'), {recursive: true}); fs.writeFileSync(path.join(directory, 'tools/website-dev/store.mjs'), '');
  fs.mkdirSync(path.join(directory, 'apps/backoffice/.next/standalone'), {recursive: true}); fs.writeFileSync(path.join(directory, 'apps/backoffice/package.json'), '{}');
  const dev = proposalPaths(path.join(directory, 'apps/backoffice'), {});
  const standalone = proposalPaths(path.join(directory, 'apps/backoffice/.next/standalone'), {});
  assert.deepEqual(dev, standalone); assert.equal(dev.dataDir, path.join(directory, 'var/website-dev'));
  assert.equal(dev.boardDatabase, path.join(directory, 'apps/planbord/var/database.sqlite'));
});

// Website-ontwikkelserver: 127.0.0.1 en localhost zijn dezelfde computer (alleen een doorverwijzing, nooit toegang).
test('loopback alias only redirects plain reads on this computer', async () => {
  // 127.0.0.1 and localhost are the same computer: redirect to the configured address instead of asking a login.
  const {loopbackAlias} = await import('../tools/website-dev/local-access.mjs');
  assert.equal(loopbackAlias({enabled: '1', origin: 'http://localhost:3001', host: '127.0.0.1:3001'}), 'http://localhost:3001');
  assert.equal(loopbackAlias({enabled: '1', origin: 'http://localhost:3003', host: '[::1]:3003'}), 'http://localhost:3003');
  assert.equal(loopbackAlias({enabled: '1', origin: 'http://localhost:3001', host: 'localhost:3001'}), null, 'already right');
  assert.equal(loopbackAlias({enabled: '1', origin: 'http://localhost:3001', host: '127.0.0.1:3002'}), null, 'other port');
  assert.equal(loopbackAlias({enabled: '1', origin: 'http://localhost:3001', host: 'evil.example:3001'}), null, 'DNS rebinding');
  assert.equal(loopbackAlias({enabled: '1', origin: 'http://localhost:3001', host: '192.168.1.20:3001'}), null, 'local network');
  assert.equal(loopbackAlias({enabled: '1', origin: 'http://localhost:3001', host: '127.0.0.1:3001', method: 'POST'}), null, 'only plain reads');
  assert.equal(loopbackAlias({enabled: undefined, origin: 'http://localhost:3001', host: '127.0.0.1:3001'}), null, 'only with the start script flag');
  assert.equal(loopbackAlias({enabled: '1', origin: 'http://localhost:3001', host: '127.0.0.1:3001', header: n => n === 'cf-ray' ? 'x' : undefined}), null, 'never through Cloudflare');
  assert.equal(loopbackAlias({enabled: '1', origin: 'https://boerbart-3001.app.github.dev', host: '127.0.0.1:3001'}), null, 'hosting keeps the login');
});

test('developer mode on localhost opens without login, but keeps the Host and Origin checks', async t => {
  const {options} = fixture(t), app = await start(t, {...options, localNoLogin: '1'});
  assert.equal((await app.request('/__dev/context')).status, 200, 'no login needed on this computer');
  assert.match(await (await app.request('/')).text(), /\/__dev\/client.js/);
  const toLogin = await app.request('/__dev/login', undefined, {redirect: 'manual'});
  assert.equal(toLogin.status, 303);assert.equal(toLogin.headers.get('location'), '/');
  assert.equal((await app.request('/__dev/proposals', draft(app.origin))).status, 200, 'saving works as the owner');
  assert.equal((await app.request('/__dev/proposals', draft(app.origin), {headers: {Origin: 'https://evil.invalid'}})).status, 403, 'other sites still cannot write');
  const wrongHost = await new Promise((resolve, reject) => {
    http.get(app.origin + '/__dev/context', {headers: {Host: 'evil.invalid'}}, res => { res.resume(); resolve(res.statusCode); }).on('error', reject);
  });
  assert.equal(wrongHost, 403);
  const proposals = await (await app.request('/__dev/proposals')).json();
  assert.ok(JSON.stringify(proposals).includes('"owner"'), 'recorded as the owner account');
});

// Telefoonstand: the backoffice through a Cloudflare quick tunnel, always with login.
test('telefoonstand: tunnel address is read from cloudflared output, never its API address', async () => {
  const {publicTunnelOrigin} = await import('../tools/telefoon-tunnel-core.mjs');
  assert.equal(publicTunnelOrigin('failed: Post "https://api.trycloudflare.com/tunnel"'), null);
  assert.equal(publicTunnelOrigin('INF Requesting https://api.trycloudflare.com ... | https://boer-blauw-kaas.trycloudflare.com |'), 'https://boer-blauw-kaas.trycloudflare.com');
});

test('telefoonstand gateway sets the tunnel Host, keeps Cloudflare headers and only forwards the HMR socket from the tunnel page', async t => {
  const {createPhoneGateway} = await import('../tools/telefoon-tunnel-core.mjs');
  const seen = [];
  const upstream = http.createServer((req, res) => { seen.push(req.headers); res.end('ok'); });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  let publicOrigin = null;
  const gateway = createPhoneGateway({backofficePort: upstream.address().port, getPublicOrigin: () => publicOrigin});
  gateway.listen(0, '127.0.0.1'); await once(gateway, 'listening');
  t.after(() => { gateway.closeAllConnections(); gateway.close(); upstream.closeAllConnections(); upstream.close(); });
  const at = 'http://127.0.0.1:' + gateway.address().port;
  assert.equal((await fetch(at + '/assistent')).status, 503, 'not before the tunnel address is known');
  publicOrigin = 'https://boer-blauw-kaas.trycloudflare.com';
  const res = await fetch(at + '/assistent', {headers: {'cf-ray': 'abc', 'cf-connecting-ip': '203.0.113.9'}});
  assert.equal(res.status, 200);
  assert.equal(seen.at(-1).host, 'boer-blauw-kaas.trycloudflare.com', 'Host is always the tunnel host, never localhost');
  assert.equal(seen.at(-1)['cf-ray'], 'abc');
  const upgrade = (path, origin) => new Promise(resolve => {
    const req = http.request(at + path, {headers: {Connection: 'Upgrade', Upgrade: 'websocket', Origin: origin, 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==', 'Sec-WebSocket-Version': '13'}});
    req.on('upgrade', () => resolve('upgraded')); req.on('response', r => resolve('response ' + r.statusCode)); req.on('error', () => resolve('closed')); req.end();
  });
  assert.equal(await upgrade('/api/voorstellen', publicOrigin), 'closed', 'only the development socket');
  assert.equal(await upgrade('/_next/webpack-hmr', 'https://evil.invalid'), 'closed', 'only from the tunnel page');
});

// Besluit eigenaar 2 november 2026: in de telefoonstand komt de bestelpagina zonder login mee, als gast; de rest van de website niet.
test('telefoonstand gateway: only the guest order page comes from the website, as a guest without owner tools', async t => {
  const {createPhoneGateway, guestPagePath} = await import('../tools/telefoon-tunnel-core.mjs');
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const backoffice = [];
  const upstream = http.createServer((req, res) => { backoffice.push({url: req.url, method: req.method}); res.end('backoffice'); });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-phone-guest-'));
  const website = createWebsiteServer({root: path.join(repo, 'apps/website'), dataDir, devMode: true, username: 'owner', password: 'x'.repeat(20), localNoLogin: '1', origin: 'http://localhost:0'});
  website.listen(0, '127.0.0.1'); await once(website, 'listening');
  const publicOrigin = 'https://boer-blauw-kaas.trycloudflare.com';
  const gateway = createPhoneGateway({backofficePort: upstream.address().port, websitePort: website.address().port, getPublicOrigin: () => publicOrigin});
  gateway.listen(0, '127.0.0.1'); await once(gateway, 'listening');
  t.after(() => { for (const s of [gateway, website, upstream]) { s.closeAllConnections(); s.close(); } fs.rmSync(dataDir, {recursive: true, force: true}); });
  const at = 'http://127.0.0.1:' + gateway.address().port;

  for (const p of ['/bestellen', '/bestellen.html']) {
    const res = await fetch(at + p, {headers: {cookie: 'bb_dev=gestolen', authorization: 'Basic eDp4'}});
    assert.equal(res.status, 200, p);
    const html = await res.text();
    assert.match(html, /Wêr hast/);
    assert.doesNotMatch(html, /__dev\/client\.js/, 'no owner tools for tunnel guests');
  }
  for (const p of ['/bestellen.js', '/bestellen.css', '/bestellen-sw.js', '/bestellen-app.json', '/beeld/boerbart-logo.webp']) assert.equal((await fetch(at + p)).status, 200, p);
  assert.equal(backoffice.length, 0, 'guest page files never reach the backoffice');

  // Everything else (other website pages, the API, writes) goes to the backoffice with its login.
  for (const [p, method] of [['/', 'GET'], ['/index.html', 'GET'], ['/__dev/login', 'GET'], ['/api/public/orders', 'POST'], ['/bestellen.html', 'POST'], ['/beeld/../index.html', 'GET']]) {
    await fetch(at + p, {method});
  }
  assert.deepEqual(backoffice.map(b => b.method + ' ' + b.url), ['GET /', 'GET /index.html', 'GET /__dev/login', 'POST /api/public/orders', 'POST /bestellen.html', 'GET /index.html']);
  assert.equal(guestPagePath('GET', '/bestellen.html?x=1'), '/bestellen.html');
  assert.equal(guestPagePath('GET', '/beeld/ander.webp'), null);
  assert.equal(guestPagePath('DELETE', '/bestellen.html'), null);
});

test('website reads the central products and opening hours read-only from the backoffice', async t => {
  const seen = [];
  const backoffice = http.createServer((req, res) => {
    seen.push({method: req.method, url: req.url, cookie: req.headers.cookie});
    if (req.url === '/api/public/availability') { res.writeHead(503, {'Content-Type': 'application/json'}); return res.end('{"error":"x"}'); }
    if (req.url === '/api/public/products') { res.writeHead(200, {'Content-Type': 'application/json'}); return res.end('{"products":[{"id":"p1"}]}'); }
    res.writeHead(404); res.end();
  });
  backoffice.listen(0, '127.0.0.1'); await once(backoffice, 'listening'); t.after(() => backoffice.close());
  const {options} = fixture(t), app = await start(t, {...options, devMode: false, backofficeOrigin: 'http://127.0.0.1:' + backoffice.address().port});
  const products = await app.request('/api/public/products', undefined, {headers: {Cookie: 'geheim=1'}});
  assert.equal(products.status, 200);
  assert.deepEqual(await products.json(), {products: [{id: 'p1'}]});
  assert.equal((await app.request('/api/public/availability')).status, 503);
  // Only the two public read points; writes and other backoffice paths are never forwarded.
  assert.equal((await app.request('/api/public/products', {x: 1})).status, 405);
  assert.equal((await app.request('/api/orders')).status, 404);
  assert.deepEqual(seen.map(r => r.method + ' ' + r.url), ['GET /api/public/products', 'GET /api/public/availability']);
  assert.equal(seen[0].cookie, undefined);
});

test('without a reachable backoffice the website gets a clear 503 and no guessed data', async t => {
  const {options} = fixture(t), app = await start(t, {...options, devMode: false, backofficeOrigin: 'http://127.0.0.1:9'});
  const response = await app.request('/api/public/availability');
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /niet beschikbaar/);
  assert.throws(() => createWebsiteServer({...options, devMode: false, backofficeOrigin: 'http://127.0.0.1:3001/pad'}), /BACKOFFICE_ORIGIN/);
});

test('website geeft het weekmenu en alleen echte productfoto’s door uit de backoffice', async t => {
  const ok = '0d6f9c1e-6a2b-4c4f-9f2e-1a2b3c4d5e6f', html = '1d010471-9856-4b3f-b84b-b460a67463da', seen = [];
  const backoffice = http.createServer((req, res) => {
    seen.push(req.method + ' ' + req.url);
    if (req.url === '/api/public/weekmenu') { res.writeHead(200, {'Content-Type': 'application/json'}); return res.end('{"weeks":[]}'); }
    if (req.url === '/api/public/media/' + ok) { res.writeHead(200, {'Content-Type': 'image/png'}); return res.end(png); }
    if (req.url === '/api/public/media/' + html) { res.writeHead(200, {'Content-Type': 'text/html'}); return res.end('<script>alert(1)</script>'); }
    res.writeHead(404); res.end();
  });
  backoffice.listen(0, '127.0.0.1'); await once(backoffice, 'listening'); t.after(() => backoffice.close());
  const {options} = fixture(t), app = await start(t, {...options, devMode: false, backofficeOrigin: 'http://127.0.0.1:' + backoffice.address().port});
  const menu = await app.request('/api/public/weekmenu');
  assert.equal(menu.status, 200); assert.deepEqual(await menu.json(), {weeks: []});
  const photo = await app.request('/api/public/media/' + ok);
  assert.equal(photo.status, 200); assert.equal(photo.headers.get('content-type'), 'image/png'); assert.deepEqual(Buffer.from(await photo.arrayBuffer()), png);
  assert.equal((await app.request('/api/public/media/' + html)).status, 404, 'alleen afbeeldingen');
  assert.equal((await app.request('/api/public/media/geen-geldig-id')).status, 404, 'alleen geldige foto-ids');
  assert.equal((await app.request('/api/public/media/' + ok, {x: 1})).status, 405, 'alleen lezen');
  assert.ok(!seen.some(r => r.startsWith('POST')));
});

test('inloggen staat altijd aan: de schakelaar en de uitzonderingen zonder login zijn vervallen (besluit eigenaar 8 november 2026)', () => {
  for (const name of ['loginRequired', 'localWithoutLogin', 'tunnelWithoutLogin', 'onlineServer']) assert.equal(name in localAccess, false, name);
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  for (const file of ['apps/backoffice/proxy.ts', 'apps/planbord/proxy.ts', 'apps/backoffice/lib/proposals.ts', 'tools/start-review.mjs', 'tools/telefoon-tunnel.mjs']) {
    const code = fs.readFileSync(path.join(repo, file), 'utf8').split('\n').filter(line => !line.trim().startsWith('//')).join('\n');
    for (const word of ['BOER_BART_LOGIN', 'LOCAL_NO_LOGIN', 'TUNNEL_NO_LOGIN', 'loginRequired', 'WithoutLogin', "'--met-login'"]) assert.equal(code.includes(word), false, file + ' bevat nog ' + word);
  }
});

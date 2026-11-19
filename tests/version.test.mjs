import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createVersionMonitor, git} from '../tools/website-dev/version.mjs';
import {createWebsiteServer} from '../tools/website-dev/server.mjs';

const identity = ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'init.defaultBranch=main'];
const sh = (cwd, ...args) => execFileSync('git', [...identity, ...args], {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
function commit(cwd, file, content, message = 'Wijziging ' + file) {
  fs.mkdirSync(path.dirname(path.join(cwd, file)), {recursive: true});
  fs.writeFileSync(path.join(cwd, file), content); sh(cwd, 'add', file); sh(cwd, 'commit', '-q', '-m', message);
  return sh(cwd, 'rev-parse', 'HEAD');
}
// origin.git is a bare GitHub stand-in, upstream an approved merge source, local the owner's checkout.
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-version-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const origin = path.join(dir, 'origin.git'), upstream = path.join(dir, 'upstream'), local = path.join(dir, 'local');
  sh(dir, 'init', '-q', '--bare', origin);
  sh(dir, 'clone', '-q', origin, upstream);
  fs.writeFileSync(path.join(upstream, '.gitignore'), 'var/\n.env.*\n!.env.example\n');
  commit(upstream, 'README.md', 'Boer Bart\n'); sh(upstream, 'add', '.gitignore'); sh(upstream, 'commit', '-q', '-m', 'Ignore');
  sh(upstream, 'push', '-q', 'origin', 'HEAD:main');
  sh(dir, 'clone', '-q', '-b', 'main', origin, local);
  // Owner data that must survive every check and update.
  fs.mkdirSync(path.join(local, 'var/development'), {recursive: true});
  fs.writeFileSync(path.join(local, 'var/development/database.sqlite'), 'planbord-gegevens');
  fs.mkdirSync(path.join(local, 'apps/backoffice'), {recursive: true});
  fs.writeFileSync(path.join(local, 'apps/backoffice/.env.local'), 'BASIC_AUTH_PASSWORD=geheim\n');
  const approve = (file, content, message) => { sh(upstream, 'pull', '-q', 'origin', 'main'); const id = commit(upstream, file, content, message); sh(upstream, 'push', '-q', 'origin', 'HEAD:main'); return id; };
  const monitor = (options = {}) => createVersionMonitor({repo: local, ...options});
  const preserved = () => {
    assert.equal(fs.readFileSync(path.join(local, 'var/development/database.sqlite'), 'utf8'), 'planbord-gegevens');
    assert.equal(fs.readFileSync(path.join(local, 'apps/backoffice/.env.local'), 'utf8'), 'BASIC_AUTH_PASSWORD=geheim\n');
  };
  return {dir, origin, upstream, local, approve, monitor, preserved, head: () => sh(local, 'rev-parse', 'HEAD')};
}

test('start check reports branch, short SHA, time and an up-to-date main without changing the checkout', async t => {
  const f = fixture(t), logs = [], before = f.head();
  const v = f.monitor({log: line => logs.push(line)});
  assert.equal(v.snapshot().status, 'onbekend');
  const s = await v.check();
  assert.equal(s.status, 'actueel'); assert.equal(s.branch, 'main'); assert.equal(s.onMain, true);
  assert.equal(s.shortHead, before.slice(0, 7)); assert.equal(s.behind, 0); assert.ok(Date.parse(s.lastCheck));
  assert.match(logs.join('\n'), /Versiecontrole: actueel · main @/);
  assert.equal(f.head(), before); f.preserved();
});

test('a new commit on origin/main is reported by polling within the interval and never installed', async t => {
  const f = fixture(t), before = f.head();
  const v = f.monitor({interval: 40}); v.start(); t.after(() => v.stop());
  for (let i = 0; i < 100 && v.snapshot().status !== 'actueel'; i++) await new Promise(r => setTimeout(r, 20));
  assert.equal(v.snapshot().intervalMinutes, 0); assert.ok(v.snapshot().nextCheck);
  const id = f.approve('feature.txt', 'nieuw', 'Goedgekeurde wijziging');
  for (let i = 0; i < 200 && v.snapshot().status !== 'updates'; i++) await new Promise(r => setTimeout(r, 20));
  const s = v.snapshot();
  assert.equal(s.status, 'updates'); assert.equal(s.behind, 1); assert.equal(s.remoteHead, id);
  assert.match(s.message, /1 nieuwe commit op GitHub main.*Nog niet bijgewerkt/);
  assert.equal(f.head(), before); assert.equal(fs.existsSync(path.join(f.local, 'feature.txt')), false); f.preserved();
});

test('reading the status (page refresh) is cached and runs no git command', async t => {
  const f = fixture(t), calls = [];
  const v = f.monitor({run: (args, o) => { calls.push(args[0]); return git(f.local, args, o); }});
  await v.check(); const count = calls.length;
  for (let i = 0; i < 5; i++) v.snapshot();
  assert.equal(calls.length, count);
  assert.ok(!calls.some(c => ['merge', 'pull', 'reset', 'stash', 'checkout', 'switch', 'clean'].includes(c)));
  assert.ok(calls.includes('fetch'));
});

test('branch work is clearly separated from approved main and cannot be updated', async t => {
  const f = fixture(t);
  sh(f.local, 'switch', '-q', '-c', 'codex/voorstel');
  commit(f.local, 'branch.txt', 'werk in uitvoering');
  f.approve('main.txt', 'goedgekeurd');
  const s = await f.monitor().check();
  assert.equal(s.onMain, false); assert.equal(s.branch, 'codex/voorstel'); assert.equal(s.ahead, 1); assert.equal(s.behind, 1);
  assert.match(s.message, /branch ‘codex\/voorstel’ met 1 commit die nog niet in main is samengevoegd/);
  assert.match(s.message, /geldt niet als geïnstalleerd/); assert.doesNotMatch(s.message, /is geïnstalleerd/);
  const pre = await f.monitor().preflight();
  assert.equal(pre.ok, false); assert.match(pre.blockers.join(' '), /alleen op main/);
});

test('offline and failing remotes show a status, keep last known data and change nothing', async t => {
  const f = fixture(t), v0 = f.monitor(); await v0.check();
  const offline = (args, o) => args[0] === 'fetch' ? Promise.resolve({code: 128, stdout: '', stderr: 'fatal: unable to access: Could not resolve host: github.com'}) : git(f.local, args, o);
  const v = f.monitor({run: offline});
  const s = await v.check();
  assert.equal(s.status, 'offline'); assert.match(s.message, /niet bereikbaar/); assert.equal(s.behind, 0); assert.equal(s.lastSuccess, null);
  const timeout = f.monitor({run: (args, o) => args[0] === 'fetch' ? Promise.resolve({code: null, stdout: '', stderr: '', timedOut: true}) : git(f.local, args, o)});
  assert.equal((await timeout.check()).status, 'offline');
  const denied = f.monitor({run: (args, o) => args[0] === 'fetch' ? Promise.resolve({code: 128, stdout: '', stderr: 'remote: Permission denied'}) : git(f.local, args, o)});
  assert.equal((await denied.check()).status, 'fout');
  const broken = createVersionMonitor({repo: f.dir});
  const b = await broken.check(); assert.equal(b.status, 'fout'); assert.match(b.message, /Git-checkout/);
  f.preserved();
});

test('local changes, collisions, divergence and unfinished git operations block the update', async t => {
  const f = fixture(t), v = f.monitor();
  f.approve('README.md', 'Nieuwe tekst\n'); f.approve('nieuw.txt', 'van main');
  await v.check();
  fs.writeFileSync(path.join(f.local, 'README.md'), 'Lokale wijziging\n');
  let pre = await v.preflight();
  assert.equal(pre.ok, false); assert.match(pre.blockers.join(' '), /lokaal gewijzigd bestand \(README\.md\).*niets gestasht/);
  await assert.rejects(v.update({token: pre.token, confirmed: true, confirmation: pre.confirmation}), /geblokkeerd/);
  assert.equal(fs.readFileSync(path.join(f.local, 'README.md'), 'utf8'), 'Lokale wijziging\n');
  sh(f.local, 'checkout', '--', 'README.md');
  fs.writeFileSync(path.join(f.local, 'nieuw.txt'), 'eigen notitie');
  pre = await v.preflight(); assert.match(pre.blockers.join(' '), /zouden worden overschreven \(nieuw\.txt\)/);
  fs.rmSync(path.join(f.local, 'nieuw.txt'));
  fs.writeFileSync(path.join(f.local, '.git/MERGE_HEAD'), 'x');
  pre = await v.preflight(); assert.match(pre.blockers.join(' '), /onafgeronde merge/);
  fs.rmSync(path.join(f.local, '.git/MERGE_HEAD'));
  commit(f.local, 'lokaal.txt', 'lokale commit');
  pre = await v.preflight(); assert.equal(pre.fastForward, false); assert.match(pre.blockers.join(' '), /uiteengelopen/);
  f.preserved();
});

test('safe update requires a fresh preflight, exact confirmation and fast-forwards only', async t => {
  const f = fixture(t), v = f.monitor(), before = f.head();
  f.approve('apps/backoffice/package.json', '{}', 'Afhankelijkheid');
  const target = f.approve('apps/planbord/drizzle/0001.sql', 'select 1;', 'Migratie');
  sh(f.local, '-c', 'user.name=x', 'stash', 'list');
  fs.writeFileSync(path.join(f.local, 'notities.txt'), 'eigen bestand');
  await v.check();
  const pre = await v.preflight();
  assert.equal(pre.ok, true, pre.blockers.join(' ')); assert.equal(pre.target, target); assert.equal(pre.commits.length, 2);
  assert.equal(pre.confirmation, 'BIJWERKEN ' + target.slice(0, 7));
  assert.match(pre.consequences.join(' '), /npm run install:apps/); assert.match(pre.consequences.join(' '), /Migraties worden niet automatisch/);
  assert.match(pre.consequences.join(' '), /Herstart/); assert.match(pre.warnings.join(' '), /niet-gevolgd bestand/);
  assert.equal(f.head(), before);
  await assert.rejects(v.update({token: pre.token, confirmation: pre.confirmation}), /expliciet/);
  await assert.rejects(v.update({token: pre.token, confirmed: true, confirmation: 'ja'}), /exact/);
  await assert.rejects(v.update({token: 'oud', confirmed: true, confirmation: pre.confirmation}), /opnieuw/);
  assert.equal(f.head(), before);
  // A newer approval after the preflight must not be installed with the old confirmation.
  f.approve('later.txt', 'later'); await v.check();
  await assert.rejects(v.update({token: pre.token, confirmed: true, confirmation: pre.confirmation}), /opnieuw|exact/);
  assert.equal(f.head(), before);
  const fresh = await v.preflight();
  const result = await v.update({token: fresh.token, confirmed: true, confirmation: fresh.confirmation});
  assert.equal(result.updated, true); assert.equal(f.head(), fresh.target); assert.equal(result.version.status, 'actueel');
  assert.equal(fs.readFileSync(path.join(f.local, 'notities.txt'), 'utf8'), 'eigen bestand');
  assert.equal(sh(f.local, 'log', '-1', '--format=%P').split(' ').length, 1, 'no merge commit');
  f.preserved();
});

test('incoming changes to protected local data paths are blocked', async t => {
  const f = fixture(t), v = f.monitor();
  sh(f.upstream, 'pull', '-q', 'origin', 'main');
  fs.mkdirSync(path.join(f.upstream, 'var'), {recursive: true}); fs.writeFileSync(path.join(f.upstream, 'var/x.sqlite'), 'x');
  sh(f.upstream, 'add', '-f', 'var/x.sqlite'); sh(f.upstream, 'commit', '-q', '-m', 'Data'); sh(f.upstream, 'push', '-q', 'origin', 'HEAD:main');
  await v.check();
  const pre = await v.preflight();
  assert.equal(pre.ok, false); assert.match(pre.blockers.join(' '), /beschermde lokale gegevens/);
  f.preserved();
});

test('version routes need this address and a same-site request, are absent without a monitor and never update on GET', async t => {
  const f = fixture(t), password = 'only-for-isolated-tests-' + randomUUID();
  const root = path.join(f.dir, 'public'); fs.mkdirSync(root); fs.writeFileSync(path.join(root, 'index.html'), '<html><body>Boer Bart</body></html>');
  const boardSnapshot = path.join(f.dir, 'board.json'); fs.writeFileSync(boardSnapshot, JSON.stringify({revision: 55, board: {nodes: []}}));
  const base = {root, devMode: true, username: 'owner', boardSnapshot, boardDatabase: path.join(f.dir, 'board.sqlite'), origin: 'http://127.0.0.1:0'};
  async function start(options) {
    const server = createWebsiteServer(options); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(() => { server.closeAllConnections(); server.close(); });
    const origin = 'http://127.0.0.1:' + server.address().port;
    const request = (route, data, from = origin) => fetch(origin + route, {method: data ? 'POST' : 'GET', headers: data ? {'Content-Type': 'application/json', Origin: from} : {}, ...(data ? {body: JSON.stringify(data)} : {})});
    const login = async () => {}; // no login any more (besluit eigenaar 3 november 2026)
    return {request, login};
  }
  const without = await start({...base, dataDir: path.join(f.dir, 'private-a')});
  await without.login(); assert.equal((await without.request('/__dev/version')).status, 404);
  const version = f.monitor(), app = await start({...base, dataDir: path.join(f.dir, 'private-b'), version});
  // No login any more: what protects updates is that they only come from this site itself, never from another website.
  for (const action of ['check', 'preflight', 'update']) assert.equal((await app.request('/__dev/version/' + action, {}, 'https://evil.invalid')).status, 403);
  await app.login();
  assert.equal((await app.request('/__dev/version-client.js')).status, 200);
  const before = f.head(); f.approve('nieuw.txt', 'x');
  assert.equal((await (await app.request('/__dev/version/check', {})).json()).status, 'updates');
  for (let i = 0; i < 3; i++) assert.equal((await (await app.request('/__dev/version')).json()).behind, 1);
  assert.equal(f.head(), before);
  assert.equal((await app.request('/__dev/version/update', {confirmed: true})).status, 409);
  assert.equal(f.head(), before);
  const pre = await (await app.request('/__dev/version/preflight', {})).json();
  assert.equal(pre.ok, true);
  const done = await (await app.request('/__dev/version/update', {token: pre.token, confirmed: true, confirmation: pre.confirmation})).json();
  assert.equal(done.updated, true); assert.equal(f.head(), pre.target); f.preserved();
});

test('a git helper that keeps the output open after a timeout or exit can never leave a check hanging', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-version-git-')); t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  let start = Date.now();
  const stuck = await git(dir, ['-c', 'alias.vast=!sleep 30', 'vast'], {timeout: 300});
  assert.equal(stuck.code, null); assert.equal(stuck.timedOut, true); assert.ok(Date.now() - start < 8000, 'settles after a timeout');
  start = Date.now();
  const leftover = await git(dir, ['-c', 'alias.achtergrond=!sleep 30 & echo klaar', 'achtergrond'], {timeout: 20000});
  assert.equal(leftover.code, 0); assert.equal(leftover.stdout.trim(), 'klaar'); assert.ok(Date.now() - start < 5000, 'settles after exit');
});

test('an update waits for a running background check instead of hanging or colliding', async t => {
  const f = fixture(t);
  f.approve('feature.txt', 'nieuw', 'Goedgekeurde wijziging');
  let slow = false;
  const v = f.monitor({run: async (args, o) => { if (slow && args[0] === 'fetch') await new Promise(r => setTimeout(r, 300)); return git(f.local, args, o); }});
  await v.check(); const pre = await v.preflight(); assert.equal(pre.ok, true);
  slow = true; const background = v.check();
  const result = await v.update({token: pre.token, confirmed: true, confirmation: pre.confirmation});
  assert.equal(result.updated, true); assert.equal(f.head(), pre.target); await background;
  f.preserved();
});

test('auto-apply fast-forwards a low-risk update on main and records it in the history', async t => {
  const f = fixture(t), calls = [], before = f.head();
  const historyFile = path.join(f.dir, 'history.json');
  const v = f.monitor({autoApply: true, historyFile, run: (args, o) => { calls.push(args); return git(f.local, args, o); }});
  const id = f.approve('apps/website/style.css', 'body{color:green}', 'Kleur aangepast');
  const s = await v.check();
  assert.equal(f.head(), id); assert.equal(s.status, 'actueel'); assert.equal(s.pending, null);
  assert.equal(s.subject, 'Kleur aangepast'); assert.ok(s.committed);
  assert.equal(s.history.length, 1);
  assert.deepEqual([s.history[0].mode, s.history[0].from, s.history[0].to, s.history[0].risk], ['automatisch', before, id, 'laag']);
  assert.equal(JSON.parse(fs.readFileSync(historyFile, 'utf8'))[0].to, id);
  // A new monitor reads the stored history back.
  assert.equal(f.monitor({historyFile}).snapshot().history[0].to, id);
  // Only reading commands plus one fast-forward; `stash list` only reads.
  const writes = calls.filter(([c, sub]) => ['pull', 'reset', 'checkout', 'switch', 'clean', 'rebase', 'push', 'commit'].includes(c) || (c === 'stash' && sub !== 'list') || (c === 'merge' && sub !== '--ff-only'));
  assert.deepEqual(writes, []);
  assert.equal(calls.filter(([c]) => c === 'merge').length, 1);
  f.preserved();
});

test('auto-apply installs every approved update on main, except one that needs a restart (besluit 2 november 2026)', async t => {
  const f = fixture(t);
  const v = f.monitor({autoApply: true});
  // A change that used to wait for approval (security/API code) is already approved via the pull request: applied.
  const security = f.approve('apps/backoffice/proxy.ts', 'export {};\n', 'Beveiliging aangepast');
  let s = await v.check();
  assert.equal(f.head(), security); assert.equal(s.status, 'actueel'); assert.equal(v.snapshot().history[0].mode, 'automatisch');
  // New packages would break the running servers: that update waits for the next start, with the files named.
  const before = f.head(), id = f.approve('apps/backoffice/package.json', '{}', 'Nieuwe afhankelijkheid');
  s = await v.check();
  assert.equal(f.head(), before); assert.equal(s.status, 'updates');
  assert.equal(s.pending.kind, 'herstart'); assert.equal(s.pending.target, id);
  assert.deepEqual(s.pending.reasons[0].files, ['apps/backoffice/package.json']);
  // The owner can still update right away after the safety check and confirmation.
  const pre = await v.preflight();
  assert.equal(pre.ok, true); assert.deepEqual(pre.restartFiles, ['apps/backoffice/package.json']);
  const done = await v.update({token: pre.token, confirmed: true, confirmation: pre.confirmation});
  assert.equal(done.to, id); assert.equal(f.head(), id);
  assert.equal(v.snapshot().history[0].mode, 'handmatig'); assert.equal(v.snapshot().pending, null);
  f.preserved();
});

test('auto-apply never overwrites local changes or updates branch work', async t => {
  const f = fixture(t), before = f.head();
  fs.writeFileSync(path.join(f.local, 'README.md'), 'eigen lokale wijziging\n');
  const v = f.monitor({autoApply: true});
  f.approve('apps/website/style.css', 'body{}', 'Laag risico');
  let s = await v.check();
  assert.equal(f.head(), before); assert.equal(s.pending.kind, 'geblokkeerd');
  assert.match(s.pending.blockers.join(' '), /lokaal gewijzigd bestand.*README\.md/);
  assert.equal(fs.readFileSync(path.join(f.local, 'README.md'), 'utf8'), 'eigen lokale wijziging\n');
  sh(f.local, 'checkout', '-q', '--', 'README.md');
  sh(f.local, 'switch', '-q', '-c', 'codex/werk');
  s = await v.check();
  assert.equal(f.head(), before); assert.equal(s.pending.kind, 'geblokkeerd');
  assert.match(s.pending.blockers.join(' '), /branch ‘codex\/werk’/);
  f.preserved();
});

test('without autoApply nothing is installed, even for low-risk updates', async t => {
  const f = fixture(t), before = f.head();
  const v = f.monitor();
  f.approve('apps/website/style.css', 'body{}', 'Laag risico');
  const s = await v.check();
  assert.equal(f.head(), before); assert.equal(s.status, 'updates'); assert.equal(s.autoApply, false); assert.equal(s.pending, null);
});

// ---- Bijwerken bij het starten (tools/website-dev/startup-update.mjs)
const {startupUpdate} = await import('../tools/website-dev/startup-update.mjs');
const runner = repo => args => { try { return {code: 0, stdout: execFileSync('git', [...identity, ...args], {cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}), stderr: ''}; } catch (e) { return {code: e.status ?? 1, stdout: String(e.stdout || ''), stderr: String(e.stderr || '')}; } };
const when = new Date('2026-11-02T20:15:00Z');

test('starten werkt bij naar de nieuwste main, met back-up en alleen installeren bij nieuwe pakketten', async t => {
  const f = fixture(t), logs = [];
  let installs = 0;
  const first = f.approve('apps/website/kleur.css', 'body{}', 'Kleur');
  let r = await startupUpdate({repo: f.local, run: runner(f.local), install: async () => { installs++; return true; }, log: l => logs.push(l), now: () => when});
  assert.equal(r.updated, true); assert.equal(f.head(), first); assert.equal(installs, 0, 'geen nieuwe pakketten: niet installeren');
  assert.ok(fs.existsSync(path.join(f.local, 'var/backups/development-20261102-2015/database.sqlite')), 'eerst een back-up van de gegevens');
  const deps = f.approve('apps/backoffice/package.json', '{}', 'Pakket');
  r = await startupUpdate({repo: f.local, run: runner(f.local), install: async () => { installs++; return true; }, log: l => logs.push(l), now: () => new Date('2026-11-02T21:00:00Z')});
  assert.equal(f.head(), deps); assert.equal(installs, 1);
  r = await startupUpdate({repo: f.local, run: runner(f.local), install: async () => true, log: l => logs.push(l), now: () => when});
  assert.equal(r.updated, false); assert.equal(r.reason, 'actueel');
  assert.match(logs.join('\n'), /nieuwste versie/);
  f.preserved();
});

test('starten overschrijft nooit lokale wijzigingen; een andere branch en een eigen main blijven bewaard', async t => {
  const f = fixture(t), logs = [], log = l => logs.push(l), install = async () => true;
  // Local edit: nothing changes, the current version starts.
  fs.writeFileSync(path.join(f.local, 'README.md'), 'eigen lokale wijziging\n');
  const target = f.approve('apps/website/a.css', 'a{}', 'A');
  let r = await startupUpdate({repo: f.local, run: runner(f.local), install, log, now: () => when});
  assert.equal(r.updated, false); assert.equal(r.reason, 'lokale wijzigingen');
  assert.equal(fs.readFileSync(path.join(f.local, 'README.md'), 'utf8'), 'eigen lokale wijziging\n');
  sh(f.local, 'checkout', '-q', '--', 'README.md');
  // Own commit on local main, then working on another branch: both are kept, main moves to GitHub main.
  const own = commit(f.local, 'notitie.txt', 'lokaal\n', 'Eigen lokale commit');
  sh(f.local, 'switch', '-q', '-c', 'proef-kassa-nieuw');
  r = await startupUpdate({repo: f.local, run: runner(f.local), install, log, now: () => when});
  assert.equal(r.updated, true); assert.equal(f.head(), target);
  assert.equal(sh(f.local, 'symbolic-ref', '--short', 'HEAD'), 'main');
  assert.equal(sh(f.local, 'rev-parse', 'proef-kassa-nieuw'), own, 'de branch blijft bestaan');
  assert.equal(sh(f.local, 'rev-parse', r.reserve), own, 'de eigen main is bewaard als reserve');
  assert.match(logs.join('\n'), /proef-kassa-nieuw.*blijft bewaard/);
  f.preserved();
});

test('starten zonder internet verandert niets', async t => {
  const f = fixture(t), before = f.head();
  sh(f.local, 'remote', 'set-url', 'origin', path.join(f.dir, 'bestaat-niet.git'));
  const r = await startupUpdate({repo: f.local, run: runner(f.local), install: async () => true, now: () => when});
  assert.equal(r.updated, false); assert.equal(r.reason, 'offline'); assert.equal(f.head(), before);
});

test('alleen de laatste vijf automatische back-ups blijven bewaard', async t => {
  const {backup} = await import('../tools/website-dev/startup-update.mjs');
  const f = fixture(t);
  for (let i = 0; i < 7; i++) backup(f.local, new Date(Date.UTC(2026, 10, 2, 10 + i, 0)), 5);
  assert.deepEqual(fs.readdirSync(path.join(f.local, 'var/backups')).sort(), ['development-20261102-1200', 'development-20261102-1300', 'development-20261102-1400', 'development-20261102-1500', 'development-20261102-1600']);
  f.preserved();
});

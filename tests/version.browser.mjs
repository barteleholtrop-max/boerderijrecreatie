import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createWebsiteServer} from '../tools/website-dev/server.mjs';
import {createVersionMonitor} from '../tools/website-dev/version.mjs';
const {chromium} = createRequire(new URL('./browser/package.json', import.meta.url))('playwright');

const sh = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'init.defaultBranch=main', ...args], {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();

test('owner sees version status, an update notice and updates only after a preflight and explicit confirmation', async t => {
  const repo = process.cwd(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-version-browser-')), password = randomUUID();
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const origin = path.join(dir, 'origin.git'), upstream = path.join(dir, 'upstream'), local = path.join(dir, 'local');
  sh(dir, 'init', '-q', '--bare', origin); sh(dir, 'clone', '-q', origin, upstream);
  fs.writeFileSync(path.join(upstream, 'README.md'), 'Boerderijrecreatie\n'); sh(upstream, 'add', '.'); sh(upstream, 'commit', '-q', '-m', 'Start'); sh(upstream, 'push', '-q', 'origin', 'HEAD:main');
  sh(dir, 'clone', '-q', '-b', 'main', origin, local);
  const before = sh(local, 'rev-parse', 'HEAD');
  const version = createVersionMonitor({repo: local});
  const server = createWebsiteServer({root: path.join(repo, 'apps/website'), dataDir: path.join(dir, 'private'), devMode: true, username: 'owner', password, origin: 'http://127.0.0.1:0', boardSnapshot: path.join(repo, 'apps/planbord/snapshot/board.json'), version});
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); const site = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); });
  fs.writeFileSync(path.join(upstream, 'nieuw.txt'), 'goedgekeurd'); sh(upstream, 'add', '.'); sh(upstream, 'commit', '-q', '-m', 'Goedgekeurde verbetering'); sh(upstream, 'push', '-q', 'origin', 'HEAD:main');
  await version.check();

  const browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})}); t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width: 1366, height: 1000}}), errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => new URL(route.request().url()).origin === site ? route.continue() : route.abort());
  await page.goto(site + '/__dev/login'); // no login any more: goes straight back to the site
  await page.getByRole('button', {name: 'Updates beschikbaar (1)', exact: true}).click();
  const panel = page.getByRole('dialog').locator('#version-panel');
  await panel.locator('#version-status').filter({hasText: 'Updates beschikbaar'}).waitFor();
  assert.equal(await panel.locator('#version-branch').textContent(), 'main (goedgekeurde hoofdlijn)');
  assert.ok((await panel.locator('#version-head').textContent()).startsWith(before.slice(0, 7) + ' · '));
  assert.equal(await panel.locator('#version-behind').textContent(), '1');
  assert.match(await panel.locator('#version-message').textContent(), /Nog niet bijgewerkt/);
  await page.reload(); assert.equal(sh(local, 'rev-parse', 'HEAD'), before);

  await page.getByRole('button', {name: '＋ Verbetering voorstellen', exact: true}).click();
  await page.getByRole('dialog').getByRole('button', {name: 'Versie & updates', exact: true}).click();
  await panel.getByRole('button', {name: 'Bijwerken…', exact: true}).click();
  await panel.getByText('Goedgekeurde verbetering', {exact: false}).waitFor();
  const phrase = await panel.locator('#version-phrase').textContent();
  assert.equal(sh(local, 'rev-parse', 'HEAD'), before);
  await panel.getByLabel('Typ ter bevestiging').fill(phrase);
  page.once('dialog', d => d.accept());
  await panel.getByRole('button', {name: 'Bevestigen en bijwerken (alleen fast-forward)', exact: true}).click();
  await panel.locator('#version-status').filter({hasText: 'Actueel'}).waitFor();
  await panel.locator('#version-result[data-outcome=bijgewerkt]').filter({hasText: 'Bijgewerkt: lokale main staat nu op'}).waitFor();
  assert.equal(sh(local, 'rev-parse', 'HEAD'), sh(upstream, 'rev-parse', 'HEAD'));
  assert.equal(await page.getByRole('button', {name: /Updates beschikbaar/}).isVisible(), false);
  assert.deepEqual(errors, []);
});

test('the update button always ends in a clear outcome: blocked with a reason on a branch, updated even if the answer is lost', async t => {
  const repo = process.cwd(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-version-outcome-')), password = randomUUID();
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const origin = path.join(dir, 'origin.git'), upstream = path.join(dir, 'upstream'), local = path.join(dir, 'local');
  sh(dir, 'init', '-q', '--bare', origin); sh(dir, 'clone', '-q', origin, upstream);
  fs.writeFileSync(path.join(upstream, 'README.md'), 'Boerderijrecreatie\n'); sh(upstream, 'add', '.'); sh(upstream, 'commit', '-q', '-m', 'Start'); sh(upstream, 'push', '-q', 'origin', 'HEAD:main');
  sh(dir, 'clone', '-q', '-b', 'main', origin, local); sh(local, 'switch', '-q', '-c', 'feat/eigen-werk');
  fs.writeFileSync(path.join(upstream, 'nieuw.txt'), 'goedgekeurd'); sh(upstream, 'add', '.'); sh(upstream, 'commit', '-q', '-m', 'Goedgekeurde verbetering'); sh(upstream, 'push', '-q', 'origin', 'HEAD:main');
  const version = createVersionMonitor({repo: local});
  const server = createWebsiteServer({root: path.join(repo, 'apps/website'), dataDir: path.join(dir, 'private'), devMode: true, username: 'owner', password, origin: 'http://127.0.0.1:0', boardSnapshot: path.join(repo, 'apps/planbord/snapshot/board.json'), version});
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); const site = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); });
  await version.check();

  const browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})}); t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width: 1366, height: 1000}}), errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => new URL(route.request().url()).origin === site ? route.continue() : route.abort());
  await page.goto(site + '/__dev/login'); // no login any more: goes straight back to the site
  await page.getByRole('button', {name: 'Nieuwe commits op main (1)', exact: true}).click();
  const panel = page.getByRole('dialog').locator('#version-panel'), button = panel.getByRole('button', {name: 'Bijwerken…', exact: true});
  await panel.locator('#version-status').filter({hasText: 'Updates beschikbaar'}).waitFor();
  assert.equal(await button.isDisabled(), false, 'never a silently disabled, waiting button');
  await button.click();
  await panel.locator('#version-result[data-outcome=geblokkeerd]').filter({hasText: /Geblokkeerd: Je werkt op branch ‘feat\/eigen-werk’/}).waitFor();
  assert.equal(await button.isDisabled(), false); assert.equal(await panel.locator('#version-confirm').isVisible(), false);

  // Back on main the update runs; the browser loses the answer, yet the outcome is verified from the real commit.
  sh(local, 'switch', '-q', 'main'); await version.check();
  await button.click(); await panel.locator('#version-result[data-outcome=klaar]').waitFor();
  await panel.getByLabel('Typ ter bevestiging').fill(await panel.locator('#version-phrase').textContent());
  await page.route('**/__dev/version/update', async route => { await route.fetch(); await route.abort('connectionreset'); });
  page.once('dialog', d => d.accept());
  await panel.getByRole('button', {name: 'Bevestigen en bijwerken (alleen fast-forward)', exact: true}).click();
  await panel.locator('#version-result[data-outcome=bijgewerkt]').filter({hasText: 'het antwoord van de server ging verloren'}).waitFor();
  assert.equal(sh(local, 'rev-parse', 'HEAD'), sh(upstream, 'rev-parse', 'HEAD'));
  assert.equal(await page.getByRole('dialog').getAttribute('aria-busy'), null);
  assert.deepEqual(errors, []);
});

test('with auto-apply the owner sees what was applied automatically and that a package update waits for the next start', async t => {
  const repo = process.cwd(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-version-auto-')), password = randomUUID();
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const origin = path.join(dir, 'origin.git'), upstream = path.join(dir, 'upstream'), local = path.join(dir, 'local');
  sh(dir, 'init', '-q', '--bare', origin); sh(dir, 'clone', '-q', origin, upstream);
  const push = (file, content, message) => { fs.mkdirSync(path.dirname(path.join(upstream, file)), {recursive: true}); fs.writeFileSync(path.join(upstream, file), content); sh(upstream, 'add', '.'); sh(upstream, 'commit', '-q', '-m', message); sh(upstream, 'push', '-q', 'origin', 'HEAD:main'); return sh(upstream, 'rev-parse', 'HEAD'); };
  push('README.md', 'Boerderijrecreatie\n', 'Start');
  sh(dir, 'clone', '-q', '-b', 'main', origin, local);
  const version = createVersionMonitor({repo: local, autoApply: true, historyFile: path.join(dir, 'private/version-history.json')});
  const server = createWebsiteServer({root: path.join(repo, 'apps/website'), dataDir: path.join(dir, 'private'), devMode: true, username: 'owner', password, origin: 'http://127.0.0.1:0', boardSnapshot: path.join(repo, 'apps/planbord/snapshot/board.json'), version});
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); const site = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); });
  const applied = push('apps/website/kleur.css', 'body{}', 'Kleur van de knoppen');
  await version.check();
  assert.equal(sh(local, 'rev-parse', 'HEAD'), applied);
  push('apps/backoffice/package.json', '{}', 'Nieuwe afhankelijkheid');
  await version.check();
  assert.equal(sh(local, 'rev-parse', 'HEAD'), applied);

  const browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})}); t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width: 1366, height: 1000}}), errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => new URL(route.request().url()).origin === site ? route.continue() : route.abort());
  await page.goto(site + '/__dev/login'); // no login any more: goes straight back to the site
  await page.getByRole('button', {name: 'Update bij volgende start (1)', exact: true}).click();
  const panel = page.getByRole('dialog').locator('#version-panel');
  await panel.locator('#version-pending-title').filter({hasText: 'Klaar voor de volgende start'}).waitFor();
  assert.match(await panel.locator('#version-pending-list').textContent(), /Wordt verwerkt bij de volgende start van boerbart-test: apps\/backoffice\/package\.json/);
  assert.match(await panel.locator('#version-mode').textContent(), /automatisch bijgewerkt/);
  assert.match(await panel.locator('#version-head').textContent(), /Kleur van de knoppen/);
  await panel.locator('#version-history summary').click();
  assert.match(await panel.locator('#version-history-list').textContent(), /automatisch · .* → .*Kleur van de knoppen/);
  assert.deepEqual(errors, []);
});

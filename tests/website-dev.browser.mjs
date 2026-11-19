import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {createWebsiteServer} from '../tools/website-dev/server.mjs';
import {openStore, readBoard} from '../tools/website-dev/store.mjs';
import {loginEnv, sessionCookie} from './sessie.mjs';
const {chromium} = createRequire(new URL('./browser/package.json', import.meta.url))('playwright');

test('website selection prevents the selected button action and restores a comment without copying page data', async t => {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-selector-website-')), password = randomUUID();
  const server = createWebsiteServer({root: path.join(repo, 'apps/website'), dataDir, devMode: true,
    username: 'selector-owner', password, origin: 'http://127.0.0.1:0', boardSnapshot: path.join(repo, 'tests/fixtures/board.json')});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); fs.rmSync(dataDir, {recursive: true, force: true}); });
  const browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
  t.after(() => browser.close());
  const page = await browser.newPage({httpCredentials: {username: 'selector-owner', password}, viewport: {width: 1366, height: 1000}}); page.setDefaultTimeout(10000);
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.goto(origin + '/__dev/login'); await page.waitForURL(origin + '/');
  await page.getByRole('button', {name: 'Onderdeel aanwijzen', exact: true}).click(); await page.getByRole('button', {name: 'Selecteren stoppen (Esc)', exact: true}).waitFor();
  await page.getByRole('link', {name: /^Bestellen/}).click();
  const dialog = page.getByRole('dialog'); await dialog.waitFor();
  assert.equal(new URL(page.url()).pathname, '/', 'Selecting must not follow the link');
  assert.equal(await page.locator('#bb-development').evaluate(el => el.shadowRoot.querySelector('.selection-box').hidden), false);
  await page.getByLabel('Wat wil je verbeteren?').fill('Maak deze knop beter herkenbaar.');
  await page.getByLabel(/Mijn opmerking bevat geen/).check();
  await page.getByLabel('Planbordonderdeel', {exact: true}).selectOption('n94');
  await page.getByRole('button', {name: 'Concept bewaren', exact: true}).click();
  await page.getByRole('status').filter({hasText: 'Bewaard.'}).waitFor();
  await page.getByRole('button', {name: 'Venster sluiten', exact: true}).click();
  await page.reload();
  await page.getByRole('button', {name: 'Opmerking 1', exact: true}).click();
  assert.equal(await page.getByLabel('Wat wil je verbeteren?').inputValue(), 'Maak deze knop beter herkenbaar.');
  const proposal = await page.evaluate(async () => (await (await fetch('/__dev/proposals')).json()).proposals[0]);
  assert.equal(proposal.location.tag, 'a'); assert.equal(proposal.topic.id, 'n94');
  assert.deepEqual(Object.keys(proposal.location).sort(), ['application', 'route', 'selector', 'signature', 'tag', 'version', 'view']);
  // All supported element kinds use the same value-free locator, even for sensitive form fields.
  const locations = await page.evaluate(async () => {
    const {locate} = await import('/__dev/selector.js');
    const fixture = document.createElement('section');
    fixture.innerHTML = '<p>PRIVATE-TEXT</p><button>PRIVATE-BUTTON</button><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"><input value="PRIVATE-VALUE" id="PRIVATE-ID"><textarea>PRIVATE-NOTE</textarea>';
    document.body.append(fixture); const result = [...fixture.children].map(el => locate(el, 'website')); fixture.remove(); return result;
  });
  assert.equal(locations.length, 5); assert.doesNotMatch(JSON.stringify(locations), /PRIVATE-|data:image/);
});

async function backoffice(t, repo, directory, enabled, password) {
  const check = net.createServer(); check.listen(0, '127.0.0.1'); await once(check, 'listening');
  const port = check.address().port; await new Promise(resolve => check.close(resolve));
  const origin = 'http://127.0.0.1:' + port;
  let output = '';
  const child = spawn(process.execPath, [path.join(repo, 'apps/backoffice/.next/standalone/server.js')], {
    cwd: path.join(repo, 'apps/backoffice'), env: {...process.env, PORT: String(port), HOSTNAME: '127.0.0.1', APP_ORIGIN: origin,
      ...loginEnv, BACKOFFICE_DEV_MODE: enabled ? '1' : '0',
      PROPOSALS_DATA_DIR: path.join(directory, 'proposals'), APP_DATA_DIR: path.join(directory, 'app'),
      PROPOSALS_ASSETS_DIR: path.join(repo, 'apps/backoffice/.next/standalone/proposal-assets'), PROPOSALS_BOARD_SNAPSHOT: path.join(repo, 'tests/fixtures/board.json'), NEXT_TELEMETRY_DISABLED: '1'},
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
  t.after(async () => { if (child.exitCode === null) { child.kill('SIGTERM'); await once(child, 'exit'); } });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(origin + '/api/health')).ok) return origin; } catch {}
    if (child.exitCode !== null) throw new Error('Backoffice start mislukt: ' + output.slice(-1200));
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Backoffice niet gestart. Voer eerst npm run build uit.');
}

test('backoffice owner can annotate a field privately; anonymous access and disabled mode stay closed', async t => {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-selector-backoffice-')), password = randomUUID();
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const origin = await backoffice(t, repo, directory, true, password);
  const shared = openStore(path.join(directory, 'proposals'));
  const board = readBoard({boardSnapshot: path.join(repo, 'tests/fixtures/board.json')});
  shared.mutate({id: randomUUID(), requestId: randomUUID(), revision: 0, action: 'save', description: 'WEBSITE-CROSS-APP voorstel', component: 'Website', pageUrl: 'http://localhost:3002/', topicId: 'n94', privacyConfirmed: true}, 'selector-owner', board, 'http://localhost:3002', 'website'); shared.close();
  assert.equal((await fetch(origin + '/api/improvements/proposals')).status, 401);
  const auth = sessionCookie('selector-owner');
  assert.equal((await fetch(origin + '/api/improvements/proposals', {method: 'POST', headers: {cookie: auth, 'Content-Type': 'application/json', Origin: 'https://evil.invalid'}, body: '{}'})).status, 403);
  const browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
  t.after(() => browser.close());
  const context = await browser.newContext({viewport: {width: 1366, height: 1000}}); await context.addCookies([{name: 'bb_sessie', value: auth.slice('bb_sessie='.length), url: origin}]);
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  let productWrites = 0; const payloads = [];
  await page.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/api/sheets') {
      if (request.method() !== 'GET') productWrites++;
      return route.fulfill({json: {connected: false}});
    }
    if (url.pathname === '/api/products') {
      if (request.method() !== 'GET') productWrites++;
      return route.fulfill({json: [{id: 'PRIVATE-RECORD', version: 1, published: null, draft: {name: 'PRIVATE-PRODUCT', department: 'Restaurant', priceCents: 999999, vat: '9', station: 'kok', available: true, photo: '', check: 'Concept', note: 'PRIVATE-NOTE', sourceId: 'PRIVATE-SOURCE', allergens: []}}]});
    }
    if (url.pathname === '/api/improvements/proposals' && request.method() === 'POST') payloads.push(request.postData());
    return route.continue();
  });
  await page.goto(origin + '/producten?token=PRIVATE-TOKEN');
  await page.getByRole('button', {name: /PRIVATE-PRODUCT/}).click();
  const nameField = page.getByLabel('Productnaam', {exact: true}); await nameField.fill('PRIVATE-FIELD-VALUE');
  await page.getByRole('button', {name: 'Onderdeel aanwijzen', exact: true}).click(); await page.getByRole('button', {name: 'Selecteren stoppen (Esc)', exact: true}).waitFor();
  await nameField.click();
  const dialog = page.locator('#bb-development').getByRole('dialog'); await dialog.waitFor();
  assert.equal(await nameField.inputValue(), 'PRIVATE-FIELD-VALUE');
  assert.equal(await dialog.getByLabel('Afbeelding of screenshot (optioneel)').isVisible(), false);
  await dialog.getByLabel('Wat wil je verbeteren?').fill('Geef dit veld meer ruimte.');
  await dialog.getByLabel(/Mijn opmerking bevat geen/).check();
  await dialog.getByLabel('Planbordonderdeel', {exact: true}).selectOption('n94');
  await dialog.getByRole('button', {name: 'Concept bewaren', exact: true}).click();
  await dialog.getByRole('status').filter({hasText: 'Bewaard.'}).waitFor();
  assert.equal(productWrites, 0); assert.equal(payloads.length, 1); assert.doesNotMatch(payloads[0], /PRIVATE-|999999/);
  await dialog.getByRole('button', {name: 'Venster sluiten', exact: true}).click();
  await page.reload();
  assert.equal(await page.getByRole('button', {name: 'Opmerking 1', exact: true}).count(), 0, 'Editor note must not move to a list element');
  await page.getByRole('button', {name: /PRIVATE-PRODUCT/}).click();
  await page.getByRole('button', {name: 'Opmerking 1', exact: true}).click();
  assert.equal(await dialog.getByLabel('Wat wil je verbeteren?').inputValue(), 'Geef dit veld meer ruimte.');
  await dialog.getByRole('button', {name: 'Venster sluiten', exact: true}).click();
  await nameField.evaluate(el => el.remove());
  await page.getByRole('button', {name: 'Opmerking 1', exact: true}).waitFor({state: 'hidden'});
  await page.getByRole('button', {name: '＋ Verbetering voorstellen', exact: true}).click();
  await dialog.getByRole('button', {name: /WEBSITE-CROSS-APP voorstel/}).waitFor();
  await dialog.getByRole('button', {name: /Geef dit veld meer ruimte/}).click();
  await dialog.getByText(/deze locatie is nu niet zichtbaar of gewijzigd/).waitFor();
  await dialog.getByRole('button', {name: 'Venster sluiten', exact: true}).click();
  await page.goto(origin + '/koppeling');
  await page.locator('#sheet-key').fill('PRIVATE-API-SECRET');
  await page.getByRole('button', {name: 'Onderdeel aanwijzen', exact: true}).click(); await page.getByRole('button', {name: 'Selecteren stoppen (Esc)', exact: true}).waitFor();
  await page.locator('#sheet-key').click();
  await dialog.getByLabel('Wat wil je verbeteren?').fill('Maak de uitleg bij dit beveiligde veld duidelijker.');
  await dialog.getByLabel(/Mijn opmerking bevat geen/).check();
  await dialog.getByRole('button', {name: 'Concept bewaren', exact: true}).click();
  await dialog.getByRole('status').filter({hasText: 'Bewaard.'}).waitFor();
  assert.equal(payloads.length, 2); assert.doesNotMatch(payloads[1], /PRIVATE-|sheet-key/);
  assert.equal(productWrites, 0);
  const off = await backoffice(t, repo, path.join(directory, 'off'), false, password);
  assert.equal((await fetch(off + '/api/improvements/context', {headers: {cookie: auth}})).status, 404);
  assert.doesNotMatch(await (await fetch(off, {headers: {cookie: auth}})).text(), /api\/improvements\/client.js/);
});

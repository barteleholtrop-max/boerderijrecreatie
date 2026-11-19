import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createWebsiteServer} from '../tools/website-dev/server.mjs';
import {openStore, readBoard} from '../tools/website-dev/store.mjs';
const {chromium} = createRequire(new URL('./browser/package.json', import.meta.url))('playwright');

test('owner collects both apps, edits, deletes, approves, creates one simulated Issue and reopens durable links', async t => {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-collection-browser-')), password = randomUUID();
  const boardSnapshot = path.join(repo, 'apps/planbord/snapshot/board.json'), board = readBoard({boardSnapshot});
  const posts = [];
  const github = {async check() {}, async create(title, body) { posts.push({title, body}); return {number: 41, url: 'https://github.com/barteleholtrop-max/boer-bart-2027-website/issues/41'}; }, async find() { return null; }};
  const server = createWebsiteServer({root: path.join(repo, 'apps/website'), dataDir, devMode: true, username: 'collection-owner', password, origin: 'http://127.0.0.1:0', boardSnapshot, github});
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); const origin = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); fs.rmSync(dataDir, {recursive: true, force: true}); });
  const store = openStore(dataDir);
  function seed(application, description) {
    const base = application === 'website' ? origin : 'http://localhost:3001';
    return store.mutate({id: randomUUID(), requestId: randomUUID(), revision: 0, action: 'save', description, component: 'Testonderdeel', pageUrl: base + '/', topicId: 'n94', privacyConfirmed: true,
      ...(application === 'backoffice' ? {location: {version: 1, application, route: '/', view: 'beheer', selector: 'body > main:nth-of-type(1) > input:nth-of-type(1)', signature: 'abcd1234', tag: 'input'}} : {})}, 'collection-owner', board, base, application);
  }
  const website = seed('website', 'Maak de webnavigatie duidelijker.'), backoffice = seed('backoffice', 'Geef het backofficeveld meer ruimte.'), remove = seed('website', 'Dit voorstel mag verwijderd worden.'); store.close();
  const browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})}); t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width: 1366, height: 1000}}); page.setDefaultTimeout(12000);
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  async function login() {
    // No login any more: an old /__dev/login link sends us straight back to the site.
    await page.waitForURL(url => !url.pathname.startsWith('/__dev/login'));
    await page.getByRole('button', {name: '＋ Verbetering voorstellen', exact: true}).waitFor();
  }
  await page.goto(origin + '/__dev/login'); await login();
  await page.getByRole('button', {name: '＋ Verbetering voorstellen', exact: true}).click(); await page.getByRole('button', {name: 'Voorstellen terugvinden', exact: true}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('heading', {name: 'Alle verbeteringsvoorstellen', exact: true}).waitFor();
  const row = id => dialog.locator(`[data-proposal-id="${id}"]`);
  assert.match(await row(website.id).textContent(), /Website/); assert.match(await row(backoffice.id).textContent(), /Backoffice/);
  page.once('dialog', event => event.accept()); await dialog.getByRole('button', {name: 'Verwijder voorstel ' + remove.id, exact: true}).click(); await row(remove.id).waitFor({state: 'detached'});
  async function editBackoffice(description) {
    await dialog.getByRole('button', {name: 'Bewerk voorstel ' + backoffice.id, exact: true}).click();
    const form = dialog.locator('#collection-edit'); await form.getByLabel('Opmerking', {exact: true}).fill(description);
    await form.getByLabel('De opmerking bevat geen gevoelige bedrijfsgegevens.', {exact: true}).check();
    await form.getByRole('button', {name: 'Bewerking bewaren', exact: true}).click(); await dialog.getByRole('status').filter({hasText: 'Bewerking bewaard.'}).waitFor();
  }
  await editBackoffice('Geef dit backofficeveld een heldere uitleg.');
  await row(website.id).locator('input[type=checkbox]').check(); await row(backoffice.id).locator('input[type=checkbox]').check();
  assert.equal(await dialog.getByRole('button', {name: 'Geselecteerde voorstellen naar Codex', exact: true}).isDisabled(), true);
  async function approve() {
    await dialog.getByRole('button', {name: 'Geselecteerde goedkeuren', exact: true}).click();
    const form = dialog.locator('#collection-approve'); await form.getByLabel('Verwijzing naar de planbordbeslissing', {exact: true}).fill('Besluit in centraal planbord, n94, 29 oktober 2026.');
    await form.getByLabel('Deze goedkeuring is al vastgelegd in het centrale planbord.', {exact: true}).check();
    await form.getByRole('button', {name: 'Goedkeuring vastleggen', exact: true}).click(); await dialog.getByRole('status').filter({hasText: 'Planbordgoedkeuring vastgelegd.'}).waitFor();
  }
  await approve();
  assert.equal(await dialog.getByRole('button', {name: 'Geselecteerde voorstellen naar Codex', exact: true}).isEnabled(), true);
  await editBackoffice('De definitieve uitleg voor dit backofficeveld.');
  assert.match(await row(backoffice.id).textContent(), /Klaar voor beoordeling/);
  assert.equal(await dialog.getByRole('button', {name: 'Geselecteerde voorstellen naar Codex', exact: true}).isDisabled(), true);
  await approve();
  await dialog.getByRole('button', {name: 'Geselecteerde voorstellen naar Codex', exact: true}).click();
  const panel = dialog.locator('#collection-dispatch');
  await panel.waitFor({state: 'visible'});
  const command = await panel.getByLabel('Kopieerbare ontwikkelopdracht', {exact: true}).inputValue();
  assert.match(command, /Maak de webnavigatie duidelijker/); assert.match(command, /definitieve uitleg/); assert.match(command, /## Backoffice/); assert.match(command, /n94/);
  assert.equal(await panel.getByRole('button', {name: 'GitHub Issue aanmaken', exact: true}).isDisabled(), true);
  await panel.locator('#dispatch-confirm').check(); await panel.getByRole('button', {name: 'GitHub Issue aanmaken', exact: true}).click();
  await panel.getByRole('link', {name: 'GitHub Issue openen', exact: true}).waitFor();
  assert.equal(posts.length, 1); assert.match(await panel.getByLabel('Kopieerbare ontwikkelopdracht').inputValue(), /issues\/41/);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await panel.getByRole('button', {name: 'Opdracht kopiëren', exact: true}).click();
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /issues\/41/);
  await page.reload(); await page.getByRole('button', {name: '＋ Verbetering voorstellen', exact: true}).click(); await page.getByRole('button', {name: 'Voorstellen terugvinden', exact: true}).click();
  assert.equal(await row(website.id).locator('input[type=checkbox]').isDisabled(), true); assert.match(await row(backoffice.id).textContent(), /Verzonden/);
  const repeated = await page.evaluate(async () => {
    const data = await (await fetch('/__dev/collection')).json();
    const response = await fetch('/__dev/collection/send', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({requestId: crypto.randomUUID(), confirmed: true, items: data.proposals.map(p => ({id: p.id, revision: p.revision}))})}); return response.json();
  });
  assert.equal(repeated.state, 'sent'); assert.equal(posts.length, 1);
  // No log-out button any more: a durable proposal link opens directly, without a login step.
  assert.equal(await page.getByRole('button', {name: 'Uitloggen', exact: true}).count(), 0);
  await page.goto(origin + '/?voorstel=' + website.id); await login();
  await dialog.locator('#form').getByLabel('Wat wil je verbeteren?', {exact: true}).waitFor();
  assert.equal(await dialog.locator('#form').getByLabel('Wat wil je verbeteren?', {exact: true}).inputValue(), website.description);
  assert.equal(await dialog.locator('#form').getByLabel('Wat wil je verbeteren?', {exact: true}).isDisabled(), true);
  assert.deepEqual(errors, []);
});

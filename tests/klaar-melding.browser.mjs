// Melding „staat klaar” in de open bestelapp, ook zonder pushmelding (melding eigenaar 14 november 2026: „melding voor de gast werkt
// nog niet”). De bestelapp vraagt elke paar seconden GET /api/public/push?bestelling=… en toont dan zelf de melding, één keer per
// werkplek. De backoffice is hier nagebootst.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createWebsiteServer} from '../tools/website-dev/server.mjs';
const {chromium} = createRequire(new URL('./browser/package.json', import.meta.url))('playwright');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ID = '0f4131b9-3a6f-4997-a3f6-c2b94de5aabd';
const products = {updated: '2026-11-14T08:00:00.000Z', products: [
  {id: 't-koffie', version: 1, name: 'Koffie', department: 'Restaurant', route: 'eten-drinken', priceCents: 300, vat: '9', available: true, photo: null, allergens: [], allergensChecked: true, optionGroups: []},
]};

test('open bestelapp: melding staat klaar zonder push, één keer per werkplek', async t => {
  const server = createWebsiteServer({root: path.join(repo, 'apps/website'), dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'bb-klaar-')), devMode: false, origin: 'http://127.0.0.1:0'});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
  t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width: 390, height: 844}});
  page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  let asked = 0, ready = false;
  await page.route('**/*', route => {
    const url = new URL(route.request().url()), json = (body, status = 200) => route.fulfill({status, contentType: 'application/json', body: JSON.stringify(body)});
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/api/public/products') return json(products);
    if (url.pathname === '/api/public/order-options') return json({ownAmount: null, group: null, pickup: {days: []}});
    if (url.pathname === '/api/public/push' && url.searchParams.get('bestelling') === ID) {
      asked++;
      return json({ready: ready ? [{station: 'barista', title: 'Je bestelling staat klaar', body: 'Je drinken (P00099) staat klaar bij de koffiebar. Geniet ervan!', tag: 'P00099-barista'}] : []});
    }
    if (url.pathname.startsWith('/api/')) return json({error: 'niet in deze test'}, 503);
    return route.continue();
  });
  // Een bestelling van zojuist, op de rekening (zoals de bon die bewaart).
  await page.addInitScript(id => { if (!localStorage.getItem('bb-klaar')) localStorage.setItem('bb-klaar', JSON.stringify({orders: {[id]: Date.now()}})); }, ID);
  await page.goto(origin + '/bestellen.html');
  await page.waitForTimeout(2500);
  assert.ok(asked >= 1, 'vraagt de stand op');
  assert.equal(await page.getByRole('dialog').count(), 0, 'nog niet klaar: geen melding');
  ready = true;
  const dialog = page.getByRole('dialog');
  await dialog.getByText('Je drinken (P00099) staat klaar bij de koffiebar. Geniet ervan!').waitFor({timeout: 12000});
  await dialog.getByRole('button', {name: 'Ik kom eraan'}).click();
  const before = asked;
  await page.waitForTimeout(7000);
  assert.ok(asked > before, 'blijft vragen');
  assert.equal(await page.getByRole('dialog').count(), 0, 'dezelfde werkplek geeft geen tweede melding');
  assert.deepEqual(errors, []);
});

// Keuze vóór het versturen (melding eigenaar 14 november 2026: „hij zet de bestelling al onderweg voor ik kan klikken dat ik een
// melding wil ontvangen”): in het bestelscherm staat „Stuur mij een bericht als het klaar staat” (standaard aan). De toestemming
// wordt gevraagd bij de tik op bestellen, vóór het versturen; daarna volgt de aanmelding voor deze bestelling.
test('bestelscherm: melding kiezen vóór het versturen, toestemming bij dezelfde tik', async t => {
  const server = createWebsiteServer({root: path.join(repo, 'apps/website'), dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'bb-klaar-')), devMode: false, origin: 'http://127.0.0.1:0'});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
  t.after(() => browser.close());
  const context = await browser.newContext({viewport: {width: 390, height: 844}});
  await context.addInitScript(() => {
    let perm = 'default';
    Object.defineProperty(Notification, 'permission', {get: () => perm});
    Notification.requestPermission = async () => { if (perm === 'default') window.logStep('toestemming'); perm = 'granted'; return perm; };
    PushManager.prototype.getSubscription = async () => null;
    PushManager.prototype.subscribe = async () => ({toJSON: () => ({endpoint: 'https://fcm.googleapis.com/fcm/send/test', keys: {p256dh: 'B'.repeat(87), auth: 'a'.repeat(22)}})});
  });
  const log = [];
  await context.exposeFunction('logStep', step => { log.push(step); });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url()), json = (body, status = 200) => route.fulfill({status, contentType: 'application/json', body: JSON.stringify(body)});
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/api/public/products') return json(products);
    if (url.pathname === '/api/public/order-options') return json({ownAmount: null, group: {code: 'OPA2FEST', name: 'Feest', host: 'Opa', validUntil: '2099-01-01'}, pickup: {days: []}});
    if (url.pathname === '/api/public/orders') { log.push('bestelling'); return json({number: 'P00106', status: 'op-groepsrekening', paid: false, lines: [{name: 'Koffie', quantity: 1, totalCents: 300, vat: '9'}], totalCents: 300, toPayCents: 0, group: {name: 'Feest'}}, 201); }
    if (url.pathname === '/api/public/push' && route.request().method() === 'GET' && !url.searchParams.has('bestelling')) return json({available: true, publicKey: Buffer.alloc(65, 4).toString('base64url')});
    if (url.pathname === '/api/public/push' && route.request().method() === 'POST') { log.push('aanmelding'); return json({ok: true}); }
    if (url.pathname === '/api/public/push') return json({ready: []});
    return route.continue();
  });
  await page.goto(origin + '/bestellen.html?groep=OPA2FEST');
  const dialog = page.getByRole('dialog');
  await page.getByRole('button', {name: /^Koffie/}).click(); await dialog.getByRole('button', {name: /Voeg toe/}).click();
  await page.locator('#basket-bar-button').click(); await dialog.getByRole('button', {name: /^Verder/}).click();
  const box = dialog.getByRole('checkbox', {name: 'Stuur mij een bericht als het klaar staat'});
  assert.equal(await box.isChecked(), true, 'standaard aan');
  await dialog.getByLabel('Naam').fill('Neef Piet'); await dialog.getByLabel('E-mail').fill('piet@example.nl'); await dialog.getByLabel('Telefoon').fill('0612345678');
  await dialog.getByRole('button', {name: /Op de rekening bestellen/}).click();
  await dialog.getByText('P00106').waitFor();
  await dialog.getByText(/Je krijgt een melding zodra het klaarstaat/).waitFor();
  assert.deepEqual(log, ['toestemming', 'bestelling', 'aanmelding'], 'toestemming bij de tik, dan bestellen, dan aanmelden voor deze bestelling');
  assert.equal(await dialog.getByRole('button', {name: 'Stuur mij een bericht als het klaar staat'}).count(), 0, 'niet nog eens vragen');
  assert.deepEqual(errors, []);
});

// QR-code van de rekeninghouder scannen bij „Ik heb een code” (wens eigenaar 5 november 2026). Camera en BarcodeDetector
// worden in de browser nagebootst: de gescande meedoe-link (?groep=CODE) vult de code in en gebruikt hem meteen. Zonder
// scanner (bijvoorbeeld Safari) legt de pagina uit dat de gewone camera-app de link opent.
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
const products = {updated: '2026-11-05T08:00:00.000Z', products: [
  {id: 't-koffie', version: 1, name: 'Koffie', department: 'Koffiebar', route: 'eten-drinken', priceCents: 350, vat: '9', available: true, photo: null, allergens: [], allergensChecked: true, optionGroups: []},
]};
const fakeScanner = `(() => {
  window.BarcodeDetector = class { constructor() {} async detect() { return [{rawValue: 'https://www.example.nl/bestellen.html?groep=ABCD-EFGH'}]; } };
  navigator.mediaDevices.getUserMedia = async () => { const c = document.createElement('canvas'); c.width = 8; c.height = 8; return c.captureStream(); };
})();`;

async function openCodeChoice(t, {scanner}) {
  const server = createWebsiteServer({root: path.join(repo, 'apps/website'), dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'bb-qr-')), devMode: false, origin: 'http://127.0.0.1:0'});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
  t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width: 390, height: 844}, reducedMotion: 'reduce'});
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  if (scanner) await page.addInitScript(fakeScanner);
  else await page.addInitScript(() => { delete window.BarcodeDetector; });
  const options = [];
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || !url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname === '/api/public/products') return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(products)});
    if (url.pathname === '/api/public/order-options') { options.push(url.searchParams.get('groep'));
      return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({ownAmount: null, pickup: {days: []}, group: url.searchParams.get('groep') ? {code: 'ABCDEFGH', name: 'Familie Jansen', host: 'Anna', validUntil: '2026-11-30'} : null})}); }
    return route.fulfill({status: 404, contentType: 'application/json', body: '{}'});
  });
  await page.goto(origin + '/bestellen.html');
  await page.getByRole('button', {name: /^Koffie/}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', {name: /Voeg toe/}).click();
  await page.locator('#basket-bar-button').click();
  await dialog.getByRole('button', {name: /^Verder/}).click();
  await dialog.getByLabel(/Op een gezamenlijke rekening/).check();
  await dialog.getByLabel(/Ik heb een code/).check();
  return {page, dialog, options, errors};
}

test('rekening: QR-code van de rekeninghouder scannen vult de code in en gebruikt hem', async t => {
  const {page, dialog, options, errors} = await openCodeChoice(t, {scanner: true});
  await dialog.getByRole('button', {name: 'QR-code scannen'}).click();
  await page.waitForFunction(() => !document.querySelector('.scan-layer'));
  for (let i = 0; i < 40 && !options.includes('ABCDEFGH'); i++) await page.waitForTimeout(100);
  assert.ok(options.includes('ABCDEFGH'), 'de gescande code wordt bij de backoffice nagevraagd: ' + JSON.stringify(options));
  assert.deepEqual(errors, []);
});

test('rekening: zonder scanner in de browser uitleg over de camera-app', async t => {
  const {dialog, errors} = await openCodeChoice(t, {scanner: false});
  await dialog.getByRole('button', {name: 'QR-code scannen'}).click();
  assert.match(await dialog.innerText(), /Open de camera-app en richt die op de QR-code van de rekeninghouder/);
  assert.deepEqual(errors, []);
});

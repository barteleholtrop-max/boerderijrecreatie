// Streepjescode op de foto (wens eigenaar 10 november 2026): de zelfkassa leest de code zelf uit de foto en stuurt hem mee; de
// backoffice herkent het product of maakt het aan met een prijsvoorstel (inkoopprijs + 20% marge) en het is meteen te koop.
// De backoffice en BarcodeDetector zijn nagebootst; de regels zelf staan in apps/backoffice/tests/package-read.test.mjs.
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
const shotDir = process.env.ZELF_SCREENSHOTS;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');
const products = {updated: '2026-11-09T08:00:00.000Z', products: [
  {id: 't-lever', version: 1, name: 'Runderlever', department: 'Winkel', route: 'winkel', priceCents: 1300, vat: '9', available: true, customerPrice: true, photo: null, allergens: [], allergensChecked: true, optionGroups: []},
  {id: 't-gehakt', version: 1, name: 'Rundergehakt', department: 'Winkel', route: 'winkel', priceCents: 900, vat: '9', available: true, customerPrice: true, photo: null, allergens: [], allergensChecked: true, optionGroups: []},
  {id: 't-jam', version: 1, name: 'Aardbeienjam', department: 'Winkel', route: 'winkel', priceCents: 550, vat: '9', available: true, photo: null, allergens: [], allergensChecked: true, optionGroups: []},
]};

test('streepjescode: de foto gaat met de code naar de backoffice; een nieuw verpakt product komt met het prijsvoorstel in het mandje', async t => {
  const server = createWebsiteServer({root: path.join(repo, 'apps/website'), dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'bb-streepjes-')), devMode: false, origin: 'http://127.0.0.1:0'});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
  t.after(() => browser.close());
  const errors = [], sent = [];
  const vla = {id: 't-vla', version: 1, name: 'Zuivelrijck vanillevla 1 liter', department: 'Winkel', route: 'winkel', priceCents: 200, vat: '9', available: true, customerPrice: false, tile: false, barcodes: ['8710400000051'], photo: null, allergens: [], allergensChecked: false, optionGroups: []};
  const page = await browser.newPage({viewport: {width: 1024, height: 900}});
  page.setDefaultTimeout(15000); page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = undefined;
    window.BarcodeDetector = class { static async getSupportedFormats() { return ['ean_13', 'qr_code']; } async detect() { return [{rawValue: '8710400000051', format: 'ean_13'}]; } };
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url()), json = (body, s = 200) => route.fulfill({status: s, contentType: 'application/json', body: JSON.stringify(body)});
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/api/public/products') return json(products);
    if (url.pathname === '/api/public/order-options') return json({ownAmount: null, group: null, pickup: {days: []}});
    if (url.pathname === '/api/public/etiket') { const b = JSON.parse(route.request().postData()); sent.push(b); return json({ok: true, productId: 't-vla', product: vla, created: true, labelName: 'Zuivelrijck vanillevla 1 liter', totalCents: 200, weightGrams: null, unitPriceCents: null, checked: true, barcode: b.barcode}); }
    if (url.pathname.startsWith('/api/')) return json({error: 'niet in deze test'}, 503);
    return route.continue();
  });
  await page.goto(origin + '/bestellen.html?zelfservice=1');
  await page.getByRole('button', {name: /^Runderlever/}).first().waitFor();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', {name: /Etiket fotograferen/}).click()]);
  await chooser.setFiles({name: 'vla.png', mimeType: 'image/png', buffer: PNG});
  const sheet = page.getByRole('dialog');
  await sheet.getByText('Zuivelrijck vanillevla 1 liter', {exact: true}).waitFor();
  assert.equal(sent[0].barcode, '8710400000051', 'de code uit de foto gaat mee');
  assert.match(sent[0].image, /^data:image\/jpeg;base64,/);
  await sheet.getByRole('button', {name: /Ja, in mijn mandje/}).click();
  assert.equal(await page.locator('#basket-badge').textContent(), '1');
  // De bon is een smalle balk onderin; „Bekijk bon” klapt de regels uit (wens eigenaar 10 november 2026, #391).
  const toggle = page.locator('#kassa-bon .bon-toggle'); await toggle.waitFor();
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  await page.locator('#kassa-bon').getByText('Zuivelrijck vanillevla 1 liter').waitFor();
  await page.locator('#kassa-bon').getByText(/€\s2,00/).first().waitFor();
  assert.deepEqual(errors, []);
});

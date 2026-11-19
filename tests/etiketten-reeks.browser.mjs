// Meerdere etiketten achter elkaar (wens eigenaar 9 november 2026: „een reeks foto's: nog een foto toevoegen, en dan klaar”).
// Elke foto wordt meteen gelezen terwijl de klant de volgende maakt; bij Klaar gaan alle gelezen etiketten in één keer in het mandje.
// De backoffice (Claude) is nagebootst, zoals in tests/etiket-foto.browser.mjs.
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
// Antwoorden van de backoffice per foto, in volgorde; de tweede is niet te lezen, de vierde (opnieuw) wel.
const answers = [
  {ok: true, productId: 't-lever', labelName: 'runderlever', totalCents: 1277, weightGrams: 690, unitPriceCents: 1850, checked: true},
  null,
  {ok: true, productId: 't-jam', labelName: 'aardbeienjam', totalCents: 550, checked: true},
  {ok: true, productId: 't-gehakt', labelName: 'rundergehakt', totalCents: 845, weightGrams: 650, unitPriceCents: 1300, checked: true},
];

// De bon is een smalle balk onderin; „Bekijk bon” klapt de regels uit (wens eigenaar 10 november 2026).
const showBon = async p => { const t = p.locator('#kassa-bon .bon-toggle'); await t.waitFor(); if (await t.getAttribute('aria-expanded') === 'false') await t.click(); };
test('etiketten in een reeks: nog een etiket, nog een, klaar; alles in één keer in het mandje; een mislukte foto opnieuw', async t => {
  const server = createWebsiteServer({root: path.join(repo, 'apps/website'), dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'bb-etiketten-')), devMode: false, origin: 'http://127.0.0.1:0'});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
  t.after(() => browser.close());
  const errors = []; let reads = 0; const release = []; // het lezen van foto 1 wacht tot foto 2 er is: lezen loopt door tijdens het fotograferen
  const page = await browser.newPage({viewport: {width: 1024, height: 900}, deviceScaleFactor: shotDir ? 2 : 1});
  // Zonder eigen camera (oude browser): dan de camera-app van de telefoon (bestandskiezer). Het eigen camerascherm staat in tests/etiket-camera.browser.mjs.
  await page.addInitScript(() => { if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = undefined; });
  page.setDefaultTimeout(15000); page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url()), json = (body, s = 200) => route.fulfill({status: s, contentType: 'application/json', body: JSON.stringify(body)});
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/api/public/products') return json(products);
    if (url.pathname === '/api/public/order-options') return json({ownAmount: null, group: null, pickup: {days: []}});
    if (url.pathname === '/api/public/etiket') {
      const a = answers[reads++];
      if (reads === 1) await new Promise(r => release.push(r));
      return a ? json(a) : json({error: 'Het etiket is niet goed te lezen. Houd het recht en dichtbij, zonder schittering, en probeer het opnieuw.'}, 422);
    }
    if (url.pathname.startsWith('/api/')) return json({error: 'niet in deze test'}, 503);
    return route.continue();
  });
  const photo = async button => { const [chooser] = await Promise.all([page.waitForEvent('filechooser'), button.click()]); await chooser.setFiles({name: 'etiket.png', mimeType: 'image/png', buffer: PNG}); };

  await page.goto(origin + '/bestellen.html?zelfservice=1');
  await page.getByRole('button', {name: /^Runderlever/}).first().waitFor();
  const sheet = page.getByRole('dialog');
  await photo(page.getByRole('button', {name: /Etiket fotograferen/}));
  await sheet.getByText(/Foto 1 · we lezen het etiket/).waitFor();
  assert.equal(await sheet.getByRole('button', {name: /Even lezen/}).isDisabled(), true, 'Klaar kan pas als alles gelezen is');
  // Foto 2 terwijl foto 1 nog gelezen wordt.
  await photo(sheet.getByRole('button', {name: /Nog een etiket/}));
  await sheet.getByText(/Foto 2 niet gelezen/).waitFor();
  release.forEach(r => r());
  await sheet.getByText('Runderlever', {exact: true}).waitFor();
  await photo(sheet.getByRole('button', {name: /Nog een etiket/}));
  await sheet.getByText('Aardbeienjam', {exact: true}).waitFor();
  // Foto 2 opnieuw: wordt rundergehakt.
  await photo(sheet.getByRole('button', {name: 'Opnieuw'}));
  await sheet.getByText('Rundergehakt', {exact: true}).waitFor();
  assert.match(await page.locator('#sheet-title').textContent(), /Etiketten \(3\)/);
  if (shotDir) await page.screenshot({path: path.join(shotDir, 'etiketten-reeks.png')});
  await sheet.getByRole('button', {name: /Alle 3 in mijn mandje/}).click();
  assert.equal(await page.locator('#basket-badge').textContent(), '3');
  const bon = page.locator('#kassa-bon');
  await showBon(page); await bon.getByText(/etiket €\s12,77/).waitFor(); await bon.getByText(/etiket €\s8,45/).waitFor(); await bon.getByText('Aardbeienjam', {exact: true}).waitFor();
  assert.equal(reads, 4);
  assert.deepEqual(errors, []);
});

// Etiket fotograferen (wens eigenaar 9 november 2026): op de zelfservicekassa en met de Zelfkassa van de ledenapp een foto van het
// prijsetiket (runderlever 0,690 kg × € 18,50 = € 12,77). De backoffice (Claude) is hier nagebootst; de regels staan in
// apps/backoffice/tests/label-read.test.mjs en de keten in tests/cooperatie.integration.mjs.
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
  {id: 't-jam', version: 1, name: 'Aardbeienjam', department: 'Winkel', route: 'winkel', priceCents: 550, vat: '9', available: true, photo: null, allergens: [], allergensChecked: true, optionGroups: []},
]};

// De bon is een smalle balk onderin; „Bekijk bon” klapt de regels uit (wens eigenaar 10 november 2026).
const showBon = async p => { const t = p.locator('#kassa-bon .bon-toggle'); await t.waitFor(); if (await t.getAttribute('aria-expanded') === 'false') await t.click(); };
test('etiket fotograferen: zelfservicekassa leest product en bedrag, de klant bevestigt, het bedrag gaat mee; ook de Zelfkassa van de ledenapp', async t => {
  const server = createWebsiteServer({root: path.join(repo, 'apps/website'), dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'bb-etiket-')), devMode: false, origin: 'http://127.0.0.1:0'});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
  t.after(() => browser.close());
  const errors = [], orders = [], photos = []; let answer = {ok: true, productId: 't-lever', labelName: 'runderlever', totalCents: 1277, weightGrams: 690, unitPriceCents: 1850, checked: true}, status = 200;
  const backoffice = route => {
    const url = new URL(route.request().url()), json = (body, s = 200) => route.fulfill({status: s, contentType: 'application/json', body: JSON.stringify(body)});
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/api/public/products') return json(products);
    if (url.pathname === '/api/public/order-options') return json({ownAmount: null, group: null, pickup: {days: []}});
    if (url.pathname === '/api/public/etiket') { photos.push(JSON.parse(route.request().postData()).image); return json(status === 200 ? answer : {error: 'Het etiket is niet goed te lezen. Houd het recht en dichtbij, zonder schittering, en probeer het opnieuw.'}, status); }
    if (url.pathname === '/api/public/orders') { const b = JSON.parse(route.request().postData()); orders.push(b); return json({number: 'P00050', status: 'wacht-op-betaling', paid: false, totalCents: 1277, toPayCents: 1277, lines: [], requestId: b.requestId}, 201); }
    if (url.pathname === '/api/public/qr') return route.fulfill({status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'});
    if (url.pathname.startsWith('/api/')) return json({error: 'niet in deze test'}, 503);
    return route.continue();
  };
  const page = await browser.newPage({viewport: {width: 1024, height: 900}, deviceScaleFactor: shotDir ? 2 : 1});
  // Zonder eigen camera (oude browser): dan de camera-app van de telefoon (bestandskiezer). Het eigen camerascherm staat in tests/etiket-camera.browser.mjs.
  await page.addInitScript(() => { if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = undefined; });
  page.setDefaultTimeout(15000); page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', backoffice);
  const photo = async (p, button) => { const [chooser] = await Promise.all([p.waitForEvent('filechooser'), button.click()]); await chooser.setFiles({name: 'etiket.png', mimeType: 'image/png', buffer: PNG}); };

  // 1. Zelfservicekassa: foto van het etiket → „Klopt dit?” → in het mandje met het etiketbedrag.
  await page.goto(origin + '/bestellen.html?zelfservice=1');
  await page.getByRole('button', {name: /^Runderlever/}).first().waitFor();
  await photo(page, page.getByRole('button', {name: /Etiket fotograferen/}));
  const sheet = page.getByRole('dialog');
  await sheet.getByText(/0,690 kg × €\s18,50 per kg/).waitFor();
  assert.match(photos[0], /^data:image\/jpeg;base64,/, 'verkleinde jpeg'); assert.ok(photos[0].length < 950000);
  if (shotDir) await page.screenshot({path: path.join(shotDir, 'etiket-klopt.png')});
  await sheet.getByRole('button', {name: /Ja, in mijn mandje/}).click();
  assert.equal(await page.locator('#basket-badge').textContent(), '1');
  await showBon(page); await page.locator('#kassa-bon').getByText(/etiket €\s12,77/).waitFor();
  await page.locator('#kassa-bon').getByRole('button', {name: /^Afrekenen/}).click();
  await page.getByRole('dialog').getByRole('button', {name: /Afrekenen met je telefoon/}).click();
  for (let i = 0; i < 50 && !orders.length; i++) await new Promise(r => setTimeout(r, 100));
  assert.deepEqual(orders[0].lines.map(l => [l.productId, l.quantity, l.priceCents]), [['t-lever', 1, 1277]]);

  // 2. Niet te lezen: een duidelijke melding en opnieuw proberen.
  status = 422;
  const phone = await browser.newPage({viewport: {width: 390, height: 844}});
  t.after(() => phone.close()); phone.on('pageerror', e => errors.push('telefoon: ' + e.message));
  await phone.route('**/*', backoffice);
  // 3. Zelfkassa van de ledenapp (?winkel=1): etiketproducten zijn te koop; in het productvenster kan een foto.
  await phone.goto(origin + '/bestellen.html?winkel=1');
  await phone.getByRole('button', {name: /^Runderlever/}).first().click();
  const product = phone.getByRole('dialog');
  await photo(phone, product.getByRole('button', {name: /Foto van het etiket/}));
  await phone.getByRole('dialog').getByText(/niet goed te lezen/).waitFor();
  status = 200;
  await photo(phone, phone.getByRole('dialog').getByRole('button', {name: /Nog een foto maken/}));
  await phone.getByRole('dialog').getByRole('button', {name: /Ja, in mijn mandje/}).click();
  assert.equal(await phone.locator('#basket-badge').textContent(), '1');

  // 4. Gewoon online (zonder ?winkel=1, nieuwe sessie): de winkel staat niet op de bestelpagina (besluit eigenaar 11 november 2026:
  //    de winkel gaat via zelfscannen), met uitleg; geen etiketknop.
  const online = await browser.newPage({viewport: {width: 390, height: 844}});
  t.after(() => online.close()); await online.route('**/*', backoffice);
  await online.goto(origin + '/bestellen.html#winkel');
  await online.getByText(/reken je af in de winkel zelf, met de zelfkassa/).waitFor();
  await online.waitForLoadState('networkidle');
  assert.equal(await online.getByText('Prijs per stuk · in de winkel').count(), 0, 'winkelproducten niet online');
  assert.equal(await online.getByRole('tab', {name: /Uit de winkel/}).count(), 0);
  assert.equal(await online.getByRole('button', {name: /Etiket fotograferen/}).isVisible(), false);
  assert.deepEqual(errors, []);
});

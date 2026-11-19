// Werkplek dicht (wens eigenaar 14 november 2026): producten van een gesloten werkplek staan in de bestelapp op „gesloten”, met
// de reden van de backoffice, en kunnen niet in het mandje. De backoffice is hier nagebootst.
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
const products = {updated: '2026-11-14T08:00:00.000Z', products: [
  {id: 't-tosti', version: 1, name: 'Boerentosti', department: 'Keuken', route: 'eten-drinken', priceCents: 650, vat: '9', available: false, closed: 'De keuken is nu gesloten.', photo: null, allergens: [], allergensChecked: true, optionGroups: []},
  {id: 't-koffie', version: 1, name: 'Koffie', department: 'Koffiebar', route: 'eten-drinken', priceCents: 300, vat: '9', available: true, photo: null, allergens: [], allergensChecked: true, optionGroups: []},
]};

test('bestelapp: product van een gesloten werkplek toont de reden en kan niet in het mandje', async t => {
  const server = createWebsiteServer({root: path.join(repo, 'apps/website'), dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'bb-dicht-')), devMode: false, origin: 'http://127.0.0.1:0'});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
  t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width: 390, height: 844}, deviceScaleFactor: shotDir ? 2 : 1});
  page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url()), json = body => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(body)});
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/api/public/products') return json(products);
    if (url.pathname === '/api/public/order-options') return json({ownAmount: null, group: null, pickup: {days: []}});
    if (url.pathname.startsWith('/api/')) return route.fulfill({status: 503, contentType: 'application/json', body: '{}'});
    return route.continue();
  });
  await page.goto(origin + '/bestellen.html');
  const card = page.locator('.product', {hasText: 'Boerentosti'});
  await card.getByText('De keuken is nu gesloten.').waitFor();
  assert.equal(await card.locator('button.add, .add-btn').count() === 0 || await card.locator('span.add').count() > 0, true, 'geen plusknop');
  await page.getByRole('button', {name: /^Boerentosti/}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', {name: /Nu gesloten/}).waitFor();
  assert.equal(await dialog.getByRole('button', {name: /Nu gesloten/}).isDisabled(), true);
  if (shotDir) await page.screenshot({path: path.join(shotDir, 'werkplek-dicht.png')});
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.product', {hasText: 'Koffie'}).getByText('De keuken is nu gesloten.').count(), 0, 'andere werkplek gewoon open');
  assert.deepEqual(errors, []);
});

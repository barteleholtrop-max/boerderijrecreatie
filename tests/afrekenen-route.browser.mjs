// Eén afrekenroute (besluit eigenaar 3 november 2026): „Afrekenen” op de startpagina gaat naar de bestelpagina
// (bestellen.html) en de winkelmand gaat mee, met de gekozen opties. De oude proefstap afrekenen.html bestaat niet meer.
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
const products = {updated: '2026-11-03T08:00:00.000Z', products: [
  {id: 't-koffie', version: 1, name: 'Koffie', department: 'Restaurant', route: 'eten-drinken', priceCents: 300, vat: '9', available: true, photo: null, allergens: [], allergensChecked: true,
    optionGroups: [{id: 'g-melk', title: 'Melk', required: true, choices: [{id: 'c-zonder', label: 'Zonder melk', extraCents: 0}, {id: 'c-haver', label: 'Havermelk', extraCents: 50}]}]},
  {id: 't-tosti', version: 1, name: 'Boerentosti', department: 'Restaurant', route: 'eten-drinken', priceCents: 650, vat: '9', available: true, photo: null, allergens: null, allergensChecked: false, optionGroups: []},
  {id: 't-eieren', version: 1, name: 'Scharreleieren', department: 'Winkel', route: 'winkel', priceCents: 400, vat: '9', available: true, photo: null, allergens: ['ei'], allergensChecked: true, optionGroups: []},
]};

test('afrekenen op de startpagina gaat met de winkelmand naar de bestelpagina; afrekenen.html is weg', async t => {
  assert.equal(fs.existsSync(path.join(repo, 'apps/website/afrekenen.html')), false);
  const server = createWebsiteServer({root: path.join(repo, 'apps/website'), dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'bb-afrekenen-')), devMode: false, origin: 'http://127.0.0.1:0'});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
  t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width: 1200, height: 900}});
  // Vooraf bestellen in de winkel staat sinds 11 november 2026 uit (zelfscannen); de bewaarde route blijft getest.
  await page.addInitScript(() => { window.BB_SHOP_ONLINE = true; });
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && url.pathname === '/api/public/products') return route.fulfill({status: 200, contentType: 'application/json', headers: {'Access-Control-Allow-Origin': '*'}, body: JSON.stringify(products)});
    if (url.origin === origin && url.pathname.startsWith('/api/')) return route.fulfill({status: 503, contentType: 'application/json', body: '{"error":"niet in deze test"}'});
    return route.continue();
  });

  await page.goto(origin + '/');
  await page.waitForFunction(() => typeof live !== 'undefined' && Array.isArray(live.products));
  // Twee koffie met havermelk en één tosti in de winkelmand van de startpagina, dan Afrekenen.
  await page.evaluate(() => { changeLine(0, 't-koffie', {'g-melk': 'c-haver'}, 2); changeLine(0, 't-tosti', {}, 1); sheet(0, 'cart'); });
  await Promise.all([page.waitForURL(/\/bestellen\.html$/), page.locator('#design-0 .sheet button.primary', {hasText: 'Afrekenen'}).click()]);

  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('bb-bestelling-v2')));
  assert.equal(saved.route, 'menu');
  assert.deepEqual(saved.carts.menu.map(l => [l.id, l.choices, l.qty]).sort(), [['t-koffie', ['c-haver'], 2], ['t-tosti', [], 1]]);
  // De bestelpagina neemt de mand over: 3 stuks in „Eten & drinken”.
  await page.waitForFunction(() => document.getElementById('basket-badge')?.textContent === '3');
  assert.deepEqual(errors, []);
  // De oude afrekenstap bestaat niet meer.
  assert.equal((await page.request.get(origin + '/afrekenen.html')).status(), 404);

  // Winkel: het winkelmandje van de startpagina gaat naar het mandje „Uit de winkel”.
  await page.goto(origin + '/');
  await page.waitForFunction(() => typeof live !== 'undefined' && Array.isArray(live.products));
  // De knop Winkel gaat sinds 3 november 2026 direct naar bestellen.html#winkel; een oude winkelmand op de pagina gaat nog steeds mee.
  await page.evaluate(() => { states[0].page = 'shop'; states[0].sheet = null; render(0); shopAdd(0, 't-eieren'); shopAdd(0, 't-eieren'); sheet(0, 'shopcart'); });
  await Promise.all([page.waitForURL(/\/bestellen\.html$/), page.locator('#design-0 .sheet button.primary', {hasText: 'Afrekenen'}).click()]);
  const shop = await page.evaluate(() => JSON.parse(sessionStorage.getItem('bb-bestelling-v2')));
  assert.equal(shop.route, 'winkel');
  assert.deepEqual(shop.carts.winkel.map(l => [l.id, l.qty]), [['t-eieren', 2]]);
  assert.equal(shop.carts.menu.length, 2, 'het menumandje blijft staan');
  await page.waitForFunction(() => document.getElementById('basket-badge')?.textContent === '2');
  assert.deepEqual(errors, []);
});

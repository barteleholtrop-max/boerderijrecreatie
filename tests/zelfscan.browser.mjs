// Zelfscan op de eigen telefoon (wens eigenaar 12 november 2026: „een zelfscankassa voor gasten op hun eigen telefoon”, met een eigen
// icoon op het startscherm). Eigen pagina zelfscan.html met eigen app (zelfscan-app.json): alleen de winkel, geen eten en drinken.
// De backoffice is hier nagebootst.
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
const product = (id, name, department, route) => ({id, version: 1, name, department, route, priceCents: 150, vat: '9', available: true, photo: null, allergens: [], allergensChecked: true, optionGroups: []});
const products = {updated: '2026-11-12T08:00:00.000Z', products: [product('t-melk', '1L Verse Melk', 'Winkel', 'winkel'), product('t-koffie', 'Koffie', 'Restaurant', 'eten-drinken')]};

test('zelfscan.html: eigen app, alleen de winkel, op de eigen telefoon', async t => {
  const server = createWebsiteServer({root: path.join(repo, 'apps/website'), dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'bb-zelfscan-')), devMode: false, origin: 'http://127.0.0.1:0'});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
  t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width: 390, height: 844}, deviceScaleFactor: shotDir ? 2 : 1, isMobile: true, hasTouch: true});
  page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url()), json = body => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(body)});
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/api/public/products') return json(products);
    if (url.pathname === '/api/public/order-options') return json({ownAmount: null, group: null, pickup: {days: []}});
    if (url.pathname.startsWith('/api/')) return route.fulfill({status: 404, contentType: 'application/json', body: '{}'});
    return route.continue();
  });
  await page.goto(origin + '/zelfscan.html');
  await page.getByText('1L Verse Melk').first().waitFor();
  assert.equal(await page.getByText('Koffie').count(), 0, 'alleen de winkel');
  assert.equal(await page.locator('link[rel=manifest]').getAttribute('href'), 'zelfscan-app.json', 'eigen app');
  assert.equal(await page.title(), 'Zelfscan — Boerderijrecreatie');
  assert.match(await page.locator('.intro h1').textContent(), /Zelfscan/);
  const manifest = await (await page.request.get(origin + '/zelfscan-app.json')).json();
  assert.equal(manifest.id, 'zelfscan'); assert.equal(manifest.scope, 'zelfscan.html'); assert.equal(manifest.display, 'standalone');
  // Winkelgerichte teksten (wens eigenaar 12 november 2026): geen teksten van de bestelpagina.
  const body = await page.locator('body').innerText();
  for (const t of ['Kies iets lekkers', 'Zit je bij Ite', 'Fijn dat je er bent', 'Bestellen op het erf', 'eigen mandje']) assert.ok(!body.includes(t), 'geen bestelpagina-tekst: ' + t);
  assert.match(body, /Pak je boodschappen/); assert.match(body, /Fotografeer het etiket/i);
  if (shotDir) await page.screenshot({path: path.join(shotDir, 'zelfscan.png'), fullPage: true});
  await page.locator('button.add').first().click();
  await page.locator('#basket-bar-button').click();
  if (shotDir) await page.screenshot({path: path.join(shotDir, 'zelfscan-mandje.png')});
  assert.match(await page.locator('#sheet').innerText(), /winkelmandje/i);
  assert.deepEqual(errors, []);
});

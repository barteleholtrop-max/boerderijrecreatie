// Foto op de druktoets van de zelfkassa (melding eigenaar 12 november 2026: „De zelfscankassa toont nog geen afbeeldingen van de
// producten”). Een product met een foto krijgt die bovenaan zijn toets; zonder foto (of als laden mislukt) blijft de toets zoals hij was.
// De backoffice is hier nagebootst; de rest van de zelfkassa staat in tests/zelfservice.browser.mjs.
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
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const product = (id, name, photo) => ({id, version: 1, name, department: 'Winkel', route: 'winkel', priceCents: 400, vat: '9', available: true, photo, allergens: [], allergensChecked: true, optionGroups: []});
const products = {updated: '2026-11-12T08:00:00.000Z', products: [
  product('t-melk', '1L Verse Melk', '/api/public/media/11111111-1111-1111-1111-111111111111'),
  product('t-gehakt', 'Rundergehakt', null),
  product('t-kapot', 'Tartaar', '/api/public/media/22222222-2222-2222-2222-222222222222'),
]};

test('zelfkassa: de druktoets toont de productfoto; zonder foto of bij een kapotte foto geen leeg vak', async t => {
  const server = createWebsiteServer({root: path.join(repo, 'apps/website'), dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'bb-zelf-foto-')), devMode: false, origin: 'http://127.0.0.1:0'});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
  t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width: 1024, height: 800}, deviceScaleFactor: shotDir ? 2 : 1});
  page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url()), json = body => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(body)});
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/api/public/products') return json(products);
    if (url.pathname === '/api/public/order-options') return json({ownAmount: null, group: null, pickup: {days: []}});
    if (url.pathname.endsWith('11111111-1111-1111-1111-111111111111')) return route.fulfill({status: 200, contentType: 'image/png', body: PNG});
    if (url.pathname.startsWith('/api/')) return route.fulfill({status: 404, contentType: 'application/json', body: '{}'});
    return route.continue();
  });
  await page.goto(origin + '/bestellen.html?zelfservice=1');
  const melk = page.locator('button.key', {hasText: '1L Verse Melk'});
  await melk.waitFor();
  await page.waitForFunction(() => document.querySelector('button.key img')?.complete);
  assert.equal(await melk.locator('.key-art img').getAttribute('src'), '/api/public/media/11111111-1111-1111-1111-111111111111', 'foto op de toets');
  assert.ok(await melk.locator('.key-art img').evaluate(img => img.naturalWidth > 0), 'de foto is geladen');
  assert.equal(await page.locator('button.key', {hasText: 'Rundergehakt'}).locator('.key-art').count(), 0, 'zonder foto geen vak');
  await page.waitForFunction(() => ![...document.querySelectorAll('button.key')].find(b => b.textContent.includes('Tartaar'))?.querySelector('.key-art'));
  assert.equal(await page.locator('button.key', {hasText: 'Tartaar'}).locator('.key-art').count(), 0, 'foto laadt niet: vak verdwijnt');
  // Tikken op een toets met foto zet het product nog steeds op de bon.
  await melk.click();
  assert.match(await page.locator('#kassa-bon').textContent(), /1 product/);
  if (shotDir) await page.screenshot({path: path.join(shotDir, 'zelfkassa-foto.png')});
  assert.deepEqual(errors, []);
});

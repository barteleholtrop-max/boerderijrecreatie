// Klant voert prijs in (wens eigenaar 5 november 2026): bij een product als rundvlees verschilt de prijs per stuk en staat
// hij op het etiket. Bij de zelfservicekassa typt de klant het bedrag in; online kan het niet vooraf besteld worden.
// De backoffice is hier nagebootst; de server controleert het bedrag zelf (tests in apps/backoffice).
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
const products = {updated: '2026-11-05T08:00:00.000Z', products: [
  {id: 't-eieren', version: 1, name: '10 Eieren', department: 'Winkel', route: 'winkel', priceCents: 400, vat: '9', available: true, photo: null, allergens: ['ei'], allergensChecked: true, optionGroups: [], customerPrice: false},
  {id: 't-rund', version: 2, name: 'Rundvlees', department: 'Winkel', route: 'winkel', priceCents: 1800, vat: '9', available: true, photo: null, allergens: [], allergensChecked: true, optionGroups: [], customerPrice: true},
]};

async function open(t, query, {shopOnline = false} = {}) {
  const server = createWebsiteServer({root: path.join(repo, 'apps/website'), dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'bb-etiket-')), devMode: false, origin: 'http://127.0.0.1:0'});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
  t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width: 1024, height: 900}, deviceScaleFactor: shotDir ? 2 : 1});
  page.setDefaultTimeout(15000);
  const errors = [], orders = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url()), json = (body, status = 200) => route.fulfill({status, contentType: 'application/json', body: JSON.stringify(body)});
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/api/public/products') return json(products);
    if (url.pathname === '/api/public/order-options') return json({ownAmount: null, group: null, pickup: {days: [{date: '2026-11-06', times: ['10:00']}]}});
    if (url.pathname === '/api/public/orders') { const b = JSON.parse(route.request().postData()); orders.push(b);
      return json({number: 'P00099', status: 'wacht-op-betaling', paid: false, totalCents: 4690, toPayCents: 4690, lines: [{name: 'Rundvlees', quantity: 2, totalCents: 4690, vat: '9'}], requestId: b.requestId}, 201); }
    if (url.pathname.startsWith('/api/')) return json({error: 'niet in deze test'}, 503);
    return route.continue();
  });
  // Vooraf bestellen in de winkel staat sinds 11 november 2026 uit (zelfscannen); de bewaarde route blijft getest.
  if (shopOnline) await page.addInitScript(() => { window.BB_SHOP_ONLINE = true; });
  await page.goto(origin + '/bestellen.html' + query);
  return {page, errors, orders};
}

// De bon is een smalle balk onderin; „Bekijk bon” klapt de regels uit (wens eigenaar 10 november 2026).
const showBon = async p => { const t = p.locator('#kassa-bon .bon-toggle'); await t.waitFor(); if (await t.getAttribute('aria-expanded') === 'false') await t.click(); };
test('etiketprijs: bij de zelfservicekassa typt de klant het bedrag van het etiket in; het gaat mee naar de backoffice', async t => {
  const {page, errors, orders} = await open(t, '?zelfservice=1');
  // Kassa met druktoetsen (9 november 2026): de toets opent het product, want eerst moet het etiketbedrag erin.
  const key = page.locator('.key', {hasText: 'Rundvlees'});
  await key.waitFor();
  assert.match(await key.getAttribute('aria-label'), /prijs van het etiket/);
  await key.click();
  const d = page.getByRole('dialog');
  const add = d.getByRole('button', {name: /Vul eerst de prijs in/});
  assert.equal(await add.isDisabled(), true, 'zonder bedrag niet toevoegen');
  await d.getByLabel(/Prijs op het etiket/).fill('23,45');
  await d.getByRole('button', {name: 'Eén meer'}).click();
  await d.getByRole('button', {name: /Voeg toe aan bestelling.*€\s46,90/}).waitFor();
  if (shotDir) await page.screenshot({path: path.join(shotDir, 'etiketprijs-invoeren.png')});
  await d.getByRole('button', {name: /Voeg toe/}).click();
  const bon = page.locator('#kassa-bon');
  await showBon(page); await bon.getByText(/etiket €\s23,45/).waitFor();
  await bon.getByText(/^€\s46,90$/).first().waitFor();
  if (shotDir) await page.screenshot({path: path.join(shotDir, 'etiketprijs-mandje.png')});
  await bon.getByRole('button', {name: /^Afrekenen/}).click();
  await d.getByRole('button', {name: /Afrekenen met je telefoon/}).click();
  for (let i = 0; i < 50 && !orders.length; i++) await new Promise(r => setTimeout(r, 100));
  assert.equal(orders.length, 1);
  assert.equal(orders[0].route, 'winkel');
  assert.deepEqual(orders[0].lines.map(l => [l.productId, l.quantity, l.priceCents]), [['t-rund', 2, 2345]]);
  assert.deepEqual(errors, []);
});

test('etiketprijs: online staat het product erbij, maar bestel je het in de winkel', async t => {
  const {page, errors} = await open(t, '', {shopOnline: true});
  await page.getByRole('button', {name: /Winkel/}).first().click().catch(() => {});
  const card = page.getByRole('button', {name: /^Rundvlees/}).first();
  await card.waitFor();
  assert.match(await card.getAttribute('aria-label'), /te koop in de winkel/);
  await card.click();
  await page.getByRole('dialog').getByText('Dit product koop je in de winkel.', {exact: false}).waitFor();
  assert.equal(await page.getByRole('dialog').getByLabel(/Prijs op het etiket/).count(), 0);
  assert.deepEqual(errors, []);
});

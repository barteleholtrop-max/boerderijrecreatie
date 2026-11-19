// Afhaalmoment bij vooraf bestellen in de winkel (wens eigenaar 3 november 2026): kies nu meenemen of later ophalen,
// met dag, tijd en naam. Het gekozen moment gaat mee naar de backoffice en staat op de bon.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createWebsiteServer} from '../tools/website-dev/server.mjs';
const shotDir = process.env.ZELF_SCREENSHOTS;
const {chromium} = createRequire(new URL('./browser/package.json', import.meta.url))('playwright');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const products = {updated: '2026-11-03T08:00:00.000Z', products: [
  {id: 't-eieren', version: 1, name: 'Scharreleieren', department: 'Winkel', route: 'winkel', priceCents: 350, vat: '9', available: true, photo: null, allergens: ['ei'], allergensChecked: true, optionGroups: []},
]};
const days = [{date: '2026-11-06', times: ['10:00', '10:30', '11:00']}, {date: '2026-11-08', times: ['14:00', '14:30']}];

test('winkel: later ophalen met dag, tijd en naam; het moment gaat mee en staat op de bon', async t => {
  const server = createWebsiteServer({root: path.join(repo, 'apps/website'), dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'bb-afhalen-')), devMode: false, origin: 'http://127.0.0.1:0'});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
  t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width: 390, height: 844}, reducedMotion: 'reduce'});
  // Vooraf bestellen in de winkel staat sinds 11 november 2026 uit (zelfscannen); de bewaarde route blijft getest.
  await page.addInitScript(() => { window.BB_SHOP_ONLINE = true; });
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const posted = [];
  const cors = {'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type'};
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || !url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname === '/api/public/products') return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(products)});
    if (url.pathname === '/api/public/order-options') return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({ownAmount: null, group: null, pickup: {days}})});
    if (url.pathname === '/api/public/orders') {
      if (route.request().method() === 'OPTIONS') return route.fulfill({status: 204, headers: cors});
      const body = JSON.parse(route.request().postData()); posted.push(body);
      // Op groepsrekening teruggeven: dan is er niets te betalen en verschijnt de bon meteen.
      return route.fulfill({status: 201, headers: cors, contentType: 'application/json', body: JSON.stringify({number: 'P00077', status: 'op-groepsrekening', paid: false, test: true, totalCents: 350,
        group: {name: 'Test'}, toPayCents: 0, chosenCents: null, pickup: body.pickup ?? null, lines: [{name: 'Scharreleieren', quantity: 1, choices: [], note: '', totalCents: 350, vat: '9'}]})});
    }
    return route.fulfill({status: 404, contentType: 'application/json', body: '{}'});
  });
  await page.goto(origin + '/bestellen.html');
  // Alleen winkelproducten: de pagina opent meteen het winkelmandje (geen tabbladen).
  await page.getByRole('button', {name: /^Scharreleieren/}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', {name: /Voeg toe/}).click();
  await page.locator('#basket-bar-button').click();
  await dialog.getByRole('button', {name: /^Verder/}).click();

  // Standaard: de gast is in de winkel en neemt het nu mee (wens eigenaar 10 november 2026: geen verwarrende keuze); bestellen kan meteen.
  assert.equal(await dialog.getByText('Wanneer haal je het op?').count(), 0, 'geen keuze vooraf');
  assert.equal(await dialog.getByLabel('Dag').count(), 0);
  if (shotDir) await page.screenshot({path: (await import('node:path')).join(shotDir, 'afhalen-standaard.png')});
  const send = dialog.getByRole('button', {name: /Bestelling plaatsen/});
  assert.equal(await send.isDisabled(), false);
  // Later ophalen: eerst dag, tijd en naam.
  await dialog.getByRole('button', {name: 'Liever vooraf bestellen en later ophalen?'}).click();
  assert.equal(await send.isDisabled(), true, 'zonder moment niet bestellen');
  assert.match(await dialog.innerText(), /Kies een dag en tijd/);
  await dialog.getByLabel('Dag').selectOption('2026-11-06');
  assert.deepEqual(await dialog.getByLabel('Tijd').locator('option').allInnerTexts(), ['Kies een tijd', '10:00', '10:30', '11:00']);
  await dialog.getByLabel('Tijd').selectOption('10:30');
  assert.equal(await send.isDisabled(), true, 'zonder naam niet bestellen');
  await dialog.getByLabel('Op naam van').fill('Jansen');
  assert.match(await dialog.innerText(), /vrijdag 6 november om 10:30/);
  assert.equal(await send.isDisabled(), false);
  await send.click();
  await page.getByText('P00077').waitFor();
  assert.deepEqual(posted.at(-1).pickup, {date: '2026-11-06', time: '10:30', name: 'Jansen'});
  assert.equal(posted.at(-1).route, 'winkel');
  assert.match(await dialog.innerText(), /Ophalen in de winkel: vrijdag 6 november om 10:30, op naam van Jansen/);
  assert.deepEqual(errors, []);
});

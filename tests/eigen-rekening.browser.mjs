// Eigen rekening op de bestelpagina (wens eigenaar 11 november 2026): eten en drinken komt standaard op je eigen rekening, met naam,
// e-mail en telefoon (klantenkaart) en een zelfgekozen grens voor een waarschuwing. Na afloop één keer afrekenen met een zelfgekozen
// bedrag. De backoffice is nagebootst; de regels zelf staan in apps/backoffice/tests/eigen-rekening.test.mjs.
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
const products = {updated: '2026-11-11T08:00:00.000Z', products: [
  {id: 't-tosti', version: 1, name: 'Boerentosti', department: 'Keuken', priceCents: 650, vat: '9', available: true, photo: null, allergens: [], allergensChecked: true, optionGroups: []},
  {id: 't-thee', version: 1, name: 'Verse muntthee', department: 'Koffiebar', priceCents: 275, vat: '9', available: true, photo: null, allergens: null, allergensChecked: false, optionGroups: []},
]};

test('eigen rekening: standaard bij eten en drinken, tweede bestelling erbij, waarschuwing boven de grens, na afloop afrekenen met eigen bedrag', async t => {
  const server = createWebsiteServer({root: path.join(repo, 'apps/website'), dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'bb-eigen-')), devMode: false, origin: 'http://127.0.0.1:0'});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
  t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width: 390, height: 844}, reducedMotion: 'reduce'});
  page.setDefaultTimeout(10000);
  const errors = [], posted = [], bill = []; page.on('pageerror', e => errors.push(e.message));
  let spent = 0, n = 6, settled = false, bunqDown = true, cashAsked = null;
  const json = (route, body, status = 200) => route.fulfill({status, contentType: 'application/json', body: JSON.stringify(body)});
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin && !url.hostname.endsWith('bunq.me')) return route.abort();
    if (url.hostname.endsWith('bunq.me')) return route.fulfill({status: 200, contentType: 'text/html', body: '<h1>bunq.me</h1>'});
    if (url.pathname === '/api/public/products') return json(route, products);
    if (url.pathname === '/api/public/order-options') return json(route, {ownAmount: {enabled: true, maxPercent: 300, allowZero: true}, pickup: {days: []},
      group: url.searchParams.get('groep') === 'EIGN2345' && !settled ? {code: 'EIGN2345', name: 'Rekening van Anna Jansen', host: 'Anna Jansen', validUntil: '2026-11-11', kind: 'eigen'} : null,
      ...(url.searchParams.get('groep') === 'EIGN2345' && settled ? {groupProblem: 'Deze groepscode is gesloten.'} : {})});
    if (url.pathname === '/api/public/orders') {
      const b = JSON.parse(route.request().postData()); posted.push(b);
      const total = b.lines.reduce((s, l) => s + (l.productId === 't-tosti' ? 650 : 275) * l.quantity, 0); spent += total;
      return json(route, {number: 'P0000' + (++n), status: 'op-groepsrekening', paid: false, lines: [{name: 'Bestelling', quantity: 1, choices: [], note: '', totalCents: total, vat: '9'}], totalCents: total, commercialCents: total,
        chosenCents: null, toPayCents: 0, group: {name: 'Rekening van Anna Jansen', ...(b.openBill ? {code: 'EIGN2345', own: true} : {})}, bill: {kind: 'eigen', spentCents: spent, warnCents: 800, over: spent > 800}}, 201);
    }
    if (url.pathname === '/api/public/rekening') {
      const b = route.request().method() === 'POST' ? JSON.parse(route.request().postData()) : {deel: url.searchParams.get('deel')}; bill.push(b);
      const view = (shares = []) => ({name: 'Rekening van Anna Jansen', code: 'EIGN2345', kind: 'eigen', status: shares.length ? 'gesloten' : 'actief', paidAt: '', warnCents: 800, over: spent > 800,
        fill: {spentCents: spent, limitCents: 50000, percent: 2, near: false, full: false, leftCents: 50000 - spent}, shares, participants: [],
        invoice: {number: 'BB-00012', date: '2026-11-11', bill: 'Rekening van Anna Jansen', holder: {name: 'Anna Jansen'}, products: [], orderedBy: ['Anna Jansen'], exclCents: 850, vat: [], payments: [], differenceCents: 0, paid: false, openCents: spent, paidCents: 0, seller: {name: 'Boerderijrecreatie'}}});
      if (b.action === 'lezen') return json(route, view());
      if (b.action === 'afrekenen') return json(route, view([{id: '11111111-2222-4333-8444-555555555555', position: 1, count: 1, amountCents: spent, status: 'open', holder: true, payer: 'Anna Jansen'}]));
      if (b.deel && route.request().method() === 'GET') return json(route, {bill: 'Rekening van Anna Jansen', kind: 'eigen', holder: 'Anna', payer: 'Anna Jansen', position: 1, count: 1, amountCents: spent, paid: false, replaced: false, online: true, busy: false, cash: cashAsked !== null, toPayCents: cashAsked ?? spent, ownAmount: {maxPercent: 300, allowZero: true}});
      if (b.deel && b.contant === true) { cashAsked = b.chosenCents ?? spent; return json(route, {cash: true, amountCents: cashAsked}); }
      // Eerste poging: bunq weigert; de gast ziet wat bunq zei (melding eigenaar 11 november 2026: „betalen lukt niet”).
      if (b.deel && bunqDown) { bunqDown = false; return json(route, {error: 'Online betalen lukt nu even niet. Betaal bij de kassa of probeer het later opnieuw.', detail: 'bunq kon het verzoek niet verwerken: voorbeeldreden'}, 502); }
      if (b.deel) { settled = true; return json(route, {checkoutUrl: 'https://bunq.me/boerbart/25.00'}); }
    }
    if (url.pathname.startsWith('/api/')) return json(route, {});
    return route.continue();
  });
  const dialog = page.getByRole('dialog');
  await page.goto(origin + '/bestellen.html');
  await page.getByRole('button', {name: /^Boerentosti/}).click(); await dialog.getByRole('button', {name: /Voeg toe/}).click();
  await page.locator('#basket-bar-button').click(); await dialog.getByRole('button', {name: /^Verder/}).click();
  // Standaard: op je eigen rekening. Geen „Wat is het je waard?” per bestelling, wel naam, e-mail en telefoon.
  // „Achteraf betalen” staat voorgekozen; „Nu betalen” vraagt eerst hoeveel, dan het betaalverzoek.
  assert.equal(await dialog.getByRole('radio', {name: /Achteraf betalen/}).isChecked(), true);
  await dialog.getByRole('radio', {name: /^Nu betalen/}).check();
  await dialog.getByRole('heading', {name: 'Hoeveel wil je betalen?'}).waitFor();
  assert.equal(await dialog.getByRole('radio', {name: /Via een betaalverzoek/}).isChecked(), true);
  assert.equal(await dialog.getByRole('radio', {name: /Met je BB-tegoed/}).count(), 0, 'geen betalen met saldo van leden');
  const order = await dialog.locator('.pay h4').allInnerTexts();
  assert.deepEqual(order, ['Hoe wil je betalen?', 'Hoeveel wil je betalen?', 'Geef wat goed voelt', 'Hoe wil je nu betalen?']);
  await dialog.getByRole('radio', {name: /Achteraf betalen/}).check();
  assert.equal(await dialog.getByRole('radio', {name: /Op een gezamenlijke rekening/}).count(), 1, 'gezamenlijke rekening blijft');
  assert.equal(await dialog.locator('.worth').count(), 0, 'geen eigen bedrag per bestelling');
  const send = dialog.getByRole('button', {name: /Op mijn rekening bestellen/});
  assert.equal(await send.isDisabled(), true, 'eerst naam, e-mail en telefoon');
  await dialog.getByLabel('Naam').fill('Anna Jansen'); await dialog.getByLabel('E-mail').fill('anna@example.nl'); await dialog.getByLabel('Telefoon').fill('0612345678');
  await dialog.getByLabel(/Waarschuw me boven/).fill('8');
  await send.click();
  await dialog.getByText('Je bestelling staat op je eigen rekening. We gaan ermee aan de slag.').waitFor();
  // Geen „Jij betaalt € 0,00” (melding eigenaar 11 november 2026), maar het bedrag dat op je rekening komt.
  assert.match(await dialog.locator('.summary').innerText(), /Op je rekening\s*€\s6,50/);
  assert.doesNotMatch(await dialog.innerText(), /Jij betaalt/);
  const first = posted[0];
  assert.equal(first.openBill.kind, 'eigen'); assert.equal(first.openBill.warnCents, 800); assert.equal(first.chosenCents, null);
  assert.deepEqual(first.guest, {name: 'Anna Jansen', email: 'anna@example.nl', phone: '0612345678'});
  assert.equal(first.klant.toestemming, true, 'klantenkaart');
  await page.keyboard.press('Escape');
  await page.locator('#group-banner').getByText('Je eigen rekening').waitFor();
  // Tweede bestelling: vanzelf op dezelfde rekening, boven de grens een waarschuwing (bestellen kan nog wel).
  await page.getByRole('button', {name: /^Verse muntthee/}).click(); await dialog.getByRole('button', {name: /Voeg toe/}).click();
  await page.locator('#basket-bar-button').click(); await dialog.getByRole('button', {name: /^Verder/}).click();
  assert.equal(await dialog.getByRole('radio', {name: /Achteraf betalen/}).count(), 0, 'geen betaalkeuze meer');
  // Gegevens niet opnieuw vragen (melding eigenaar 11 november 2026); de knop toont het bedrag van deze bestelling.
  assert.equal(await dialog.getByLabel('Naam').count(), 0); await dialog.getByText('Op naam van Anna Jansen.').waitFor();
  assert.match(await dialog.getByRole('button', {name: /Op mijn rekening bestellen/}).innerText(), /€\s2,75/);
  await dialog.getByRole('button', {name: /Op mijn rekening bestellen/}).click();
  await dialog.getByRole('alert').getByText(/meer dan je grens van €\s8,00/).waitFor();
  assert.equal(posted[1].groupCode, 'EIGN2345'); assert.equal(posted[1].openBill, undefined);
  // Na afloop: afrekenen, met een zelfgekozen bedrag, via een betaalverzoek.
  await dialog.getByRole('button', {name: 'Mijn rekening · afrekenen'}).click();
  await dialog.getByText('Je eigen rekening').waitFor();
  await dialog.getByRole('button', {name: /^Afrekenen/}).click();
  await dialog.getByText('Totaal van je rekening').waitFor();
  // Veld leeg, met de gemiddelde waarde als houvast en de uitleg waarom je zelf mag kiezen.
  assert.equal(await dialog.getByLabel('Jouw bedrag').inputValue(), ''); assert.equal(await dialog.getByLabel('Jouw bedrag').getAttribute('placeholder'), 'Jouw bedrag');
  assert.match(await dialog.locator('.worth .normal').innerText(), /Gemiddelde waarde bij collega’s\s*€\s9,25/);
  await dialog.getByText('Waarom mag je zelf de prijs bepalen?').waitFor();
  await dialog.getByLabel('Jouw bedrag').fill('25');
  // Contant bij de kassa (wens eigenaar 11 november 2026): de gast ziet wat hij contant betaalt en waar.
  await dialog.getByLabel('Jouw bedrag').fill('20');
  await dialog.getByRole('button', {name: 'Contant betalen bij de kassa'}).click();
  await dialog.getByText(/Je betaalt €\s20,00 contant bij de kassa\. Zeg dat het om de Rekening van Anna Jansen gaat/).waitFor();
  assert.deepEqual(bill.filter(b => b.contant).map(b => b.chosenCents), [2000]);
  cashAsked = null;
  await dialog.getByRole('button', {name: /Betalen via betaalverzoek/}).click();
  await dialog.getByRole('alert').getByText(/bunq kon het verzoek niet verwerken: voorbeeldreden/).waitFor();
  await dialog.getByLabel('Jouw bedrag').fill('25');
  await dialog.getByRole('button', {name: /Betalen via betaalverzoek/}).click();
  await page.waitForURL(/bunq\.me/);
  const pay = bill.find(b => b.deel && !b.contant && b.chosenCents !== undefined);
  assert.equal(pay.chosenCents, 2500); assert.deepEqual(bill.find(b => b.action === 'afrekenen').payers, []);
  assert.deepEqual(errors, []);
});

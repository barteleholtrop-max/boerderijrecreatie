// Zelfservicekassa in de winkel (besluit eigenaar 4 november 2026): bestellen.html?zelfservice=1 op een tablet.
// Alleen het winkelmandje; afrekenen met de eigen telefoon (iDEAL), niet contant; daarna leeg.
// De camerascanner is weg (besluit eigenaar 9 november 2026); etiketten fotograferen staat in tests/etiket-foto.browser.mjs en tests/etiketten-reeks.browser.mjs.
// De backoffice is hier nagebootst; de echte keten staat in tests/betalen.integration.mjs.
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
const products = {updated: '2026-11-04T08:00:00.000Z', products: [
  {id: 't-eieren', version: 1, name: '10 Eieren', department: 'Winkel', route: 'winkel', priceCents: 400, vat: '9', available: true, photo: null, allergens: ['ei'], allergensChecked: true, optionGroups: []},
  {id: 't-jam', version: 1, name: 'Aardbeienjam', supplier: 'Sanne', department: 'Winkel', route: 'winkel', priceCents: 550, vat: '9', available: true, photo: null, allergens: [], allergensChecked: true, optionGroups: []},
  {id: 't-koffie', version: 1, name: 'Koffie', department: 'Restaurant', route: 'eten-drinken', priceCents: 300, vat: '9', available: true, photo: null, allergens: [], allergensChecked: true, optionGroups: []},
]};

// De bon is een smalle balk onderin; „Bekijk bon” klapt de regels uit (wens eigenaar 10 november 2026).
const showBon = async p => { const t = p.locator('#kassa-bon .bon-toggle'); await t.waitFor(); if (await t.getAttribute('aria-expanded') === 'false') await t.click(); };
test('zelfservicekassa: alleen winkel, scannen, afrekenen op de eigen telefoon (iDEAL), niet contant, daarna leeg', async t => {
  const server = createWebsiteServer({root: path.join(repo, 'apps/website'), dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'bb-zelf-')), devMode: false, origin: 'http://127.0.0.1:0'});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
  t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width: 1024, height: 900}, deviceScaleFactor: shotDir ? 2 : 1});
  page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const orders = [], payStarts = [], qrUrls = []; let paid = new Set(), n = 40;
  const backoffice = route => {
    const url = new URL(route.request().url()), json = (body, status = 200) => route.fulfill({status, contentType: 'application/json', body: JSON.stringify(body)});
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/api/public/products') return json(products);
    if (url.pathname === '/api/public/order-options') return json({ownAmount: null, group: null, pickup: {days: [{date: '2026-11-05', times: ['10:00']}]}});
    if (url.pathname === '/api/public/orders') { const b = JSON.parse(route.request().postData()); orders.push(b); n++;
      return json({number: 'P000' + n, status: 'wacht-op-betaling', paid: false, totalCents: 800, toPayCents: 800, lines: [{name: '10 Eieren', quantity: 2, totalCents: 800, vat: '9'}], requestId: b.requestId}, 201); }
    if (url.pathname === '/api/public/dividend') return json({name: 'Anna', availableCents: 2000, bondCents: 2000, bbCents: 0, year: 2025});
    if (url.pathname === '/api/public/qr') { qrUrls.push(url.searchParams.get('url')); return route.fulfill({status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'}); }
    if (url.pathname === '/api/public/payments' && route.request().method() === 'POST') { const b = JSON.parse(route.request().postData()); payStarts.push(b);
      if (b.method === 'bb') { paid.add(b.requestId); return json({paid: true, paidWith: 'dividend', receipt: {number: 'P000' + n, paid: true, totalCents: 800, toPayCents: 800, lines: [{name: '10 Eieren', quantity: 2}]}}); }
      return json({checkoutUrl: 'https://www.mollie.com/checkout/test-mode?method=ideal&token=abc'}); }
    if (url.pathname === '/api/public/payments') { const id = url.searchParams.get('bestelling');
      return json({number: 'P000' + n, status: paid.has(id) ? 'vastgelegd' : 'wacht-op-betaling', paid: paid.has(id), totalCents: 800, toPayCents: 800, lines: [{name: '10 Eieren', quantity: 2}], payment: {available: true, status: paid.has(id) ? 'betaald' : 'open'}}); }
    if (url.pathname.startsWith('/api/')) return json({error: 'niet in deze test'}, 503);
    return route.continue();
  };
  await page.route('**/*', backoffice);

  // Eigen pagina (wens eigenaar 12 november 2026); het oude adres bestellen.html?zelfservice=1 staat in de tests hieronder.
  await page.goto(origin + '/zelfkassa.html');
  await page.getByRole('button', {name: /^10 Eieren/}).first().waitFor();
  assert.equal(await page.getByText('Koffie').count(), 0, 'alleen winkelproducten');
  assert.equal(await page.locator('#routes').isHidden(), true, 'geen keuze eten & drinken');
  assert.equal(await page.locator('.foot').isHidden(), true, 'geen link terug naar de website');
  // Op de tablet geïnstalleerd (wens eigenaar 9 november 2026): eigen app, altijd de zelfkassa, volledig scherm.
  // ?v=2 (11 november 2026): nieuwe versie van het app-bestand, zodat telefoons de vaste liggende stand niet blijven onthouden.
  assert.match(await page.evaluate(() => document.querySelector('link[rel=manifest]').href), /zelfkassa-app\.json$/);
  const app = await (await fetch(origin + '/zelfkassa-app.json')).json();
  assert.deepEqual([app.start_url, app.display, app.id, app.orientation], ['zelfkassa.html', 'fullscreen', 'zelfkassa', 'any'], 'staand op de telefoon, liggend op de tablet: het toestel bepaalt');
  // Alleen de kassapagina hoort bij de Zelfkassa-app; de rest van de website (ook de bestelpagina) opent daar niet in.
  assert.equal(app.scope, 'zelfkassa.html');
  assert.equal(await page.title(), 'Zelfkassa — Boerderijrecreatie');
  assert.equal(await page.locator('.intro h1').textContent(), 'Zelfkassa');
  // Etiket fotograferen staat altijd op de zelfkassa, ook als er nog geen product met een etiketprijs is.
  await page.getByRole('button', {name: /Etiket fotograferen/}).waitFor();
  // Wie levert het (wens eigenaar 9 november 2026), klein op de toets.
  await page.locator('.key', {hasText: 'Aardbeienjam'}).getByText('Geleverd door Sanne').waitFor();
  // Kassa met druktoetsen (9 november 2026): elke tik op de toets zet er één op de bon.
  const addEggs = async () => { const key = page.locator('.key', {hasText: '10 Eieren'}); await key.click(); await key.click(); await showBon(page); await page.locator('#kassa-bon').getByText('10 Eieren').waitFor(); };

  // 1. Afrekenen: alleen met de eigen telefoon. De QR-code op de tablet opent de betaalpagina op de telefoon; geen contant.
  await addEggs();
  assert.equal(await page.locator('#kassa-bon .bon-line').count(), 1, 'de bon klapt uit');
  await page.locator('#kassa-bon .bon-toggle').click(); assert.equal(await page.locator('#kassa-bon .bon-line').count(), 0, 'dichtgeklapt: alleen de balk');
  await page.locator('#kassa-bon').getByText(/2 producten/).waitFor();
  if (shotDir) await page.screenshot({path: path.join(shotDir, 'zelfservice-toetsen.png')});
  await page.locator('#kassa-bon').getByRole('button', {name: /^Afrekenen/}).click();
  const dialog = page.getByRole('dialog');
  assert.equal(await dialog.getByText('Wanneer haal je het op?').count(), 0, 'geen afhaalkeuze bij de zelfservicekassa');
  assert.equal(await dialog.getByRole('button', {name: /[Cc]ontant/}).count(), 0, 'niet contant op de tablet');
  if (shotDir) await page.screenshot({path: path.join(shotDir, 'zelfservice-betalen.png')});
  await dialog.getByRole('button', {name: /Afrekenen met je telefoon/}).click();
  await dialog.getByRole('img', {name: 'QR-code om te betalen'}).waitFor();
  if (shotDir) await page.screenshot({path: path.join(shotDir, 'zelfservice-qr.png')});
  assert.equal(orders[0].route, 'winkel');
  assert.equal(qrUrls.at(-1), origin + '/bestellen.html?betaal=' + orders[0].requestId, 'QR naar de betaalpagina op de telefoon');
  assert.equal(payStarts.length, 0, 'de tablet start zelf geen betaling');
  assert.equal(await dialog.getByRole('button', {name: /[Cc]ontant/}).count(), 0);

  // 2. Op de telefoon: alleen het betaalverzoek (iDEAL); betalen met saldo van leden bestaat hier niet, ook niet met een oude
  // ledenkoppeling op de telefoon. Na de betaling ziet de tablet het vanzelf.
  const phone = await browser.newPage({viewport: {width: 390, height: 844}});
  t.after(() => phone.close());
  phone.on('pageerror', e => errors.push('telefoon: ' + e.message));
  await phone.route('**/*', backoffice);
  await phone.addInitScript(() => localStorage.setItem('bb-lid', 'a'.repeat(43)));
  await phone.goto(origin + '/bestellen.html?betaal=' + orders[0].requestId);
  const pay = phone.getByRole('dialog');
  await pay.getByRole('button', {name: /Betalen via betaalverzoek/}).waitFor();
  assert.equal(await pay.getByRole('button', {name: /Betalen met je saldo/}).count(), 0, 'geen saldo van leden');
  assert.equal(await pay.getByText(/BB-saldo|ledenpagina/).count(), 0, 'geen uitleg over leden');
  if (shotDir) await phone.screenshot({path: path.join(shotDir, 'zelfservice-telefoon.png')});
  paid.add(orders[0].requestId); // betaald via het betaalverzoek (Mollie)
  await dialog.getByText(/Betaald! Neem je boodschappen/).waitFor();
  await dialog.getByRole('button', {name: 'Volgende klant'}).click();
  await page.locator('#kassa-bon').getByText(/Tik op een toets/).waitFor();

  // 3. Een andere telefoon: ook alleen het betaalverzoek.
  const guest = await browser.newPage({viewport: {width: 390, height: 844}});
  t.after(() => guest.close());
  await guest.route('**/*', backoffice);
  await guest.goto(origin + '/bestellen.html?betaal=' + orders[0].requestId.replace(/.$/, c => c === '0' ? '1' : '0'));
  await guest.getByRole('dialog').getByRole('button', {name: /Betalen via betaalverzoek/}).waitFor();
  assert.equal(await guest.getByRole('button', {name: /Betalen met je saldo/}).count(), 0);

  // 4. Een QR-sticker met een gewone telefoon scannen: de bestelpagina opent dat product.
  await guest.goto(origin + '/bestellen.html?winkel=1&product=t-jam');
  await guest.getByRole('dialog').getByText('Aardbeienjam').first().waitFor();
  assert.equal(new URL(guest.url()).searchParams.has('product'), false, 'product uit het adres gehaald');
  assert.deepEqual(errors, []);
});

test('zelfservicekassa met „Wat is het je waard?”: na het invullen van een bedrag gaat Afrekenen met je telefoon aan', async t => {
  const server = createWebsiteServer({root: path.join(repo, 'apps/website'), dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'bb-zelf-')), devMode: false, origin: 'http://127.0.0.1:0'});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
  t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width: 1024, height: 900}});
  page.setDefaultTimeout(15000);
  const errors = [], orders = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url()), json = (body, status = 200) => route.fulfill({status, contentType: 'application/json', body: JSON.stringify(body)});
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/api/public/products') return json(products);
    if (url.pathname === '/api/public/order-options') return json({ownAmount: {enabled: true, maxPercent: 200, allowZero: false}, group: null, pickup: {days: []}});
    if (url.pathname === '/api/public/orders') { const b = JSON.parse(route.request().postData()); orders.push(b); return json({number: 'P00060', status: 'wacht-op-betaling', paid: false, totalCents: 800, chosenCents: b.chosenCents, toPayCents: b.chosenCents ?? 800, lines: [], requestId: b.requestId}, 201); }
    if (url.pathname === '/api/public/qr') return route.fulfill({status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'});
    if (url.pathname.startsWith('/api/')) return json({error: 'niet in deze test'}, 503);
    return route.continue();
  });
  await page.goto(origin + '/bestellen.html?zelfservice=1');
  const key = page.locator('.key', {hasText: '10 Eieren'}); await key.click(); await key.click();
  await page.locator('#kassa-bon').getByRole('button', {name: /^Afrekenen/}).click();
  const dialog = page.getByRole('dialog'), pay = dialog.getByRole('button', {name: /Afrekenen met je telefoon/});
  assert.equal(await pay.isDisabled(), true, 'eerst zelf een bedrag kiezen');
  await dialog.locator('#worth').fill('10');
  assert.equal(await pay.isDisabled(), false, 'na het invullen: afrekenen kan');
  assert.match(await pay.innerText(), /€\s10,00/);
  await pay.click();
  await dialog.getByRole('img', {name: 'QR-code om te betalen'}).waitFor();
  assert.equal(orders[0].chosenCents, 1000);
  assert.deepEqual(errors, []);
});

test('zelfkassa op een telefoon (tabletlink gescand): afrekenen gaat meteen naar de betaalpagina, zonder QR-code', async t => {
  const server = createWebsiteServer({root: path.join(repo, 'apps/website'), dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'bb-zelf-')), devMode: false, origin: 'http://127.0.0.1:0'});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
  t.after(() => browser.close());
  const context = await browser.newContext({viewport: {width: 390, height: 844}, screen: {width: 390, height: 844}, isMobile: true, hasTouch: true});
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  const errors = [], orders = [], qr = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url()), json = (body, status = 200) => route.fulfill({status, contentType: 'application/json', body: JSON.stringify(body)});
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/api/public/products') return json(products);
    if (url.pathname === '/api/public/order-options') return json({ownAmount: null, group: null, pickup: {days: []}});
    if (url.pathname === '/api/public/orders') { const b = JSON.parse(route.request().postData()); orders.push(b); return json({number: 'P00070', status: 'wacht-op-betaling', paid: false, totalCents: 400, toPayCents: 400, lines: [], requestId: b.requestId}, 201); }
    if (url.pathname === '/api/public/payments' && route.request().method() === 'GET') return json({number: 'P00070', status: 'wacht-op-betaling', paid: false, totalCents: 400, toPayCents: 400, lines: [{name: '10 Eieren', quantity: 1}], payment: {available: true, status: null}});
    if (url.pathname === '/api/public/qr') { qr.push(url.search); return route.fulfill({status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>'}); }
    if (url.pathname.startsWith('/api/')) return json({error: 'niet in deze test'}, 503);
    return route.continue();
  });
  // Telt hoe vaak de pagina om volledig scherm vraagt: op een telefoon nooit (de melding daarvan viel over Afrekenen).
  await page.addInitScript(() => { window.__fullscreen = 0; Element.prototype.requestFullscreen = function () { window.__fullscreen++; return Promise.resolve(); }; });
  await page.goto(origin + '/bestellen.html?zelfservice=1');
  await page.locator('.key', {hasText: '10 Eieren'}).click();
  assert.equal(await page.evaluate(() => window.__fullscreen), 0, 'geen volledig scherm op een telefoon');
  await page.locator('#kassa-bon').getByRole('button', {name: /^Afrekenen/}).click();
  await page.getByRole('dialog').getByRole('button', {name: /^Afrekenen/}).click();
  await page.getByRole('dialog').getByRole('button', {name: /Betalen via betaalverzoek/}).waitFor();
  assert.equal(qr.length, 0, 'geen QR-code op de telefoon');
  assert.equal(orders.length, 1);
  assert.deepEqual(errors, []);
});

// Zelfscan op de eigen telefoon (wens eigenaar 13 november 2026: „hij moet eerst vragen hoeveel je wil betalen”):
// in het afrekenscherm staat „Geef wat goed voelt” boven „Hoe wil je betalen?”.
test('zelfscan op de telefoon: eerst hoeveel je wilt betalen, dan hoe', async t => {
  const server = createWebsiteServer({root: path.join(repo, 'apps/website'), dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'bb-zelf-')), devMode: false, origin: 'http://127.0.0.1:0'});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
  t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width: 390, height: 844}});
  page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url()), json = body => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(body)});
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/api/public/products') return json(products);
    if (url.pathname === '/api/public/order-options') return json({ownAmount: {enabled: true, maxPercent: 200, allowZero: false}, group: null, pickup: {days: []}});
    if (url.pathname.startsWith('/api/')) return route.fulfill({status: 503, contentType: 'application/json', body: '{}'});
    return route.continue();
  });
  await page.goto(origin + '/bestellen.html?winkel=1&product=t-eieren');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', {name: /Voeg toe|In mijn mandje/}).first().click();
  await page.locator('#basket-bar-button').click();
  await dialog.getByRole('button', {name: /^Verder/}).click();
  await dialog.getByRole('heading', {name: 'Geef wat goed voelt'}).waitFor();
  const order = await dialog.evaluate(d => [...d.querySelectorAll('h4')].map(x => x.textContent));
  assert.ok(order.indexOf('Geef wat goed voelt') >= 0 && order.indexOf('Geef wat goed voelt') < order.indexOf('Hoe wil je betalen?'), order.join(' | '));
  assert.equal(await dialog.locator('.worth').count(), 1, 'het bedrag staat er één keer');
  // Het bedragblok past in het betaalblok (wens eigenaar 13 november 2026: het stak rechts buiten het scherm).
  const fit = await dialog.evaluate(d => { const w = d.querySelector('.worth').getBoundingClientRect(), p = d.querySelector('.worth').parentElement.getBoundingClientRect(); return w.right <= p.right + 0.5 && w.left >= p.left - 0.5; });
  assert.equal(fit, true, 'Geef wat goed voelt past binnen het blok');
  assert.deepEqual(errors, []);
});

// Zelfscan betaald (wens eigenaar 13 november 2026): geen „Stuur mij een bericht als het klaar staat” (dat is voor eten en
// drinken), maar „Veel plezier met je boodschappen”.
test('zelfscan betaald: veel plezier met je boodschappen, geen bericht als het klaar staat', async t => {
  const server = createWebsiteServer({root: path.join(repo, 'apps/website'), dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'bb-zelf-')), devMode: false, origin: 'http://127.0.0.1:0'});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
  t.after(() => browser.close());
  const errors = [];
  const pageUrl = p => p + '?betaal=0b0e7a52-1c3d-4e5f-8a9b-0c1d2e3f4a5b';
  const receipt = winkel => ({number: 'P00091', status: 'vastgelegd', paid: true, totalCents: 420, commercialCents: 420, chosenCents: 400, toPayCents: 400, winkel,
    lines: [{name: 'Boerderijrecreatie eieren', quantity: 1, totalCents: 420, vat: '9'}], payment: {available: true, status: 'betaald'}});
  const open = async (winkel, path0 = '/bestellen.html') => {
    const page = await browser.newPage({viewport: {width: 390, height: 844}});
    page.setDefaultTimeout(15000); page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { window.PushManager = window.PushManager || function () {}; });
    await page.route('**/*', route => {
      const url = new URL(route.request().url()), json = body => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(body)});
      if (url.origin !== origin) return route.abort();
      if (url.pathname === '/api/public/products') return json(products);
      if (url.pathname === '/api/public/order-options') return json({ownAmount: null, group: null, pickup: {days: []}});
      if (url.pathname === '/api/public/payments') return json(receipt(winkel));
      if (url.pathname.startsWith('/api/')) return route.fulfill({status: 503, contentType: 'application/json', body: '{}'});
      return route.continue();
    });
    await page.goto(origin + pageUrl(path0));
    await page.getByRole('dialog').getByText('P00091').waitFor();
    return page;
  };
  const shop = await open(true), dialog = shop.getByRole('dialog');
  await dialog.getByText('Betaald! Veel plezier met je boodschappen.').waitFor();
  assert.equal(await dialog.getByRole('button', {name: /Stuur mij een bericht/}).count(), 0);
  assert.equal(await dialog.getByRole('button', {name: 'Klaar'}).count(), 1);
  // In de zelfscan-app (wens eigenaar 13 november 2026: „bij de zelfscan mag de app afsluiten”): Klaar sluit de bon en meldt dat je
  // de app kunt sluiten (een browser laat een pagina zichzelf meestal niet sluiten).
  const app = await open(true, '/zelfscan.html');
  await app.evaluate(() => { window.__closed = 0; window.close = () => { window.__closed++; }; });
  await app.getByRole('dialog').getByRole('button', {name: 'Klaar'}).click();
  await app.getByText('Klaar! Je kunt de app nu sluiten.').waitFor();
  assert.equal(await app.getByRole('dialog').count(), 0, 'bon dicht');
  // Niet zelf sluiten (melding eigenaar 14 november 2026): dan kwam een ouder tabblad met de bestelpagina tevoorschijn.
  assert.equal(await app.evaluate(() => window.__closed), 0, 'Klaar sluit het tabblad niet');
  assert.equal(await app.getByText('Eten & drinken').first().isVisible(), false, 'geen eten en drinken in beeld in de zelfscan');
  const food = await open(false);
  await food.getByRole('dialog').getByText('Betaald! Je bestelling is doorgegeven en we gaan ermee aan de slag.').waitFor();
  assert.deepEqual(errors, []);
});

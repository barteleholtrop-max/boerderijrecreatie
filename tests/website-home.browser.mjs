// Startpagina (3 november 2026, wensen eigenaar): volgorde spelen → winkel → eten, de naam "Ite by Boer Bart",
// Winkel opent de nieuwe bestelpagina met het winkelmandje, de agenda van deze week als kaarten, en
// contactgegevens in de footer uit de centrale planning (/api/public/availability → contact).
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
const shotDir = process.env.HOME_SCREENSHOTS;
const day = n => new Intl.DateTimeFormat('sv-SE', {timeZone: 'Europe/Amsterdam'}).format(new Date(Date.now() + n * 86400000));

test('startpagina: volgorde, Ite, winkel naar de bestelpagina, agenda als kaarten en contact in de footer', async t => {
  const server = createWebsiteServer({root: path.join(repo, 'apps/website'), dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'bb-home-')), devMode: false, origin: 'http://127.0.0.1:0'});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
  t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width: 1400, height: 900}, deviceScaleFactor: shotDir ? 2 : 1});
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const availability = {open: {state: 'onbekend', today: null, note: '', nextOpen: null},
    yte: {moments: [{date: day(3), time: '19:00'}], weeksAhead: 8}, visit: {blocks: [], days: []}, groups: {blocks: []},
    events: [{id: 'e-lam', date: day(1), start: '10:00', end: '12:00', title: 'Lammetjes knuffelen', description: 'Kom kijken.', example: false, signup: {open: true, spotsLeft: 10}, priceCents: 0, paymentInfo: '', payOnline: false}],
    contact: {phone: '0513 123 456', email: 'info@boerbart.nl', whatsapp: '06 12 34 56 78'}, updated: new Date().toISOString()};
  const yte = [];
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && url.pathname === '/api/public/yte-requests') { const b = JSON.parse(route.request().postData()); yte.push(b); return route.fulfill({status: 201, contentType: 'application/json', body: JSON.stringify({ok: true, status: 'aanvraag', name: b.name, date: b.date, from: b.time, to: '22:00', people: b.people})}); }
    if (url.origin === origin && url.pathname === '/api/public/availability') return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(availability)});
    if (url.origin === origin && url.pathname.startsWith('/api/')) return route.fulfill({status: 503, contentType: 'application/json', body: '{"error":"niet in deze test"}'});
    return url.origin === origin ? route.continue() : route.abort();
  });

  await page.goto(origin + '/');
  const card = page.locator('#design-0');
  await card.locator('.week-card').first().waitFor();
  const nav = (await card.locator('.desktop-navigation button').allInnerTexts()).map(s => s.trim());
  assert.deepEqual(nav.slice(0, 6), ['Mijn Bloei', 'De boerderij', 'Spelen', 'Winkel', 'Eten & drinken bestellen', 'Ite']);
  const cards = (await card.locator('.desktop-cards h3').allInnerTexts()).map(s => s.replace(/\s+/g, ' ').trim());
  assert.deepEqual(cards, ['Boartsje & ûntdekke', 'De pleatswinkel', 'Ite by Boer Bart']);
  assert.doesNotMatch(await card.innerText(), /\bYte\b/, 'nergens meer "Ite by Boer Bart" in beeld');
  // Agenda van deze week als kaart, klikbaar naar meer informatie.
  assert.match(await card.locator('.week-card').first().innerText(), /Lammetjes knuffelen[\s\S]*10:00–12:00 uur/);
  // Footer: contactgegevens uit de centrale planning.
  const footer = card.locator('.footer-contact');
  assert.equal(await footer.getByRole('link', {name: '0513 123 456'}).getAttribute('href'), 'tel:0513123456');
  assert.equal(await footer.getByRole('link', {name: 'info@boerbart.nl'}).getAttribute('href'), 'mailto:info@boerbart.nl');
  assert.equal(await footer.getByRole('link', {name: 'WhatsApp'}).getAttribute('href'), 'https://wa.me/31612345678');
  if (shotDir) {
    await card.locator('.desktop-cards').scrollIntoViewIfNeeded(); await page.screenshot({path: path.join(shotDir, 'home-kaarten.png')});
    await card.locator('.desktop-today').scrollIntoViewIfNeeded(); await page.screenshot({path: path.join(shotDir, 'home-agenda-footer.png'), fullPage: false});
  }
  await card.locator('.week-card').first().click();
  await card.getByText('Kom kijken.').waitFor();
  // Ite: de gast kiest of hij graag aanschuift bij andere gasten; het antwoord gaat mee met de aanvraag.
  await page.goto(origin + '/');
  await card.locator('.desktop-navigation').getByRole('button', {name: 'Ite', exact: true}).click();
  const ite = card.locator('.sheet');
  await ite.getByText('Vinden jullie het leuk om aan te schuiven bij andere gasten?').waitFor();
  assert.match(await ite.innerText(), /Ite by Boer Bart/);
  await ite.locator('.moments button').first().click();
  await ite.getByLabel('Naam').fill('Anna de Vries'); await ite.getByLabel('E-mailadres').fill('anna@example.nl'); await ite.getByLabel('Telefoonnummer').fill('0612345678');
  await ite.getByLabel('Ja, gezellig').check(); await ite.getByLabel(/Boer Bart mag mijn gegevens/).check();
  if (shotDir) { await ite.getByText('Vinden jullie het leuk').scrollIntoViewIfNeeded(); await page.screenshot({path: path.join(shotDir, 'ite-aanschuiven.png')}); }
  await card.getByRole('button', {name: /Reservering aanvragen/}).click();
  await card.getByText(/Tige tank/).waitFor();
  assert.equal(yte[0].sharing, true);
  // Praktisch: de hele blokken zijn klikbaar; "In fraach?" toont de contactgegevens uit de planning.
  await page.goto(origin + '/');
  await card.locator('.desktop-navigation').getByRole('button', {name: 'Praktisch', exact: true}).click();
  await card.locator('.info-click').filter({hasText: 'In fraach?'}).click();
  assert.equal(await card.locator('.sheet').getByRole('link', {name: '0513 123 456'}).getAttribute('href'), 'tel:0513123456');
  await card.locator('.sheet').getByRole('button', {name: /sluiten/i}).first().click();
  await card.locator('.info-click').filter({hasText: 'Wannear komst?'}).press('Enter');
  await page.waitForFunction(() => states[0].page === 'plan');
  // Winkel gaat naar de nieuwe bestelpagina, met het winkelmandje open.
  await page.goto(origin + '/');
  await card.locator('.desktop-navigation').getByRole('button', {name: 'Winkel', exact: true}).click();
  await page.waitForURL(/\/bestellen\.html#winkel$/);
  // De winkel gaat via zelfscannen (besluit eigenaar 11 november 2026): de bestelpagina legt dat uit.
  await page.getByText(/reken je af in de winkel zelf, met de zelfkassa/).waitFor();
  assert.deepEqual(errors, []);
});

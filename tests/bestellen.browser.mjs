// Bestelpagina voor gasten (apps/website/bestellen.html): leest het aanbod alleen uit de centrale
// backoffice (/api/public/products), rekent bedragen met actuele prijzen en verstuurt de bestelling naar
// /api/public/orders met één aanvraagnummer, ook als de verbinding even wegvalt. Buiten de lokale
// websitepoorten (zoals in de telefoonstand en in deze test) staan pagina en backoffice op hetzelfde adres.
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
const shotDir = process.env.BESTELLEN_SCREENSHOTS; // optioneel: schermafbeeldingen voor beoordeling

// Testgegevens in het formaat van GET /api/public/products (geen echte prijzen).
const fixture = () => ({updated: '2026-11-02T08:00:00.000Z', products: [
  {id: 't-koffie', version: 1, name: 'Koffie', department: 'Koffiebar', priceCents: 300, vat: '9', available: true, photo: null, allergens: [], allergensChecked: true,
    optionGroups: [{id: 'g-melk', title: 'Melk', required: true, choices: [{id: 'c-zonder', label: 'Zonder melk', extraCents: 0}, {id: 'c-haver', label: 'Havermelk', extraCents: 50}]}]},
  {id: 't-thee', version: 1, name: 'Verse muntthee', department: 'Koffiebar', priceCents: 275, vat: '9', available: true, photo: null, allergens: null, allergensChecked: false, optionGroups: []},
  {id: 't-tosti', version: 1, name: 'Boerentosti', department: 'Keuken', priceCents: 650, vat: '9', available: true, photo: null, allergens: ['gluten', 'melk'], allergensChecked: true, optionGroups: []},
  {id: 't-soep', version: 1, name: 'Soep van de dag', department: 'Keuken', priceCents: 500, vat: '9', available: false, photo: null, allergens: null, allergensChecked: false, optionGroups: []},
  {id: 't-eieren', version: 1, name: 'Scharreleieren', department: 'Winkel', route: 'winkel', priceCents: 350, vat: '9', available: true, photo: null, allergens: ['ei'], allergensChecked: true, optionGroups: []},
  {id: 't-soeppakket', version: 1, name: 'Soeppakket', department: 'Speelboerderij', route: 'winkel', priceCents: 900, vat: '9', available: true, photo: null, allergens: null, allergensChecked: false, optionGroups: []},
]});

// Sinds 11 november 2026 bestel je eten en drinken standaard op je eigen rekening; deze tests betalen meteen (wens eigenaar).
const payNow = async dialog => { const r = dialog.getByRole('radio', {name: /^Nu betalen/}); if (await r.count() && !(await r.isChecked())) await r.check(); };

test('gast bestelt met actuele prijzen uit de backoffice; bestelling wordt één keer vastgelegd', async t => {
  const server = createWebsiteServer({root: path.join(repo, 'apps/website'), dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'bb-bestellen-')), devMode: false, origin: 'http://127.0.0.1:0'});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });

  const browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
  t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, reducedMotion: 'reduce'});
  // Vooraf bestellen in de winkel staat sinds 11 november 2026 uit (zelfscannen); de bewaarde route blijft getest.
  await page.addInitScript(() => { window.BB_SHOP_ONLINE = true; });
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));

  let data = fixture(), down = false, calls = 0, orderMode = 'drop';
  const posted = [], payments = [];
  const paidReceipt = {number: 'P00042', status: 'vastgelegd', paid: true, test: true, totalCents: 740, lines: [{name: 'Koffie', quantity: 2, choices: ['Melk: Havermelk'], note: '', totalCents: 740, vat: '9'}], payment: {available: true, status: 'betaald'}};
  const cors = {'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type'};
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && url.pathname === '/api/public/orders') {
      if (route.request().method() === 'OPTIONS') return route.fulfill({status: 204, headers: cors});
      const body = JSON.parse(route.request().postData());
      assert.equal(route.request().headers()['content-type'], 'application/json');
      posted.push(body);
      if (orderMode === 'drop') { orderMode = 'ok'; return route.abort('connectionreset'); } // verbinding valt weg
      if (orderMode === 'changed') return route.fulfill({status: 409, headers: cors, contentType: 'application/json', body: '{"error":"De kaart is net bijgewerkt. Kijk je bestelling nog even na."}'});
      // Nagebootste backoffice: rekent zelf met de testgegevens, zoals de echte server.
      const lines = body.lines.map(l => {
        const p = data.products.find(x => x.id === l.productId);
        const extra = Object.entries(l.selections).reduce((s, [g, c]) => s + p.optionGroups.find(x => x.id === g).choices.find(x => x.id === c).extraCents, 0);
        return {name: p.name, quantity: l.quantity, choices: Object.entries(l.selections).map(([g, c]) => p.optionGroups.find(x => x.id === g).title + ': ' + p.optionGroups.find(x => x.id === g).choices.find(x => x.id === c).label), note: l.note, totalCents: (p.priceCents + extra) * l.quantity, vat: p.vat};
      });
      return route.fulfill({status: 201, headers: cors, contentType: 'application/json', body: JSON.stringify({number: 'P00042', status: 'wacht-op-betaling', paid: false, lines, totalCents: lines.reduce((s, l) => s + l.totalCents, 0)})});
    }
    // Betalen (Mollie): zonder ingestelde sleutel meldt de backoffice dat online betalen nog niet aanstaat.
    if (url.origin === origin && url.pathname === '/api/public/payments') {
      if (route.request().method() === 'OPTIONS') return route.fulfill({status: 204, headers: cors});
      if (route.request().method() === 'POST') { payments.push(JSON.parse(route.request().postData()));
        return route.fulfill({status: 503, headers: cors, contentType: 'application/json', body: '{"error":"Online betalen staat nog niet aan.","unavailable":true}'}); }
      payments.push({status: url.searchParams.get('bestelling')});
      return route.fulfill({status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(paidReceipt)});
    }
    if (url.origin === origin && url.pathname === '/api/public/products') {
      calls++;
      return down ? route.fulfill({status: 503, contentType: 'application/json', body: '{"error":"Het aanbod is tijdelijk niet beschikbaar."}'})
        : route.fulfill({status: 200, contentType: 'application/json', headers: {'Access-Control-Allow-Origin': '*'}, body: JSON.stringify(data)});
    }
    return url.origin === origin ? route.continue() : route.abort();
  });
  const shot = async name => { if (shotDir) await page.screenshot({path: path.join(shotDir, name + '.png'), fullPage: name.startsWith('kaart')}); };
  const reload = async () => { await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); };

  await page.goto(origin + '/bestellen.html');
  await page.getByRole('heading', {name: 'Koffiebar'}).waitFor();
  assert.equal(await page.getByRole('heading', {name: 'Keuken'}).count(), 1);
  assert.equal(await page.getByText('Scharreleieren').count(), 0, 'winkelproducten staan in een eigen route');
  assert.equal(await page.getByText('Soeppakket').count(), 0, 'de backoffice bepaalt het mandje, niet de afdelingsnaam');
  assert.match(await page.getByRole('button', {name: /^Koffie,/}).innerText(), /€\s3,00/);
  await shot('kaart');

  // Personaliseren bij elk beschikbaar product (verzoek eigenaar 3 november 2026); „+” met verplichte keuze opent eerst het product.
  assert.equal(await page.getByRole('button', {name: 'Personaliseren: Soep van de dag'}).count(), 0, 'niet beschikbaar: geen Personaliseren');
  await page.getByRole('button', {name: 'Personaliseren: Verse muntthee'}).click();
  assert.match(await page.getByRole('dialog').innerText(), /Opmerking/);
  await page.keyboard.press('Escape');
  await page.getByRole('button', {name: 'Koffie: eerst een keuze maken'}).click();
  assert.equal(await page.getByRole('dialog').getByRole('button', {name: /Maak eerst een keuze/}).isDisabled(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#basket-bar').isVisible(), false, 'nog niets in het mandje');

  // Niet beschikbaar: wel zichtbaar, niet toe te voegen.
  await page.getByRole('button', {name: /^Soep van de dag/}).click();
  assert.equal(await page.getByRole('button', {name: /Nu niet beschikbaar/}).isDisabled(), true);
  await page.keyboard.press('Escape');

  // Verplichte keuze met meerprijs; allergenen alleen als ze gecontroleerd zijn.
  await page.getByRole('button', {name: /^Koffie,/}).click();
  const dialog = page.getByRole('dialog');
  assert.equal(await dialog.getByRole('button', {name: /Maak eerst een keuze/}).isDisabled(), true);
  await dialog.getByLabel(/^Havermelk/).check();
  await dialog.getByRole('button', {name: 'Eén meer'}).click();
  await shot('product');
  assert.match(await dialog.getByRole('button', {name: /Voeg toe/}).innerText(), /€\s7,00/);
  await dialog.getByRole('button', {name: /Voeg toe/}).click();
  await page.getByRole('button', {name: /^Verse muntthee/}).click();
  assert.match(await dialog.innerText(), /Vraag het even aan een van ons/);
  await dialog.getByRole('button', {name: /Voeg toe/}).click();
  assert.match(await page.locator('#basket-bar').innerText(), /3[\s\S]*€\s9,75/);

  // Mandje en afronden.
  await page.locator('#basket-bar-button').click();
  assert.match(await dialog.innerText(), /Havermelk/);
  await shot('mandje');
  await dialog.getByRole('button', {name: /^Verder/}).click();
  await shot('afronden');
  assert.equal(posted.length, 0, 'pas versturen na bevestigen');
  assert.equal(await dialog.getByRole('alert').count(), 0, 'geen foutmelding zonder fout');
  assert.doesNotMatch(await dialog.innerText(), /\[object/);
  await page.keyboard.press('Escape');

  // Prijs gewijzigd in de backoffice: het mandje rekent met de nieuwe prijs (geen opgeslagen bedragen).
  data = fixture(); data.products[0].priceCents = 320; await reload();
  await page.waitForFunction(() => /€\s10,15/.test(document.getElementById('basket-bar-total').textContent));
  // Product van de kaart gehaald: regel verdwijnt met een melding.
  data.products = data.products.filter(p => p.id !== 't-thee'); await reload();
  await page.getByText(/Verse muntthee is niet meer op de kaart/).waitFor();
  assert.match(await page.locator('#basket-bar-total').innerText(), /€\s7,40/);

  // Mandje blijft bewaard na herladen.
  await page.reload(); await page.getByRole('heading', {name: 'Koffiebar'}).waitFor();
  assert.match(await page.locator('#basket-bar').innerText(), /2/);

  // Bestellen: eerste poging valt weg, tweede poging gebruikt hetzelfde aanvraagnummer.
  await page.locator('#basket-bar-button').click();
  await dialog.getByRole('button', {name: /^Verder/}).click();
  await payNow(dialog); await dialog.getByRole('button', {name: /Bestelling plaatsen/}).click();
  await dialog.getByText(/Geen verbinding/).waitFor();
  await payNow(dialog); await dialog.getByRole('button', {name: /Bestelling plaatsen/}).click();
  await dialog.getByText('P00042').waitFor();
  assert.equal(posted.length, 2);
  assert.equal(posted[0].requestId, posted[1].requestId, 'opnieuw proberen maakt geen tweede bestelling');
  assert.match(posted[0].requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.deepEqual(posted[1], {requestId: posted[0].requestId, route: 'eten-drinken', lines: [{productId: 't-koffie', version: 1, quantity: 2, note: '', selections: {'g-melk': 'c-haver'}}], chosenCents: null, groupCode: null});
  assert.equal(JSON.stringify(posted).includes('priceCents'), false, 'de website stuurt geen prijzen mee');
  assert.match(await dialog.innerText(), /€\s7,40/);
  assert.match(await dialog.innerText(), /wacht op betaling/);
  assert.match(await dialog.innerText(), /Online betalen staat nog niet aan/);
  assert.deepEqual(payments[0], {requestId: posted[0].requestId, page: '/bestellen.html'}, 'betalen start met hetzelfde aanvraagnummer');
  await shot('bevestigd');
  await dialog.getByRole('button', {name: 'Terug naar de kaart'}).click();
  assert.equal(await page.locator('#basket-bar').isHidden(), true, 'mandje is leeg na bestellen');

  // Kaart veranderd tijdens bestellen: de backoffice weigert, de pagina haalt de kaart opnieuw op.
  await page.getByRole('button', {name: /^Boerentosti/}).click();
  await dialog.getByRole('button', {name: /Voeg toe/}).click();
  orderMode = 'changed'; data.products.find(p => p.id === 't-tosti').priceCents = 700;
  await page.locator('#basket-bar-button').click();
  await dialog.getByRole('button', {name: /^Verder/}).click();
  await payNow(dialog); await dialog.getByRole('button', {name: /Bestelling plaatsen/}).click();
  await dialog.getByText(/De bedragen hieronder zijn bijgewerkt/).waitFor();
  assert.match(await dialog.innerText(), /€\s7,00/);
  const before = posted.length; orderMode = 'ok';
  await payNow(dialog); await dialog.getByRole('button', {name: /Bestelling plaatsen/}).click();
  await dialog.getByText('P00042').waitFor();
  assert.notEqual(posted[before].requestId, posted[before - 1].requestId, 'na een gewijzigde kaart een nieuw aanvraagnummer');
  await dialog.getByRole('button', {name: 'Terug naar de kaart'}).click();

  // Winkel heeft een eigen mandje.
  await page.getByRole('tab', {name: /Uit de winkel/}).click();
  await page.getByRole('button', {name: /^Scharreleieren/}).click();
  await dialog.getByRole('button', {name: /Voeg toe/}).click();
  assert.match(await page.locator('#basket-bar').innerText(), /winkelmandje · 1[\s\S]*€\s3,50/);
  assert.equal(await page.getByText('Soeppakket').count(), 1);
  await shot('winkel');

  // Storing: geen prijzen tonen, wel netjes uitleggen.
  down = true; await reload();
  await page.getByRole('heading', {name: 'Even geduld…'}).waitFor();
  assert.doesNotMatch(await page.locator('body').innerText(), /€/, 'bij een storing staan er geen bedragen in beeld');
  await shot('storing');
  down = false; await page.getByRole('button', {name: 'Opnieuw proberen'}).click();
  await page.getByRole('heading', {name: 'Winkel'}).waitFor();

  // Terug van Mollie: de pagina vraagt de stand op bij de backoffice en toont de betaalde bestelling.
  const back = '5f0c1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b';
  await page.goto(origin + '/bestellen.html?bestelling=' + back);
  await dialog.getByText(/Betaald!/).waitFor();
  assert.match(await dialog.innerText(), /P00042[\s\S]*testomgeving van Mollie/);
  assert.equal(new URL(page.url()).search, '', 'het aanvraagnummer verdwijnt uit de adresbalk');
  assert.deepEqual(payments.at(-1), {status: back});
  await shot('betaald');

  assert.ok(calls >= 5);
  assert.deepEqual(errors, []);
});

test('de bestelpagina bevat zelf geen prijzen of producten', () => {
  for (const file of ['bestellen.html', 'bestellen.js', 'bestellen.css']) {
    const text = fs.readFileSync(path.join(repo, 'apps/website', file), 'utf8');
    assert.doesNotMatch(text, /€\s?\d|\d\s?€|priceCents\s*:\s*\d/, file);
  }
});

test('eigen bedrag ("Wat is het je waard?") en bestellen op groepsrekening', async t => {
  const server = createWebsiteServer({root: path.join(repo, 'apps/website'), dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'bb-bestellen-')), devMode: false, origin: 'http://127.0.0.1:0'});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
  t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, reducedMotion: 'reduce'});
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const posted = [], asked = [];
  let groupFull = false;
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/api/public/products') return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(fixture())});
    if (url.pathname === '/api/public/order-options') {
      const code = url.searchParams.get('groep'); asked.push(code);
      const body = {ownAmount: {enabled: true, maxPercent: 300, allowZero: true}, group: null};
      if (code === 'OPA2FEST' && !groupFull) body.group = {code, name: '70 jaar opa Jan', host: 'Opa Jan', validUntil: '2026-11-30'};
      if (code === 'OPA2FEST' && groupFull) body.groupProblem = 'Het budget van deze groep is bereikt. Vraag het aan de gastheer of bestel en betaal zelf.';
      return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(body)});
    }
    if (url.pathname === '/api/public/orders') {
      const body = JSON.parse(route.request().postData()); posted.push(body);
      if (body.groupCode && groupFull) return route.fulfill({status: 409, contentType: 'application/json', body: JSON.stringify({error: 'Het budget van deze groep is bereikt. Vraag het aan de gastheer of bestel en betaal zelf.', reason: 'groep'})});
      const lines = [{name: 'Boerentosti', quantity: 1, choices: [], note: '', totalCents: 650, vat: '9'}];
      return route.fulfill({status: 201, contentType: 'application/json', body: JSON.stringify({number: 'P00007', status: body.groupCode ? 'op-groepsrekening' : 'wacht-op-betaling', paid: false, lines, totalCents: 650,
        commercialCents: 650, chosenCents: body.chosenCents, toPayCents: body.groupCode ? 0 : body.chosenCents ?? 650, group: body.groupCode ? {name: '70 jaar opa Jan'} : null})});
    }
    return route.continue();
  });
  const dialog = page.getByRole('dialog');
  const addTosti = async () => { await page.getByRole('button', {name: /^Boerentosti/}).click(); await dialog.getByRole('button', {name: /Voeg toe/}).click(); };
  const checkout = async () => { await page.locator('#basket-bar-button').click(); await dialog.getByRole('button', {name: /^Verder/}).click(); await payNow(dialog); };

  // Eigen bedrag: de normale waarde als houvast, het veld begint leeg en de gast typt zelf (wens eigenaar 5 november 2026),
  // boven het maximum geblokkeerd, nul mag.
  await page.goto(origin + '/bestellen.html');
  await page.getByRole('heading', {name: 'Keuken'}).waitFor();
  assert.equal(await page.locator('#group-banner').isHidden(), true);
  await addTosti(); await checkout();
  await dialog.getByRole('heading', {name: 'Geef wat goed voelt'}).waitFor();
  assert.doesNotMatch(await dialog.innerText(), /inkomen/, 'geen verschil maken tussen gasten');
  assert.match(await dialog.locator('.worth').innerText(), /Gemiddelde waarde bij collega’s\s*€\s6,50/);
  const field = dialog.getByLabel('Jouw bedrag'), send = dialog.getByRole('button', {name: /Bestelling plaatsen/});
  assert.match(await dialog.locator('.worth').innerText(), /Geef wat goed voelt\s*Boerderijrecreatie, een boerderij van overvloed\./);
  assert.equal(await dialog.getByLabel('Jouw bedrag').inputValue(), '', 'het veld begint leeg');
  // Toetsenbord moet weg kunnen (wens eigenaar 8 november 2026): knop „Klaar” en Enter halen de focus van het veld.
  assert.equal(await field.getAttribute('enterkeyhint'), 'done');
  await field.focus(); await dialog.getByRole('button', {name: 'Klaar'}).click();
  assert.equal(await field.evaluate(el => el === document.activeElement), false, 'Klaar sluit het toetsenbord');
  await field.focus(); await field.press('Enter');
  assert.equal(await field.evaluate(el => el === document.activeElement), false, 'Enter sluit het toetsenbord');
  assert.equal(await send.isDisabled(), true, 'eerst zelf een bedrag intypen');
  assert.match(await dialog.locator('.vat-summary').innerText(), /zodra je je bedrag hebt ingevuld/);
  await field.fill('6,50');
  assert.match(await dialog.locator('.vat-summary').innerText(), /Waarvan btw 9%\s*€\s0,54/);
  await dialog.getByText('Waarom mag je zelf de prijs bepalen?', {exact:true}).click();
  assert.match(await dialog.locator('.worth-explanation').innerText(), /vrijwillig en zonder druk/);
  assert.match(await dialog.locator('.worth-explanation').innerText(), /aandacht en liefde[\s\S]*gemiddelde prijzen[\s\S]*een plek zijn voor iedereen/);
  assert.equal(await dialog.locator('.worth-explanation').getAttribute('open'), '');
  assert.match(await dialog.locator('.worth-explanation').innerText(), /Na aftrek van de btw[\s\S]*drie gelijke delen/);
  assert.equal(await dialog.locator('.worth-distribution li').count(), 3);

  await field.fill('25');
  assert.match(await dialog.getByText(/maximaal/).innerText(), /€\s19,50/);
  assert.equal(await send.isDisabled(), true);
  assert.match(await dialog.locator('.vat-summary').innerText(), /geldig bedrag/);
  await field.fill('0');
  assert.match(await dialog.locator('.vat-summary').innerText(), /Waarvan btw 9%\s*€\s0,00/);
  await dialog.getByText(/Dat mag; we zien het apart/).waitFor();
  await field.fill('8,50');
  assert.match(await send.innerText(), /€\s8,50/);
  assert.match(await dialog.locator('.vat-summary').innerText(), /Waarvan btw 9%\s*€\s0,70/);
  assert.equal(await dialog.locator('.worth-explanation').getAttribute('open'), '', 'uitleg blijft open tijdens typen');
  await send.click();
  await dialog.getByText('P00007').waitFor();
  assert.deepEqual(posted.at(-1).chosenCents, 850); assert.equal(posted.at(-1).groupCode, null);
  assert.match(await dialog.innerText(), /Gemiddelde waarde\s*€\s6,50[\s\S]*Jouw bedrag\s*€\s8,50/);
  await dialog.getByRole('button', {name: 'Terug naar de kaart'}).click();

  // Groepslink: banner, geen eigen bedrag, gast betaalt niets.
  await page.goto(origin + '/bestellen.html?groep=opa2-fest');
  await page.locator('#group-banner').getByText('70 jaar opa Jan').waitFor();
  assert.match(await page.locator('#group-banner').innerText(), /rekening van Opa Jan\. Jij betaalt niets/);
  assert.equal(asked.at(-1), 'OPA2FEST');
  await addTosti(); await checkout();
  assert.equal(await dialog.locator('.worth').count(), 0, 'op groepsrekening geen eigen bedrag');
  // Op een rekening laat iedereen naam, e-mail en telefoon achter (wens eigenaar 5 november 2026).
  const groupSend = dialog.getByRole('button', {name: /Op de rekening bestellen/});
  assert.equal(await groupSend.isDisabled(), true, 'zonder gegevens nog niet');
  await dialog.getByLabel('Naam').fill('Neef Piet'); await dialog.getByLabel('E-mail').fill('piet@example.nl'); await dialog.getByLabel('Telefoon').fill('0612345678');
  assert.match(await groupSend.innerText(), /€\s0,00/);
  await groupSend.click();
  await dialog.getByText('P00007').waitFor();
  assert.match(await dialog.locator('.vat-summary').innerText(), /groepsrekening[\s\S]*€\s0,54/);
  assert.equal(posted.at(-1).groupCode, 'OPA2FEST'); assert.equal(posted.at(-1).chosenCents, null); assert.deepEqual(posted.at(-1).guest, {name: 'Neef Piet', email: 'piet@example.nl', phone: '0612345678'});
  assert.match(await dialog.innerText(), /Jij betaalt\s*€\s0,00/);
  // Op de rekening is de bestelling geregeld. Kan de browser meldingen tonen, dan heet sluiten „Geen bericht nodig”,
  // anders „Terug naar de kaart” (verschilt per browser, ook tussen deze machine en GitHub).
  await dialog.getByRole('button', {name: /^(Geen bericht nodig|Terug naar de kaart)$/}).click();

  // Budget op: de backoffice weigert, de pagina legt het uit en de gast kan zelf betalen.
  groupFull = true;
  await addTosti(); await checkout();
  await dialog.getByRole('button', {name: /Op de rekening bestellen/}).click();
  await dialog.getByRole('alert').getByText(/budget van deze groep is bereikt/).waitFor();
  await page.keyboard.press('Escape');
  await page.locator('#group-banner').getByRole('button', {name: 'Zonder deze code bestellen'}).click();
  assert.equal(await page.locator('#group-banner').isHidden(), true);
  await checkout();
  await dialog.getByRole('heading', {name: 'Geef wat goed voelt'}).waitFor();
  await dialog.getByLabel('Jouw bedrag').fill('6,50'); // gelijk aan de normale waarde: gewoon de normale prijs
  await payNow(dialog); await dialog.getByRole('button', {name: /Bestelling plaatsen/}).click();
  await dialog.getByText('P00007').waitFor();
  assert.equal(posted.at(-1).groupCode, null); assert.equal(posted.at(-1).chosenCents, null);
  assert.deepEqual(errors, []);
});

test('pushmelding: na bestellen aanmelden met één knop; de aanmelding gaat met het aanvraagnummer naar de backoffice', async t => {
  const server = createWebsiteServer({root: path.join(repo, 'apps/website'), dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'bb-bestellen-')), devMode: false, origin: 'http://127.0.0.1:0'});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
  t.after(() => browser.close());
  const context = await browser.newContext({viewport: {width: 390, height: 844}, reducedMotion: 'reduce'});
  // De pushdienst van de browser bestaat niet in deze testbrowser: alleen het aanmelden zelf wordt nagebootst.
  await context.addInitScript(() => {
    // Headless Chromium weigert meldingen altijd; hier geeft de 'gast' toestemming.
    Object.defineProperty(Notification, 'permission', {get: () => 'default'}); Notification.requestPermission = async () => 'granted';
    PushManager.prototype.getSubscription = async () => null;
    PushManager.prototype.subscribe = async function (o) { window.__subscribed = o; return {toJSON: () => ({endpoint: 'https://fcm.googleapis.com/fcm/send/test', keys: {p256dh: 'B'.repeat(87), auth: 'a'.repeat(22)}})}; };
  });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const posted = [];
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/api/public/products') return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(fixture())});
    if (url.pathname === '/api/public/order-options') return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({ownAmount: null, group: {code: 'OPA2FEST', name: 'Feest', host: 'Opa', validUntil: '2099-01-01'}})});
    if (url.pathname === '/api/public/orders') return route.fulfill({status: 201, contentType: 'application/json', body: JSON.stringify({number: 'P00009', status: 'op-groepsrekening', paid: false, lines: [{name: 'Boerentosti', quantity: 1, choices: [], note: '', totalCents: 650, vat: '9'}], totalCents: 650, commercialCents: 650, chosenCents: null, toPayCents: 0, group: {name: 'Feest'}})});
    if (url.pathname === '/api/public/push' && route.request().method() === 'GET') return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({available: true, publicKey: Buffer.alloc(65, 4).toString('base64url')})});
    if (url.pathname === '/api/public/push') { posted.push(JSON.parse(route.request().postData())); return route.fulfill({status: 200, contentType: 'application/json', body: '{"ok":true}'}); }
    return route.continue();
  });
  await page.goto(origin + '/bestellen.html?groep=OPA2FEST');
  await page.getByRole('heading', {name: 'Keuken'}).waitFor();
  const dialog = page.getByRole('dialog');
  await page.getByRole('button', {name: /^Boerentosti/}).click(); await dialog.getByRole('button', {name: /Voeg toe/}).click();
  await page.locator('#basket-bar-button').click(); await dialog.getByRole('button', {name: /^Verder/}).click();
  await dialog.getByLabel('Naam').fill('Neef Piet'); await dialog.getByLabel('E-mail').fill('piet@example.nl'); await dialog.getByLabel('Telefoon').fill('0612345678');
  await dialog.getByRole('button', {name: /Op de rekening bestellen/}).click();
  await dialog.getByText('P00009').waitFor();
  // De melding is de hoofdknop: aanzetten en sluiten in één tik (wens eigenaar 5 november 2026).
  assert.equal(await dialog.getByRole('button', {name: 'Geen bericht nodig'}).count(), 1);
  await dialog.getByRole('button', {name: 'Stuur mij een bericht als het klaar staat'}).click();
  await page.locator('#toast').getByText(/Je krijgt een melding zodra het klaarstaat/).waitFor();
  assert.equal(posted.length, 1);
  assert.match(posted[0].requestId, /^[0-9a-f-]{36}$/);
  assert.equal(posted[0].subscription.endpoint, 'https://fcm.googleapis.com/fcm/send/test');
  assert.equal(await page.evaluate(() => window.__subscribed.userVisibleOnly), true);
  assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.scriptURL.endsWith('/bestellen-sw.js')), true);
  // Klaar terwijl de pagina open is: melodietje en trillen (wens eigenaar 5 november 2026). De service worker geeft het door.
  await page.evaluate(() => {
    window.__vibrate = []; navigator.vibrate = p => { window.__vibrate.push(p); return true; };
    window.__tones = 0; const start = OscillatorNode.prototype.start; OscillatorNode.prototype.start = function (...a) { window.__tones++; return start.apply(this, a); };
    navigator.serviceWorker.dispatchEvent(new MessageEvent('message', {data: {type: 'boerbart-klaar', title: 'Je bestelling staat klaar', body: 'Haal hem op bij de bar.'}}));
  });
  // Groot in beeld (melding eigenaar 14 november 2026), met de tekst van de werkplek en een knop om te sluiten.
  const ready = page.getByRole('dialog');
  await ready.getByRole('heading', {name: 'Je bestelling staat klaar'}).first().waitFor();
  await ready.getByText('Haal hem op bij de bar.').waitFor();
  await ready.getByRole('button', {name: 'Ik kom eraan'}).click();
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.deepEqual(await page.evaluate(() => window.__vibrate), [[200, 100, 200, 100, 500]], 'kort-kort-lang trillen');
  assert.equal(await page.evaluate(() => window.__tones), 4, 'vier noten');
  const sw = fs.readFileSync(path.join(repo, 'apps/website/bestellen-sw.js'), 'utf8');
  // Groter dan het standaardbelletje (wens eigenaar 14 november 2026): eigen icoon in de meldingenbalk en blijft staan.
  assert.match(sw, /badge: new URL\('beeld\/melding-badge\.png'/);assert.match(sw, /requireInteraction: true/);
  assert.ok(fs.statSync(path.join(repo, 'apps/website/beeld/melding-badge.png')).size > 500);
  assert.match(sw, /vibrate: \[200, 100, 200, 100, 500\]/);assert.match(sw, /postMessage\(\{type: 'boerbart-klaar'/);
  assert.deepEqual(errors, []);
});

// Groepen & feesten op de website: direct antwoord op de gekozen datum en de aanvraag versturen naar de backoffice.
// De backoffice is hier nagebootst; de echte keten staat in tests/groepsaanvraag.integration.mjs.
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
const shotDir = process.env.GROEP_SCREENSHOTS;

test('gast ziet direct of de datum open is en verstuurt de aanvraag één keer', async t => {
  const server = createWebsiteServer({root: path.join(repo, 'apps/website'), dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'bb-groep-')), devMode: false, origin: 'http://127.0.0.1:0'});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
  t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width: 390, height: 844}, deviceScaleFactor: shotDir ? 2 : 1});
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const checks = [], sent = [];
  let failFirstSend = true;
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && url.pathname === '/api/public/group-requests') {
      if (route.request().method() === 'GET') {
        const date = url.searchParams.get('datum'), people = Number(url.searchParams.get('personen'));
        checks.push({date, people});
        const body = date === '2026-12-07' ? {state: 'gesloten', date, parts: [], alternatives: ['2026-12-10', '2026-12-11'], message: 'Op maandag 7 december zijn we gesloten.'}
          : people > 40 ? {state: 'vol', date, parts: [], alternatives: [], message: 'Op deze dag is er voor een groep van ' + people + ' geen plek meer.'}
          : {state: 'vrij', date, parts: [], alternatives: [], message: 'Op donderdag 10 december is er nog plek voor jullie groep.'};
        return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(body)});
      }
      sent.push(JSON.parse(route.request().postData()));
      if (failFirstSend) { failFirstSend = false; return route.abort('connectionreset'); }
      return route.fulfill({status: 201, contentType: 'application/json', body: JSON.stringify({ok: true, indication: {state: 'vrij', message: 'Op donderdag 10 december is er nog plek voor jullie groep.'}})});
    }
    if (url.origin === origin && url.pathname.startsWith('/api/')) return route.fulfill({status: 503, contentType: 'application/json', body: '{"error":"niet in deze test"}'});
    return url.origin === origin ? route.continue() : route.abort();
  });

  await page.goto(origin + '/');
  await page.waitForFunction(() => typeof states !== 'undefined');
  await page.evaluate(() => { states[0].activity = 'Kinderfeestje'; sheet(0, 'request'); });
  const sheet = page.locator('#design-0 .sheet');
  await sheet.getByLabel('Je naam').fill('Anna de Vries');
  await sheet.getByLabel('E-mailadres').fill('anna@example.nl');
  await sheet.getByLabel('Jullie wensen').fill('Een kinderfeestje met pannenkoeken.');
  await sheet.getByLabel(/Gewenste datum/).fill('2026-12-07');
  await sheet.getByText(/zijn we gesloten/).waitFor();
  assert.match(await sheet.locator('.group-check').innerText(), /eerste indicatie/);
  // Een voorgestelde vrije datum kiezen vult het datumveld en vraagt opnieuw.
  await sheet.locator('.group-alt button').first().click();
  await sheet.getByText(/nog plek voor jullie groep/).waitFor();
  assert.equal(await sheet.getByLabel(/Gewenste datum/).inputValue(), '2026-12-10');
  await sheet.getByLabel(/Aantal personen/).fill('50');
  await sheet.getByText(/geen plek meer/).waitFor();
  await sheet.getByLabel(/Aantal personen/).fill('12');
  await sheet.getByText(/nog plek voor jullie groep/).waitFor();
  assert.deepEqual(checks.at(-1), {date: '2026-12-10', people: 12});
  if (shotDir) await page.screenshot({path: path.join(shotDir, 'groep-datum.png')});

  await sheet.getByRole('button', {name: /Bekijk je wensen/}).click();
  await sheet.getByRole('button', {name: /Aanvraag versturen/}).click();
  await sheet.getByRole('alert').getByText(/Geen verbinding/).waitFor();
  await sheet.getByRole('button', {name: /Aanvraag versturen/}).click();
  await sheet.getByText(/Je aanvraag is bij ons binnen/).waitFor();
  if (shotDir) await page.screenshot({path: path.join(shotDir, 'groep-verstuurd.png')});
  assert.equal(sent.length, 2);
  assert.equal(sent[0].requestId, sent[1].requestId, 'opnieuw proberen maakt geen tweede aanvraag');
  assert.deepEqual({...sent[1], requestId: 'x'}, {requestId: 'x', activity: 'Kinderfeestje', name: 'Anna de Vries', email: 'anna@example.nl', date: '2026-12-10', daypart: '', people: 12, wishes: 'Een kinderfeestje met pannenkoeken.'});
  await sheet.getByRole('button', {name: 'Klaar'}).click();
  assert.equal(await page.evaluate(() => groupDrafts[0]), undefined, 'na versturen is de invoer gewist');
  assert.deepEqual(errors, []);
});

// Eigen camerascherm voor etiketten (wens eigenaar 10 november 2026: „bij etiket fotograferen in het fotoscherm zelf een volgende
// foto kunnen drukken of klaar; nu is dat nog onduidelijk”). Chromium met een nagebootste camera; de backoffice is nagebootst.
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
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');
const products = {updated: '2026-11-10T08:00:00.000Z', products: [
  {id: 't-lever', version: 1, name: 'Runderlever', department: 'Winkel', route: 'winkel', priceCents: 1300, vat: '9', available: true, customerPrice: true, photo: null, allergens: [], allergensChecked: true, optionGroups: []},
  {id: 't-jam', version: 1, name: 'Aardbeienjam', department: 'Winkel', route: 'winkel', priceCents: 550, vat: '9', available: true, photo: null, allergens: [], allergensChecked: true, optionGroups: []},
]};
const answers = [
  {ok: true, productId: 't-lever', labelName: 'runderlever', totalCents: 1277, weightGrams: 690, unitPriceCents: 1850, checked: true},
  {ok: true, productId: 't-jam', labelName: 'aardbeienjam', totalCents: 550, checked: true},
  {ok: true, productId: 't-jam', labelName: 'aardbeienjam', totalCents: 550, checked: true},
];

test('camerascherm: Foto maken, Volgend etiket, Klaar; en zonder camera een knop naar de camera-app', async t => {
  const server = createWebsiteServer({root: path.join(repo, 'apps/website'), dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'bb-etiketcam-')), devMode: false, origin: 'http://127.0.0.1:0'});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const browser = await chromium.launch({headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'], ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
  t.after(() => browser.close());
  const errors = []; let reads = 0;
  const backoffice = async route => {
    const url = new URL(route.request().url()), json = (body, s = 200) => route.fulfill({status: s, contentType: 'application/json', body: JSON.stringify(body)});
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/api/public/products') return json(products);
    if (url.pathname === '/api/public/order-options') return json({ownAmount: null, group: null, pickup: {days: []}});
    if (url.pathname === '/api/public/etiket') return json(answers[reads++]);
    if (url.pathname.startsWith('/api/')) return json({error: 'niet in deze test'}, 503);
    return route.continue();
  };

  // 1. Met camera: alles gebeurt in het camerascherm zelf.
  const page = await browser.newPage({viewport: {width: 390, height: 844}, deviceScaleFactor: shotDir ? 2 : 1});
  page.setDefaultTimeout(15000); page.on('pageerror', e => errors.push(e.message)); await page.route('**/*', backoffice);
  await page.goto(origin + '/bestellen.html?zelfservice=1');
  await page.getByRole('button', {name: /Etiket fotograferen/}).click();
  const cam = page.getByRole('dialog', {name: 'Etiketten fotograferen'});
  await cam.getByRole('button', {name: 'Foto maken'}).waitFor();
  await page.waitForFunction(() => document.querySelector('.cam-video')?.videoWidth > 0);
  await cam.getByRole('button', {name: 'Foto maken'}).click();
  await cam.getByText(/✓ Runderlever €\s12,77\. 1 foto · 1 gelezen\. Volgend etiket, of tik op Klaar\./).waitFor();
  await cam.getByRole('button', {name: 'Volgend etiket'}).click();
  await cam.getByText(/2 foto's · 2 gelezen/).waitFor();
  if (shotDir) await page.screenshot({path: path.join(shotDir, 'etiket-camera.png')});
  await cam.getByRole('button', {name: 'Klaar (2)'}).click();
  assert.equal(await cam.count(), 0, 'camerascherm dicht');
  const sheet = page.getByRole('dialog');
  assert.match(await page.locator('#sheet-title').textContent(), /Etiketten \(2\)/);
  await sheet.getByRole('button', {name: /Alle 2 in mijn mandje/}).click();
  assert.equal(await page.locator('#basket-badge').textContent(), '2');
  assert.equal(await page.evaluate(() => document.querySelector('.cam-video')), null, 'camera uit na Klaar');

  // 2. Geen toestemming voor de camera: een knop naar de camera-app (geen automatische sprong die de browser zou blokkeren).
  const denied = await browser.newPage({viewport: {width: 390, height: 844}});
  t.after(() => denied.close()); denied.on('pageerror', e => errors.push('geweigerd: ' + e.message)); await denied.route('**/*', backoffice);
  await denied.addInitScript(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('geweigerd', 'NotAllowedError')); });
  await denied.goto(origin + '/bestellen.html?zelfservice=1');
  await denied.getByRole('button', {name: /Etiket fotograferen/}).click();
  const dcam = denied.getByRole('dialog', {name: 'Etiketten fotograferen'});
  await dcam.getByText(/De camera opent hier niet/).waitFor();
  const [chooser] = await Promise.all([denied.waitForEvent('filechooser'), dcam.getByRole('button', {name: /Camera-app openen/}).click()]);
  await chooser.setFiles({name: 'etiket.png', mimeType: 'image/png', buffer: PNG});
  await denied.getByRole('dialog').getByText('Aardbeienjam', {exact: true}).waitFor();

  // 3. Altijd de achtercamera (besluit eigenaar 12 november 2026), ook op de tablet van de zelfkassa en ook met een oude keuze
  // voor de voorcamera op het apparaat. Een toestel zonder achtercamera (zoals de nagebootste camera in stap 1) opent de camera die er is.
  const back = await browser.newPage({viewport: {width: 1024, height: 768}});
  t.after(() => back.close()); back.on('pageerror', e => errors.push('achter: ' + e.message)); await back.route('**/*', backoffice);
  await back.addInitScript(() => {
    localStorage.setItem('bb-camera', 'user'); window.asked = [];
    navigator.mediaDevices.getUserMedia = c => { window.asked.push(c.video.facingMode); return Promise.reject(new DOMException('nee', 'NotAllowedError')); };
  });
  await back.goto(origin + '/bestellen.html?zelfservice=1');
  await back.getByRole('button', {name: /Etiket fotograferen/}).click();
  await back.getByRole('dialog', {name: 'Etiketten fotograferen'}).getByText(/De camera opent hier niet/).waitFor();
  assert.deepEqual(await back.evaluate(() => window.asked), [{exact: 'environment'}, {ideal: 'environment'}]);
  assert.equal(await back.evaluate(() => [...document.querySelectorAll('input[type=file][capture]')].every(i => i.getAttribute('capture') === 'environment')), true);
  assert.deepEqual(errors, []);
});

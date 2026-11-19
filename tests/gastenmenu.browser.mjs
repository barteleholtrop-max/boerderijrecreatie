// Eén afrekenroute (besluit eigenaar 3 november 2026): „Afrekenen” op de startpagina gaat naar de bestelpagina
// (bestellen.html) en de winkelmand gaat mee, met de gekozen opties. De oude proefstap afrekenen.html bestaat niet meer.
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
const products = {updated: '2026-11-03T08:00:00.000Z', products: [
  {id: 't-koffie', version: 1, name: 'Koffie', menuCategory: 'Koffie', department: 'Restaurant', route: 'eten-drinken', priceCents: 300, vat: '9', available: true, photo: null, allergens: [], allergensChecked: true,
    optionGroups: [{id: 'g-melk', title: 'Melk', required: true, choices: [{id: 'c-zonder', label: 'Zonder melk', extraCents: 0}, {id: 'c-haver', label: 'Havermelk', extraCents: 50}]}]},
  {id: 't-tosti', version: 1, name: 'Boerentosti', menuCategory: 'Tosti', department: 'Restaurant', route: 'eten-drinken', priceCents: 650, vat: '9', available: true, photo: null, allergens: null, allergensChecked: false, optionGroups: []},
  {id: 't-eieren', version: 1, name: 'Scharreleieren', department: 'Winkel', route: 'winkel', priceCents: 400, vat: '9', available: true, photo: null, allergens: ['ei'], allergensChecked: true, optionGroups: []},
]};

test('alle menuknoppen openen direct bestellen.html en behouden het bestaande mandje', async t => {
  assert.equal(fs.existsSync(path.join(repo, 'apps/website/afrekenen.html')), false);
  const server = createWebsiteServer({root: path.join(repo, 'apps/website'), dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'bb-afrekenen-')), devMode: false, origin: 'http://127.0.0.1:0'});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
  t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width: 1200, height: 900}});
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && url.pathname === '/api/public/products') return route.fulfill({status: 200, contentType: 'application/json', headers: {'Access-Control-Allow-Origin': '*'}, body: JSON.stringify(products)});
    if (url.origin === origin && url.pathname.startsWith('/api/')) return route.fulfill({status: 503, contentType: 'application/json', body: '{"error":"niet in deze test"}'});
    return route.continue();
  });


  // De knop onder Ik ben er al opent meteen de bestaande bestelpagina.
  await page.goto(origin + '/');
  await page.evaluate(()=>setOne(0,'here'));
  await Promise.all([page.waitForURL(/\/bestellen\.html$/),page.locator('#design-0').getByRole('button',{name:'Eten & drinken bestellen →',exact:true}).click()]);
  await page.getByRole('heading',{name:'Koffie',exact:true}).waitFor();
  assert.equal(await page.locator('.guest-menu').count(),0);
  // Een eerder mandje op de bestelpagina blijft behouden bij opnieuw openen.
  await page.getByRole('button',{name:/^Koffie, vanaf/}).click();
  await page.getByRole('dialog').getByLabel('Havermelk').check();
  await page.getByRole('dialog').getByRole('button',{name:/Voeg toe/}).click();
  for(const action of ['home','desktop','drawer','studio','hash']){
    await page.setViewportSize({width:['home','drawer'].includes(action)?390:1200,height:900});
    await page.goto(origin+(action==='studio'?'/?concepten':action==='hash'?'/#menu':'/'));
    if(action==='home'){
      await page.locator('#design-0 .new-hero').getByRole('button',{name:/Ik ben er al/}).click();
      await Promise.all([page.waitForURL(url=>url.pathname==='/bestellen.html'),page.locator('#design-0').getByRole('button',{name:'Eten & drinken bestellen →',exact:true}).click()]);
    }
    if(action==='desktop')await Promise.all([page.waitForURL(/\/bestellen\.html$/),page.locator('#design-0 .desktop-navigation').getByRole('button',{name:'Eten & drinken bestellen',exact:true}).click()]);
    if(action==='drawer'){
      await page.locator('#design-0').getByRole('button',{name:'Navigatie openen'}).click();
      await Promise.all([page.waitForURL(/\/bestellen\.html$/),page.locator('#design-0 .sheet').getByRole('button',{name:/Iets bestellen/}).click()]);
    }
    if(action==='studio')await Promise.all([page.waitForURL(/\/bestellen\.html$/),page.locator('.studio-tools').getByRole('button',{name:'Bestellen',exact:true}).click()]);
    if(action==='hash')await page.waitForURL(/\/bestellen\.html$/);
    await page.waitForFunction(()=>document.getElementById('basket-badge')?.textContent==='1');
    const saved=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('bb-bestelling-v2')));
    assert.equal(saved.carts.menu[0].choices[0],'c-haver');
  }
  assert.deepEqual(errors,[]);
});

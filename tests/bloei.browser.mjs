import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createWebsiteServer} from '../tools/website-dev/server.mjs';
import {fixture,view,change} from '../apps/backoffice/lib/bloei-core.ts';
const {chromium}=createRequire(new URL('./browser/package.json',import.meta.url))('playwright');
const repo=path.resolve(new URL('..',import.meta.url).pathname);

test('Bloei: overzicht, toetsenbordtabs, actiebevestiging, eigendom en mobiele lay-out',async t=>{
 let state=fixture(),revision=0,adminMode=false;
 const backend=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname!=='/api/public/bloei'&&url.pathname!=='/api/public/bloei-proef'){res.writeHead(503);return res.end('{}');}
  const context={role:adminMode?(url.searchParams.get('rol')==='personeel'?'personeel':'financieel'):'lid',actor:adminMode?(url.searchParams.get('actor')==='b'?'proef-beheer-b':'proef-beheer-a'):'proef-lid',memberId:url.searchParams.get('lid')||'proef-anna'};
  res.setHeader('Content-Type','application/json');
  if(req.method==='POST'){let raw='';for await(const c of req)raw+=c;const b=JSON.parse(raw);try{state=change(state,context,b,(String(b.action).startsWith('batch')?'2027-05-01':'2027-04-30')+'T10:00:00Z');revision++;}catch(e){res.statusCode=e.status||400;return res.end(JSON.stringify({error:e.message}));}}
  res.end(JSON.stringify({revision,...view(state,context,'2027-04-30'),day:'2027-04-30'}));
 });
 backend.listen(0,'127.0.0.1');await once(backend,'listening');
 const server=createWebsiteServer({root:path.join(repo,'apps/website'),devMode:false,dataDir:fs.mkdtempSync(path.join(os.tmpdir(),'bloei-design-')),origin:'http://127.0.0.1:0',backofficeOrigin:'http://127.0.0.1:'+backend.address().port});server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>{backend.closeAllConnections();backend.close();server.closeAllConnections();server.close();});
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
 await page.goto('http://127.0.0.1:'+server.address().port);await page.getByRole('button',{name:'Mijn Bloei',exact:true}).click();const bloei=page.locator('bloei-proef');
 await bloei.locator('[data-metric=spendable]').waitFor();assert.match(await bloei.locator('[data-metric=bonds]').innerText(),/1.500,00/);assert.match(await bloei.locator('[data-metric=shares]').innerText(),/0,00/);assert.match(await bloei.locator('[data-metric=spendable]').innerText(),/72,00/);
 assert.equal(await bloei.getByRole('tab',{name:'Backoffice',exact:true}).count(),0,'a member projection has no backoffice navigation');
 // An HTML attribute is not evidence of financial authority; the server projection remains decisive.
 await bloei.evaluate(el=>{el.setAttribute('beheer','');el.render()});
 assert.equal(await bloei.getByRole('tab',{name:'Backoffice',exact:true}).count(),0);
 assert.equal(await bloei.locator('.bloei-settings').count(),0);
 await bloei.evaluate(el=>{el.removeAttribute('beheer');el.render()});
 const overview=bloei.getByRole('tab',{name:'Ledenomgeving',exact:true});await overview.focus();await page.keyboard.press('ArrowRight');assert.equal(await bloei.getByRole('tab',{name:'Bloeimarkt',exact:true}).getAttribute('aria-selected'),'true');await bloei.getByRole('tab',{name:'Mijn bezit',exact:true}).click();
 await bloei.getByRole('button',{name:'Nominaal aanbieden'}).first().click();assert.equal(await bloei.locator('#reden').evaluate(el=>document.activeElement===el),true);assert.equal(state.listings.length,0);
 await bloei.locator('#reden').fill('Browserproef: aanbieden');await bloei.getByRole('button',{name:'Nominaal aanbieden'}).first().click();await bloei.getByText('Wijziging centraal opgeslagen.').waitFor();assert.equal(state.listings.length,1);
 await bloei.locator('#lid').selectOption('proef-bauke');await bloei.getByRole('tab',{name:'Bloeimarkt',exact:true}).click();await bloei.getByRole('button',{name:'Bekijk en koop →',exact:true}).click();const buy=page.getByRole('dialog',{name:'Aankoop bekijken'});await buy.waitFor();assert.match(await buy.locator('.bloei-quote-total').innerText(),/1.002,50/);await buy.getByLabel('Reden voor de wijziging').fill('Browserproef: reserveren');await buy.getByLabel(/Ik bevestig/).check();await buy.getByRole('button',{name:'Reserveren',exact:true}).click();await bloei.getByText('Wijziging centraal opgeslagen.').waitFor();assert.equal(state.holdings[0].memberId,'proef-anna');assert.equal(await page.getByRole('dialog').count(),0);
 await bloei.locator('.bloei-confirmation>summary').click();await bloei.locator('#reden').fill('Browserproef: betaling en controles');await bloei.locator('#bevestigen').check();await bloei.getByRole('button',{name:'Betaling en controles simuleren'}).click();await bloei.getByText('Wijziging centraal opgeslagen.').waitFor();assert.equal(state.holdings[0].memberId,'proef-bauke');
 await bloei.getByRole('tab',{name:'Mijn afspraken',exact:true}).click();await bloei.locator('.bloei-document>summary').first().click();await bloei.getByText(/FICTIEF CONTRACT/).first().waitFor();
 await page.setViewportSize({width:390,height:844});await bloei.getByRole('tab',{name:'Ledenomgeving',exact:true}).click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await bloei.getByRole('button',{name:'Tegoed cadeau geven',exact:true}).click();const gift=page.getByRole('dialog',{name:'Tegoed cadeau geven'});await gift.getByRole('button',{name:'Cadeaubon simuleren'}).click();assert.equal(await gift.getByLabel('Reden voor de wijziging').evaluate(el=>document.activeElement===el),true);await gift.getByLabel('Reden voor de wijziging').fill('Browserproef: cadeau');await gift.getByLabel(/Ik bevestig/).check();await gift.getByLabel('Bedrag (€)').fill('10000');await gift.getByRole('button',{name:'Cadeaubon simuleren'}).click();await gift.getByRole('alert').getByText(/Onvoldoende/).waitFor();assert.equal(await gift.getByLabel('Bedrag (€)').inputValue(),'10000');assert.equal(await gift.getByLabel('Reden voor de wijziging').inputValue(),'Browserproef: cadeau');await gift.getByLabel('Bedrag (€)').fill('1e2');await gift.getByRole('button',{name:'Cadeaubon simuleren'}).click();assert.equal(await gift.getByLabel('Bedrag (€)').evaluate(el=>el.validity.customError),true);assert.equal(state.gifts.length,0);await gift.getByLabel('Bedrag (€)').fill('25');await gift.getByLabel('Voor wie? (optioneel)').fill('Fictieve ontvanger');await gift.getByRole('button',{name:'Cadeaubon simuleren'}).click();await bloei.getByText('Wijziging centraal opgeslagen.').waitFor();assert.equal(state.gifts[0].amount,2500);assert.equal(state.gifts[0].recipient,'Fictieve ontvanger');
 await bloei.getByRole('button',{name:'Bankrekening wijzigen'}).click();await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
 // Use a financial mock projection to exercise the backoffice UI; real authorization is covered by the API/core tests.
 adminMode=true;await page.setViewportSize({width:1280,height:1000});await page.setContent('<link rel="stylesheet" href="/brand.css"><link rel="stylesheet" href="/bloei-proef.css"><bloei-proef beheer endpoint="/api/public/bloei-proef"></bloei-proef>');const card=bloei.locator('.bloei-member-card');
 // Indeling 8 november 2026: het beheer opent met alle houders; de kaart staat onder het tabblad Houderkaart.
 await bloei.getByRole('tab',{name:'Alle houders',exact:true}).waitFor();assert.equal(await bloei.getByRole('tab',{name:'Alle houders',exact:true}).getAttribute('aria-selected'),'true');
 assert.equal(await bloei.getByRole('tab',{name:'Ledenomgeving',exact:true}).count(),0,'het scherm van het lid staat niet in het beheer');
 await bloei.getByRole('tab',{name:'Houderkaart',exact:true}).click();
 await card.getByRole('heading',{name:'Anna Voorbeeld',exact:true}).waitFor();
 assert.equal(await card.getByText('Frans Voorbeeld',{exact:true}).count(),0);
 // The new card wraps the existing credits/actions, with the same server projection and selected identity.
 assert.match(await card.locator('[data-metric=bonds]').innerText(),/500,00/);
 await card.getByRole('tab',{name:'Gegevens',exact:true}).click();await card.getByText('Gegevens van dezelfde persoon',{exact:true}).waitFor();
 await card.getByRole('tab',{name:'Gegevens',exact:true}).focus();await page.keyboard.press('ArrowRight');
 assert.equal(await card.getByRole('tab',{name:'Geschiedenis',exact:true}).getAttribute('aria-selected'),'true');
 await card.getByRole('tabpanel',{name:'Geschiedenis',exact:true}).getByText(/De aankoopgeschiedenis uit de oude omgeving is nog niet geïmporteerd/).waitFor();
 const revisionBeforeLink=revision;
 await card.getByRole('button',{name:'Koppeling beoordelen',exact:true}).click();await card.getByRole('button',{name:'In voorbeeld koppelen',exact:true}).click();
 assert.equal(revision,revisionBeforeLink,'the local link simulation must not mutate the server ledger');
 await bloei.locator('#lid').selectOption('proef-bauke');await card.getByRole('heading',{name:'Bauke Voorbeeld',exact:true}).waitFor();
 await card.getByRole('button',{name:'Koppeling beoordelen',exact:true}).waitFor();
 await card.getByRole('tab',{name:'Overzicht',exact:true}).click();
 assert.match(await card.locator('[data-metric=shares]').innerText(),/1.000,00/);
 const central=card.locator('aside .bloei-card');
 await central.getByRole('region',{name:'Bezittingen per regeling',exact:true}).waitFor();
 await central.getByRole('region',{name:'Gekoppelde onderdelen',exact:true}).waitFor();
 assert.equal(await card.getByRole('region',{name:'Bezittingen per regeling',exact:true}).count(),1,'holdings are shown once under central data');
 assert.match(await central.locator('[data-card-participations]').innerText(),/1.000,00/);
 await central.getByText('Nog niet vastgesteld',{exact:true}).waitFor();

 await card.getByRole('tab',{name:'Documenten',exact:true}).click();
 assert.equal(await card.locator('details.bloei-document').count(),2,'Bauke owns the transferred bond and his original participation');
 await bloei.locator('#lid').selectOption('proef-anna');await card.getByRole('heading',{name:'Anna Voorbeeld',exact:true}).waitFor();
 assert.equal(await card.locator('details.bloei-document').count(),1,'Anna must not see Bauke’s contract in her selected card');assert.match(await card.locator('[data-card-participations]').innerText(),/0,00/);
 await card.getByRole('tab',{name:'Overzicht',exact:true}).click();
 // De Bloeimarkt heeft in de backoffice een eigen tabblad.
 assert.equal(await card.getByRole('link',{name:'Naar de Bloeimarkt',exact:true}).getAttribute('href'),'/bloei/markt');
 await card.getByRole('button',{name:'Tegoed cadeau geven',exact:true}).click();
 const integratedGift=page.getByRole('dialog',{name:'Tegoed cadeau geven'});
 await integratedGift.getByLabel('Bedrag (€)').fill('1');await integratedGift.getByLabel('Reden voor de wijziging').fill('Geïntegreerde kaart: bestaand tegoed gebruiken');await integratedGift.getByLabel(/Ik bevestig/).check();
 await integratedGift.getByRole('button',{name:'Cadeaubon simuleren'}).click();await bloei.getByText('Wijziging centraal opgeslagen.').waitFor();
 assert.equal(state.gifts.at(-1).memberId,'proef-anna');assert.equal(state.gifts.at(-1).amount,100);assert.match(await card.locator('[data-metric=spendable]').innerText(),/71,00/);
 await card.getByRole('button',{name:'Bankrekening wijzigen',exact:true}).first().click();
 const ibanDialog=page.getByRole('dialog',{name:'Bankrekening wijzigen'});await ibanDialog.getByLabel('Bankrekening (alleen demo)').selectOption('test-b');await ibanDialog.getByLabel('Reden voor de wijziging').fill('Geïntegreerde kaart: rekeningkeuze');await ibanDialog.getByLabel(/Ik bevestig/).check();await ibanDialog.getByRole('button',{name:'Rekeningkeuze bewaren'}).click();
 await bloei.getByText('Wijziging centraal opgeslagen.').waitFor();assert.equal(state.members.find(m=>m.id==='proef-anna').ibanChoice,'test-b');
 await card.locator('aside').getByText('Testrekening B',{exact:true}).waitFor();
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.setViewportSize({width:1280,height:1000});
 await bloei.getByRole('tab',{name:'Alle houders',exact:true}).click();await bloei.getByRole('tab',{name:'Leden',exact:true}).waitFor();await bloei.locator('#zoeken').fill('Bauke');assert.equal(await bloei.locator('[data-member-row]:visible').count(),1);await bloei.getByRole('button',{name:'Beheren',exact:true}).click();await bloei.locator('#principal').waitFor();
 await bloei.getByRole('tab',{name:'Uitbetalingen',exact:true}).click();assert.match(await bloei.locator('#bloei-admin-uitbetalingen .bloei-v05-metrics').innerText(),/22,00/);await bloei.locator('.bloei-confirmation>summary').click();await bloei.locator('#reden').fill('Proefbatch voorbereiden');await bloei.getByRole('button',{name:'Betaalbatch voorbereiden',exact:true}).click();await bloei.getByText('Wijziging centraal opgeslagen.').waitFor();assert.equal(state.batches[0].status,'concept');
 await bloei.locator('.bloei-settings>summary').click();await bloei.locator('#actor').selectOption('b');await bloei.getByRole('button',{name:'Als tweede beheerder goedkeuren'}).waitFor();await bloei.locator('.bloei-confirmation>summary').click();await bloei.locator('#reden').fill('Tweede controle');await bloei.locator('#bevestigen').check();await bloei.getByRole('button',{name:'Als tweede beheerder goedkeuren'}).click();await bloei.getByRole('link',{name:'Voorbeeldbetaalbestand downloaden'}).waitFor();assert.equal(state.batches[0].status,'goedgekeurd');
 await bloei.getByRole('tab',{name:'Logboek',exact:true}).click();assert.equal(await bloei.locator('#bloei-admin-logboek tbody tr').count(),state.audit.length);await bloei.getByRole('tab',{name:'Beveiliging & rechten',exact:true}).click();await bloei.getByText(/Dit werkt nu met fictieve rollen/).waitFor();await bloei.locator('.bloei-settings>summary').click();await bloei.locator('#rol').selectOption('personeel');await bloei.getByText('Geen toegang tot bezit, IBAN, documenten of financieel beheer.').waitFor();assert.equal(await bloei.locator('[role=tab]').count(),0);
 assert.deepEqual(errors,[]);
});

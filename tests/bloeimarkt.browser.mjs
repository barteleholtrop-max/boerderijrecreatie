import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {marketBuilt,startMarketTest,prepareMarket} from './bloeimarkt-server.mjs';
import {sessionCookie} from './sessie.mjs';
const {chromium}=createRequire(new URL('./browser/package.json',import.meta.url))('playwright');
test('Bloeimarkt and official documents: desktop, mobile, application and private owner upload',{skip:!marketBuilt&&'eerst npm run build',timeout:120000},async t=>{
 const s=await startMarketTest(t);await prepareMarket(s);
 const app=path.resolve('apps/website-fab'),vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1'],{cwd:app,env:{...process.env,BACKOFFICE_ORIGIN:s.base},stdio:['ignore','pipe','pipe']}),logs=[];
 vite.stdout.on('data',d=>logs.push(String(d)));vite.stderr.on('data',d=>logs.push(String(d)));t.after(()=>new Promise(r=>{if(vite.exitCode!==null)return r();vite.once('exit',r);vite.kill()}));
 let up=false;for(let n=0;n<60;n++){try{if((await fetch('http://localhost:3004/bloeimarkt/')).ok){up=true;break}}catch{}await new Promise(r=>setTimeout(r,200))}assert.ok(up,logs.join(''));
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:3004/bloeimarkt/');await page.getByRole('heading',{name:'6% boodschappen · voorbeeldaanbod'}).waitFor();assert.equal(await page.locator('h1').count(),1);
 await page.getByRole('button',{name:'0% obligatie',exact:true}).click();await page.getByRole('heading',{name:'Nog geen aanbod in deze regeling'}).waitFor();await page.getByRole('button',{name:'Alles',exact:true}).click();
 await page.getByRole('link',{name:'Officiële documenten',exact:true}).first().click();await page.getByRole('heading',{name:'AFM-informatie',exact:true}).waitFor();assert.equal(await page.getByText('Nog geen document beschikbaar.',{exact:true}).count(),3);
 const shot=async name=>{if(!process.env.BLOEI_SCREENSHOT_DIR)return;fs.mkdirSync(process.env.BLOEI_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.BLOEI_SCREENSHOT_DIR,name+'.png'),fullPage:true})};await page.evaluate(()=>scrollTo(0,0));await shot('bloeimarkt-desktop');
 await page.setViewportSize({width:1100,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'navigation fits a smaller laptop');await page.setViewportSize({width:1440,height:1000});
 await page.getByRole('button',{name:'Bekijk dit aanbod'}).click();const dialog=page.getByRole('dialog');await dialog.waitFor();await dialog.getByLabel('Volledige naam').fill('Nieuwe Deelnemer Voorbeeld');await dialog.getByLabel('E-mailadres').fill('nieuw@example.invalid');await dialog.getByLabel(/Ik wil mijn interesse/).check();await dialog.getByRole('button',{name:'Interesse doorgeven',exact:true}).click();await page.getByRole('heading',{name:'Je interesse is ontvangen'}).waitFor();assert.match(page.url(),/#aankoop=/);assert.equal((await s.call('/api/bloei/markt',{owner:true})).data.orders.length,1);
 await page.setViewportSize({width:390,height:844});await page.goto('http://localhost:3004/bloeimarkt/#documenten');await page.getByRole('heading',{name:'AFM-informatie',exact:true}).waitFor();await shot('bloeimarkt-mobiel');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow on a phone');
 await page.getByRole('button',{name:'Menu openen',exact:true}).click();await page.getByRole('navigation',{name:'Mobiel menu'}).getByRole('link',{name:'Bloeimarkt',exact:true}).waitFor();await page.getByRole('button',{name:'Menu sluiten',exact:true}).click();
 // The owner adds a PDF as a draft, then explicitly publishes it. The same document appears in both public views.
 const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addCookies([{name:'bb_sessie',value:s.auth.slice('bb_sessie='.length),url:s.base}]);const owner=await context.newPage();
 // Eén verzameling (16 november 2026): de eigenaar zet het reglement bij Bedrijfsgegevens & documenten en vinkt „Op de Bloeimarkt” aan.
 owner.on('dialog',d=>void d.accept());
 await owner.goto(s.base+'/bedrijfsgegevens');const docs=owner.locator('#officiele-documenten');await docs.getByRole('heading',{name:'Officiële documenten',exact:true}).waitFor();
 await docs.getByLabel('Naam',{exact:true}).fill('Reglement · fictieve browserproef');await docs.locator('select[name="category"]').selectOption('reglement');await docs.getByLabel('Versie of datum').fill('voorbeeld-1');await docs.locator('input[name="file"]').setInputFiles({name:'voorbeeld.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nsynthetic\n%%EOF')});await docs.getByRole('button',{name:'Document toevoegen'}).click();await docs.getByText('Document toegevoegd.',{exact:true}).waitFor();
 assert.equal((await s.call('/api/public/bloeimarkt')).data.documents.length,0,'eerst alleen in de verzameling');
 const markt=docs.getByRole('checkbox',{name:'Openbaar'});
 // Eén code per handeling (8 november 2026): openbaar zetten gebruikt de code; uit en weer aan vraagt een nieuwe code.
 await markt.click();await docs.getByText('Staat nu openbaar op de Bloeimarkt.',{exact:true}).waitFor();await markt.click();await docs.getByText('Staat niet meer op de Bloeimarkt.',{exact:true}).waitFor();
 await markt.click();const ask=owner.getByRole('dialog',{name:'Bevestig met je code'});await ask.waitFor();await ask.getByRole('button',{name:'Annuleren',exact:true}).click();
 assert.equal((await s.call('/api/public/bloeimarkt')).data.documents.length,0,'zonder nieuwe code niet openbaar');
 await context.addCookies([{name:'bb_sessie',value:sessionCookie('market-owner').slice('bb_sessie='.length),url:s.base}]); // alsof de eigenaar een nieuwe code invult
 await markt.click();await docs.getByText('Staat nu openbaar op de Bloeimarkt.',{exact:true}).waitFor();assert.equal((await s.call('/api/public/bloeimarkt')).data.documents.length,1);
 if(process.env.BLOEI_SCREENSHOT_DIR)await owner.screenshot({path:path.join(process.env.BLOEI_SCREENSHOT_DIR,'bloei-documentbeheer.png'),fullPage:true});
 await page.reload();await page.getByRole('link',{name:/Reglement · fictieve browserproef/}).waitFor();const download=page.waitForEvent('download');await page.getByRole('link',{name:/Reglement · fictieve browserproef/}).click();assert.equal((await download).suggestedFilename(),'voorbeeld.pdf');await shot('bloeimarkt-documenten-mobiel');
 await page.goto('http://localhost:3004/mijn-bloei/#documenten');await page.locator('#documenten').getByRole('link',{name:/Reglement · fictieve browserproef/}).waitFor();assert.deepEqual(errors,[]);
});

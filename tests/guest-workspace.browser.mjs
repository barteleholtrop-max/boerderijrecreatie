import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(new URL('./browser/package.json',import.meta.url))('playwright');
const origin=process.env.BB_GUEST_TEST_ORIGIN;
test('isolated backoffice planning works on desktop and phone; CSRF, revision and booking rules hold',{skip:!origin},async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
 try{const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await page.goto(origin+'/planning');await page.getByRole('heading',{name:'Openingstijden',exact:true}).waitFor();await page.getByText('12 tafels · 64 zitplaatsen',{exact:true}).waitFor();
 const get=async()=>{const r=await page.request.get(origin+'/api/gasten');assert.equal(r.status(),200);return r.json()};
 const post=async b=>{const d=await get();return page.request.post(origin+'/api/gasten',{headers:{Origin:origin},data:{requestId:crypto.randomUUID(),version:d.version,...b}})};
 let response=await page.request.post(origin+'/api/gasten',{headers:{Origin:'https://foreign.example'},data:{action:'table'}});assert.equal(response.status(),400);assert.match((await response.json()).error,/herkomst/);
 response=await post({action:'yte-service',service:{weekday:4,from:'19:00',to:'22:00',configured:true}});assert.equal(response.status(),200);await page.reload();await page.getByRole('heading',{name:'Openingstijden',exact:true}).waitFor();
 const section=page.locator('section').filter({has:page.getByRole('heading',{name:'Nieuwe aanvraag / reservering',exact:true})});
 const bounds=await Promise.all(['Naam','E-mail','Telefoon','Activiteit'].map(name=>section.getByLabel(name,{exact:true}).boundingBox()));
 assert.equal(Math.round(bounds[0].x),Math.round(bounds[1].x),'name and email in the same vertical block');assert.equal(Math.round(bounds[1].x),Math.round(bounds[2].x));assert.ok(bounds[1].y>bounds[0].y&&bounds[2].y>bounds[1].y,'contact fields go down');assert.ok(bounds[3].x>bounds[0].x,'visit block alongside contact block');
 await section.getByLabel('Naam',{exact:true}).focus();await page.keyboard.press('Tab');assert.equal(await section.getByLabel('E-mail',{exact:true}).evaluate(e=>e===document.activeElement),true);await page.keyboard.press('Tab');assert.equal(await section.getByLabel('Telefoon',{exact:true}).evaluate(e=>e===document.activeElement),true);
 await section.getByLabel('Naam',{exact:true}).fill('Browser Testgroep');await section.getByLabel('E-mail',{exact:true}).fill('test@example.com');await section.getByLabel('Datum',{exact:true}).fill('2027-11-04');await section.getByLabel('Van',{exact:true}).fill('19:00');await section.getByLabel('Tot',{exact:true}).fill('21:00');await section.getByLabel('Personen',{exact:true}).fill('5');await section.getByLabel('Status',{exact:true}).selectOption('bevestigd');await section.getByRole('button',{name:'Bevestig opslaan / wijzigen'}).click();
 await page.getByText('Aanvraag / reservering opgeslagen. Google Agenda synchroniseer je via Koppelingen.',{exact:true}).waitFor();
 const loaded=await get(),r=loaded.state.reservations.find(r=>r.name==='Browser Testgroep');assert.equal(r.status,'bevestigd');assert.equal(r.tables.length,1);assert.equal(loaded.state.tables.find(t=>t.id===r.tables[0]).seats,6);
 response=await post({action:'exception',exception:{date:r.date,hours:{open:false,from:'10:00',to:'18:00'},note:'Gesloten'}});assert.equal(response.status(),400);assert.match((await response.json()).error,/conflicteert/);
 response=await post({action:'table',version:-1,table:{id:'13',seats:4}});assert.equal(response.status(),409);
 await page.goto(origin+'/gesprekken');await page.getByRole('heading',{name:'Gesprekken, aanvragen & klanten',exact:true}).waitFor();await page.getByText('Gmail nog niet ingesteld',{exact:true}).waitFor();
 await page.goto(origin+'/koppeling');await page.getByRole('heading',{name:'Alle koppelingen beheren'}).waitFor();await page.getByRole('button').filter({has:page.getByText('Gmail',{exact:true})}).click();await page.getByRole('heading',{name:'Gmail instellen'}).waitFor();
 await page.setViewportSize({width:390,height:844});await page.goto(origin+'/planning');await page.getByRole('heading',{name:'Openingstijden',exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'phone has no horizontal overflow');
 assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});

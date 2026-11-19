// Online betalen via een bunq-betaalverzoek (wens eigenaar 10 november 2026: Mollie gaf geen akkoord; „kan het ook via een
// betaalverzoekstructuur?”). Tegen een echte, tijdelijke database (PGlite) en een nagebootste bunq: verzoek aanmaken, dubbel klikken,
// betaald (ook als bunq het verzoek nog niet bijwerkte), verkeerd bedrag, verlopen en opnieuw, en de bankverdeling telt het mee.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const run=(name,code)=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-'+name+'-'));
 try{const r=spawnSync(process.execPath,['--experimental-transform-types','--input-type=module','-e',"import './tests/helpers/ts-resolve.mjs';import assert from 'node:assert/strict';"+code],
  {cwd:new URL('../',import.meta.url),env:{...process.env,APP_DATA_DIR:dir,DATABASE_URL:'',APP_ORIGIN:'http://127.0.0.1:3001',SHEETS_CONFIG_KEY:'ab'.repeat(32),GUEST_BUNQ_API_KEY:'sandbox_'+'k'.repeat(40),BUNQ_LIVE_ENABLED:'',ONLINE_BETALEN:'bunq',MOLLIE_API_KEY:''},encoding:'utf8',timeout:120000});
  assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/ok/)}finally{fs.rmSync(dir,{recursive:true,force:true})}};
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');

test('betaalverzoek: aanmaken, dubbel klikken, betaald, verkeerd bedrag, verlopen en opnieuw',()=>run('bunqme',`
 const {bunqMock}=await import('./tests/helpers/bunq-mock.mjs');const mock=bunqMock();mock.state.apiKey=process.env.GUEST_BUNQ_API_KEY;process.env.BUNQ_API_BASE=await mock.start();
 const {getDb}=await import('./db/index.ts');const s=await import('./db/schema.ts');const {eq}=await import('drizzle-orm');
 const P=await import('./lib/online-payments.ts');const bank=await import('./lib/bank-split.ts');
 const db=getDb(),t=new Date().toISOString();
 assert.equal(P.onlineVia(),'bunq');assert.equal(P.onlineMode(),'test','sandbox: geen echt geld');
 const order=async(req,cents)=>{await db.insert(s.orders).values({requestId:req,request:'{}',data:JSON.stringify({lines:[]}),created:t,mode:'winkel',status:'wacht-op-betaling',paymentStatus:'open',totalCents:cents});return P.orderByRequest(req)};
 // Zonder bunq Main: een duidelijke melding, geen verzoek.
 let o=await order('11111111-1111-4111-8111-111111111111',1250);
 const e1=await P.startPayment(o,'https://site/terug').catch(e=>e);assert.match(e1.message,/Online betalen lukt nu even niet/);assert.match(e1.detail,/bunq-rekening Main/);assert.equal(mock.state.tabs.size,0);
 await bank.saveAccounts({main:1,tegoed:2,btw:3,potten:4,cooperatie:5},0,'Bartele');
 // Aanmaken: precies het bedrag en het bestelnummer; dubbel klikken geeft dezelfde link.
 const a=await P.startPayment(o,'https://site/terug');assert.match(a.checkoutUrl,/^https:\\/\\/bunq\\.me\\//);
 const b=await P.startPayment(o,'https://site/terug');assert.equal(b.checkoutUrl,a.checkoutUrl);assert.equal(mock.state.tabs.size,1);
 const [tabId,tab]=[...mock.state.tabs][0];
 assert.deepEqual(tab.entry.amount_inquired,{value:'12.50',currency:'EUR'});assert.equal(tab.entry.description,'Boer Bart bestelling P'+String(o.id).padStart(5,'0'));assert.equal(tab.entry.redirect_url,'https://site/terug');
 let rows=await db.select().from(s.payments).where(eq(s.payments.orderId,o.id));assert.equal(rows.length,1);assert.equal(rows[0].provider,'bunqme-test');assert.equal(rows[0].externalRef,'bunqme:'+tabId);
 // Nog niet betaald: blijft open, de bestelling wacht.
 await P.refreshOrder(o);assert.equal((await P.orderByRequest(o.requestId)).status,'wacht-op-betaling');
 // Verkeerd bedrag betaald: telt niet.
 mock.payTab(tabId,1000);await P.refreshOrder(o);assert.equal((await P.orderByRequest(o.requestId)).paymentStatus!=='betaald',true,'te weinig');
 // Juiste bedrag: betaald, bestelling gaat door, verzoek gesloten.
 mock.payTab(tabId,1250);await P.refreshOrder(o);o=await P.orderByRequest(o.requestId);
 assert.equal(o.paymentStatus,'betaald');assert.equal(o.status,'vastgelegd');assert.equal(o.test,1,'sandbox: testbestelling');assert.equal(mock.state.tabs.get(tabId).status,'CANCELLED');
 assert.deepEqual(await P.startPayment(o,'https://site/terug'),{paid:true});
 // Achtervang: bunq werkt het verzoek niet bij, maar het geld staat met precies deze omschrijving op Main. Via het werkproces.
 let o2=await order('22222222-2222-4222-8222-222222222222',800);const c=await P.startPayment(o2,'https://site/terug');const id2=Number(c.checkoutUrl.split('/').pop());
 mock.payTab(id2,800,{silent:true});assert.equal(await P.refreshOpenBunqPayments(),1);assert.equal((await P.orderByRequest(o2.requestId)).paymentStatus,'betaald');
 // Verlopen: die poging mislukt, een nieuwe krijgt een eigen omschrijving (-2), zodat een late betaling van de oude niets verwart.
 let o3=await order('33333333-3333-4333-8333-333333333333',500);const d=await P.startPayment(o3,'https://site/terug');const id3=Number(d.checkoutUrl.split('/').pop());
 mock.state.tabs.get(id3).status='EXPIRED';const e=await P.startPayment(o3,'https://site/terug');assert.notEqual(e.checkoutUrl,d.checkoutUrl);
 const id4=Number(e.checkoutUrl.split('/').pop());assert.match(mock.state.tabs.get(id4).entry.description,/-2$/);
 rows=await db.select().from(s.payments).where(eq(s.payments.orderId,o3.id));assert.deepEqual(rows.map(r=>r.status).sort(),['mislukt','open']);
 // Contant afrekenen kan niet terwijl er een betaalverzoek openstaat (geen dubbele betaling).
 assert.match(JSON.stringify(await P.payOrderWithBalance(o3,'x'.repeat(43))),/andere betaling/);
 // De bankverdeling telt de betalingen van gasten op Main als ontvangst mee, net als Mollie.
 const core=await import('./lib/bank-split-core.ts');
 assert.ok(core.isGuestInflow({id:1,created:t,amountCents:1250,description:'Boer Bart bestelling P00001',counterpartyName:'Gast',counterpartyIban:''}));
 assert.ok(core.isGuestInflow({id:2,created:t,amountCents:500,description:'Boer Bart bestelling P00003-2',counterpartyName:'Gast',counterpartyIban:''}));
 assert.ok(!core.isGuestInflow({id:3,created:t,amountCents:500,description:'kas',counterpartyName:'Rianne',counterpartyIban:''}));
 assert.ok(!core.isGuestInflow({id:4,created:t,amountCents:-500,description:'Boer Bart bestelling P00001',counterpartyName:'x',counterpartyIban:''}));
 await mock.stop();console.log('ok');process.exit(0);
`));

test('keuze en schermen: Mollie of bunq bij Systeem & koppelingen; abonnementen blijven bij Mollie',()=>{
 assert.match(read('lib/connection-fields.ts'),/'ONLINE_BETALEN','Online betalen via',false,'choice'\),options:\[\['mollie'/);
 assert.match(read('lib/connection-settings.ts'),/\['','mollie','bunq'\]\.includes\(b\.values\.ONLINE_BETALEN\)/);
 assert.match(read('lib/online-payments.ts'),/if\(via==='bunq'\)\{if\(order\.salesContext==='abonnement'\)throw/);
 assert.match(read('lib/assistant-jobs.ts'),/'online-betalingen':async/);
 assert.match(read('app/api/omgeving/route.ts'),/betalen:onlineMode\(\),via:onlineVia\(\)/);
});

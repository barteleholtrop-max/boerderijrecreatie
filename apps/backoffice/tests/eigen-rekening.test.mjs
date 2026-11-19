// Eigen rekening (wens eigenaar 11 november 2026: „standaard op eigen rekening bestellen en alles na afloop laten afrekenen; dat
// scheelt veel betalingskosten; wel de optie behouden om op een gezamenlijke rekening te bestellen; na afloop zelf een bedrag laten
// bepalen”). Tegen een echte, tijdelijke database (PGlite) en een nagebootste bunq.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import './helpers/ts-resolve.mjs';
const run=(name,code)=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-'+name+'-'));
 try{const r=spawnSync(process.execPath,['--experimental-transform-types','--input-type=module','-e',"import './tests/helpers/ts-resolve.mjs';import assert from 'node:assert/strict';"+code],
  {cwd:new URL('../',import.meta.url),env:{...process.env,APP_DATA_DIR:dir,DATABASE_URL:'',K_SERVICE:'',APP_ORIGIN:'http://127.0.0.1:3001',SHEETS_CONFIG_KEY:'ab'.repeat(32),GUEST_BUNQ_API_KEY:'sandbox_'+'k'.repeat(40),BUNQ_LIVE_ENABLED:'',ONLINE_BETALEN:'bunq',MOLLIE_API_KEY:''},encoding:'utf8',timeout:120000});
  assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/ok/)}finally{fs.rmSync(dir,{recursive:true,force:true})}};
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
const P=await import('../lib/public-orders.ts');

test('bestelling: een eigen rekening openen vraagt geen maximum; de grens voor een waarschuwing mag leeg',()=>{
 const base={requestId:'11111111-1111-4111-8111-111111111111',route:'eten-drinken',lines:[{productId:'koffie',version:1,quantity:1,note:'',selections:{}}],chosenCents:null,groupCode:null,
  guest:{name:'Anna Jansen',email:'anna@example.nl',phone:'0612345678'}};
 const o=P.parseGuestOrder({...base,openBill:{kind:'eigen',name:'Rekening van Anna Jansen',warnCents:4000,token:'t'.repeat(43)}});
 assert.deepEqual({...o.openBill,token:undefined},{name:'Rekening van Anna Jansen',limitCents:P.EIGEN_MAX_CENTS,kind:'eigen',warnCents:4000,token:undefined});
 assert.equal(P.parseGuestOrder({...base,openBill:{kind:'eigen',warnCents:null,token:'t'.repeat(43)}}).openBill.warnCents,null);
 assert.throws(()=>P.parseGuestOrder({...base,openBill:{kind:'eigen',warnCents:99999999,token:'t'.repeat(43)}}),/grens/);
 assert.throws(()=>P.parseGuestOrder({...base,guest:null,openBill:{kind:'eigen',token:'t'.repeat(43)}}),/naam|e-mail|Naam/i,'naam, e-mail en telefoon verplicht');
 assert.equal(P.parseGuestOrder({...base,openBill:{name:'Familie Jansen',limitCents:10000,token:'t'.repeat(43)}}).openBill.kind,'groep','gezamenlijke rekening blijft');
});

test('eigen rekening: bestellingen erop, waarschuwing boven de grens, na afloop één betaalverzoek (bunq) met een zelfgekozen bedrag',()=>run('eigen',`
 const {bunqMock}=await import('./tests/helpers/bunq-mock.mjs');const mock=bunqMock();mock.state.apiKey=process.env.GUEST_BUNQ_API_KEY;process.env.BUNQ_API_BASE=await mock.start();
 const {getDb}=await import('./db/index.ts');const s=await import('./db/schema.ts');const {eq}=await import('drizzle-orm');
 const G=await import('./lib/group-bill.ts');const bank=await import('./lib/bank-split.ts');const O=await import('./lib/order-options-store.ts');
 await bank.saveAccounts({main:1,tegoed:2,btw:3,potten:4,cooperatie:5},0,'Bartele');
 await O.saveSetting({context:'website',enabled:true,maxPercent:300,allowZero:true},0,'test');
 const db=getDb(),t=new Date().toISOString(),token='e'.repeat(43);
 let g=await G.openBill('gast-eigen',{name:'Rekening van Anna',limitCents:50000,holder:{name:'Anna Jansen',email:'anna@example.nl',phone:'0612345678'},token,kind:'eigen',warnCents:1500});
 assert.equal(g.kind,'eigen');assert.equal(g.warnCents,1500);
 const line=c=>({productId:'koffie',name:'Koffie',quantity:1,unitCents:c,totalCents:c,vat:'9',vatCents:Math.round(c*9/109),station:'barista',choices:[],note:''});
 const order=async(req,cents)=>db.insert(s.orders).values({requestId:req,request:'{}',data:JSON.stringify({lines:[line(cents)],guest:{name:'Anna Jansen',email:'anna@example.nl'}}),created:t,mode:'yte',status:'vastgelegd',paymentStatus:'op-rekening',totalCents:cents,groupCodeId:g.id});
 await order('a1111111-1111-4111-8111-111111111111',1200);
 let d=await G.billDetail(g);assert.equal(d.kind,'eigen');assert.equal(d.over,false);
 await order('a2222222-2222-4222-8222-222222222222',800);
 d=await G.billDetail(g);assert.equal(d.fill.spentCents,2000);assert.equal(d.over,true,'boven de eigen grens: waarschuwing, geen blokkade');
 // De grens aanpassen of weghalen.
 await G.changeWarn(g,2500);g=await G.billByToken(token);assert.equal(g.warnCents,2500);
 await assert.rejects(G.changeWarn(g,99999999),/grens/);
 // Na afloop: één deel (de gast zelf), betalen met een zelfgekozen bedrag via een betaalverzoek van bunq.
 const shares=await G.startSharing(g,[]);assert.equal(shares.length,1);assert.equal(shares[0].payerEmail,'anna@example.nl');assert.equal(shares[0].amountCents,2000);
 let share=await G.shareById(shares[0].id);
 const a=await G.payShareOnline(share,'https://site/bestellen.html?deel='+share.id,2500);assert.match(a.checkoutUrl,/^https:\\/\\/bunq\\.me\\//);
 const [tabId,tab]=[...mock.state.tabs][0];
 assert.deepEqual(tab.entry.amount_inquired,{value:'25.00',currency:'EUR'},'het zelfgekozen bedrag');assert.equal(tab.entry.description,'Boer Bart rekening '+g.code);
 share=await G.shareById(share.id);assert.equal(share.provider,'bunqme-test');assert.equal(share.paidCents,2500);
 // Nog eens drukken: dezelfde link.
 assert.equal((await G.payShareOnline(share,'https://site/x',null)).checkoutUrl,a.checkoutUrl);
 // Verkeerd bedrag telt niet; het juiste wel, en dan is de rekening voldaan.
 mock.payTab(tabId,2000);await G.refreshShare(share);assert.equal((await G.shareById(share.id)).status,'open');
 mock.payTab(tabId,2500);await G.refreshShare(await G.shareById(share.id));
 share=await G.shareById(share.id);assert.equal(share.status,'betaald');assert.equal(share.method,'bunq');assert.equal(mock.state.tabs.get(tabId).status,'CANCELLED');
 g=await G.billByToken(token);assert.ok(g.paidAt,'rekening voldaan');
 d=await G.billDetail(g);assert.deepEqual(d.invoice.payments.map(p=>[p.method,p.amountCents]),[['Betaalverzoek (bunq)',2500]]);
 // Werkproces: een betaald verzoek waarvan de gast de pagina sloot, wordt toch verwerkt (achtervang via de bijschrijving op Main).
 const g2=await G.openBill('gast-eigen-2',{name:'Rekening van Bert',limitCents:50000,holder:{name:'Bert',email:'bert@example.nl',phone:'0612345679'},token:'f'.repeat(43),kind:'eigen'});
 await db.insert(s.orders).values({requestId:'b1111111-1111-4111-8111-111111111111',request:'{}',data:JSON.stringify({lines:[line(900)]}),created:t,mode:'yte',status:'vastgelegd',paymentStatus:'op-rekening',totalCents:900,groupCodeId:g2.id});
 const [s2]=await G.startSharing(g2,[]);const b=await G.payShareOnline(s2,'https://site/x',null);const id2=Number(b.checkoutUrl.split('/').pop());
 mock.payTab(id2,900,{silent:true});assert.equal(await G.refreshOpenBunqShares(),1);assert.equal((await G.shareById(s2.id)).status,'betaald');
 // Contant bij de kassa (wens eigenaar 11 november 2026): de gast kiest contant met een eigen bedrag; de kassa ziet het en rekent af.
 const g3=await G.openBill('gast-eigen-3',{name:'Rekening van Cor',limitCents:50000,holder:{name:'Cor',email:'cor@example.nl',phone:'0612345670'},token:'g'.repeat(43),kind:'eigen'});
 await db.insert(s.orders).values({requestId:'c1111111-1111-4111-8111-111111111111',request:'{}',data:JSON.stringify({lines:[line(1800)]}),created:t,mode:'yte',status:'vastgelegd',paymentStatus:'op-rekening',totalCents:1800,groupCodeId:g3.id});
 const [s3]=await G.startSharing(g3,[]);
 assert.deepEqual(await G.requestShareCash(s3,2000),{cash:true,amountCents:2000});
 let c3=await G.shareById(s3.id);assert.equal(c3.status,'open');assert.equal(c3.method,'contant-gevraagd');assert.equal(c3.paidCents,2000);
 assert.equal((await G.openBills()).find(b=>b.id===g3.id).cashCents,2000,'de kassa ziet: wil contant betalen, € 20');
 await G.payShareAtRegister(c3,'contant','Rianne');c3=await G.shareById(s3.id);assert.equal(c3.status,'betaald');assert.equal(c3.method,'contant');
 const inv3=(await G.billDetail(await G.groupById(g3.id))).invoice;assert.deepEqual(inv3.payments.map(p=>[p.method,p.amountCents]),[['Contant',2000]]);assert.equal(inv3.paid,true);
 // Bankverdeling: een betaalde rekening op Main telt als ontvangst.
 const core=await import('./lib/bank-split-core.ts');
 assert.ok(core.isGuestInflow({id:1,created:t,amountCents:2500,description:'Boer Bart rekening '+g.code,counterpartyName:'Anna',counterpartyIban:''}));
 assert.ok(core.isGuestInflow({id:2,created:t,amountCents:900,description:'Boer Bart rekening ABCD2345 deel 2-2',counterpartyName:'x',counterpartyIban:''}));
 await mock.stop();console.log('ok');process.exit(0);
`));

test('bestelpagina: standaard op eigen rekening bij eten en drinken; gezamenlijke rekening en nu betalen blijven',()=>{
 const js=fs.readFileSync(new URL('../../website/bestellen.js',import.meta.url),'utf8');
 assert.match(js,/pay: \{method: 'eigen'/);
 assert.match(js,/choice\('eigen', 'Achteraf betalen'/);assert.match(js,/choice\('rekening', 'Op een gezamenlijke rekening'/);assert.match(js,/h\('b', \{text: 'Nu betalen'\}\)/);assert.match(js,/sub\('ideal', 'Via een betaalverzoek'/);assert.match(js,/sub\('dividend', 'Met je BB-tegoed'/);
 assert.match(js,/openBill: \{kind: 'eigen'/);assert.match(js,/action: 'afrekenen', payers: \[\]/);
 assert.match(read('drizzle-pg/0060_eigen_rekening.sql'),/ADD COLUMN "kind" text DEFAULT 'groep' NOT NULL/);
});

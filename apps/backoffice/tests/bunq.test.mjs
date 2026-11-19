// bunq-koppeling (wens eigenaar 6 november 2026): sessie, handtekening, eigen rekeningen, overboeken alleen naar eigen rekeningen,
// conceptbetalingen en de sandbox-grens. Tegen een nagebootste bunq (tests/helpers/bunq-mock.mjs).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bunqMock} from './helpers/bunq-mock.mjs';
const bunq=await import('../lib/bunq.ts');
const KEY='sandbox_'+'a'.repeat(40);
const memory=()=>{let s=null;return {saved:()=>s,load:async()=>s,save:async v=>{s=structuredClone(v)}}};

test('alleen een sandbox-sleutel, tenzij live bij publiceren is aangezet; de echte bank alleen met BUNQ_LIVE_ENABLED',()=>{
 assert.ok(bunq.validBunqKey(KEY,false));
 assert.equal(bunq.validBunqKey('a'.repeat(64),false),false);
 assert.ok(bunq.validBunqKey('a'.repeat(64),true));
 for(const k of ['','sandbox_','sandbox_kort','x'.repeat(10)])assert.equal(bunq.validBunqKey(k,true),false,k);
 const old={...process.env};
 try{delete process.env.BUNQ_API_BASE;delete process.env.BUNQ_LIVE_ENABLED;assert.equal(bunq.bunqBase(),bunq.SANDBOX_BASE);assert.equal(bunq.bunqMode(),'sandbox');
  process.env.BUNQ_LIVE_ENABLED='1';assert.equal(bunq.bunqBase(),bunq.LIVE_BASE);assert.equal(bunq.bunqMode(),'live');
  process.env.BUNQ_API_BASE='https://evil.example';assert.equal(bunq.bunqBase(),bunq.LIVE_BASE,'een vreemd adres wordt genegeerd');
  process.env.BUNQ_API_BASE='http://127.0.0.1:9';assert.equal(bunq.bunqBase(),'http://127.0.0.1:9');assert.equal(bunq.bunqMode(),'sandbox')}
 finally{process.env=old}
});
test('bedragen in centen',()=>{
 assert.equal(bunq.bunqAmount(1250),'12.50');assert.throws(()=>bunq.bunqAmount(0));assert.throws(()=>bunq.bunqAmount(-5));assert.throws(()=>bunq.bunqAmount(1.5));
 assert.equal(bunq.bunqCents('12.50'),1250);assert.equal(bunq.bunqCents('-3.05'),-305);assert.ok(Number.isNaN(bunq.bunqCents('12.5')));assert.ok(Number.isNaN(bunq.bunqCents(12)));
});

test('sessie, rekeningen, eigen overboeking en conceptbetaling tegen een nagebootste bunq',async()=>{
 const mock=bunqMock();mock.state.apiKey=KEY;const base=await mock.start();process.env.BUNQ_API_BASE=base;
 try{
  const store=memory();
  await assert.rejects(()=>bunq.bunqClient('a'.repeat(64),store),/live/,'een echte sleutel werkt niet zonder live');
  const c=await bunq.bunqClient(KEY,store);
  assert.equal(c.userId,42);assert.equal(store.saved().deviceRegistered,true);assert.ok(store.saved().privateKey.includes('PRIVATE KEY'));
  const accounts=await bunq.listAccounts(c);assert.deepEqual(accounts.map(a=>a.iban),['NL11BUNQ0000000001','NL22BUNQ0000000002','NL33BUNQ0000000003','NL44BUNQ0000000004','NL55BUNQ0000000005','NL66BUNQ0000000006']); // 6 = Rente & vaste kosten (8 november 2026)
  mock.add(1,12000,{name:'Stichting Mollie Payments',description:'Mollie uitbetaling'});
  const list=await bunq.paymentsSince(c,1,'2000-01-01T00:00:00Z');assert.equal(list.length,1);assert.equal(list[0].amountCents,12000);assert.equal(list[0].counterpartyName,'Stichting Mollie Payments');
  // De maandagverdeling: één concept met een regel per eigen rekening. Er gebeurt niets tot bevestigen in de bunq-app.
  const split=await bunq.ownDraft(c,{fromId:1,entries:[{toIban:'NL22 BUNQ 0000 0000 02',amountCents:5000,description:'BB-VERDELING 2026-11-02 tegoed'},{toIban:'NL33BUNQ0000000003',amountCents:1000,description:'BB-VERDELING 2026-11-02 btw'}]});
  assert.equal(mock.state.drafts.get(split).entries.length,2);assert.equal(mock.balance(1),12000,'nog niets verplaatst');
  mock.accept(split);assert.equal(mock.balance(1),6000);assert.equal(mock.balance(2),5000);assert.equal(mock.balance(3),1000);
  // Geld naar buiten kan via deze weg niet, en de backoffice heeft geen directe overboeking meer.
  assert.equal(bunq.ownTransfer,undefined);
  const calls=mock.state.calls.length;
  await assert.rejects(()=>bunq.ownDraft(c,{fromId:1,entries:[{toIban:'NL91ABNA0417164300',amountCents:100,description:'x'}]}),/geen eigen bunq-rekening/);
  await assert.rejects(()=>bunq.ownDraft(c,{fromId:1,entries:[{toIban:'NL11BUNQ0000000001',amountCents:100,description:'x'}]}),/dezelfde rekening/);
  assert.ok(!mock.state.calls.slice(calls).some(x=>x.startsWith('POST')),'er is niets verstuurd');
  // Conceptbetaling: bunq wacht op bevestiging in de app.
  const draft=await bunq.draftPayment(c,{fromId:2,toIban:'NL91ABNA0417164300',toName:'Anna de Vries',amountCents:2500,description:'Boer Bart uitbetaling BB-tegoed'});
  assert.equal(mock.state.drafts.get(draft).accepts,1);assert.equal(mock.state.drafts.get(draft).entry.amount.value,'25.00');
  assert.deepEqual(await bunq.draftStatus(c,2,draft),{status:'PENDING',paymentId:null});
  mock.add(2,2500);mock.accept(draft);const st=await bunq.draftStatus(c,2,draft);assert.equal(st.status,'ACCEPTED');
  const paid=await bunq.paymentById(c,2,st.paymentId);assert.equal(paid.amountCents,-2500,'de afschrijving van BB-tegoed bestaat');
  assert.equal(await bunq.findDraft(c,2,'BB-tegoed'),draft);assert.equal(await bunq.findDraft(c,1,'BB-VERDELING 2026-11-02'),split);assert.equal(await bunq.findDraft(c,2,'BB-UITBETALING onbekend'),null);
  // Alleen een zekere weigering (4xx) betekent dat bunq niets aanmaakte.
  const e=(s)=>Object.assign(new bunq.BunqError('x'),{providerStatus:s});
  assert.ok(bunq.definiteRefusal(e(400)));for(const s of [408,429,500,503,undefined])assert.equal(bunq.definiteRefusal(e(s)),false,String(s));
  // Een verlopen sessie wordt één keer vanzelf vernieuwd; de installatie blijft.
  mock.state.expire=true;assert.equal((await bunq.listAccounts(c)).length,6);assert.equal(mock.state.sessions,2);
  assert.equal(mock.state.calls.filter(x=>x==='POST /v1/installation').length,1);
  // Opnieuw verbinden met dezelfde opgeslagen sessie: geen nieuwe installatie of sessie nodig.
  await bunq.bunqClient(KEY,store);assert.equal(mock.state.sessions,2);
 }finally{delete process.env.BUNQ_API_BASE;await mock.stop()}
});

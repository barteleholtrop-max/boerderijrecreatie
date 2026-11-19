// Test of live in de schermen, en een duidelijke melding als Mollie weigert (wens eigenaar 9 november 2026: „alle sandboxes eruit”;
// bij de eerste echte betaling zag de gast „Mollie kon de betaling niet verwerken: Your account is currently suspended”).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './helpers/ts-resolve.mjs';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
const M=await import('../lib/mollie.ts');
const O=await import('../lib/onderdelen.ts');
const W=await import('../lib/werkplek-pas-core.ts');

test('Mollie weigert: de gast krijgt een Nederlandse melding, de tekst van Mollie gaat mee als detail',async t=>{
 const real=globalThis.fetch;t.after(()=>{globalThis.fetch=real});
 globalThis.fetch=async()=>new Response(JSON.stringify({status:422,title:'Unprocessable Entity',detail:'Your account is currently suspended'}),{status:422,headers:{'Content-Type':'application/json'}});
 const err=await M.createMolliePayment('test_'+'a'.repeat(30),{amountCents:200,description:'Boer Bart bestelling P00054',redirectUrl:'https://x/terug',webhookUrl:null,metadata:{},idempotencyKey:'k'}).catch(e=>e);
 assert.ok(err instanceof M.MollieError);
 assert.equal(err.message,'Online betalen lukt nu even niet. Betaal bij de kassa of probeer het later opnieuw.');
 assert.doesNotMatch(err.message,/suspended|Mollie kon/);assert.equal(err.detail,'Your account is currently suspended');
 assert.match(read('app/api/kassa/afrekenen/route.ts'),/e\.detail\?' \(Mollie: '\+e\.detail\+'\)'/,'de kassa ziet wel waarom');
});

test('omschrijving op het bankafschrift: Boer Bart vooraan, zonder middenpunt',()=>{
 for(const f of ['lib/online-payments.ts','lib/signup-payments.ts','lib/group-bill.ts','lib/harvest-billing.ts']){
  const s=read(f);for(const m of s.matchAll(/description:([`'][^`']*[`'])/g))assert.doesNotMatch(m[1],/·/,f+': '+m[1]);
 }
 assert.match(read('lib/online-payments.ts'),/description:`Boer Bart bestelling \$\{number\}`/);
});

test('/api/omgeving: alleen de stand, voor iedereen die is ingelogd en voor een werkplektablet',()=>{
 const r=read('app/api/omgeving/route.ts');assert.match(r,/betalen:onlineMode\(\)/);assert.doesNotMatch(r,/key:/,'nooit de sleutel');
 assert.ok(O.allowed('medewerker',[],'/api/omgeving','GET'));assert.ok(W.werkplekAllowed('/api/omgeving','GET'));assert.ok(!W.werkplekAllowed('/api/omgeving','POST'));
});

test('geen vaste proef- of testteksten meer in de schermen die met echt geld werken',()=>{
 assert.doesNotMatch(read('app/shell.tsx'),/Privé proef/);assert.match(read('app/shell.tsx'),/betaalStand\(omgeving\)/);
 assert.doesNotMatch(read('app/kassa/register.tsx'),/title="Proefomgeving"|proefbestellingen/);assert.match(read('app/kassa/register.tsx'),/omgeving\.betalen!=='live'/);
 assert.doesNotMatch(read('app/page.tsx'),/Proefbestellingen/);assert.doesNotMatch(read('app/financien/page.tsx'),/Er is niets betaald|proefbestellingen|Proefkassa/);
 assert.doesNotMatch(read('app/yte/page.tsx'),/proefbestellingen/);
});

// Koppelingen op Financiën (wens eigenaar 12 november 2026: „bunq staat op niet gekoppeld terwijl het wel werkt”).
test('Financiën toont de echte stand van bunq en SnelStart, nooit een sleutel',async()=>{
 const {connectionState}=await import('../lib/bunq.ts'),env=v=>k=>v[k];
 const sandbox={GUEST_BUNQ_API_KEY:'sandbox_'+'a'.repeat(40)};
 assert.deepEqual(connectionState(env(sandbox)),{bunq:'sandbox',snelstart:false});
 assert.doesNotMatch(JSON.stringify(connectionState(env(sandbox))),/sandbox_a/,'geen sleutel in de stand');
 assert.equal(connectionState(env({GUEST_BUNQ_API_KEY:'onzin'})).bunq,null);assert.equal(connectionState(env({})).bunq,null);
 const old=process.env.BUNQ_LIVE_ENABLED,base=process.env.BUNQ_API_BASE;process.env.BUNQ_LIVE_ENABLED='1';delete process.env.BUNQ_API_BASE;
 try{assert.equal(connectionState(env({GUEST_BUNQ_API_KEY:'A'.repeat(64)})).bunq,'live','echte sleutel, live aan')}
 finally{if(old===undefined)delete process.env.BUNQ_LIVE_ENABLED;else process.env.BUNQ_LIVE_ENABLED=old;if(base!==undefined)process.env.BUNQ_API_BASE=base}
 assert.equal(connectionState(env({GUEST_SNELSTART_SUBSCRIPTION_KEY:'x',GUEST_SNELSTART_CLIENT_KEY:'y'})).snelstart,true);
 assert.match(read('app/api/omgeving/route.ts'),/koppelingen:connectionState\(connectionSetting\)/);
 const page=read('app/financien/page.tsx');assert.doesNotMatch(page,/\['bunq','[^']*','Niet gekoppeld'/,'geen vaste tekst meer');assert.match(page,/omgeving\?\.koppelingen|o\?\.koppelingen/);
 assert.match(page,/onClick=\{\(\)=>toggle\('bestellingen'\)\}/,'tegels zijn klikbaar');
});

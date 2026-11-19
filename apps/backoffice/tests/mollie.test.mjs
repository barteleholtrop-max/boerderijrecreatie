import {test} from 'node:test';
import assert from 'node:assert/strict';
const {validMollieKey,mollieAmount,amountToCents,mapMollieStatus,checkMolliePayment,webhookUrl,molliePaymentId,mollieBase}=await import('../lib/mollie.ts');
const {returnPage,guestReceipt}=await import('../lib/public-orders.ts');
const {applyPaymentUpdate}=await import('../lib/payments.ts');

test('alleen een testsleutel, tenzij live bij publiceren is aangezet',()=>{
 assert.ok(validMollieKey('test_'+'a'.repeat(30),false));
 assert.equal(validMollieKey('live_'+'a'.repeat(30),false),false,'live blijft uit tot het besluit om te publiceren');
 assert.ok(validMollieKey('live_'+'a'.repeat(30),true));
 for(const k of ['','test_','test_kort','sk_'+'a'.repeat(30),'test_'+'a'.repeat(30)+' x'])assert.equal(validMollieKey(k,true),false,k);
});
test('bedragen in centen, zonder afrondingsfouten',()=>{
 assert.equal(mollieAmount(1250),'12.50');assert.equal(mollieAmount(5),'0.05');assert.equal(mollieAmount(1999),'19.99');
 assert.throws(()=>mollieAmount(0));assert.throws(()=>mollieAmount(1.5));
 assert.equal(amountToCents('12.50'),1250);assert.equal(amountToCents('0.29'),29);
 for(const v of ['12.5','12,50','-1.00',12.5,null,'1e3'])assert.ok(Number.isNaN(amountToCents(v)),String(v));
});
test('alleen paid geldt als betaald; afgebroken, verlopen en mislukt als mislukt',()=>{
 assert.equal(mapMollieStatus('paid'),'betaald');
 for(const s of ['failed','canceled','expired'])assert.equal(mapMollieStatus(s),'mislukt');
 for(const s of ['open','pending','authorized','iets-nieuws'])assert.equal(mapMollieStatus(s),null);
});
test('een betaling telt alleen met het juiste kenmerk, bedrag, valuta en modus',()=>{
 const p={id:'tr_abc123',status:'paid',mode:'test',amountCents:740,currency:'EUR',metadata:{paymentId:'mollie-7-1'},checkoutUrl:null};
 const expect={paymentId:'mollie-7-1',amountCents:740,mode:'test'};
 assert.equal(checkMolliePayment(p,expect),null);
 assert.match(checkMolliePayment({...p,metadata:{paymentId:'mollie-8-1'}},expect),/andere bestelling/);
 assert.match(checkMolliePayment({...p,amountCents:1},expect),/bedrag/);
 assert.match(checkMolliePayment({...p,currency:'USD'},expect),/bedrag/);
 assert.match(checkMolliePayment({...p,mode:'live'},expect),/modus/);
});
test('Mollie-melding alleen naar een openbaar https-adres; testserver alleen lokaal',()=>{
 assert.equal(webhookUrl({}),null);
 assert.equal(webhookUrl({BACKOFFICE_TUNNEL_ORIGIN:'http://localhost:3001'}),null);
 assert.equal(webhookUrl({BACKOFFICE_TUNNEL_ORIGIN:'https://abc-def.trycloudflare.com'}),'https://abc-def.trycloudflare.com/api/public/payments/mollie');
 assert.equal(webhookUrl({MOLLIE_WEBHOOK_ORIGIN:'https://backoffice.boerbart.nl/',BACKOFFICE_TUNNEL_ORIGIN:'https://x.trycloudflare.com'}),'https://backoffice.boerbart.nl/api/public/payments/mollie');
 assert.ok(molliePaymentId('tr_WDqYK6vllg'));for(const v of ['','tr_','tr_../x','re_abc123',null])assert.equal(molliePaymentId(v),false);
 const before=process.env.MOLLIE_API_BASE;
 process.env.MOLLIE_API_BASE='https://evil.example';assert.equal(mollieBase(),'https://api.mollie.com');
 process.env.MOLLIE_API_BASE='http://127.0.0.1:9999';assert.equal(mollieBase(),'http://127.0.0.1:9999');
 if(before===undefined)delete process.env.MOLLIE_API_BASE;else process.env.MOLLIE_API_BASE=before;
});
test('terug na betalen alleen naar de bestelpagina',()=>{
 assert.equal(returnPage('/bestellen.html'),'/bestellen.html');assert.equal(returnPage('/bestellen'),'/bestellen');assert.equal(returnPage('/bestellen/'),'/bestellen/');assert.equal(returnPage('/zelfscan.html'),'/zelfscan.html');assert.equal(returnPage('/zelfscan'),'/zelfscan');
 for(const v of ['//evil.example/bestellen','https://evil.example/bestellen.html','/beheer','/bestellen.html?x=1',null])assert.equal(returnPage(v),'/bestellen.html',String(v));
});
test('online betaling: betaald alleen met het kenmerk van Mollie; bon toont betaald',()=>{
 const open={id:'mollie-7-1',orderId:7,method:'online',amountCents:740,status:'open',provider:'mollie-test',externalRef:'tr_abc123',version:1};
 assert.equal(applyPaymentUpdate(open,{status:'betaald',externalRef:'tr_abc123'}).payment.status,'betaald');
 assert.throws(()=>applyPaymentUpdate(open,{status:'betaald',externalRef:'tr_ander1'}),/andere betaling/);
 assert.throws(()=>applyPaymentUpdate({...open,externalRef:null},{status:'betaald',externalRef:null}),/kenmerk/);
 const data=JSON.stringify({mode:'zelfservice',lines:[],totalCents:740});
 const r=guestReceipt({id:7,created:'2026-11-03T10:00:00.000Z',data,status:'vastgelegd',paymentStatus:'betaald',test:1});
 assert.equal(r.paid,true);assert.equal(r.test,true);assert.equal(r.status,'vastgelegd');
});

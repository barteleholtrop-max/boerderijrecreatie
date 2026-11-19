import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canTransition,applyPaymentUpdate,orderPaymentStatus,validNewPayment} from '../lib/payments.ts';
const open={id:'p1',orderId:1,method:'bank',amountCents:1950,status:'open',provider:'bank',externalRef:null,version:1};
test('alleen toegestane statusstappen: open → betaald/mislukt, betaald → terugbetaald',()=>{
 assert.ok(canTransition('open','betaald'));assert.ok(canTransition('open','mislukt'));assert.ok(canTransition('betaald','terugbetaald'));
 for(const [a,b] of [['betaald','open'],['mislukt','betaald'],['terugbetaald','betaald'],['open','terugbetaald']])assert.equal(canTransition(a,b),false,a+'→'+b);
});
test('dezelfde bevestiging twee keer verwerkt niets dubbel',()=>{
 const first=applyPaymentUpdate(open,{status:'betaald',externalRef:'BANK-1'});assert.equal(first.result,'changed');assert.equal(first.payment.status,'betaald');assert.equal(first.payment.version,2);
 const again=applyPaymentUpdate(first.payment,{status:'betaald',externalRef:'BANK-1'});assert.equal(again.result,'duplicate');assert.equal(again.payment,first.payment);
});
test('bevestiging met een ander kenmerk of een niet-toegestane stap wordt geweigerd',()=>{
 const paid=applyPaymentUpdate(open,{status:'betaald',externalRef:'BANK-1'}).payment;
 assert.throws(()=>applyPaymentUpdate(paid,{status:'betaald',externalRef:'BANK-2'}),/andere betaling/);
 assert.throws(()=>applyPaymentUpdate(paid,{status:'mislukt',externalRef:null}),/niet toegestaan/);
});
test('bankbetaling is pas betaald met het kenmerk van de bank',()=>{
 assert.throws(()=>applyPaymentUpdate(open,{status:'betaald',externalRef:null}),/kenmerk van de bank/);
 assert.equal(applyPaymentUpdate({...open,method:'contant'},{status:'betaald',externalRef:null}).payment.status,'betaald');
});
test('betaalstatus van een bestelling volgt uit bevestigde betalingen',()=>{
 assert.equal(orderPaymentStatus(1000,[]),'niet-gekoppeld');
 assert.equal(orderPaymentStatus(1000,[{amountCents:1000,status:'open'}]),'open');
 assert.equal(orderPaymentStatus(1000,[{amountCents:400,status:'betaald'},{amountCents:600,status:'mislukt'}]),'deels-betaald');
 assert.equal(orderPaymentStatus(1000,[{amountCents:400,status:'betaald'},{amountCents:600,status:'betaald'}]),'betaald');
 assert.equal(orderPaymentStatus(1000,[{amountCents:1000,status:'terugbetaald'}]),'terugbetaald');
});
test('nieuwe betaling vraagt bestelling, methode, positief bedrag en uniek aanvraagnummer',()=>{
 const ok={orderId:1,method:'bank',amountCents:1950,requestId:'0d6f9c1e-6a2b-4c4f-9f2e-1a2b3c4d5e6f'};assert.ok(validNewPayment(ok));
 for(const change of [{orderId:0},{method:'creditcard'},{amountCents:0},{amountCents:1.5},{requestId:'x'}])assert.equal(validNewPayment({...ok,...change}),false);
});

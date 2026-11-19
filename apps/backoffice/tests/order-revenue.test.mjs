import {test} from 'node:test';
import assert from 'node:assert/strict';
const {countsAsRevenue,paidAmounts,statusLabel}=await import('../lib/order-revenue.ts');
const {buildLine,priceCheckOpen}=await import('../lib/orders.ts');

test('één omzetregel: wacht op betaling en terugbetaald tellen niet mee, al het andere wel',()=>{
 assert.equal(countsAsRevenue({status:'wacht-op-betaling',paymentStatus:'open'}),false,'onbetaald of mislukt online');
 assert.equal(countsAsRevenue({status:'vastgelegd',paymentStatus:'terugbetaald'}),false);
 for(const o of [{status:'vastgelegd',paymentStatus:'niet-gekoppeld'},{status:'vastgelegd',paymentStatus:'betaald'},{status:'op-groepsrekening',paymentStatus:'op-rekening'},{status:'vastgelegd',paymentStatus:'nul-bedrag'}])
  assert.equal(countsAsRevenue(o),true,JSON.stringify(o));
});
test('omzet is wat echt betaald is: bij Jou wat goed fielt het gekozen bedrag met de btw daarover',()=>{
 const base={totalCents:2850,vat9Cents:235,vat21Cents:0,chosenCents:null,chosenVat9Cents:null,chosenVat21Cents:null};
 assert.deepEqual(paidAmounts(base),{cents:2850,vat9:235,vat21:0});
 assert.deepEqual(paidAmounts({...base,chosenCents:2000,chosenVat9Cents:165,chosenVat21Cents:0}),{cents:2000,vat9:165,vat21:0});
 assert.deepEqual(paidAmounts({...base,chosenCents:0,chosenVat9Cents:0,chosenVat21Cents:0}),{cents:0,vat9:0,vat21:0});
});
test('leesbare status uit de kolommen',()=>{
 assert.equal(statusLabel({status:'wacht-op-betaling',paymentStatus:'open'}),'Wacht op betaling');
 assert.equal(statusLabel({status:'vastgelegd',paymentStatus:'betaald'}),'Betaald');
 assert.equal(statusLabel({status:'op-groepsrekening',paymentStatus:'op-rekening'}),'Op groepsrekening');
 assert.equal(statusLabel({status:'vastgelegd',paymentStatus:'niet-gekoppeld'}),'Vastgelegd');
});
test('Prijs controleren geldt ook als verborgen markering: de server verkoopt het product dan niet',()=>{
 const p={name:'Cappucino',priceCents:350,vat:'9',station:'barista',available:true,department:'Koffie',optionGroups:[]};
 const line={productId:'p1',version:1,quantity:1,selections:{},note:''};
 assert.ok(buildLine(p,line));
 assert.equal(priceCheckOpen({sourceCheck:'Prijs controleren'}),true);assert.equal(priceCheckOpen({check:'Prijs controleren'}),true);assert.equal(priceCheckOpen({}),false);
 assert.throws(()=>buildLine({...p,sourceCheck:'Prijs controleren'},line),/Controleer eerst prijs en btw/);
 assert.throws(()=>buildLine({...p,check:'Prijs controleren'},line),/Controleer eerst prijs en btw/);
});

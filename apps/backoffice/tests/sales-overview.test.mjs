import test from 'node:test';import assert from 'node:assert/strict';
import {salesOverview,periodPreset,overviewNumber,payMethodOf,paidSplit,paidWithText} from '../lib/sales-overview.ts';
const line=(name,quantity,vat,paidCents,paidVatCents,productId=name)=>({productId,name,quantity,vat,paidCents,paidVatCents});
test('verkoopoverzicht telt alleen meetellende bestellingen, per product, btw-tarief, dag en kanaal',()=>{
 const o=salesOverview([
  {number:'P1',created:'2026-11-02T09:00:00Z',mode:'yte',counted:true,paidCents:1150,lines:[line('Koffie',2,'9',700,58),line('Appeltaart',1,'9',450,37)]},
  {number:'P2',created:'2026-11-03T22:30:00Z',mode:'winkel',counted:true,paidCents:1210,lines:[line('Koffie',1,'9',350,29),line('Mok',1,'21',860,149)]},
  {number:'P3',created:'2026-11-03T10:00:00Z',mode:'winkel',counted:false,paidCents:999,lines:[line('Mok',5,'21',4300,746)]},
 ]);
 assert.equal(o.orders,2);assert.equal(o.skipped,1);
 assert.deepEqual(o.total,{exclCents:2360-273,vatCents:273,inclCents:2360});
 assert.deepEqual(o.products.map(p=>[p.name,p.quantity,p.inclCents]),[['Koffie',3,1050],['Mok',1,860],['Appeltaart',1,450]]);
 assert.deepEqual(o.vat.map(v=>[v.rate,v.inclCents,v.vatCents]),[['9',1500,124],['21',860,149]]);
 assert.deepEqual(o.days.map(d=>[d.date,d.orders,d.inclCents]),[['2026-11-02',1,1150],['2026-11-03',1,1210]],'dag in Amsterdamse tijd');
 assert.deepEqual(o.modes.map(m=>[m.name,m.orders]),[['Winkel',1],['Ite by Boerderijrecreatie',1]]);
});
test('een leeg overzicht is nul',()=>{const o=salesOverview([]);assert.equal(o.orders,0);assert.deepEqual(o.total,{exclCents:0,vatCents:0,inclCents:0});assert.deepEqual(o.products,[])});
test('snelle periodes: dag, week van maandag t/m zondag, maand',()=>{
 assert.deepEqual(periodPreset('dag','2026-11-04'),{van:'2026-11-04',tot:'2026-11-04'});
 assert.deepEqual(periodPreset('gisteren','2026-11-01'),{van:'2026-10-31',tot:'2026-10-31'});
 assert.deepEqual(periodPreset('week','2026-11-04'),{van:'2026-11-02',tot:'2026-11-08'});
 assert.deepEqual(periodPreset('week','2026-11-08'),{van:'2026-11-02',tot:'2026-11-08'},'zondag hoort bij dezelfde week');
 assert.deepEqual(periodPreset('vorige-week','2026-11-04'),{van:'2026-10-26',tot:'2026-11-01'});
 assert.deepEqual(periodPreset('maand','2026-02-10'),{van:'2026-02-01',tot:'2026-02-28'});
 assert.deepEqual(periodPreset('vorige-maand','2026-01-15'),{van:'2025-12-01',tot:'2025-12-31'});
 assert.equal(overviewNumber('2026-11-02','2026-11-08'),'VO-20261102-20261108');assert.equal(overviewNumber('2026-11-04','2026-11-04'),'VO-20261104');
});

// Betaalwijze (wens eigenaar 12 november 2026): per regel hoe het is voldaan, en bij het totaal per bunq, contant, BB-saldo.
test('betaalwijze uit de geslaagde betalingen: bunq, Mollie, contant, pin, BB-saldo, rentesaldo',()=>{
 assert.equal(payMethodOf('online','bunqme-live'),'bunq');assert.equal(payMethodOf('online','bunqme-test'),'bunq');
 assert.equal(payMethodOf('online','mollie-live'),'mollie');assert.equal(payMethodOf('contant','balie'),'contant');assert.equal(payMethodOf('pin','balie'),'pin');
 assert.equal(payMethodOf('bb','bb:lid-1'),'bb');assert.equal(payMethodOf('dividend','dividend:lid-1'),'rente');assert.equal(payMethodOf('raar','x'),'onbekend');
 assert.deepEqual(paidSplit({paidCents:500,paidWith:[{method:'online',provider:'bunqme-live',cents:500}]}),[{method:'bunq',cents:500}]);
 assert.deepEqual(paidSplit({paidCents:1000,paidWith:[{method:'bb',provider:'bb:x',cents:333},{method:'dividend',provider:'dividend:x',cents:667}]}),[{method:'bb',cents:333},{method:'rente',cents:667}],'gedeeld, vaste volgorde');
 const odd=paidSplit({paidCents:100,paidWith:[{method:'bb',provider:'bb:x',cents:1},{method:'dividend',provider:'dividend:x',cents:1},{method:'contant',provider:'balie',cents:1}]});
 assert.equal(odd.reduce((a,p)=>a+p.cents,0),100,'afronden: samen precies het betaalde bedrag');
 assert.deepEqual(paidSplit({paidCents:900,paymentStatus:'op-rekening',paidWith:[]}),[{method:'groepsrekening',cents:900}]);
 assert.deepEqual(paidSplit({paidCents:0,paymentStatus:'nul-bedrag'}),[{method:'zonder',cents:0}]);
 assert.deepEqual(paidSplit({paidCents:700,paymentStatus:'betaald'}),[{method:'onbekend',cents:700}],'geen betaalregel: eerlijk „niet vastgelegd”');
 assert.equal(paidWithText({paidCents:1000,paidWith:[{method:'dividend',provider:'dividend:x',cents:600},{method:'bb',provider:'bb:x',cents:400}]}),'BB-saldo + Rentesaldo');
});
test('verkoopoverzicht: regel per product én betaalwijze, totaal per betaalwijze telt op tot het totaal',()=>{
 const o=salesOverview([
  {number:'P1',created:'2026-11-12T09:00:00Z',mode:'zelfservice',counted:true,paidCents:500,paidWith:[{method:'online',provider:'bunqme-live',cents:500}],lines:[line('0.0 Bier',1,'9',500,41)]},
  {number:'P2',created:'2026-11-12T09:10:00Z',mode:'winkel',counted:true,paidCents:200,paidWith:[{method:'contant',provider:'balie',cents:200}],lines:[line('1L Melk',1,'9',200,17)]},
  {number:'P3',created:'2026-11-12T09:20:00Z',mode:'winkel',counted:true,paidCents:700,paidWith:[{method:'bb',provider:'bb:x',cents:700}],lines:[line('0.0 Bier',1,'9',500,41),line('1L Melk',1,'9',200,17)]},
  {number:'P4',created:'2026-11-12T09:30:00Z',mode:'winkel',counted:false,paidCents:0,paidWith:[],lines:[line('1L Melk',9,'9',1800,149)]},
 ]);
 assert.deepEqual(o.products.map(p=>[p.name,p.paidWith,p.quantity,p.inclCents]).sort(),[['0.0 Bier','BB-saldo',1,500],['0.0 Bier','bunq',1,500],['1L Melk','BB-saldo',1,200],['1L Melk','Contant',1,200]]);
 assert.deepEqual(o.methods.map(m=>[m.name,m.orders,m.inclCents]),[['bunq',1,500],['Contant',1,200],['BB-saldo',1,700]]);
 assert.equal(o.methods.reduce((a,m)=>a+m.inclCents,0),o.total.inclCents);
});

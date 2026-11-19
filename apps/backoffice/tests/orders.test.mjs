import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildLine} from '../lib/orders.ts';
const product={name:'Proefkoffie',priceCents:350,vat:'9',station:'barista',available:true,department:'Restaurant',optionGroups:[{id:'milk',title:'Melk',required:true,choices:[{id:'regular',label:'Gewoon',extraCents:0},{id:'extra',label:'Extra melk',extraCents:50}]}]};
const input={productId:'test',version:1,quantity:2,selections:{milk:'extra'},note:'  Tafel 4  '};
test('rekent meerprijs per product, aantal en btw in centen',()=>{const l=buildLine(product,input);assert.equal(l.unitCents,400);assert.equal(l.totalCents,800);assert.equal(l.vatCents,66);assert.equal(l.station,'barista');assert.equal(l.note,'Tafel 4');assert.deepEqual(l.choices,['Melk: Extra melk']);});
test('blokkeert ontbrekende verplichte keuzes en ongeldige antwoorden',()=>{assert.throws(()=>buildLine(product,{...input,selections:{}}),/Maak een keuze/);assert.throws(()=>buildLine(product,{...input,selections:{milk:'invalid'}}),/Ongeldige keuze/);assert.throws(()=>buildLine(product,{...input,selections:{milk:'extra',unknown:'x'}}),/gewijzigd/)});
test('blokkeert ongeldige aantallen, ontbrekende routing, btw en onbeschikbaarheid',()=>{for(const quantity of [0,100,1.5])assert.throws(()=>buildLine(product,{...input,quantity}));for(const change of [{station:''},{vat:''},{available:false},{check:'Prijs controleren'}])assert.throws(()=>buildLine({...product,...change},input))});
test('bewaarde bestelling verandert niet mee met productprijs',()=>{const snapshot=buildLine(product,input);const changed=buildLine({...product,priceCents:450},input);assert.equal(snapshot.totalCents,800);assert.equal(changed.totalCents,1000)});
import {orderTotals,lineRecords,orderPeriod} from '../lib/orders.ts';
test('bestelkolommen volgen exact uit de vastgelegde regels',()=>{const a=buildLine(product,input),b=buildLine({...product,vat:'21',station:'winkel',priceCents:1210},{...input,selections:{milk:'regular'},quantity:1});
 assert.deepEqual(orderTotals([a,b]),{totalCents:2010,vat9Cents:66,vat21Cents:210});
 assert.deepEqual(lineRecords([a,b]).map(l=>[l.position,l.station,l.totalCents]),[[0,'barista',800],[1,'winkel',1210]])});
test('periode volgt hele dagen in Nederlandse tijd, ook rond zomertijd',()=>{
 assert.deepEqual(orderPeriod('2026-10-01','2026-10-31'),{from:'2026-09-30T22:00:00.000Z',until:'2026-10-31T23:00:00.000Z'});
 assert.deepEqual(orderPeriod('2026-03-29','2026-03-29'),{from:'2026-03-28T23:00:00.000Z',until:'2026-03-29T22:00:00.000Z'});
 assert.equal(orderPeriod(null,null),null);
 for(const [a,b] of [['2026-02-30','2026-03-01'],['2026-10-02','2026-10-01'],['2025-01-01','2026-06-01'],['gisteren','2026-10-01']])assert.throws(()=>orderPeriod(a,b));
});

// Klant voert prijs in (wens eigenaar 5 november 2026): bijvoorbeeld rundvlees, de prijs staat op het etiket.
test('etiketprijs: het ingevoerde bedrag telt, met btw, en alleen bij een product dat het toestaat',async()=>{
 const {MAX_CUSTOMER_PRICE_CENTS}=await import('../lib/orders.ts');
 const meat={name:'Rundvlees',priceCents:1800,vat:'9',station:'winkel',available:true,department:'Winkel',customerPrice:true};
 const line={productId:'rv',version:1,quantity:2,selections:{},note:'',priceCents:2345};
 const l=buildLine(meat,line);
 assert.equal(l.unitCents,2345);assert.equal(l.totalCents,4690);assert.equal(l.vatCents,Math.round(4690*9/109));assert.deepEqual(l.choices,['prijs van het etiket']);
 for(const priceCents of [undefined,0,-5,12.5,'2345'])assert.throws(()=>buildLine(meat,{...line,priceCents}),/etiket/);
 assert.throws(()=>buildLine(meat,{...line,priceCents:MAX_CUSTOMER_PRICE_CENTS+1}),/hoog/);
 assert.throws(()=>buildLine({...meat,customerPrice:false},line),/vaste prijs/,'gewoon product: geen eigen prijs');
});

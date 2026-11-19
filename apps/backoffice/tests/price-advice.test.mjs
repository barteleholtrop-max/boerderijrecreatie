import {test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/ts-resolve.mjs';
const {adviseAll,categorize,menuRound,regionStats}=await import('../lib/price-advice.ts');
const {BENCHMARKS}=await import('../lib/price-benchmarks.ts');
const row=(name,priceCents,extra={},published=null)=>({id:name,version:1,draft:{name,department:'Restaurant',priceCents,vat:'',station:'',available:true,photo:'',check:'',note:'',sourceId:'',...extra},published});
const one=(r,rows=[r])=>adviseAll(rows).find(a=>a.id===r.id);

test('herkent categorieën en laat water, winkel en kopieën apart',()=>{
 assert.equal(categorize('Cappucino'),'cappuccino');assert.equal(categorize('Coca Cola Zero'),'frisdrank');assert.equal(categorize('Spa Rood'),'water');
 assert.equal(categorize('Gudzekop Trippel Volle Laag'),'speciaalbier');assert.equal(categorize('Hertog Jan 0.0 Blondbier'),'pils');
 assert.equal(categorize('Boerenwijn'),null);assert.equal(categorize('Kindertosti Kaas'),'kindertosti');assert.equal(categorize('Waterijs'),null);
});
test('voorstel alleen onder de regio, naar de onderkant, en afgerond',()=>{
 const s=regionStats('frisdrank');assert.ok(s.n>=2);
 const low=one(row('Coca Cola',200));assert.equal(low.position,'onder');assert.equal(low.proposedCents,menuRound(s.min));
 const fit=one(row('Fanta',s.min));assert.equal(fit.position,'binnen');assert.equal(fit.proposedCents,null);
 const high=one(row('Naturfrisk Ginger Ale',s.max*2));assert.equal(high.position,'boven');assert.equal(high.proposedCents,null,'nooit automatisch verlagen');
 assert.equal(menuRound(321),325);assert.equal(menuRound(510),525);
});
test('geen voorstel met te weinig of alleen afhaalprijzen, en niet voor burgers of winkel',()=>{
 assert.equal(one(row('Bitterballen',100)).proposedCents,null);
 assert.equal(one(row('Kinderpannenkoek',100)).proposedCents,null);
 assert.equal(one(row('Boer Bart Burger',100)).proposedCents,null);
 assert.equal(one(row('Coca Cola',100,{department:'Winkel'})).proposedCents,null);
});
test('alleen horecaprijzen tellen; afhaal is alleen referentie',()=>{
 for(const b of BENCHMARKS)assert.ok(b.km<=30&&b.source.startsWith('https://')&&b.priceCents>0,b.business);
 const s=regionStats('tosti');assert.ok(s.references.every(b=>b.segment==='horeca'));assert.ok(s.lowReferences.length>0);
});
test('btw: 9%, drank met alcohol 21%, ook bij speciaalbier zonder het woord bier',()=>{
 assert.equal(one(row('Gudzekop Trippel Volle Laag',585)).vatSuggestion,'21');
 assert.equal(one(row('Hertog Jan 0.0 Blondbier',410)).vatSuggestion,'9');
 assert.equal(one(row('Appeltaart',390)).vatSuggestion,'9');
});
test('wat nog ontbreekt om te verkopen, ook het verborgen prijs-controleren',()=>{
 const a=one(row('Cappucino',350,{vat:'9',station:'barista',sourceCheck:'Prijs controleren'},{name:'Cappucino'}));
 assert.ok(a.blockers.includes('Prijs controleren'));assert.ok(a.priceCheck);
 const b=one(row('Thee',290));assert.deepEqual(b.blockers,['Btw ontbreekt','Werkafdeling ontbreekt','Niet gepubliceerd']);
 assert.equal(b.stationSuggestion,'barista');assert.equal(one(row('Uitsmijter',1100)).stationSuggestion,'kok');
 const p={name:'Soep',department:'Restaurant',priceCents:750,vat:'9',station:'kok',available:true,photo:'',check:'',note:'',sourceId:''};
 assert.deepEqual(adviseAll([{id:'s',version:2,draft:p,published:p}])[0].blockers,[]);
});
test('afwijking op de eigen kaart en kopieën',()=>{
 const rows=[row('Lungo',280),row('Koffie Lungo',280),row('Latte Macchiato',380),row('Koffie',150),row('Kopie van Vers brood',350)];
 const a=adviseAll(rows);
 assert.ok(a.find(x=>x.name==='Koffie').ownFlag);assert.ok(a.find(x=>x.name==='Kopie van Vers brood').duplicate);
});

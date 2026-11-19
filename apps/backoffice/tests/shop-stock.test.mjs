import {test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/ts-resolve.mjs';
const {productStock,stockMap,stockProblem,saleMoves,isTracked,resaleIngredient}=await import('../lib/shop-stock.ts');
const {adviseShop,roundHalf,costTrend,targetMargin,LEDGERS,SALE_LEDGERS}=await import('../lib/shop-price-advice.ts');

const ing=(id,stock,extra={})=>({id,name:id,stock,known:true,min:0,...extra});
const resale=(productId,ingredientId)=>({productId,yield:1,lossPct:0,lines:[{ingredientId,quantity:1}]});
const src={ingredients:[ing('sap',22,{min:5}),ing('jam',0),ing('bloem',10),ing('boter',3),ing('nieuw',0,{known:false})],
 recipes:[resale('appelsap','sap'),resale('jam','jam'),{productId:'koek',yield:10,lossPct:0,lines:[{ingredientId:'bloem',quantity:1},{ingredientId:'boter',quantity:0.5}]},resale('nieuw','nieuw')]};

test('onbeperkt is de standaard: bestaande producten veranderen niet',()=>{
 assert.equal(isTracked({}),false);assert.equal(isTracked({stockMode:'onbeperkt'}),false);assert.equal(isTracked({stockMode:'geteld'}),true);
 assert.deepEqual(productStock(src,{id:'appelsap'}),{tracked:false});
});
test('doorverkoop: productvoorraad is de ingrediëntvoorraad',()=>{
 const s=productStock(src,{id:'appelsap',stockMode:'geteld'});
 assert.equal(s.stock,22);assert.equal(s.low,false);assert.equal(s.resale.id,'sap');
 assert.equal(productStock(src,{id:'jam',stockMode:'geteld'}).stock,0);
 assert.equal(resaleIngredient(src,'koek'),null,'een echt recept is geen doorverkoop');
});
test('recept: het krapste ingrediënt bepaalt, naar beneden afgerond',()=>{
 // 10 kg bloem = 100 koeken, 3 kg boter = 60 koeken
 assert.equal(productStock(src,{id:'koek',stockMode:'geteld'}).stock,60);
});
test('zonder recept of telling: geen getal maar een duidelijke melding',()=>{
 assert.match(productStock(src,{id:'los',stockMode:'geteld'}).problem,/Koppel eerst/);
 assert.match(productStock(src,{id:'nieuw',stockMode:'geteld'}).problem,/tellen/);
 const m=stockMap(src,[{id:'appelsap',stockMode:'geteld'},{id:'jam',stockMode:'geteld'},{id:'nieuw',stockMode:'geteld'},{id:'koek'}]);
 assert.deepEqual([...m],[['appelsap',22],['jam',0]]);
});
test('bijna op volgt het minimum van het ingrediënt',()=>{
 const low={...src,ingredients:src.ingredients.map(i=>i.id==='sap'?{...i,stock:5}:i)};
 assert.equal(productStock(low,{id:'appelsap',stockMode:'geteld'}).low,true);
});
test('bestellen: uitverkocht of te weinig wordt geweigerd, ook verdeeld over regels',()=>{
 const stock=new Map([['appelsap',3],['jam',0]]);
 assert.equal(stockProblem([{productId:'appelsap',name:'Appelsap',quantity:3}],stock),null);
 assert.equal(stockProblem([{productId:'appelsap',name:'Appelsap',quantity:2},{productId:'appelsap',name:'Appelsap',quantity:2}],stock),'Van Appelsap is er nog maar 3 op voorraad.');
 assert.equal(stockProblem([{productId:'jam',name:'Jam',quantity:1}],stock),'Jam is uitverkocht.');
 assert.equal(stockProblem([{productId:'koffie',name:'Koffie',quantity:50}],stock),null,'onbeperkt telt niet');
});
test('verkoop haalt af per ingrediënt en noteert een tekort in plaats van negatief te gaan',()=>{
 assert.deepEqual(saleMoves(src,[{productId:'appelsap',quantity:2},{productId:'appelsap',quantity:1}]),[{ingredientId:'sap',quantity:3,shortage:0}]);
 assert.deepEqual(saleMoves(src,[{productId:'jam',quantity:2}]),[{ingredientId:'jam',quantity:0,shortage:2}]);
 assert.deepEqual(saleMoves(src,[{productId:'koek',quantity:10}]),[{ingredientId:'bloem',quantity:1,shortage:0},{ingredientId:'boter',quantity:0.5,shortage:0}]);
 assert.deepEqual(saleMoves(src,[{productId:'nieuw',quantity:1}]),[],'nog niet geteld: niets afboeken');
});

const base={priceCents:350,vat:'9',ledger:'7103',costCents:240,soldPerWeek:4,stock:20};
test('grootboekrekeningen: 7102 en 7109 zijn grondstof, de rest doorverkoop',()=>{
 assert.deepEqual(LEDGERS.filter(l=>l.kind==='grondstof').map(l=>l.id),['7102','7109']);
 assert.equal(SALE_LEDGERS.length,8);assert.equal(targetMargin({ledger:'7105'}),30);assert.equal(targetMargin({ledger:'7105',targetMarginPct:50}),50);
 assert.equal(targetMargin({}),40);
});
test('afronding op hele of halve euro',()=>{
 assert.equal(roundHalf(327),350);assert.equal(roundHalf(324),300);assert.equal(roundHalf(10),50);
});
test('inkoop gestegen: hoger voorstel met uitleg, binnen de maximale stap',()=>{
 const a=adviseShop({...base,previousCostCents:220,costNote:'factuur Pluimveebedrijf 28-10'});
 // 2,40 / 0,65 × 1,09 = 4,02 → hooguit +15% = 4,03 → 4,00
 assert.equal(a.proposedCents,400);assert.equal(a.reasons[0],'Inkoop +9% (factuur Pluimveebedrijf 28-10)');
 assert.ok(a.marginNewPct>a.marginNowPct);
});
test('geen voorstel als de prijs al klopt',()=>{
 const a=adviseShop({...base,priceCents:400});assert.equal(a.proposedCents,null);assert.equal(a.problem,null);
});
test('mag sneller weg: lager, maar nooit onder de minimale marge',()=>{
 const a=adviseShop({priceCents:250,vat:'9',ledger:'7110',costCents:130,soldPerWeek:5,stock:16,fasterSale:true});
 assert.equal(a.proposedCents,200);assert.match(a.reasons.join(' '),/Mag sneller weg: voorraad voor 3 weken/);
 const floor=adviseShop({priceCents:200,vat:'9',ledger:'7110',costCents:150,soldPerWeek:0,stock:16,fasterSale:true,targetMarginPct:25});
 assert.ok(floor.proposedCents===null||floor.marginNewPct>=20,'minimale marge 20%');
});
test('ligt stil en verkoopt snel',()=>{
 const slow=adviseShop({priceCents:450,vat:'9',ledger:'7110',costCents:210,soldPerWeek:0.4,stock:18});
 assert.equal(slow.proposedCents,400);assert.match(slow.reasons.join(' '),/Ligt stil: voorraad voor 45 weken/);
 const fast=adviseShop({priceCents:700,vat:'9',ledger:'7105',costCents:460,soldPerWeek:20,stock:6});
 assert.equal(fast.proposedCents,750);assert.match(fast.reasons.join(' '),/Verkoopt snel \(20 per week\)/);
});
test('alcohol rekent met 21% btw',()=>{
 assert.equal(adviseShop({priceCents:350,vat:'21',ledger:'7108',costCents:145,soldPerWeek:12,stock:48}).proposedCents,null);
});
test('zonder inkoopprijs of btw: geen voorstel maar een uitleg',()=>{
 assert.match(adviseShop({...base,costCents:null}).problem,/inkoopprijs/);
 assert.match(adviseShop({...base,vat:''}).problem,/Btw/);
});
test('inkooptrend uit de laatste twee beoordeelde facturen',()=>{
 const line=(ingredientId,quantity,netCents)=>({kind:'product',ingredientId,quantity,netCents});
 const t=costTrend([
  {supplier:'Fruitbedrijf',number:'1',date:'2026-10-12',reviewed:true,lines:[line('sap',24,2976)]},
  {supplier:'Fruitbedrijf',number:'2',date:'2026-11-03',reviewed:true,lines:[line('sap',24,3240)]},
  {supplier:'X',number:'3',date:'2026-11-04',reviewed:false,lines:[line('sap',1,1)]},
 ],'sap');
 assert.equal(t.previousCents,124);assert.equal(t.note,'factuur Fruitbedrijf 03-11');
 assert.equal(costTrend([],'sap'),null);
});

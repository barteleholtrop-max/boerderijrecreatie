import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './helpers/ts-resolve.mjs';
const {buildLine,currentPrice,offerActive}=await import('../lib/orders.ts');
const core=await import('../lib/supplier-shop-core.ts');
const {applyWriteOff}=await import('../lib/coop-portal-core.ts');
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
// Zondag 8 november 2026: 14:59 en 15:00 Nederlandse tijd (UTC+1).
const zo1459=new Date('2026-11-08T13:59:00Z'),zo1500=new Date('2026-11-08T14:00:00Z'),za1600=new Date('2026-11-07T15:00:00Z'),ma0900=new Date('2026-11-09T08:00:00Z');
const jam={name:'Jam',priceCents:500,vat:'9',station:'winkel',available:true,department:'Winkel',offer:{percent:70}};
const line={productId:'jam',version:1,quantity:2,selections:{},note:''};

test('zondagaanbieding: vanaf 15:00 op zondag het ingestelde percentage, zichtbaar als korting op de regel',()=>{
 assert.equal(offerActive(jam,zo1459),false);assert.equal(offerActive(jam,zo1500),true);assert.equal(offerActive(jam,za1600),false);
 const l=buildLine(jam,line,zo1500);assert.equal(l.unitCents,350);assert.equal(l.totalCents,700);assert.match(l.choices[0],/70% van de prijs \(korting\)/);
 assert.equal(buildLine(jam,line,zo1459).unitCents,500);
 assert.equal(buildLine({...jam,offer:{percent:5}},line,zo1500).unitCents,500,'ongeldig percentage telt niet');
 assert.deepEqual(currentPrice(jam,zo1500),{priceCents:350,wasCents:500,percent:70});
 assert.match(read('app/kassa/register.tsx'),/currentPrice\(x\)/,'kassa toont de korting');
 assert.match(read('lib/public-products.ts'),/wasCents:currentPrice/,'website rekent hetzelfde');
});
test('bijna uitverkocht: één bericht bij het passeren van de grens, en bij uitverkocht',()=>{
 assert.equal(core.lowFor({}),3);assert.equal(core.lowFor({lowAt:5}),5);
 assert.match(core.lowStockMessage('Jam',5,3,3).body,/Nog 3 van Jam/);
 assert.equal(core.lowStockMessage('Jam',3,2,3),null,'niet bij elke verkoop daarna');
 assert.match(core.lowStockMessage('Jam',2,0,3).title,/uitverkocht/);
 assert.equal(core.lowStockMessage('Jam',2,2,3),null);
 // Bericht aan de leverancier alleen na een gelukte afboeking (sinds 5 november 2026 buiten het voorraadslot).
 assert.match(read('lib/stock-sales.ts'),/result==='saved'\?\{before,after:/);assert.match(read('lib/stock-sales.ts'),/if\(typeof outcome==='object'\)\{const \{afterSale\}/);
});
test('zondag- en maandagvraag: op tijd, één keer per dag; maandagvraag op maandag en dinsdag',()=>{
 assert.equal(core.sundayAskDue(new Date('2026-11-08T10:59:00Z')),false);assert.equal(core.sundayAskDue(new Date('2026-11-08T11:00:00Z')),true);
 assert.equal(core.mondayAskDue(ma0900),true);assert.equal(core.mondayAskDue(zo1500),false);
 assert.equal(core.oldStockWindow(ma0900),true);assert.equal(core.oldStockWindow(new Date('2026-11-11T10:00:00Z')),false);
 const jobs=read('lib/assistant-jobs.ts');assert.match(jobs,/'zondag-aanbieding:'\+amsterdamDay\(t\)/);assert.match(jobs,/'maandag-voorraad:'\+amsterdamDay\(t\)/);
});
test('instellingen per product controleren',()=>{
 assert.deepEqual(core.parseOptions({offer:{percent:60},lowAt:2,perishable:true}),{offer:{percent:60},lowAt:2,perishable:true});
 assert.equal(core.parseOptions({offer:null}).offer,null);
 assert.throws(()=>core.parseOptions({offer:{percent:100}}),/10 tot en met 95/);assert.throws(()=>core.parseOptions({lowAt:-1}),/bijna op/);
});
test('oude voorraad afboeken: hele stand naar 0 met reden; zonder voorraad niets',()=>{
 const s={ingredients:[{id:'i',stock:4,known:true}],recipes:[{productId:'jam',lines:[{ingredientId:'i',quantity:1}]}],moves:[]};
 assert.equal(applyWriteOff(s,{productId:'jam',today:'2026-11-09',reason:'Oude voorraad, leverancier: mag weg',reference:'Anna',newId:()=>'m'}),4);
 assert.equal(s.ingredients[0].stock,0);assert.equal(s.moves[0].quantity,-4);assert.match(s.moves[0].reason,/mag weg/);
 assert.equal(applyWriteOff(s,{productId:'jam',today:'2026-11-09',reason:'x',reference:'x',newId:()=>'n'}),0);
 const route=read('app/api/deelnemer/[token]/route.ts');assert.match(route,/case 'oude-voorraad'/);assert.match(route,/case 'instellingen'/);
});

test('zondagaanbieding: leverancier kiest zelf de begintijd (wens eigenaar 6 november 2026)',()=>{
 // 6 november 2026 is wintertijd: Amsterdam = UTC+1. Zondag 8 november.
 const jam={priceCents:500,offer:{percent:70,from:'12:30'}};
 assert.equal(offerActive(jam,new Date('2026-11-08T11:29:00Z')),false);
 assert.equal(offerActive(jam,new Date('2026-11-08T11:30:00Z')),true);
 assert.equal(currentPrice(jam,new Date('2026-11-08T11:30:00Z')).priceCents,350);
 assert.equal(offerActive({priceCents:500,offer:{percent:70}},new Date('2026-11-08T13:59:00Z')),false,'zonder eigen tijd blijft het 15:00');
 assert.equal(offerActive({priceCents:500,offer:{percent:70,from:'25:00'}},new Date('2026-11-08T20:00:00Z')),false,'ongeldige tijd telt niet');
 assert.deepEqual(core.parseOptions({offer:{percent:60,from:'16:45'}}).offer,{percent:60,from:'16:45'});
 assert.deepEqual(core.parseOptions({offer:{percent:60}}).offer,{percent:60});
 assert.throws(()=>core.parseOptions({offer:{percent:60,from:'9:00'}}),/tijd/);
});
test('aanbieding maken (wens eigenaar 7 november 2026): korting vanaf een dag tot en met een dag; laagste prijs wint',async()=>{
 const {currentPrice,validDeal,dealActive}=await import('../lib/offer-core.ts');
 const wed=new Date('2026-11-11T10:00:00Z'),sun=new Date('2026-11-15T15:30:00Z'),after=new Date('2026-11-16T10:00:00Z');
 const p={priceCents:2000,deal:{percent:80,from:'2026-11-10',until:'2026-11-15'}};
 assert.ok(validDeal(p.deal));assert.ok(!validDeal({percent:80,from:'2026-11-15',until:'2026-11-10'}));assert.ok(!validDeal({percent:5,from:'2026-11-10',until:'2026-11-12'}));
 assert.deepEqual(currentPrice(p,wed),{priceCents:1600,wasCents:2000,percent:80});
 assert.equal(dealActive(p,after),false);assert.equal(currentPrice(p,after).wasCents,null,'na de einddatum weer de gewone prijs');
 assert.equal(currentPrice({...p,offer:{percent:70,from:'15:00'}},sun).priceCents,1400,'zondagaanbieding lager: die geldt');
 assert.equal(currentPrice({...p,offer:{percent:90,from:'15:00'}},sun).priceCents,1600,'eigen aanbieding lager: die geldt');
});

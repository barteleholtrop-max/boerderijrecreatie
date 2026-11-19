// Werkplek-totalen en rekenvoorbeeld (wensen eigenaar 5 november 2026).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/ts-resolve.mjs';
const {lineTotals}=await import('../lib/kiosk-totals.ts');
const {exampleDay}=await import('../lib/pot-day-core.ts');

test('totalen: zelfde gerecht met dezelfde keuzes telt samen, andere keuzes apart',()=>{
 const t=lineTotals([
  {lines:[{name:'Pannenkoek',quantity:4,choices:['naturel']},{name:'Friet',quantity:2,choices:[]}]},
  {lines:[{name:'Pannenkoek',quantity:10,choices:['naturel']},{name:'Pannenkoek',quantity:1,choices:['spek']},{name:'friet ',quantity:8,choices:[]}]}]);
 assert.deepEqual(t.map(x=>[x.quantity,x.name,x.choices.join(','),x.orders]),[[14,'Pannenkoek','naturel',2],[10,'Friet','',2],[1,'Pannenkoek','spek',1]]);
 assert.deepEqual(lineTotals([]),[]);
});

test('rekenvoorbeeld: fictieve dagomzet, elke rol één persoon, delen tellen precies op',()=>{
 const roles=[{name:'Chef-kok',points:4},{name:'Hoofdbediening',points:3},{name:'Bediening',points:2},{name:'Extra bediening bij drukte',points:2},{name:'Afwas',points:2},{name:'Schoonmaak',points:1},{name:'Organisatie',points:1}];
 const x=exampleDay(3000,roles,150000,1400);
 assert.equal(x.potCents,45000);assert.equal(x.totalPoints,15);assert.equal(x.pointValueCents,3000);
 assert.deepEqual(x.rows.slice(0,2).map(r=>[r.name,r.shareCents,r.tipCents,r.totalCents]),[['Chef-kok',12000,200,12200],['Hoofdbediening',9000,200,9200]]);
 assert.equal(x.rows.reduce((s,r)=>s+r.shareCents,0),45000);assert.equal(x.rows.reduce((s,r)=>s+r.tipCents,0),1400);
 assert.equal(exampleDay(3000,[{name:'',points:2},{name:'Afwas',points:0}],10000).rows.length,0,'lege of puntloze rollen tellen niet');
});

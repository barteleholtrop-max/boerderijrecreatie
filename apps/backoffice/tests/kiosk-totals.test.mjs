// Werkplek-totalen en rekenvoorbeeld (wensen eigenaar 5 november 2026).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/ts-resolve.mjs';
const {lineTotals}=await import('../lib/kiosk-totals.ts');

test('totalen: zelfde gerecht met dezelfde keuzes telt samen, andere keuzes apart',()=>{
 const t=lineTotals([
  {lines:[{name:'Pannenkoek',quantity:4,choices:['naturel']},{name:'Friet',quantity:2,choices:[]}]},
  {lines:[{name:'Pannenkoek',quantity:10,choices:['naturel']},{name:'Pannenkoek',quantity:1,choices:['spek']},{name:'friet ',quantity:8,choices:[]}]}]);
 assert.deepEqual(t.map(x=>[x.quantity,x.name,x.choices.join(','),x.orders]),[[14,'Pannenkoek','naturel',2],[10,'Friet','',2],[1,'Pannenkoek','spek',1]]);
 assert.deepEqual(lineTotals([]),[]);
});

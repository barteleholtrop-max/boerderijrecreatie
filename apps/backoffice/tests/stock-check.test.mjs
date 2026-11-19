// Werkplek → Voorraad controleren (wens eigenaar 6 november 2026).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './helpers/ts-resolve.mjs';
const {checkList}=await import('../lib/stock-check.ts');
const {KIOSK_SCREENS}=await import('../lib/kiosk-core.ts');
const ing=(id,stock,countedAt='')=>({id,name:id,stock,known:true,min:0,countedAt});
const src={ingredients:[ing('i-ale',14,'2026-11-06'),ing('i-friet',0,'2026-11-03'),ing('i-ei',6),ing('i-meel',5,'2026-11-06')],
 recipes:[{productId:'ale',lines:[{ingredientId:'i-ale',quantity:1}],yield:1,lossPct:0},{productId:'friet',lines:[{ingredientId:'i-friet',quantity:1}],yield:1,lossPct:0},
  {productId:'eieren',lines:[{ingredientId:'i-ei',quantity:1}],yield:1,lossPct:0},{productId:'pannenkoek',lines:[{ingredientId:'i-meel',quantity:0.1},{ingredientId:'i-ei',quantity:1}],yield:1,lossPct:0}]};
const p=(id,name,station,stockMode='geteld')=>({id,version:1,published:{name,station,stockMode}});
const products=[p('ale','Ginger Ale','barista'),p('friet','Huisgemaakte friet','kok'),p('eieren','10 Eieren','winkel'),p('pannenkoek','Pannenkoek','kok'),p('koffie','Koffie','barista','onbeperkt'),{id:'concept',version:1,published:null}];

test('te controleren: getelde producten met één ingrediënt; nog niet gecontroleerd eerst; voortgang per dag',()=>{
 const l=checkList(products,src,'2026-11-06');
 assert.deepEqual(l.rows.map(r=>[r.name,r.stock,r.checkedToday]),[['10 Eieren',6,false],['Huisgemaakte friet',0,false],['Ginger Ale',14,true]]);
 assert.equal(l.done,1);assert.equal(l.total,3);
 assert.deepEqual(l.viaInkoop,['Pannenkoek'],'recept met meerdere ingrediënten: tellen bij Inkoop');
 assert.deepEqual(l.unlimited,['Koffie']);
});

test('per werkplek te filteren',()=>{
 assert.deepEqual(checkList(products,src,'2026-11-06','kok').rows.map(r=>r.name),['Huisgemaakte friet']);
 assert.deepEqual(checkList(products,src,'2026-11-06','barista').rows.map(r=>r.name),['Ginger Ale']);
});

test('eigen scherm in de werkplekbalk, naast de kassa (scherm uit PR #248)',()=>{
 const ids=KIOSK_SCREENS.map(s=>s.id);assert.equal(ids.filter(i=>i==='voorraad').length,1,'één keer in de balk');assert.equal(ids[ids.indexOf('kassa')+1],'voorraad');
 assert.ok(fs.existsSync(new URL('../app/werkplek/voorraad/page.tsx',import.meta.url)));
});

// Tellen met foto's (wens eigenaar 17 november 2026): herkennen uit de voorraadlijst, nieuw product, − en +, eerste telling zonder reden.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './helpers/ts-resolve.mjs';
const C=await import('../lib/count-photo-core.ts');
const list=[{id:'cola',name:'Coca-Cola 33 cl blik',unit:'st',origin:'inkoop'},{id:'melk',name:'Volle melk',unit:'l',origin:'inkoop'}];

test('schema en vraag: kiezen uit de voorraadlijst',()=>{
 const s=C.countPhotoSchema(list);assert.deepEqual(s.properties.items.items.properties.ingredientId.anyOf[0].enum,['cola','melk']);
 assert.match(C.countPhotoPrompt(list),/cola: Coca-Cola 33 cl blik · st/);assert.match(C.countPhotoPrompt([]),/steeds op null/);
});
test('controle: bekend, zelfde naam, nieuw, dubbel en onleesbaar',()=>{
 const r=C.checkCountPhoto({readable:true,items:[
  {ingredientId:'cola',name:'Cola',unit:'kg',seen:6},
  {ingredientId:null,name:'volle melk',unit:'st',seen:null},
  {ingredientId:null,name:'FRISTI 65% MINDER SUIKER',unit:'st',seen:4},
  {ingredientId:'cola',name:'Cola',unit:'st',seen:2},
  {ingredientId:null,name:'',unit:'st',seen:1}]},list);
 assert.equal(r.ok,true);
 assert.deepEqual(r.items[0],{ingredientId:'cola',name:'Coca-Cola 33 cl blik',unit:'st',seen:6},'eenheid van het ingrediënt');
 assert.equal(r.items[1].ingredientId,'melk','zelfde naam = dat product');
 assert.deepEqual(r.items[2],{ingredientId:null,name:'Fristi 65% minder suiker',unit:'st',seen:4});
 assert.equal(r.items.length,3,'dubbel en leeg vallen weg');
 assert.equal(C.checkCountPhoto({readable:false},list).ok,false);
 assert.equal(C.checkCountPhoto({readable:true,items:[]},list).ok,false);
});
test('scherm en API: foto’s, − en +, nieuw product toevoegen, eerste telling zonder reden',()=>{
 const route=fs.readFileSync(new URL('../app/api/werkplek/tel-foto/route.ts',import.meta.url),'utf8');
 assert.match(route,/isSameOrigin/);assert.match(route,/createRateLimit/);
 const ui=fs.readFileSync(new URL('../app/werkplek/voorraad/tel-foto.tsx',import.meta.url),'utf8');
 assert.match(ui,/Tellen met foto’s/);assert.match(ui,/action:'ingredient'/);assert.match(ui,/Eén minder/);assert.match(ui,/Eén meer/);
 const page=fs.readFileSync(new URL('../app/werkplek/voorraad/page.tsx',import.meta.url),'utf8');
 assert.match(page,/<CountPhotos /);assert.match(page,/count-pm/);assert.match(page,/f\.i\.known&&f\.diff!==0/);
 const ops=fs.readFileSync(new URL('../app/api/operations/route.ts',import.meta.url),'utf8');
 assert.match(ops,/checkCount\(raw,i\.stock,isWarehouse\(i\)\|\|!i\.known\)/);
});

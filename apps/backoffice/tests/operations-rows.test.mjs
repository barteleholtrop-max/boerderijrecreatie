import {test} from 'node:test';
import assert from 'node:assert/strict';
import {toRows,fromRows,diffOps} from '../lib/operations-rows.ts';
import {applyMovement} from '../lib/operations-core.ts';
import {sample} from './operations-fixture.mjs';
const moveRows=s=>s.moves.map((m,i)=>({...m,seq:i+1}));
test('tabelrijen geven exact dezelfde stand terug',()=>{const s=sample();assert.deepEqual(fromRows(toRows(s),moveRows(s)),s)});
test('alleen gewijzigde en nieuwe rijen worden geschreven',()=>{
 const before=sample(),after=structuredClone(before);
 after.ingredients[1].notes='aangepast';applyMovement(after,'flour',-1,'2026-10-29','Verbruik','',' m2');
 const c=diffOps(before,after,1,1);
 assert.deepEqual(c.ingredients.map(r=>r.id),['flour','milk']);
 assert.equal(c.invoices.length+c.invoiceLines.length+c.recipes.length+c.recipeLines.length+c.incoming.length+c.history.length,0);
 assert.deepEqual(c.moves.map(m=>[m.seq,m.quantity]),[[2,-1]]);
});
test('vervangen recept herschrijft zijn regels, ook als er een regel vervalt',()=>{
 const before=sample(),after=structuredClone(before);
 after.recipes[0]={...after.recipes[0],lines:[{ingredientId:'flour',quantity:2}],version:3};
 after.recipeHistory.push({recipe:before.recipes[0],date:'2026-10-31',portionCents:60});
 const c=diffOps(before,after,1,1);
 assert.deepEqual(c.replaceRecipeLines,['p1']);assert.deepEqual(c.recipeLines.map(l=>l.ingredientId),['flour']);
 assert.equal(c.recipes[0].version,3);assert.equal(c.history.length,1);assert.equal(JSON.parse(c.history[0].recipe).version,2);
});
test('nieuwe factuur en ontvangst schrijven factuur, regels en bestelling',()=>{
 const before=sample(),after=structuredClone(before);
 after.invoices.push({id:'v2',supplier:'Ander',number:'F2',date:'2026-10-31',source:'',reviewed:true,lines:[{id:'a',article:'',description:'x',quantity:1,unit:'kg',netCents:100,ingredientId:'flour',kind:'product',received:false}]});
 after.incoming[0].remaining=0;after.incoming[0].status='received';
 const c=diffOps(before,after,1,1);
 assert.deepEqual(c.invoices.map(v=>v.id),['v2']);assert.deepEqual(c.invoiceLines.map(l=>l.invoiceId+'/'+l.id),['v2/a']);assert.equal(c.incoming[0].status,'received');
});

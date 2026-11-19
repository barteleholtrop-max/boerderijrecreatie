// Inkoop volgt de prullenbak van Gerechten & prijzen (wens eigenaar 5 november 2026).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {activeOnly} from '../lib/inkoop-view.ts';

test('ingrediënten en recepten van verwijderde producten staan niet in de lijsten; de rest blijft',()=>{
 const ingredients=[{id:'eieren'},{id:'melk'},{id:'meel'},{id:'nieuw-uit-factuur'}];
 const recipes=[
  {productId:'p-eieren',lines:[{ingredientId:'eieren'}]},           // winkelproduct, verwijderd
  {productId:'p-pannenkoek',lines:[{ingredientId:'melk'},{ingredientId:'meel'},{ingredientId:'eieren'}]}, // actief
  {productId:'p-melk',lines:[{ingredientId:'melk'}]},               // winkelproduct, verwijderd
 ];
 const v=activeOnly(ingredients,recipes,new Set(['p-pannenkoek']));
 assert.deepEqual(v.recipes.map(r=>r.productId),['p-pannenkoek']);
 assert.deepEqual(v.ingredients.map(i=>i.id),['eieren','melk','meel','nieuw-uit-factuur'],'nog gebruikt door de pannenkoek, of in geen recept');
 const zonderPannenkoek=activeOnly(ingredients,recipes,new Set());
 assert.deepEqual(zonderPannenkoek.ingredients.map(i=>i.id),['nieuw-uit-factuur'],'alleen nog in recepten van verwijderde producten: niet in de lijst');
 assert.equal(zonderPannenkoek.hiddenIngredients,3);assert.equal(zonderPannenkoek.hiddenRecipes,3);
});

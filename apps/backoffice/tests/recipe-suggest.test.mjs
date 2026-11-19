import {test} from 'node:test';
import assert from 'node:assert/strict';
import {suggestionParams,readSuggestion} from '../lib/recipe-suggest.ts';
const ing=(id,name,unit,allergens=[])=>({id,name,unit,supplier:'HANOS',article:'1',stock:3,known:true,countedAt:'',pack:1,min:0,leadDays:1,shelfDays:0,allergens,checked:true,notes:'interne notitie'});
const list=[ing('meel','Tarwebloem','kg',['Gluten']),ing('ei','Eieren','st',['Eieren']),ing('melk','Melk','l',['Melk'])];
const answer=input=>({stop_reason:'tool_use',content:[{type:'tool_use',id:'t',name:'recept_voorstel',input}]});

test('Claude krijgt productnaam, wensen en ingrediënten, maar geen prijzen, voorraad of notities',()=>{
 const p=suggestionParams({name:'Pannenkoeken',department:'Restaurant'},'10 porties',list,'claude-test');
 const text=JSON.stringify(p);
 assert.equal(p.tool_choice.name,'recept_voorstel');assert.equal(p.model,'claude-test');
 assert.match(text,/Pannenkoeken/);assert.match(text,/10 porties/);assert.match(text,/id meel: Tarwebloem \(kg\)/);assert.match(text,/Gluten/);
 assert.doesNotMatch(text,/interne notitie|HANOS/);
});
test('een voorstel gebruikt alleen bekende ingrediënten met de juiste eenheid; onbekende komen als ontbrekend terug',()=>{
 const s=readSuggestion(answer({porties:10,verliesPercentage:5,bereiding:'Beslag maken en bakken.',toelichting:'Controleer de melk.',ingredienten:[
  {id:'meel',naam:'Tarwebloem',eenheid:'kg',hoeveelheid:0.5},{id:'ei',naam:'Eieren',eenheid:'st',hoeveelheid:4},{id:'melk',naam:'Melk',eenheid:'kg',hoeveelheid:1},
  {naam:'Boter',eenheid:'kg',hoeveelheid:0.05},{id:'ei',naam:'Eieren',eenheid:'st',hoeveelheid:1},{naam:'',eenheid:'kg',hoeveelheid:1},{naam:'Zout',eenheid:'snufje',hoeveelheid:1}]}),list);
 assert.equal(s.yield,10);assert.equal(s.lossPct,5);
 assert.deepEqual(s.lines,[{ingredientId:'meel',quantity:0.5},{ingredientId:'ei',quantity:4}]);
 assert.deepEqual(s.missing.map(m=>m.name),['Melk','Boter']);
 assert.equal(s.note,'Controleer de melk.');
});
test('geen of een onbruikbaar antwoord geeft een duidelijke melding',()=>{
 assert.throws(()=>readSuggestion({stop_reason:'end_turn',content:[{type:'text',text:'hoi'}]},list),/geen bruikbaar voorstel/);
 assert.throws(()=>readSuggestion({stop_reason:'refusal',content:[]},list),/geen voorstel/);
 assert.throws(()=>readSuggestion(answer({porties:0,ingredienten:[]}),list),/porties/);
 assert.throws(()=>readSuggestion(answer({porties:2,ingredienten:[]}),list),/geen ingrediënten/);
 assert.equal(readSuggestion(answer({porties:2,verliesPercentage:150,ingredienten:[{id:'ei',naam:'Eieren',eenheid:'st',hoeveelheid:2}]}),list).lossPct,90);
});

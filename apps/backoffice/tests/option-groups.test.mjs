// Gedeelde keuzegroepen (wens eigenaar 5 november 2026): „Soort melk” bij cappuccino én latte; aanpassen geldt overal.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isShared,sharedGroups,withShared,library,quickGroup} from '../lib/option-groups.ts';

const melk={id:'kg-melk',title:'Soort melk',required:true,choices:[{id:'boer',label:'Van de boerderij',extraCents:0},{id:'haver',label:'Haver',extraCents:50}]};
const suiker={id:'eigen-1',title:'Suiker?',required:false,choices:[{id:'ja',label:'Ja',extraCents:0}]};

test('alleen groepen met kg- zijn gedeeld',()=>{
 assert.equal(isShared(melk),true);assert.equal(isShared(suiker),false);assert.equal(isShared(null),false);
 assert.deepEqual([...sharedGroups({optionGroups:[melk,suiker]}).keys()],['kg-melk']);
 assert.equal(sharedGroups({}).size,0);
});
test('een aangepaste groep vervangt alleen dezelfde groep en laat de rest staan',()=>{
 const nieuw={...melk,choices:[...melk.choices,{id:'amandel',label:'Amandel',extraCents:50}]};
 const latte={name:'Latte',priceCents:420,optionGroups:[suiker,melk]};
 const next=withShared(latte,new Map([['kg-melk',nieuw]]));
 assert.deepEqual(next.optionGroups,[suiker,nieuw]);assert.equal(next.name,'Latte');assert.equal(next.priceCents,420);
 assert.deepEqual(latte.optionGroups,[suiker,melk],'origineel blijft ongewijzigd');
});
test('geen wijziging: null; een groep wordt nooit toegevoegd bij een product dat hem niet heeft',()=>{
 assert.equal(withShared({optionGroups:[melk]},new Map([['kg-melk',melk]])),null);
 assert.equal(withShared({name:'Thee',optionGroups:[suiker]},new Map([['kg-melk',melk]])),null);
 assert.equal(withShared({name:'Taart'},new Map([['kg-melk',melk]])),null);
});
test('bibliotheek: elke gedeelde groep één keer, met de producten die hem gebruiken',()=>{
 const lib=library([{id:'a',draft:{name:'Cappuccino',optionGroups:[melk]}},{id:'b',draft:{name:'Latte',optionGroups:[suiker,melk]}},{id:'c',draft:{name:'Thee',optionGroups:[suiker]}},{id:'d',draft:null,published:{name:'Chai',optionGroups:[melk]}}]);
 assert.equal(lib.length,1);assert.equal(lib[0].group.title,'Soort melk');
 assert.deepEqual(lib[0].usedBy.map(u=>u.name),['Cappuccino','Latte','Chai']);
});

test('nieuwe keuzevraag vanaf de werkplek: vraag plus keuzes met komma’s, gedeeld en zonder meerprijs',()=>{
 let n=0;const id=()=>'id'+(++n);
 const g=quickGroup('  Soort melk ','Koe, Haver,  haver ;Koe',true,id);
 assert.deepEqual(g,{id:'kg-id1',title:'Soort melk',required:true,choices:[{id:'id2',label:'Koe',extraCents:0},{id:'id3',label:'Haver',extraCents:0},{id:'id4',label:'haver',extraCents:0}]});
 assert.equal(isShared(g),true,'daarna ook bij andere producten te kiezen');
 assert.equal(quickGroup('','Koe, Haver',true),null,'zonder vraag niets');
 assert.equal(quickGroup('Soort melk','Koe',true),null,'minstens twee keuzes');
});

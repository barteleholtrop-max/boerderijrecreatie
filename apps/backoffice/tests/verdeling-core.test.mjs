// Verdeling in één oogopslag (wens eigenaar 9 november 2026): rekenregels zonder database.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/ts-resolve.mjs';
const core=await import('../lib/verdeling-core.ts');
const sum=s=>s.parts.reduce((n,p)=>n+p.bp,0);
const base={today:'2026-11-09',
 pots:[{id:'restaurant',name:'Restaurant',weekly:false,hasRevenue:true,open:1,members:['Anna','Bauke'],current:{percentBp:3000,validFrom:'2026-11-01',roles:[{name:'Chef-kok',points:4},{name:'Nieuw',points:0}]},upcoming:null},
  {id:'boerderij',name:'Boerderij',weekly:false,hasRevenue:false,open:0,members:[],current:null,upcoming:null}],
 suppliers:[{id:'k',name:'Karst Jan',bp:1500,since:'2026-11-03',products:4},{id:'n',name:'Nieuw',bp:null,since:null,products:1}],
 shopPot:{bp:500,since:'2026-11-09',open:false,upcoming:null},
 funds:[{id:'f',name:'Kippenpot',active:true,shareBp:1000,manager:'Ingeborg',products:2}]};

test('elke verdeling telt op tot precies 100%, met de echte percentages',()=>{
 const v=core.buildVerdeling(base),by=id=>v.sources.find(s=>s.id===id);
 for(const s of v.sources)if(s.parts.length)assert.equal(sum(s),10000,s.name);
 assert.deepEqual(by('pot-restaurant').parts,[{to:'leden',bp:3000},{to:'cooperatie',bp:7000}]);
 assert.deepEqual(by('lev-k').parts,[{to:'cooperatie',bp:1500},{to:'winkelpot',bp:500},{to:'leverancier',bp:8000}],'15% + 5% winkelpot, 80% leverancier');
 assert.deepEqual(by('fonds-f').parts,[{to:'cooperatie',bp:1000},{to:'onderdeelpot',bp:9000}]);
 assert.deepEqual(by('winkel-eigen').parts,[{to:'cooperatie',bp:10000}]);
 assert.match(by('pot-restaurant').details[0],/Chef-kok 4/);assert.doesNotMatch(by('pot-restaurant').details[0],/Nieuw/,'rollen zonder punten niet tonen');
});
test('ontbrekende afspraken en percentages vallen op',()=>{
 const v=core.buildVerdeling(base),by=id=>v.sources.find(s=>s.id===id);
 assert.equal(by('pot-boerderij').status,'geen-afspraak');assert.deepEqual(by('pot-boerderij').parts,[]);
 assert.match(by('pot-boerderij').warnings.join(),/geen omzetbron/);
 // Zonder eigen percentage geldt het standaard coöperatiedeel van 15% (besluit eigenaar 9 november 2026), geen waarschuwing meer.
 assert.match(by('lev-n').details.join(),/standaard coöperatiedeel van 15/);assert.deepEqual(by('lev-n').warnings,[]);
 assert.deepEqual(by('lev-n').parts,[{to:'cooperatie',bp:1500},{to:'winkelpot',bp:500},{to:'leverancier',bp:8000}]);
 assert.equal(v.totals.open,1);
});
test('zonder winkelpot gaat het hele restant naar de leverancier; nooit meer dan 100%',()=>{
 const v=core.buildVerdeling({...base,shopPot:{bp:0,since:null,open:true,upcoming:null}});
 assert.deepEqual(v.sources.find(s=>s.id==='lev-k').parts,[{to:'cooperatie',bp:1500},{to:'leverancier',bp:8500}]);
 assert.equal(v.totals.open,2,'een lopend winkelpotvoorstel telt mee');
 assert.deepEqual(core.parts([{to:'cooperatie',bp:9800},{to:'winkelpot',bp:500},{to:'leverancier',bp:10000}]),[{to:'cooperatie',bp:9800},{to:'winkelpot',bp:200}]);
});

test('zonder eigen percentage geldt het standaard coöperatiedeel van 15%, gelijk aan coop-core (16 november 2026)',async()=>{
 const V=await import('../lib/verdeling-core.ts'),fsm=await import('node:fs');
 assert.equal(V.DEFAULT_COOP_BP,1500);
 assert.match(fsm.readFileSync(new URL('../lib/coop-core.ts',import.meta.url),'utf8'),/export const DEFAULT_COOP_BP=1500;/);
});

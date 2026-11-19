// Magazijnvoorraad (wens eigenaar 8 november 2026): melden op de tablet, bijbestellen voor Sanne, nooit voor gasten.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkRequest,openRequests,parseRequestReference,requestReference,isWarehouse,REQUEST_REASON} from '../lib/warehouse-core.ts';
import {checkCount} from '../lib/stock-count-core.ts';
import {validIngredient} from '../lib/operations-core.ts';
import {toRows,fromRows} from '../lib/operations-rows.ts';
import {sample} from './operations-fixture.mjs';
import {allPgSql} from './helpers/pg-sql.mjs';

const wc={id:'wc',name:'Toiletpapier',unit:'st',stock:12,known:true,min:6,supplier:'Sligro',kind:'magazijn'};
const flour={id:'flour',name:'Bloem',unit:'kg',stock:2,known:true,min:1,supplier:'',kind:undefined};
let seq=0;const req=(status,by,date,id='wc',quantity=0)=>({ingredientId:id,quantity,date,reason:REQUEST_REASON,reference:requestReference({status,by}),seq:++seq});
const mv=(quantity,date,reason='Levering',id='wc')=>({ingredientId:id,quantity,date,reason,reference:'',seq:++seq});

test('referentie heen en terug, zonder scheidingstekens uit de naam',()=>{
 const ref=requestReference({status:'bijna-op',by:'Sanne · de Vries',note:'bovenste plank leeg'});
 assert.equal(ref,'Magazijn · Bijna op · door Sanne de Vries · bovenste plank leeg');
 assert.deepEqual(parseRequestReference(ref),{status:'bijna-op',by:'Sanne de Vries',note:'bovenste plank leeg'});
 assert.equal(parseRequestReference('Werkplektelling · was 1 · geteld 2'),null);
});

test('personeel meldt alleen bijna op of op; inkoop ook besteld en afgehandeld; naam verplicht',()=>{
 assert.equal(checkRequest({ingredientId:'wc',status:'op',by:'Sanne'},true).status,'op');
 assert.throws(()=>checkRequest({ingredientId:'wc',status:'besteld',by:'Sanne'},true),/bijna op of op/);
 assert.equal(checkRequest({ingredientId:'wc',status:'besteld',by:'Sanne'},false).status,'besteld');
 assert.throws(()=>checkRequest({ingredientId:'wc',status:'op',by:'  '},true),/wie/);
 assert.throws(()=>checkRequest({status:'op',by:'Sanne'},true),/magazijnartikel/);
});

test('melding blijft open tot er weer voorraad bij komt; op gaat voor bijna op; besteld blijft zichtbaar',()=>{
 let open=openRequests([req('bijna-op','Sanne','2026-11-08')],[wc,flour]);
 assert.equal(open.length,1);assert.equal(open[0].status,'bijna-op');assert.equal(open[0].reportedBy,'Sanne');
 open=openRequests([req('bijna-op','Sanne','2026-11-08'),req('op','Kees','2026-11-09',undefined,-12)],[wc]);
 assert.equal(open[0].status,'op');assert.equal(open[0].reportedBy,'Kees');
 open=openRequests([req('op','Kees','2026-11-09'),req('besteld','Sanne','2026-11-09'),req('bijna-op','Sanne','2026-11-10')],[wc]);
 assert.equal(open[0].status,'besteld');assert.equal(open[0].reportedStatus,'op');assert.equal(open[0].orderedBy,'Sanne');
 open=openRequests([req('op','Kees','2026-11-09'),req('besteld','Sanne','2026-11-09'),mv(24,'2026-11-11')],[wc]);
 assert.equal(open.length,0,'levering sluit de melding');
 open=openRequests([req('bijna-op','Sanne','2026-11-08'),req('afgehandeld','Sanne','2026-11-08')],[wc]);
 assert.equal(open.length,0,'afgehandeld sluit de melding');
 open=openRequests([req('bijna-op','Sanne','2026-11-08'),mv(-2,'2026-11-09','Telling / correctie')],[wc]);
 assert.equal(open.length,1,'minder voorraad sluit niets');
});

test('alleen magazijnartikelen; het dringendst eerst',()=>{
 const tape={...wc,id:'tape',name:'Afwasmiddel'};
 const open=openRequests([req('op','x','2026-11-08','flour'),req('bijna-op','Sanne','2026-11-07','wc'),req('op','Kees','2026-11-08','tape')],[wc,tape,flour]);
 assert.deepEqual(open.map(r=>r.ingredientId),['tape','wc']);
 assert.equal(isWarehouse(flour),false);assert.equal(isWarehouse(wc),true);
});

test('magazijn tellen hoeft geen reden; gewone voorraad wel',()=>{
 assert.equal(checkCount({ingredientId:'wc',quantity:4},12,true).reason,null);
 assert.throws(()=>checkCount({ingredientId:'flour',quantity:4},12),/reden/);
});

test('soort: leeg of keuken of magazijn; alleen magazijn wordt bewaard en teruggelezen',()=>{
 const s=sample();const i=s.ingredients[0];
 assert.ok(validIngredient(i));assert.ok(validIngredient({...i,kind:'magazijn'}));assert.ok(validIngredient({...i,kind:'keuken'}));
 assert.ok(!validIngredient({...i,kind:'gasten'}));
 s.ingredients[0]={...i,kind:'magazijn'};
 const rows=toRows(s);assert.equal(rows.ingredients[0].kind,'magazijn');assert.equal(rows.ingredients[1]?.kind??'keuken','keuken');
 const back=fromRows(rows,[]);assert.equal(back.ingredients[0].kind,'magazijn');assert.equal('kind' in (back.ingredients[1]||{}),false);
});

test('scherm en route: tabblad Magazijn, melden en nooit in de afwijkingenlijst; schema met migratie',()=>{
 const page=readFileSync(new URL('../app/werkplek/voorraad/page.tsx',import.meta.url),'utf8');
 assert.match(page,/\['magazijn','🧻 Magazijn'\]/);assert.match(page,/action:'magazijn-melding',from:'werkplek'/);
 assert.match(page,/filter\(i=>i\.kind!=='magazijn'\)/,'Tellen toont geen magazijnartikelen');
 const route=readFileSync(new URL('../app/api/operations/route.ts',import.meta.url),'utf8');
 assert.match(route,/case 'magazijn-melding'/);assert.match(route,/filter\(m=>!own\.has\(m\.ingredientId\)\)/);
 assert.match(readFileSync(new URL('../db/schema.ts',import.meta.url),'utf8'),/kind:text\('kind'\)\.notNull\(\)\.default\('keuken'\)/);
 assert.match(allPgSql(),/"kind" text DEFAULT 'keuken' NOT NULL/);
});

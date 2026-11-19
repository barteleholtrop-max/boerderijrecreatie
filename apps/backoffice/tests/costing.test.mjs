import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {unitPriceCents,margin,suggestIngredient,cleanName,draftIngredient,matchByName,resaleProposals} from '../lib/costing.ts';
import {validInvoice} from '../lib/operations-core.ts';
const ing=(id,name,unit='l',o={})=>({id,name,unit,supplier:'',article:'',stock:0,known:false,countedAt:'',pack:1,min:0,leadDays:1,shelfDays:0,allergens:[],checked:false,notes:'',origin:'inkoop',ownCents:null,...o});
const line=(o={})=>({id:'l1',article:'123',description:'OATLY HAVERMELK BARISTA 6X1L',quantity:6,unit:'l',netCents:1500,ingredientId:'',kind:'product',received:false,...o});

test('prijs per kg, liter of stuk is het nettobedrag gedeeld door de totale hoeveelheid',()=>{
 assert.equal(unitPriceCents(line()),250);
 assert.equal(unitPriceCents(line({quantity:0})),null);
});
test('marge: verkoopprijs incl. btw terug naar excl. btw, min de kostprijs excl. btw',()=>{
 const m=margin(1090,'9',400);
 assert.equal(Math.round(m.exclCents),1000);assert.equal(Math.round(m.vatCents),90);assert.equal(Math.round(m.marginCents),600);assert.equal(Math.round(m.marginPct),60);
 assert.equal(margin(1210,'21',null).marginPct,null);
 assert.equal(margin(1000,'',400),null);assert.equal(margin(0,'9',400),null);
});
test('ingrediëntvoorstel: eerst hetzelfde leveranciersartikel, anders een volledige naammatch met dezelfde eenheid',()=>{
 const list=[ing('melk','Melk'),ing('haver','Havermelk',`l`),ing('haver-kg','Havermelk','kg'),ing('art','Iets anders','l',{supplier:'HANOS',article:'123'})];
 assert.deepEqual(suggestIngredient(line(),'Hanos',list),{ingredientId:'art',reason:'artikel'});
 assert.deepEqual(suggestIngredient(line({article:'999'}),'Hanos',list),{ingredientId:'haver',reason:'naam'});
 assert.equal(suggestIngredient(line({article:'999',description:'Volle melk'}),'Hanos',[ing('haver','Havermelk')]),null);
 assert.deepEqual(suggestIngredient(line({article:'',description:'Volle melk 1L'}),'',list),{ingredientId:'melk',reason:'naam'});
 assert.equal(suggestIngredient(line({article:'',description:'Kaas'}),'',list),null);
});
test('nieuw ingrediënt uit een factuurregel: leesbare naam, zelfde eenheid, verpakking uit de omrekening, allergenen ongecontroleerd',()=>{
 assert.equal(cleanName('OATLY HAVERMELK BARISTA 6X1L'),'Oatly havermelk barista');
 const d=draftIngredient(line({packCount:6,packSize:1}),' HANOS ','id1');
 assert.equal(d.name,'Oatly havermelk barista');assert.equal(d.unit,'l');assert.equal(d.pack,1);assert.equal(d.supplier,'HANOS');assert.equal(d.article,'123');assert.equal(d.checked,false);assert.deepEqual(d.allergens,[]);
 assert.equal(draftIngredient(line(),'x','id2').pack,6);
});
test('verpakkingsomrekening op een factuurregel moet kloppen met de totale hoeveelheid',()=>{
 const inv=l=>({id:'v',supplier:'HANOS',number:'1',date:'2026-11-02',source:'',lines:[line(l)],reviewed:false});
 assert.ok(validInvoice(inv({})));
 assert.ok(validInvoice(inv({packCount:2,packSize:3})));
 assert.ok(!validInvoice(inv({packCount:2,packSize:4})));
 assert.ok(!validInvoice(inv({packCount:2})));
});
test('migratie 0010 maakt de tabel voor koppelingssleutels',()=>{
 const dir=new URL('../drizzle/',import.meta.url),db=new DatabaseSync(':memory:');
 for(const n of fs.readdirSync(dir).filter(n=>n.endsWith('.sql')).sort())db.exec(fs.readFileSync(new URL(n,dir),'utf8'));
 db.prepare("INSERT INTO integration_settings(id,secret,updated) VALUES('claude','x','2026-11-02')").run();
 assert.deepEqual({...db.prepare('SELECT hint,note,updated_by FROM integration_settings').get()},{hint:'',note:'',updated_by:''});
});

test('eigen melk wordt nooit voorgesteld bij een groothandelsfactuur',()=>{
 const eigen=ing('m1','Melk','l',{origin:'eigen',ownCents:60,supplier:'Eigen boerderij',article:'7'});
 assert.equal(suggestIngredient({article:'',description:'Biologische volle melk 1 l',unit:'l'},'Sligro',[eigen]),null);
 assert.equal(suggestIngredient({article:'7',description:'Melk',unit:'l'},'Eigen boerderij',[eigen]),null);
 const groot=ing('m2','Melk','l');assert.equal(suggestIngredient({article:'',description:'Biologische volle melk 1 l',unit:'l'},'Sligro',[eigen,groot]).ingredientId,'m2');
 const d=draftIngredient({id:'x',article:'',description:'HAVERMELK 1L',quantity:6,unit:'l',netCents:900,ingredientId:'',kind:'product',received:false},'Sligro','n');assert.equal(d.origin,'inkoop');assert.equal(d.ownCents,null);
});
test('ingrediënt zoeken op naam, in beide richtingen en op eenheid',()=>{
 const list=[ing('a','Appelsap','l'),ing('b','Appelsap Boerderijrecreatie','st'),ing('c','Jam aardbei','st')];
 assert.equal(matchByName('Appelsap',list,'l').id,'a');
 assert.equal(matchByName('Appelsap Boerderijrecreatie 0,75',list,'st').id,'b');
 assert.equal(matchByName('Boerderijrecreatie jam aardbei 450 gram',list,'st').id,'c');
 assert.equal(matchByName('Kaas',list),null);
});
test('doorverkoop: alleen winkelproducten zonder recept, bestaand ingrediënt per stuk of een nieuw',()=>{
 const products=[{id:'p1',name:'Jam aardbei',department:'Winkel'},{id:'p2',name:'Honing',department:'Winkel'},{id:'p3',name:'Soep',department:'Restaurant'},{id:'p4',name:'Eieren',department:'Winkel'}];
 const r=resaleProposals(products,[{productId:'p4'}],[ing('c','Jam aardbei','st'),ing('h','Honing','kg')]);
 assert.deepEqual(r,[{productId:'p2',name:'Honing',ingredientId:null,newName:'Honing'},{productId:'p1',name:'Jam aardbei',ingredientId:'c',newName:''}]);
});

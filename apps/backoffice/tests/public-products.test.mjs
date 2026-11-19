import {test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/ts-resolve.mjs';
const {publicProducts}=await import('../lib/public-products.ts');
const row=(id,p,published=true)=>({id,version:3,published:published?JSON.stringify({name:'Koffie',department:'Restaurant',priceCents:350,vat:'9',station:'barista',available:true,photo:'',note:'Interne notitie',check:'',sourceId:'bron-1',allergens:['Melk'],allergensChecked:true,optionGroups:[],...p}):null});
test('alleen gepubliceerde producten, zonder interne velden',()=>{
 const list=publicProducts([row('a',{}),row('b',{},false)]);
 assert.equal(list.length,1);const p=list[0];
 assert.deepEqual(Object.keys(p).sort(),['allergens','allergensChecked','available','barcodes','customerPrice','department','id','menuCategory','name','optionGroups','organic','photo','priceCents','route','skal','soldOut','supplier','supplierCompany','tile','vat','version','wasCents']);
 for(const secret of ['Interne notitie','bron-1','barista'])assert.ok(!JSON.stringify(list).includes(secret),secret);
});
test('allergenen alleen na controle; geen geraden prijzen of btw',()=>{
 assert.equal(publicProducts([row('a',{allergensChecked:false})])[0].allergens,null);
 assert.deepEqual(publicProducts([row('a',{})])[0].allergens,['Melk']);
 assert.equal(publicProducts([row('a',{vat:''}),row('b',{priceCents:'3,50'})]).length,0);
 assert.equal(publicProducts([row('a',{sourceCheck:'Prijs controleren'})])[0].available,false);
});
test('interne media-adressen worden niet doorgegeven, publieke https-foto wel',()=>{
 assert.equal(publicProducts([row('a',{photo:'/api/media/0d6f9c1e-6a2b-4c4f-9f2e-1a2b3c4d5e6f'})])[0].photo,'/api/public/media/0d6f9c1e-6a2b-4c4f-9f2e-1a2b3c4d5e6f','beeldbankfoto via het openbare foto-adres');
 assert.equal(publicProducts([row('a',{photo:'/api/media/../../etc'})])[0].photo,null);
 assert.equal(publicProducts([row('a',{photo:'https://example.org/k.jpg'})])[0].photo,'https://example.org/k.jpg');
});
test('alleen bestelbaar met werkafdeling; route en keuze-ID\'s voor de website',()=>{
 assert.equal(publicProducts([row('a',{station:''})])[0].available,false);
 assert.equal(publicProducts([row('a',{check:'Prijs controleren'})])[0].available,false);
 assert.equal(publicProducts([row('a',{})])[0].route,'eten-drinken');
 assert.equal(publicProducts([row('a',{station:'winkel',department:'Speelboerderij'})])[0].route,'winkel');
 const g=publicProducts([row('a',{optionGroups:[{id:'g1',title:'Melk',required:true,choices:[{id:'c1',label:'Haver',extraCents:50}]}]})])[0].optionGroups;
 assert.deepEqual(g,[{id:'g1',title:'Melk',required:true,choices:[{id:'c1',label:'Haver',extraCents:50}]}]);
});

test('geteld product met voorraad 0 is uitverkocht en niet te bestellen; onbeperkt telt niet',()=>{
 const rows=[row('a',{stockMode:'geteld'}),row('b',{stockMode:'geteld'}),row('c',{}),row('d',{stockMode:'geteld'})];
 const list=publicProducts(rows,new Map([['a',0],['b',4],['c',0]]));
 const by=id=>list.find(p=>p.id===id);
 assert.equal(by('a').soldOut,true);assert.equal(by('a').available,false);
 assert.equal(by('b').soldOut,false);assert.equal(by('b').available,true);
 assert.equal(by('c').soldOut,false,'onbeperkt: nooit uitverkocht');
 assert.equal(by('d').soldOut,false,'stand onbekend: niet als uitverkocht tonen');
 assert.ok(!('stockMode' in by('a')),'interne instellingen gaan niet naar de website');
});

test('gastcategorie komt centraal uit de productnaam',()=>{assert.deepEqual(publicProducts([row('a',{name:'Affligem 0.0 Blond'}),row('b',{name:'Koffie'}),row('c',{name:'Ambachtelijke taart'}),row('d',{name:'2 losse koekjes'})]).map(p=>p.menuCategory).sort(),['Bier (glas of flesje)','Koffie','Taart en gebak','Taart en gebak'].sort())});
test('etiketprijs (klant voert prijs in) gaat mee naar de website',()=>{
 const [p]=publicProducts([row('rv',{name:'Rundvlees',station:'winkel',customerPrice:true})]);
 assert.equal(p.customerPrice,true);assert.equal(p.route,'winkel');
 assert.equal(publicProducts([row('k',{})])[0].customerPrice,false);
});

test('niet op het startscherm (9 november 2026): tile false, wel te koop; het kenmerk nieuw via zelfkassa blijft intern',()=>{
 const [p]=publicProducts([row('a',{onStartscherm:false,zelfkassa:{at:'2026-11-09T08:00:00Z',labelName:'runderhaas'}})]);
 assert.equal(p.tile,false);assert.equal(p.available,publicProducts([row('a',{})])[0].available);
 assert.equal(publicProducts([row('a',{})])[0].tile,true,'standaard op het startscherm');
 assert.ok(!JSON.stringify(p).includes('runderhaas'));
});

test('wie levert het (9 november 2026): alleen wat de backoffice meegeeft (voornaam of pot), anders null',()=>{
 assert.equal(publicProducts([row('a',{})])[0].supplier,null);
 assert.equal(publicProducts([row('a',{})],new Map(),new Map([['a','Rianne']]))[0].supplier,'Rianne');
});

test('streepjescodes (9 november 2026): alleen cijfercodes, standaard leeg',()=>{
 assert.deepEqual(publicProducts([row('a',{})])[0].barcodes,[]);
 assert.deepEqual(publicProducts([row('a',{barcodes:['8712345678906','abc','12']})])[0].barcodes,['8712345678906']);
});

test('bedrijfsnaam van het lid voor een landingspagina (Nijemoed Bloemen)',()=>{
 assert.equal(publicProducts([row('a',{})])[0].supplierCompany,null);
 assert.equal(publicProducts([row('a',{})],new Map(),new Map([['a','Bindert']]),new Map([['a','Nijemoed Bloemen']]))[0].supplierCompany,'Nijemoed Bloemen');
});

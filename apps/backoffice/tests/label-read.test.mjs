// Etiket lezen voor de zelfkassa (wens eigenaar 9 november 2026): de controle op wat Claude van een prijsetiket leest.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/ts-resolve.mjs';
const L=await import('../lib/label-read-core.ts');
const candidates=[{id:'p-lever',name:'Runderlever'},{id:'p-gehakt',name:'Rundergehakt'}];

test('etiket: runderlever 0,690 kg × € 18,50 = € 12,77 klopt en wordt gekoppeld',()=>{
 const r=L.checkLabel({readable:true,productId:'p-lever',labelName:'runderlever',totalCents:1277,weightGrams:690,unitPriceCents:1850},candidates);
 assert.deepEqual(r,{ok:true,productId:'p-lever',labelName:'runderlever',totalCents:1277,weightGrams:690,unitPriceCents:1850,checked:true});
 const g=L.checkLabel({readable:true,productId:'p-gehakt',labelName:'rundergehakt',totalCents:1113,weightGrams:530,unitPriceCents:2100},candidates);
 assert.equal(g.ok&&g.checked,true,'0,530 × 21,00 = 11,13');
});
test('etiket: gewicht × kiloprijs past niet bij het totaal: wel het totaal, maar niet als gecontroleerd',()=>{
 const r=L.checkLabel({readable:true,productId:'p-lever',labelName:'x',totalCents:1500,weightGrams:690,unitPriceCents:1850},candidates);
 assert.equal(r.ok,true);assert.equal(r.ok&&r.checked,false);
});
test('etiket: onleesbaar, onbekend product of onzinbedrag wordt geweigerd',()=>{
 assert.equal(L.checkLabel({readable:false},candidates).ok,false);
 assert.equal(L.checkLabel({readable:true,productId:'p-onbekend',totalCents:500},candidates).ok,false);
 assert.equal(L.checkLabel({readable:true,productId:'p-lever',totalCents:null},candidates).ok,false);
 assert.equal(L.checkLabel({readable:true,productId:'p-lever',totalCents:0},candidates).ok,false);
 assert.equal(L.checkLabel({readable:true,productId:'p-lever',totalCents:L.MAX_LABEL_CENTS+1},candidates).ok,false);
 assert.equal(L.checkLabel({readable:true,productId:'p-lever',totalCents:12.5},candidates).ok,false,'geen halve centen');
 assert.equal(L.checkLabel(null,candidates).ok,false);
});
test('etiket: schema laat alleen producten uit de lijst toe; prompt noemt ze',()=>{
 const s=L.labelSchema(candidates);
 assert.deepEqual(s.properties.productId.anyOf[0].enum,['p-lever','p-gehakt']);
 assert.equal(s.additionalProperties,false);
 assert.match(L.labelPrompt(candidates),/p-lever: Runderlever/);
});
test('etiket: alleen een foto als data-URL, niet te groot',()=>{
 assert.deepEqual(L.parseImage('data:image/jpeg;base64,QUJD'),{mediaType:'image/jpeg',data:'QUJD'});
 assert.equal(L.parseImage('data:image/gif;base64,QUJD'),null);
 assert.equal(L.parseImage('https://elders.example/x.jpg'),null);
 assert.equal(L.parseImage('data:image/jpeg;base64,'+'A'.repeat(2_100_000)),null);
 assert.equal(L.parseImage(42),null);
});

test('etiket: geen passend product → de naam van het etiket komt terug om het product aan te maken',()=>{
 const r=L.checkLabel({readable:true,productId:null,labelName:'  runderhaas ',totalCents:2450,weightGrams:350,unitPriceCents:7000},candidates);
 assert.deepEqual(r,{ok:true,productId:null,newName:'Runderhaas',labelName:'  runderhaas ',totalCents:2450,weightGrams:350,unitPriceCents:7000,checked:true});
 const same=L.checkLabel({readable:true,productId:null,labelName:'RUNDERLEVER',totalCents:1277},candidates);
 assert.equal(same.ok&&same.productId,'p-lever','dezelfde naam: bestaand product, ook als Claude het niet koos');
 assert.equal(L.checkLabel({readable:true,productId:null,labelName:'12',totalCents:500},candidates).ok,false,'geen bruikbare naam');
 assert.equal(L.productName('<script>runder</script>'),'Script runder script');
 assert.equal(L.productName('Kaas 48+ (jong belegen)'),'Kaas 48 (jong belegen)');
});

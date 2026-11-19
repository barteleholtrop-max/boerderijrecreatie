// Voorraad tellen op de werkplek en onderling inkopen (wens eigenaar 6 november 2026).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './helpers/ts-resolve.mjs';
const C=await import('../lib/stock-count-core.ts');

test('telling: zonder verschil geen reden nodig, met verschil wel',()=>{
 assert.deepEqual(C.checkCount({ingredientId:'cola',quantity:12},12),{ingredientId:'cola',quantity:12,reason:null,note:''});
 assert.throws(()=>C.checkCount({ingredientId:'cola',quantity:8},12),/reden/);
 assert.equal(C.checkCount({ingredientId:'cola',quantity:8,reason:'groep',note:' verjaardag '},12).reason,'groep');
 assert.throws(()=>C.checkCount({ingredientId:'cola',quantity:8,reason:'anders',note:'  '},12),/Anders/);
 assert.throws(()=>C.checkCount({ingredientId:'cola',quantity:-1,reason:'groep'},12),/0 of meer/);
 assert.throws(()=>C.checkCount({ingredientId:'cola',quantity:8,reason:'toString'},12),/reden/);
 // Afronding: 0,1 + 0,2 telt niet als verschil.
 assert.equal(C.checkCount({ingredientId:'melk',quantity:0.3},0.1+0.2).reason,null);
});

test('referentie: heen en terug, ook met vreemde tekens in de toelichting',()=>{
 const ref=C.countReference({oldStock:12,quantity:8.5,reason:'groep',note:'feest · bovenzaal\nlaat',by:'Sanne de Vries'});
 assert.equal(ref,'Werkplektelling · was 12 · geteld 8,5 · Groep of feest buiten de kassa: feest bovenzaal laat · door Sanne de Vries');
 assert.deepEqual(C.parseCountReference(ref),{oldStock:12,quantity:8.5,reason:'groep',reasonText:'Groep of feest buiten de kassa',note:'feest bovenzaal laat',by:'Sanne de Vries'});
 assert.equal(C.parseCountReference('Telling'),null);
 assert.equal(C.parseCountReference('Werkplektelling · was 3 · geteld 3 · door Piet').reason,null);
});

test('afwijkingenlijst: verkocht sinds vorige telling, groot verschil gemarkeerd, nieuwste eerst',()=>{
 const ing=[{id:'cola',name:'Cola',unit:'st'},{id:'taart',name:'Appeltaart',unit:'st'}];
 const moves=[
  {ingredientId:'cola',quantity:24,date:'2026-11-01',reason:'Beginvoorraad',reference:'Telling',seq:1},
  {ingredientId:'cola',quantity:-5,date:'2026-11-02',reason:'Verkoop',reference:'P00001',seq:2},
  {ingredientId:'cola',quantity:-3,date:'2026-11-03',reason:'Verkoop',reference:'P00002',seq:3},
  {ingredientId:'cola',quantity:-10,date:'2026-11-04',reason:'Telling / correctie',reference:C.countReference({oldStock:16,quantity:6,reason:'groep',note:'',by:'Sanne'}),seq:4},
  {ingredientId:'taart',quantity:-1,date:'2026-11-04',reason:'Telling / correctie',reference:C.countReference({oldStock:10,quantity:9,reason:'kapot',note:'',by:'Jan'}),seq:5},
  {ingredientId:'taart',quantity:0,date:'2026-11-05',reason:'Telling / correctie',reference:C.countReference({oldStock:9,quantity:9,reason:null,note:'',by:'Jan'}),seq:6},
 ];
 const rows=C.deviationReport(moves,ing);
 assert.equal(rows.length,2,'een telling zonder verschil staat niet in de lijst');
 assert.equal(rows[0].name,'Appeltaart');assert.equal(rows[0].large,false);
 assert.deepEqual({diff:rows[1].diff,sold:rows[1].soldSince,since:rows[1].sinceDate,large:rows[1].large,by:rows[1].by},{diff:-10,sold:8,since:'2026-11-01',large:true,by:'Sanne'});
});

test('onderling inkopen: referentie met afdeling en naam',()=>{
 assert.equal(C.internalReference('keuken',' Chef  Jan '),'Keuken · Chef Jan');
 assert.throws(()=>C.internalReference('keuken',''),/wie/);
 assert.throws(()=>C.internalReference('kelder','Jan'),/keuken/);
 assert.equal(C.INTERNAL_MODE,'onderling');
});

test('onderling: keuken betaalt inkoopprijs (besluit eigenaar 6 november 2026)',()=>{
 // Lid met 15% coöperatiedeel: kaas van € 10,00 → € 8,50, precies wat het lid normaal krijgt.
 assert.equal(C.internalUnitCents({priceCents:1000,vat:'9',owner:true,ownerBp:1500,costExclCents:null}),850);
 assert.equal(C.internalUnitCents({priceCents:1000,vat:'9',owner:true,ownerBp:2000,costExclCents:null}),800,'coöperatiedeel + winkelpot (16 november 2026)');
 assert.equal(C.internalUnitCents({priceCents:1000,vat:'9',owner:true,ownerBp:null,costExclCents:null}),1000,'geen percentage = 0% inhouding, net als de weekafsluiting');
 // Coöperatie zelf: kostprijs excl. btw plus btw.
 assert.equal(C.internalUnitCents({priceCents:250,vat:'9',owner:false,ownerBp:null,costExclCents:100}),109);
 assert.equal(C.internalUnitCents({priceCents:250,vat:'21',owner:false,ownerBp:null,costExclCents:null}),null);
});

test('weekafsluiting: onderlinge regel gaat zonder inhouding naar het lid',async()=>{
 const K=await import('../lib/coop-core.ts');
 const people=[{id:'kj',name:'Karst Jan',vatInclusive:false}],rates=[{participantId:'kj',validFrom:'2026-01-01',percentBp:1500}];
 const line=(paid,internal)=>({orderId:1,number:'P00001',day:'2026-11-06',productName:'Kaas',quantity:1,ownerId:'kj',paidCents:paid,paidVatCents:Math.round(paid*9/109),sign:1,test:false,internal});
 const normal=K.settle([line(1090,false)],people,rates).participants[0].payoutCents;
 const intern=K.settle([line(Math.round(1090*0.85),true)],people,rates).participants[0];
 assert.equal(intern.retainedCents,0);
 assert.ok(Math.abs(intern.payoutCents-normal)<=1,`lid krijgt hetzelfde: ${intern.payoutCents} tegen ${normal}`);
});

test('onderling: onbekende inkoopprijs zelf invullen (besluit eigenaar 6 november 2026)',()=>{
 assert.equal(C.manualUnitCents(350,'Cola'),350);
 assert.throws(()=>C.manualUnitCents(undefined,'Cola'),/Vul bij Cola een prijs/);
 assert.throws(()=>C.manualUnitCents(0,'Cola'),/prijs/);assert.throws(()=>C.manualUnitCents(2.5,'Cola'),/prijs/);
 assert.throws(()=>C.manualUnitCents(C.MAX_MANUAL_CENTS+1,'Cola'),/erg hoog/);
});

test('onderling met etiketprijs (besluit eigenaar 9 november 2026): etiket min coöperatiedeel, zonder eigenaar het volle bedrag',()=>{
 const S=C;
 // Runderlever van een lid, etiket € 12,77, coöperatiedeel 15%: de keuken betaalt € 10,85.
 assert.equal(S.internalLabelUnitCents(1277,{name:'Runderlever',owner:true,ownerBp:1500}),1085);
 assert.equal(S.internalLabelUnitCents(1277,{name:'Runderlever',owner:true,ownerBp:null}),1277,'geen percentage ingesteld = 0');
 assert.equal(S.internalLabelUnitCents(1113,{name:'Rundergehakt',owner:false,ownerBp:null}),1113,'coöperatie zelf: het volle etiketbedrag');
 assert.throws(()=>S.internalLabelUnitCents(undefined,{name:'Runderlever',owner:true,ownerBp:1500}),/etiket/);
 assert.throws(()=>S.internalLabelUnitCents(0,{name:'Runderlever',owner:true,ownerBp:1500}),/etiket/);
 assert.throws(()=>S.internalLabelUnitCents(S.MAX_MANUAL_CENTS+1,{name:'Runderlever',owner:true,ownerBp:1500}),/hoog/);
 assert.equal(S.LABEL_PRICE_CHOICE(1277,true),'etiket € 12,77, min coöperatiedeel en winkelpot');
});

test('keuken betaalt ook de winkelpot minder (besluit eigenaar 16 november 2026)',()=>{
 const src=fs.readFileSync(new URL('../app/api/orders/route.ts',import.meta.url),'utf8');
 assert.match(src,/potOn\(await shopPotRules\(\),today\)/);
 assert.match(src,/ownerBp:owner\?withPot\(/);assert.match(src,/bp:owner\?withPot\(/);
});

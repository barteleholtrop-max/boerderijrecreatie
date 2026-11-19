import {test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/ts-resolve.mjs';
const C=await import('../lib/coop-core.ts');
const line=o=>({orderId:1,number:'P00001',day:'2026-11-03',productName:'Brood',quantity:1,ownerId:'rianne',paidCents:1090,paidVatCents:90,sign:1,test:false,...o});
const people=[{id:'rianne',name:'Rianne',vatInclusive:false},{id:'bindert',name:'Bindert',vatInclusive:true},{id:'karst',name:'Karst Jan',vatInclusive:false}];

test('weken: maandag t/m zondag, de vorige week is af op maandag',()=>{
 assert.equal(C.mondayOf('2026-11-03'),'2026-11-02');assert.equal(C.mondayOf('2026-11-08'),'2026-11-02');assert.equal(C.mondayOf('2026-11-09'),'2026-11-09');
 assert.equal(C.weekEnd('2026-11-02'),'2026-11-08');assert.equal(C.lastClosedWeek('2026-11-09'),'2026-11-02');
 assert.equal(C.isoWeekNumber('2026-11-02'),45);assert.equal(C.isoWeekNumber('2026-12-28'),53);
 assert.throws(()=>C.mondayOf('3-11-2026'));
});
test('percentage per datum: elke verkoopdag rekent met wat die dag gold',()=>{
 const rates=[{participantId:'rianne',validFrom:'2026-01-01',percentBp:1500},{participantId:'rianne',validFrom:'2026-11-05',percentBp:2000}];
 assert.equal(C.rateOn(rates,'rianne','2026-11-04'),1500);assert.equal(C.rateOn(rates,'rianne','2026-11-05'),2000);assert.equal(C.ownRateOn(rates,'rianne','2025-12-31'),null);assert.equal(C.rateOn(rates,'rianne','2025-12-31'),1500,'geen eigen percentage: de vaste afspraak van 15% (besluit eigenaar 9 november 2026)');
 assert.equal(C.validRate({participantId:'x',validFrom:'2026-11-02',percentBp:10001}),false);assert.equal(C.percentText(1250),'12,5%');
});
test('afrekening over de omzet exclusief btw, eigenaar per regel, proef nooit afgerekend',()=>{
 const rates=[{participantId:'rianne',validFrom:'2026-01-01',percentBp:1500},{participantId:'rianne',validFrom:'2026-11-05',percentBp:2000},{participantId:'bindert',validFrom:'2026-01-01',percentBp:1000}];
 const s=C.settle([
  line({}),                                    // 10,00 excl → 15% = 1,50
  line({day:'2026-11-06'}),                    // 10,00 excl → 20% = 2,00
  line({ownerId:'bindert',paidCents:2420,paidVatCents:420}), // bloemen 21%: 20,00 excl, 10% = 2,00; incl btw: + 90% van 4,20 = 3,78
  line({ownerId:null,paidCents:350,paidVatCents:29}),        // geen eigenaar: coöperatie
  line({ownerId:'onbekend',paidCents:100,paidVatCents:8}),   // eigenaar bestaat niet meer: coöperatie
  line({test:true,paidCents:99999}),
  line({orderId:9,sign:-1,day:'2026-11-07'}),  // correctie (terugbetaald uit een eerdere week), 20% in die dag
 ],people,rates);
 const r=s.participants.find(p=>p.id==='rianne'),b=s.participants.find(p=>p.id==='bindert');
 assert.equal(r.revenueExclCents,1000);assert.equal(r.retainedCents,150+200-200);assert.equal(r.payoutCents,1000-150);
 assert.equal(b.revenueExclCents,2000);assert.equal(b.retainedCents,200);assert.equal(b.vatShareCents,378);assert.equal(b.payoutCents,2000-200+378);
 assert.deepEqual(s.coop,{revenueExclCents:321+92,vatCents:37,lines:2});assert.equal(s.testLines,1);
 assert.equal(s.participants.some(p=>p.id==='karst'),false,'geen verkoop: niet in de lijst');
 assert.equal(s.retainedTotalCents,350);assert.equal(s.payoutTotalCents,850+2178);assert.deepEqual(s.warnings,[]);
});
test('afronden in één keer per percentage; vaste afspraak zonder eigen percentage; waarschuwing bij negatief saldo',()=>{
 const many=Array.from({length:3},()=>line({paidCents:109,paidVatCents:9}));// 3 × 1,00 excl, 12,5% → 0,375 → 0,38 (niet 3 × 0,13)
 const s=C.settle(many,people,[{participantId:'rianne',validFrom:'2026-01-01',percentBp:1250}]);
 assert.equal(s.participants[0].retainedCents,38);
 const w=C.settle([line({ownerId:'karst'}),line({sign:-1})],people,[{participantId:'rianne',validFrom:'2026-01-01',percentBp:1000}]);
 const k=w.participants.find(p=>p.id==='karst');assert.equal(k.retainedCents,150,'15% vaste afspraak');assert.equal(k.missingRate,true,'het scherm laat „vaste afspraak” zien');assert.doesNotMatch(w.warnings.join(' '),/Karst/);assert.match(w.warnings.join(' '),/Rianne: negatief saldo/);
 assert.equal(w.payoutTotalCents,850,'negatief wordt niet meegeteld');
});
test('IBAN-controle en afschermen',()=>{
 for(const v of ['NL91ABNA0417164300','nl91 abna 0417 1643 00','DE89370400440532013000','NL20INGB0001234567'])assert.equal(C.validIban(v),true,v);
 for(const v of ['NL91ABNA0417164301','NL91ABNA041716430','XX00','',null,'NL91 ABNA 0417 1643 00 1'])assert.equal(C.validIban(v),false,String(v));
 assert.equal(C.maskIban('NL91ABNA0417164300'),'NL91 •••• 4300');
});
test('SEPA-betaalbestand (pain.001.001.03) en reserve-CSV',()=>{
 const xml=C.sepaXml({msgId:'BB-2026-11-02',createdAt:'2026-11-09T08:00:00.000Z',executionDate:'2026-11-09',debtorName:'Coöperatie Boer Bart',debtorIban:'NL91ABNA0417164300',
  transfers:[{endToEndId:'BB-2026-11-02-bindert',name:'Bindert & Zn',iban:'nl20 ingb 0001 2345 67',amountCents:2178,remittance:'Boer Bart week 45 · Bindert'},{endToEndId:'x',name:'Nul',iban:'NL20INGB0001234567',amountCents:0,remittance:'x'}]});
 assert.match(xml,/xmlns="urn:iso:std:iso:20022:tech:xsd:pain\.001\.001\.03"/);
 assert.equal((xml.match(/<CdtTrfTxInf>/g)||[]).length,1,'nul of negatief gaat er niet in');
 assert.match(xml,/<NbOfTxs>1<\/NbOfTxs>\s*<CtrlSum>21\.78<\/CtrlSum>/);assert.match(xml,/<InstdAmt Ccy="EUR">21\.78<\/InstdAmt>/);
 assert.match(xml,/<Nm>Bindert \+ Zn<\/Nm>/);assert.match(xml,/<IBAN>NL20INGB0001234567<\/IBAN>/);assert.match(xml,/<Nm>Cooperatie Boer Bart<\/Nm>/);
 assert.match(xml,/<Ustrd>Boer Bart week 45 Bindert<\/Ustrd>/);assert.match(xml,/<ReqdExctnDt>2026-11-09<\/ReqdExctnDt>/);
 assert.doesNotMatch(xml,/[<>&]\s*script/i);
 assert.throws(()=>C.sepaXml({msgId:'a',createdAt:'2026-11-09T08:00:00Z',executionDate:'2026-11-09',debtorName:'x',debtorIban:'NL00',transfers:[{endToEndId:'a',name:'a',iban:'NL20INGB0001234567',amountCents:1,remittance:'a'}]}),/coöperatie/);
 assert.throws(()=>C.sepaXml({msgId:'a',createdAt:'2026-11-09T08:00:00Z',executionDate:'2026-11-09',debtorName:'x',debtorIban:'NL91ABNA0417164300',transfers:[{endToEndId:'a',name:'Karst',iban:'NL00',amountCents:1,remittance:'a'}]}),/Karst/);
 assert.throws(()=>C.sepaXml({msgId:'a',createdAt:'x',executionDate:'2026-11-09',debtorName:'x',debtorIban:'NL91ABNA0417164300',transfers:[]}),/niets/);
 const csv=C.transfersCsv([{endToEndId:'a',name:'=HYPERLINK("x")',iban:'NL20INGB0001234567',amountCents:12345,remittance:'week 45; brood'}]);
 assert.equal(csv,'Naam;IBAN;Bedrag;Omschrijving\r\n"\'=HYPERLINK(""x"")";NL20INGB0001234567;123,45;"week 45; brood"\r\n');
});
test('onderlinge ruil (BB stap 4): met BB betaald = 2% coöperatiedeel, naar verhouding, nooit meer dan het gewone',()=>{
 assert.equal(C.ruilRate(1500,0),1500);assert.equal(C.ruilRate(1500,10000),200);assert.equal(C.ruilRate(1500,5000),850);assert.equal(C.ruilRate(100,10000),100,'lager percentage blijft');
 const rates=[{participantId:'rianne',validFrom:'2026-01-01',percentBp:1500}];
 const gewoon=C.settle([line({})],people,rates).participants[0],ruil=C.settle([line({bbShareBp:10000})],people,rates).participants[0];
 assert.deepEqual([gewoon.retainedCents,gewoon.payoutCents],[150,850]);   // 10,00 excl, 15%
 assert.deepEqual([ruil.retainedCents,ruil.payoutCents],[20,980]);        // 10,00 excl, 2%
 const half=C.settle([line({bbShareBp:5000})],people,rates).participants[0];assert.equal(half.retainedCents,85);
});

test('proefverkopen: alleen proefregels van deze deelnemer, met bedrag incl. btw; nooit in de afrekening',async()=>{
 const {practiceSales,settle}=await import('../lib/coop-core.ts');
 const line=(o)=>({orderId:37,number:'P00037',day:'2026-11-07',productName:'bloemen',quantity:1,ownerId:'bindert',paidCents:2000,paidVatCents:165,sign:1,test:true,...o});
 const lines=[line(),line({orderId:38,quantity:2,paidCents:4000,paidVatCents:330}),line({ownerId:'ander'}),line({test:false,productName:'echt'}),line({orderId:39,sign:-1})];
 const r=practiceSales(lines,'bindert');
 assert.deepEqual(r.products,[{name:'bloemen',quantity:2,inclCents:4000}]);
 assert.equal(r.quantity,2);assert.equal(r.inclCents,4000);
 assert.deepEqual(practiceSales([],'bindert'),{products:[],quantity:0,inclCents:0});
 const s=settle(lines.filter(l=>l.test),[{id:'bindert',name:'Bindert',vatInclusive:false}],[]);
 assert.equal(s.participants.length,0);assert.equal(s.testLines,4);
});

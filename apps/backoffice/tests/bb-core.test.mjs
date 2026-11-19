// BB-tegoed stap 1 (besluiten eigenaar 5 en 6 november 2026): wie BB krijgt en wat een weekafsluiting bijschrijft.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './helpers/ts-resolve.mjs';
const {getsBb,potWeekEntries,shopWeekEntries,bbBalance,paidAsBb}=await import('../lib/bb-core.ts');
const cls={a:'A',b:'B',c:'C',x:''};

test('alleen A- en B-leden krijgen BB',()=>{
 assert.deepEqual(['A','B','C',''].map(getsBb),[true,true,false,false]);
});
test('potweek: één regel per A/B-lid met een vaste bron; C-leden en nul niet',()=>{
 const e=potWeekEntries('restaurant','Restaurant','2026-11-02','week 45',[{participantId:'a',payoutCents:4200},{participantId:'b',payoutCents:0},{participantId:'c',payoutCents:900},{participantId:'x',payoutCents:500}],id=>cls[id],'2026-11-09');
 assert.deepEqual(e,[{participantId:'a',day:'2026-11-09',kind:'pot-week',amountCents:4200,source:'pot:restaurant:2026-11-02',note:'Voorschot op de winst · Restaurant · week 45'}]);
});
test('winkelweek: opbrengst na coöperatiedeel, ook een negatieve correctie',()=>{
 const e=shopWeekEntries('2026-11-02','week 45',[{id:'b',payoutCents:3150},{id:'a',payoutCents:-200},{id:'c',payoutCents:800}],id=>cls[id],'2026-11-09');
 assert.deepEqual(e.map(x=>[x.participantId,x.amountCents,x.source]),[['b',3150,'winkel:2026-11-02'],['a',-200,'winkel:2026-11-02']]);
});
test('saldo en volgorde, en wie niet in het betaalbestand hoort',()=>{
 const b=bbBalance([{amountCents:4200,day:'2026-11-09'},{amountCents:-1000,day:'2026-11-10'},{amountCents:3150,day:'2026-11-09'}]);
 assert.equal(b.balanceCents,6350);assert.equal(b.entries[0].day,'2026-11-10');
 const s=new Set(['a\u0000pot:restaurant:2026-11-02']);
 assert.equal(paidAsBb(s,'a','pot:restaurant:2026-11-02'),true);assert.equal(paidAsBb(s,'c','pot:restaurant:2026-11-02'),false);
});
test('migratie: tabel bb_entries met beveiliging per rij en een unieke bron per lid',()=>{
 const sql=fs.readFileSync(new URL('../drizzle-pg/0022_bb_tegoed.sql',import.meta.url),'utf8');
 assert.match(sql,/CREATE TABLE "bb_entries"/);assert.match(sql,/ALTER TABLE "bb_entries" ENABLE ROW LEVEL SECURITY/);assert.match(sql,/CREATE UNIQUE INDEX "bb_entries_source"/);
});

// ---- Stap 2 (besluiten eigenaar 6 november 2026): maandagvraag, uitbetaling en documenten ----
const {parseChoice,withdrawAmount,buildDocument,docNumber,documentText,NO_CHOICE}=await import('../lib/bb-core.ts');
test('keuze: alles, laten staan, of overmaken met een bedrag of percentage dat blijft staan',()=>{
 assert.deepEqual(parseChoice({choice:'alles'}),{choice:'alles',keepCents:null,keepBp:null});
 assert.deepEqual(parseChoice({choice:'deel',keepCents:2500}),{choice:'deel',keepCents:2500,keepBp:null});
 assert.deepEqual(parseChoice({choice:'deel',keepBp:5000}),{choice:'deel',keepCents:null,keepBp:5000});
 for(const v of [{choice:'x'},{choice:'deel'},{choice:'deel',keepCents:1,keepBp:1},{choice:'deel',keepBp:10001},{choice:'deel',keepCents:-1}])assert.throws(()=>parseChoice(v));
 assert.equal(NO_CHOICE.choice,'laten','nooit gekozen = laten staan');
});
test('wat er wordt overgemaakt: nooit meer dan het saldo, nooit negatief',()=>{
 assert.equal(withdrawAmount(10000,{choice:'alles',keepCents:null,keepBp:null}),10000);
 assert.equal(withdrawAmount(10000,{choice:'laten',keepCents:null,keepBp:null}),0);
 assert.equal(withdrawAmount(10000,{choice:'deel',keepCents:2500,keepBp:null}),7500);
 assert.equal(withdrawAmount(10000,{choice:'deel',keepCents:null,keepBp:3000}),7000);
 assert.equal(withdrawAmount(1000,{choice:'deel',keepCents:2500,keepBp:null}),0);
 assert.equal(withdrawAmount(-500,{choice:'alles',keepCents:null,keepBp:null}),0);
});
const party=(o)=>({name:'Tuinderij Bindert',lines:['Schoterweg 30','8462 TD Rotstergaast'],kvk:'12345678',vatNumber:'NL123456789B01',kor:false,email:'b@example.com',company:true,...o});
const entries=[{id:'e1',kind:'winkel-week',amountCents:2058,meta:JSON.stringify({vat:{'9':1000,'21':800},vatIn:{'9':90,'21':168}})},{id:'e2',kind:'pot-week',amountCents:4200,meta:''}];
test('creditfactuur bij een btw-plichtig lid: per tarief de btw die al in het BB zit; voorschot op de winst zonder btw',()=>{
 const d=buildDocument({party:party(),entries,withdrawCents:6258,balanceAfterCents:0,number:docNumber('creditfactuur','2026',1),date:'2026-11-09',week:'2026-11-09'});
 assert.equal(d.kind,'creditfactuur');assert.equal(d.number,'BBC-2026-0001');
 assert.deepEqual(d.deliveries.map(l=>[l.vatRate,l.exclCents,l.vatCents]),[['9',1000,90],['21',800,168]]);
 assert.equal(d.advanceCents,4200);assert.equal(d.vatCents,258);assert.equal(d.payCents,6258,'de btw is al bijgeschreven: niet nog eens erbovenop');assert.deepEqual(d.warnings,[]);
 const t=documentText(d,{name:'Coöperatie Boer Bart',address:'Schoterweg 26',kvk:'1',vatNumber:'NL0'});assert.match(t.body,/factureren door de afnemer/);assert.match(t.subject,/BBC-2026-0001/);
});
test('KOR-lid: creditfactuur zonder btw; particulier: uitbetalingsoverzicht; verkeerde btw-instelling geeft een melding',()=>{
 const plain=[{...entries[0],amountCents:1800,meta:JSON.stringify({vat:{'9':1000,'21':800}})},entries[1]];
 const k=buildDocument({party:party({vatNumber:'',kor:true}),entries:plain,withdrawCents:6000,balanceAfterCents:0,number:'x',date:'2026-11-09',week:'2026-11-09'});
 assert.equal(k.kind,'creditfactuur');assert.equal(k.vatCents,0);assert.equal(k.payCents,6000);assert.deepEqual(k.warnings,[]);
 const p=buildDocument({party:party({company:false,kvk:'',vatNumber:''}),entries:plain,withdrawCents:3000,balanceAfterCents:3000,number:'x',date:'2026-11-09',week:'2026-11-09'});
 assert.equal(p.kind,'overzicht');assert.equal(p.vatCents,0);assert.equal(p.payCents,3000);assert.equal(p.keptCents,3000);
 const onlyPot=buildDocument({party:party(),entries:[entries[1]],withdrawCents:4200,balanceAfterCents:0,number:'x',date:'2026-11-09',week:'2026-11-09'});
 assert.equal(onlyPot.kind,'overzicht','zonder geleverde producten geen creditfactuur');
 assert.match(buildDocument({party:party(),entries:plain,withdrawCents:1,balanceAfterCents:0,number:'x',date:'d',week:'w'}).warnings[0],/inclusief btw/);
 assert.match(buildDocument({party:party({vatNumber:'',kor:true}),entries,withdrawCents:1,balanceAfterCents:0,number:'x',date:'d',week:'w'}).warnings[0],/KOR/);
});
test('winkelweek schrijft de btw per tarief mee bij uitbetalen inclusief btw',()=>{
 const e=shopWeekEntries('2026-11-02','week 45',[{id:'a',payoutCents:1090,byVat:{'9':1000},vatByRate:{'9':90}},{id:'b',payoutCents:500,byVat:{'21':500},vatByRate:{}}],id=>cls[id],'2026-11-09');
 assert.deepEqual(e.map(x=>JSON.parse(x.meta)),[{vat:{'9':1000},vatIn:{'9':90}},{vat:{'21':500}}]);
});
test('migratie stap 2: keuzes en documenten met beveiliging per rij, één maandagaanvraag per lid',()=>{
 const sql=fs.readFileSync(new URL('../drizzle-pg/0025_bb_maandagvraag.sql',import.meta.url),'utf8');
 assert.match(sql,/CREATE UNIQUE INDEX "bb_payouts_week"/);
 for(const t of ['bb_choices','bb_documents'])assert.match(sql,new RegExp(`ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY`));
 assert.match(sql,/ALTER TABLE "bb_entries" ADD COLUMN "meta"/);
});
test('weekafsluiting: bij uitbetalen inclusief btw de btw per tarief, precies gelijk aan het btw-deel',async()=>{
 const C=await import('../lib/coop-core.ts');
 const l=(o)=>({orderId:1,number:'1',day:'2026-11-03',productName:'x',quantity:1,ownerId:'a',sign:1,test:false,...o});
 const lines=[l({paidCents:1090,paidVatCents:90}),l({paidCents:1090,paidVatCents:90}),l({paidCents:333,paidVatCents:58}),l({paidCents:1000,paidVatCents:0})];
 const s=C.settle(lines,[{id:'a',name:'A',vatInclusive:true},],[{participantId:'a',validFrom:'2026-01-01',percentBp:1500}]);
 const p=s.participants[0],sum=Object.values(p.vatByRate).reduce((n,c)=>n+c,0);
 assert.equal(sum,p.vatShareCents);assert.deepEqual(Object.keys(p.vatByRate).sort(),['21','9']);
 assert.deepEqual(C.settle(lines,[{id:'a',name:'A',vatInclusive:false}],[{participantId:'a',validFrom:'2026-01-01',percentBp:1500}]).participants[0].vatByRate,{});
});
test('betalen met dividend: eerst het obligatiesaldo, het restant uit BB, nooit meer dan samen',async()=>{
 const {splitDividendPayment}=await import('../lib/bb-core.ts');
 assert.deepEqual(splitDividendPayment(700,1200,0),{fromBond:700,fromBb:0});
 assert.deepEqual(splitDividendPayment(1500,1200,500),{fromBond:1200,fromBb:300});
 assert.deepEqual(splitDividendPayment(800,0,800),{fromBond:0,fromBb:800});
 assert.equal(splitDividendPayment(1800,1200,500),null);
 assert.equal(splitDividendPayment(0,1200,500),null);
 assert.deepEqual(splitDividendPayment(500,-100,600),{fromBond:0,fromBb:500});
});
test('waarde bij Boer Bart (besluit eigenaar 7 november 2026): 1 BB = 1 + percentage − 2%; uitbetalen blijft € 1',async()=>{
 const {bbValueBp,bbWorth,bbNeeded}=await import('../lib/bb-core.ts');
 assert.equal(bbValueBp(1500),11300,'15% → € 1,13');assert.equal(bbValueBp(3000),12800,'30% → € 1,28');
 assert.equal(bbValueBp(null),11300,'zonder winkelpercentage (potten): 15%');assert.equal(bbValueBp(100),10000,'nooit minder dan € 1');
 assert.equal(bbWorth(8500,11300),9605,'85 BB = € 96,05');
 assert.equal(bbNeeded(9605,11300),8500);assert.ok(bbNeeded(bbWorth(1234,11300),11300)<=1234,'nooit meer BB dan het tegoed');
 for(let bb=1;bb<3000;bb+=7)assert.ok(bbNeeded(bbWorth(bb,12800),12800)<=bb);
});

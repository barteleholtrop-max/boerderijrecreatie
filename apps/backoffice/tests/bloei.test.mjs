import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import './helpers/ts-resolve.mjs';
const {fixture,change,available,view}=await import('../lib/bloei-core.ts');
const {encryptSnapshot,decryptSnapshot,prepareImport}=await import('../lib/bloei-backup.ts');
const {sampleSepa}=await import('../lib/bloei-sepa.ts');
const anna={role:'lid',actor:'proef-lid',memberId:'proef-anna'},bauke={...anna,memberId:'proef-bauke'},admin={role:'financieel',actor:'proef-beheer-a',memberId:'proef-anna'};
const at='2027-04-30T10:00:00.000Z';
const act=(s,c,action,b={})=>change(s,c,{action,reason:'Fictieve test',confirm:true,...b},at);
test('centen, vervalgrens op 1 mei en apart stortingstegoed',()=>{
 const s=fixture();assert.equal(available(s,'proef-anna','2027-04-30'),7200);assert.equal(available(s,'proef-anna','2027-05-01'),1200);assert.equal(available(s,'proef-bauke','2027-04-30'),50000);
 assert.throws(()=>act(s,anna,'besteden',{amount:7201}));assert.throws(()=>act(s,anna,'besteden',{amount:1.5}));
 assert.throws(()=>act(s,anna,'cadeaubon',{amount:100,recipient:'a'.repeat(81)}));const next=act(s,anna,'cadeaubon',{amount:6100,recipient:'  Fictieve ontvanger  '});assert.equal(available(next,'proef-anna','2027-04-30'),1100);assert.equal(s.credits[0].amount,6000);assert.equal(next.audit.length,1);assert.equal(next.gifts[0].amount,6100);assert.equal(next.gifts[0].recipient,'Fictieve ontvanger');assert.match(next.gifts[0].code,/^FICTIEF-/);
});
test('rente gaat pas volgend obligatiejaar in, één richting omwisselen, origineel contract blijft',()=>{
 let s=act(fixture(),anna,'rente',{holdingId:'ob-1',rate:2});assert.equal(s.holdings[0].rate,6);assert.equal(s.holdings[0].nextRate,2);
 s=act(s,anna,'omwisselen',{holdingId:'ob-1'});assert.equal(s.holdings[0].kind,'participatie');assert.equal(s.holdings[0].contract,'contract-1');assert.deepEqual(s.documents,fixture().documents);assert.throws(()=>act(s,anna,'omwisselen',{holdingId:'ob-1'}));
 assert.equal(s.audit[0].before.holdings[0].nextRate,undefined);assert.equal(s.audit[0].after.holdings[0].kind,'obligatie');
});
test('reservering blokkeert dubbel kopen; eigendom alleen na betaling EN controles; replay mislukt',()=>{
 let s=act(fixture(),anna,'verkopen',{holdingId:'ob-1'}),id=s.listings[0].id;s=act(s,bauke,'reserveren',{listingId:id});
 assert.equal(s.holdings[0].memberId,'proef-anna');assert.throws(()=>act(s,bauke,'reserveren',{listingId:id}));assert.throws(()=>act(s,anna,'omwisselen',{holdingId:'ob-1'}));
 assert.throws(()=>act(s,bauke,'betaling-simuleren',{listingId:id,checks:false}));
 assert.throws(()=>change(s,bauke,{action:'betaling-simuleren',listingId:id,checks:true,confirm:true,reason:'Test'},'2027-04-30T10:10:00.000Z'));
 s=act(s,bauke,'betaling-simuleren',{listingId:id,checks:true});assert.equal(s.holdings[0].memberId,'proef-bauke');assert.equal(s.listings[0].fee,250);assert.throws(()=>act(s,bauke,'betaling-simuleren',{listingId:id,checks:true}));
});
test('personeel krijgt alleen kaartprojectie; leden kunnen geen andere bezittingen of beheer wijzigen',()=>{
 const s=fixture(),staff={...admin,role:'personeel'};assert.deepEqual(Object.keys(view(s,staff,'2027-04-30')),['mode','card']);assert.throws(()=>act(s,staff,'iban',{choice:'test-b'}));
 assert.throws(()=>act(s,bauke,'verkopen',{holdingId:'ob-1',memberId:'proef-anna'}));assert.throws(()=>act(s,anna,'afspraak',{agreementId:'afspraak-1'}));assert.throws(()=>act(s,anna,'iban',{choice:'NL91ABNA0417164300'}));
 assert.equal(view(s,anna,'2027-04-30').members.length,1);assert.ok(!('audit' in view(s,anna,'2027-04-30')));
});
test('batch alleen in mei; tweede actor vereist; voorbeeld XML bevat geen uitvoerbare IBAN',()=>{
 assert.throws(()=>act(fixture(),admin,'batch'));
 const s=change(fixture(),admin,{action:'batch',reason:'Mei voorbereiden'},'2027-05-01T10:00:00Z'),id=s.batches[0].id;
 assert.equal(s.batches[0].lines[0].amount,2200);assert.throws(()=>sampleSepa(s,admin,id));assert.throws(()=>act(s,anna,'cadeaubon',{amount:100}));assert.throws(()=>act(s,admin,'batch-goedkeuren',{batchId:id}));
 const approved=act(s,{...admin,actor:'proef-beheer-b'},'batch-goedkeuren',{batchId:id});const xml=sampleSepa(approved,admin,id);assert.match(xml,/pain.001.001.03/);assert.match(xml,/FICTIEFGEENIBAN/);assert.doesNotMatch(xml,/NL91ABNA/);assert.throws(()=>sampleSepa(approved,anna,id));
});
test('versleutelde consistente herstelkopie bevat originele documenten EN audit; corruptie en verkeerde sleutel falen',()=>{
 const s=act(fixture(),anna,'iban',{choice:'test-b'}),key=randomBytes(32),sealed=encryptSnapshot(s,key);assert.ok(!sealed.includes('Anna'));assert.deepEqual(decryptSnapshot(sealed,key),s);assert.throws(()=>decryptSnapshot(sealed,randomBytes(32)));
 const corrupt=JSON.parse(sealed);corrupt.ciphertext='AAAA'+corrupt.ciphertext.slice(4);assert.throws(()=>decryptSnapshot(JSON.stringify(corrupt),key));
});
test('ShareCouncil dry run reconcilieert en bewaart originele contracthashes; nooit activatie',()=>{
 const row={sourceId:'sc-1',memberSourceId:'sc-lid-1',kind:'obligatie',nominal:100000,credit:6000,contractId:'contract-1',contractSha256:'a'.repeat(64)};
 const r=prepareImport([row],{nominal:100000,credit:6000});assert.deepEqual(r.errors,[]);assert.equal(r.canActivate,false);assert.equal(r.documents[0].sha256,row.contractSha256);
 assert.ok(prepareImport([row,row],{nominal:100000,credit:6000}).errors.length);assert.ok(prepareImport([{...row,contractSha256:''}],{nominal:100000,credit:6000}).errors.length);
});
test('centrale opslag CAS weigert dubbele actie en bewaart audit atomair; Bloei standaard aan, noodrem BLOEI=uit',async()=>{
 process.env.APP_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'bloei-93-'));process.env.APP_ORIGIN='http://localhost:3001';
 const {read,overview,mutate}=await import('../lib/bloei-store.ts');const {handle}=await import('../lib/bloei-http.ts');
 process.env.BLOEI='uit';assert.equal((await handle(new Request('http://localhost:3001/api/public/bloei'))).status,404);
 delete process.env.BLOEI;assert.equal((await handle(new Request('http://localhost:3001/api/public/bloei'))).status,200);const initial=await overview(anna),b={action:'verkopen',holdingId:'ob-1',revision:initial.revision,reason:'Race test'};
 const result=await Promise.allSettled([mutate(anna,b),mutate(anna,b)]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.filter(r=>r.status==='rejected').length,1);
 const current=await read();assert.equal(current.state.listings.length,1);assert.equal(current.state.audit.length,1);assert.equal(current.revision,1);
 assert.equal((await handle(new Request('http://localhost:3001/api/bloei-proef'),true)).status,403);
 assert.equal((await handle(new Request('http://localhost:3001/api/public/bloei-proef',{method:'POST',headers:{origin:'https://evil.example'},body:'{}'}))).status,403);
 const pub=await handle(new Request('http://localhost:3001/api/public/bloei-proef?rol=financieel'));assert.equal(pub.status,200);assert.ok(!('audit' in await pub.json()));
});

test('v0.5-overzicht splitst bezit en tegoed centraal, gebruikt dezelfde rente als de betaalbatch en lekt geen ledenbeheer',()=>{
 const s=fixture();const d=view(s,anna,'2027-04-30');assert.equal(d.summary.bonds,150000);assert.equal(d.summary.shares,0);assert.equal(d.summary.product,6000);assert.equal(d.summary.dividend,1200);assert.equal(d.summary.interest,1000);assert.equal(d.summary.spendable,7200);assert.equal(view(s,anna,'2027-05-01').summary.product,0);assert.equal(view(s,bauke,'2027-04-30').summary.special,50000);assert.equal(d.memberSummaries,undefined);assert.equal(d.payoutPreview,undefined);
 const next=act(s,anna,'rente',{holdingId:'ob-1',rate:2});const preview=view(next,admin,'2027-04-30').payoutPreview;assert.equal(preview[0].interest,1000);const batch=change(next,admin,{action:'batch',reason:'Rente vergelijken'},'2027-05-01T10:00:00Z');assert.equal(batch.batches[0].lines[0].amount,preview[0].amount);
});

test('Bloei-beheer weigert een ledenidentiteit of financiële rol in de URL zonder eigenaarstoegang',async()=>{
 const {handle}=await import('../lib/bloei-http.ts');
 for(const headers of [{},{'x-boer-bart-verified-user':'lid'},{'x-boer-bart-role':'financieel'}]){
  const response=await handle(new Request('http://localhost:3001/api/bloei?rol=financieel&actor=a',{headers}),true);
  assert.equal(response.status,403);
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import './helpers/ts-resolve.mjs';
import {marketFixture} from '../../../tests/bloei-market-fixture.mjs';
import {createMollieMock} from '../../../tests/mollie-mock.mjs';
const core=await import('../lib/bloei-market-core.ts');
const {emptyMarket,marketGroups,addOffer,addOrder,availableAssets,publicMarket,lockedOrder,privateOrder,transferOwnership,marketAnnualGrant}=core;
const at=new Date('2026-11-06T12:00:00Z');
function offer(s,r,scheme='grocery6',quantity=3){const g=marketGroups(r,s,at).find(g=>g.scheme===scheme);const o=addOffer(s,r,{groupKey:g.key,quantity,title:'Obligaties · voorbeeld',sellerLabel:'Een deelnemer',sellerOrg:'org_exampleSeller',consentRef:'synthetische instemming',sellerConsent:true},at);o.status='published';return o}
function order(s,r,o,extra={}){return addOrder(s,r,{requestId:randomUUID(),action:'reserve',offerId:o.id,name:'Koper Voorbeeld',email:'buyer@example.invalid',quantity:1,consent:true,termsVersion:s.settings.termsVersion,...extra},randomBytes(32).toString('base64url'),true,at)}
function approved(o,mode='live'){o.status='paid';o.payments=[{id:randomUUID(),externalRef:'tr_synthetic123',amountCents:o.amountCents,mode,status:'paid',checkoutUrl:null,created:at.toISOString(),keyFingerprint:'synthetic'}];o.checks={buyerId:'buyer',createBuyer:false,agreementRef:'synthetic',by:'test',at:at.toISOString()};o.route={id:'crt_synthetic123',status:'done',organizationId:'org_exampleSeller',description:'synthetic',at:at.toISOString(),keyFingerprint:'synthetic'}}

test('market: explicit publication, server prices, shared claims and original term',()=>{
 const s=emptyMarket(),r=marketFixture();assert.equal(publicMarket(s,r,false,at).offers.length,0);
 const o=offer(s,r,'cash26',2),a=order(s,r,o,{amountCents:1,vat:21});assert.equal(a.amountCents,100000);assert.equal(a.vat,'vrijgesteld');assert.equal(a.vatCents,0);assert.equal(a.assets[0].matures,'2034-02-28');
 assert.equal(marketGroups(r,s,at).some(g=>g.scheme==='cash26'),false);
 const duplicate={...o,id:randomUUID()};assert.equal(availableAssets(s,duplicate,at).length,1,'claims apply to asset keys across offers');
 const b=order(s,r,o);assert.notEqual(a.assets[0].key,b.assets[0].key);assert.throws(()=>order(s,r,o),/beschikbaar/);
 assert.equal(lockedOrder(a,new Date(at.getTime()+11*60000)),false);
 a.payments.push({status:'creating'});assert.equal(lockedOrder(a,new Date('2030-01-01')),true,'an uncertain provider request never expires by a local clock');
 const view=JSON.stringify(publicMarket(s,r,true,at));for(const value of ['buyer@example.invalid','seller@example.invalid','org_exampleSeller','synthetische instemming','secretHash','oldMemberNumber','sourceRef','positionId'])assert.equal(view.includes(value),false,value);
 assert.throws(()=>privateOrder(s,a.id+'.'+'x'.repeat(43)),/ongeldig/);
});
test('market: transfer preserves source, legacy numbering and already allocated grocery credit; grants follow May ownership',()=>{
 process.env.BLOEI_MARKET_LIVE_ENABLED='1';try{
  const s=emptyMarket(),r=marketFixture(),o=offer(s,r),a=order(s,r,o),credit=structuredClone(r.credits[0]);approved(a);
  transferOwnership(r,s,a,'2027-04-30T21:59:00.000Z');assert.equal(a.status,'transferred');
  const own=r.positions.find(p=>p.memberId==='buyer');assert.deepEqual(own.serials,[501]);assert.deepEqual(own.oldSerials,[71]);assert.equal(own.issued,'2024-02-29');assert.equal(own.oldMemberNumber,'voorbeeld-oud');assert.equal(own.unitCents,100000);
  assert.deepEqual(r.positions.find(p=>p.memberId==='seller'&&p.scheme==='grocery6').oldSerials,[72,73]);assert.deepEqual(r.credits[0],credit);assert.equal(r.credits.find(c=>c.memberId==='buyer').remainingCents,0);
  assert.equal(marketAnnualGrant(r,'buyer','2027-04-30T22:00:00.000Z'),6000);assert.equal(marketAnnualGrant(r,'seller','2027-04-30T22:00:00.000Z'),12000);
  transferOwnership(r,s,a,'2027-04-30T22:00:01.000Z');assert.equal(r.market.transfers.length,1,'exactly once');
  const b=order(s,r,o);approved(b);transferOwnership(r,s,b,'2027-04-30T22:00:00.000Z');
  assert.equal(marketAnnualGrant(r,'buyer','2027-04-30T22:00:00.000Z'),6000,'boundary transfer does not backdate the grant');assert.equal(marketAnnualGrant(r,'buyer','2028-04-30T22:00:00.000Z'),12000);
 }finally{delete process.env.BLOEI_MARKET_LIVE_ENABLED}
});
test('market: test payments never mutate real capital or credits',()=>{
 const s=emptyMarket(),r=marketFixture(),o=offer(s,r),a=order(s,r,o),before=JSON.stringify(r);approved(a,'test');transferOwnership(r,s,a,at.toISOString());assert.equal(a.status,'test-complete');assert.equal(JSON.stringify(r),before);assert.equal(availableAssets(s,o,at).length,3);
});

test('market store: encrypted documents, authorization, concurrent orders and verified payment routing',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-market-'));process.env.APP_DATA_DIR=dir;process.env.DATABASE_URL='';process.env.SHEETS_CONFIG_KEY='ab'.repeat(32);process.env.APP_ORIGIN='http://localhost:3001';delete process.env.BLOEI;
 const {env,closeDatabase}=await import('../lib/portable/env.ts');const realStore=await import('../lib/bloei-real-store.ts');const store=await import('../lib/bloei-market-store.ts');const {keyFingerprint,routeSellerPayment}=await import('../lib/bloei-market-mollie.ts');
 t.after(async()=>{await closeDatabase();fs.rmSync(dir,{recursive:true,force:true});delete process.env.MOLLIE_API_KEY;delete process.env.MOLLIE_API_BASE;delete process.env.MOLLIE_LIVE_ENABLED;delete process.env.BLOEI_MARKET_LIVE_ENABLED});
 async function seed(){await env.DB.prepare('DELETE FROM bloei_market').run();await env.DB.prepare("INSERT INTO bloei_administration(id,digest,data_sealed,sources_sealed,imported_at,imported_by) VALUES('main',?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data_sealed=excluded.data_sealed,sources_sealed=excluded.sources_sealed").bind('a'.repeat(64),realStore.sealImport(marketFixture()),'unchanged-original-archive',at.toISOString(),'test').run()}
 const manage=async b=>store.marketManage({...b,version:(await store.marketAdmin()).version},'test-owner');
 await seed();
 await t.test('official PDF bytes stay original; drafts and another member’s agreement stay private',async()=>{
  const bytes=Buffer.from('%PDF-1.4\nsynthetic document\n%%EOF'),file=new File([bytes],'Reglement.pdf',{type:'application/pdf'});
  const doc=async extra=>store.saveMarketDocument(file,{title:'Reglement voorbeeld',category:'reglement',documentVersion:'test-1',visibility:'public',version:(await store.marketAdmin()).version,...extra},'test-owner');
  const id=await doc();assert.equal((await store.marketPublic()).documents.length,0);await assert.rejects(()=>store.documentDownload(id),/niet gevonden/);
  assert.deepEqual(Buffer.from(await (await store.documentDownload(id,{owner:true})).arrayBuffer()),bytes);
  await assert.rejects(()=>manage({action:'document-publish',id,published:true}),/Bevestig/);
  await manage({action:'document-publish',id,published:true,confirm:true});assert.equal((await store.marketPublic()).documents.length,1);
  const response=await store.documentDownload(id);assert.equal(response.headers.get('content-type'),'application/pdf');assert.match(response.headers.get('content-disposition'),/^attachment/);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
  await assert.rejects(()=>doc({category:'overeenkomst'}),/persoonlijke overeenkomst/);
  const privateId=await doc({title:'Privé overeenkomst',category:'overeenkomst',visibility:'member',memberId:'buyer'});await manage({action:'document-publish',id:privateId,published:true,confirm:true});
  await assert.rejects(()=>store.documentDownload(privateId),/niet gevonden/);await assert.rejects(()=>store.documentDownload(privateId,{memberId:'other'}),/niet gevonden/);
  assert.deepEqual(Buffer.from(await (await store.documentDownload(privateId,{memberId:'buyer'})).arrayBuffer()),bytes);
  assert.equal((await store.documentsForMember('buyer')).length,2);assert.equal((await store.documentsForMember('other')).length,1);assert.equal((await store.marketPublic()).documents.length,1);
  const {state}=await store.loadMarket(),blob=await env.BUCKET.get(state.documents[0].blobKey),sealed=await new Response(blob.body).text();assert.equal(sealed.includes('%PDF-'),false);assert.equal(sealed.includes(bytes.toString('base64')),false);
  await manage({action:'document-publish',id,published:false});await assert.rejects(()=>store.documentDownload(id),/niet gevonden/);assert.deepEqual(Buffer.from(await (await store.documentDownload(id,{owner:true})).arrayBuffer()),bytes);
 });
 async function setup(key){await seed();process.env.MOLLIE_API_KEY=key;const mock=createMollieMock({key});process.env.MOLLIE_API_BASE='http://127.0.0.1:'+await mock.listen();t.after(()=>mock.close());await manage({action:'settings',settings:{mode:key.startsWith('live_')?'live':'test',providerConfirmed:true,termsUrl:'https://example.invalid/voorwaarden.pdf',termsVersion:'synthetic-v1'}});const d=await store.marketAdmin(),g=d.groups.find(g=>g.scheme==='grocery6');await manage({action:'offer',offer:{groupKey:g.key,quantity:2,title:'Boodschappenobligaties',sellerLabel:'Een deelnemer',sellerOrg:'org_exampleSeller',consentRef:'synthetic',sellerConsent:true}});const id=(await store.marketAdmin()).offers[0].id;await manage({action:'publish',id});return {mock,id}}
 const buy=(id,extra={})=>store.marketOrder({action:'reserve',requestId:randomUUID(),secret:randomBytes(32).toString('base64url'),offerId:id,name:'Koper Voorbeeld',email:'buyer@example.invalid',quantity:1,consent:true,termsVersion:'synthetic-v1',...extra});
 const finish=id=>store.finishMarketOrder({id,buyerId:'buyer',createBuyer:false,agreementRef:'synthetic-contract',buyerIdentityVerified:true,sellerApproved:true,transferDocumentVerified:true},'test-owner');
 await t.test('test payment and duplicate webhook route once, without changing real ownership',async()=>{
  const {mock,id}=await setup('test_'+randomBytes(15).toString('hex')),before=JSON.stringify(await realStore.readReal());
  const results=await Promise.allSettled([buy(id),buy(id),buy(id)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,2);assert.match(results.find(r=>r.status==='rejected').reason.message,/beschikbaar/);
  const {token}=results.find(r=>r.status==='fulfilled').value,paid=await store.startMarketPayment(token,'http://localhost:3002');assert.ok(paid.checkoutUrl);assert.equal(mock.last().amount.value,'1000.00');assert.match(mock.last().redirectUrl,/#aankoop=/);assert.equal(mock.last().redirectUrl.includes('buyer@example.invalid'),false);
  await store.startMarketPayment(token,'http://localhost:3002');assert.equal(mock.state.created,1);mock.setStatus(mock.last().id,'paid');await store.marketWebhook(mock.last().id);await store.marketWebhook(mock.last().id);
  const orderId=token.split('.')[0];await finish(orderId);await finish(orderId);assert.equal(mock.state.routes.size,1);assert.equal((await store.refreshMarketOrder(token)).status,'test-complete');assert.equal(JSON.stringify(await realStore.readReal()),before);
 });
 await t.test('unknown payment creation remains held; paid/refunded and wrong amounts are verified with the provider',async()=>{
  const {mock,id}=await setup('test_'+randomBytes(15).toString('hex')),a=await buy(id);mock.state.loseNextPaymentResponse=true;
  await assert.rejects(()=>store.startMarketPayment(a.token,'http://localhost:3002'));await assert.rejects(()=>store.startMarketPayment(a.token,'http://localhost:3002'),/eerdere betaalpoging/);assert.equal(mock.state.created,1);
  mock.setStatus(mock.last().id,'paid');mock.state.amountOverride.set(mock.last().id,'0.01');await assert.rejects(()=>store.marketWebhook(mock.last().id),/betaalgegevens/);assert.equal((await store.loadMarket()).state.orders[0].status,'reserved');
  mock.state.amountOverride.clear();await store.marketWebhook(mock.last().id);assert.equal((await store.refreshMarketOrder(a.token)).status,'paid');
  mock.last().amountRefunded={currency:'EUR',value:'1000.00'};await store.marketWebhook(mock.last().id);assert.equal((await store.refreshMarketOrder(a.token)).status,'cancelled');assert.equal(mock.state.routes.size,0);
 });
 await t.test('a refund of one duplicate payment never releases an asset while another paid attempt exists',async()=>{
  const {mock,id}=await setup('test_'+randomBytes(15).toString('hex')),a=await buy(id);await store.startMarketPayment(a.token,'http://localhost:3002');const first=mock.last();
  mock.setStatus(first.id,'canceled');await store.refreshMarketOrder(a.token);await store.startMarketPayment(a.token,'http://localhost:3002');const second=mock.last();
  mock.setStatus(first.id,'paid');first.amountRefunded={currency:'EUR',value:'invalid'};await assert.rejects(()=>store.marketWebhook(first.id),/betaalgegevens/);delete first.amountRefunded;
  await store.marketWebhook(first.id);mock.setStatus(second.id,'paid');await store.marketWebhook(second.id);assert.equal((await store.refreshMarketOrder(a.token)).status,'paid-review');
  first.amountRefunded={currency:'EUR',value:'1000.00'};await store.marketWebhook(first.id);assert.equal((await store.refreshMarketOrder(a.token)).status,'paid-review');assert.equal((await store.marketPublic()).offers[0].available,1);
  second.amountRefunded={currency:'EUR',value:'1000.00'};await store.marketWebhook(second.id);assert.equal((await store.refreshMarketOrder(a.token)).status,'cancelled');assert.equal((await store.marketPublic()).offers[0].available,2);assert.equal(mock.state.routes.size,0);
 });
 await t.test('a confirmed live transaction in a local mock transfers once; lost payout response is recovered before retry',async()=>{
  process.env.MOLLIE_LIVE_ENABLED='1';process.env.BLOEI_MARKET_LIVE_ENABLED='1';
  const {mock,id}=await setup('live_'+randomBytes(15).toString('hex')),a=await buy(id);await store.startMarketPayment(a.token,'http://localhost:3002');mock.setStatus(mock.last().id,'paid');await store.marketWebhook(mock.last().id);
  const orderId=a.token.split('.')[0];mock.state.loseNextRouteResponse=true;await assert.rejects(()=>finish(orderId));assert.equal((await realStore.readReal()).positions.some(p=>p.memberId==='buyer'),false);assert.equal(mock.state.routes.size,1);
  await finish(orderId);await finish(orderId);assert.equal(mock.state.routes.size,1);assert.equal(mock.state.calls.filter(c=>c.method==='POST'&&c.url.includes('/routes')).length,1);
  const state=await realStore.readReal();assert.equal(state.positions.filter(p=>p.memberId==='buyer').length,1);assert.equal(state.market.transfers.length,1);assert.equal(state.credits[0].remainingCents,9500);assert.equal(state.credits.find(c=>c.memberId==='buyer').remainingCents,0);
  assert.equal((await env.DB.prepare("SELECT sources_sealed FROM bloei_administration WHERE id='main'").first()).sources_sealed,'unchanged-original-archive');
  const p={paymentId:mock.last().id,orderId:randomUUID(),amountCents:100000,organizationId:'org_exampleSeller',startedAt:new Date(Date.now()-61*60000).toISOString(),fingerprint:keyFingerprint(process.env.MOLLIE_API_KEY)};
  await assert.rejects(()=>routeSellerPayment(process.env.MOLLIE_API_KEY,p),/eerdere uitbetaling/);assert.equal(mock.state.calls.filter(c=>c.method==='POST'&&c.url.includes('/routes')).length,1,'no blind retry after idempotency window');
 });
 await t.test('interest can be reserved later using the same private link, with new consent',async()=>{
  const {id}=await setup('test_'+randomBytes(15).toString('hex')),a=await buy(id,{action:'interest'});assert.equal(a.receipt.status,'interest');
  await assert.rejects(()=>store.activateMarketOrder(a.token,{consent:false,termsVersion:'synthetic-v1'}));assert.equal((await store.activateMarketOrder(a.token,{consent:true,termsVersion:'synthetic-v1'})).status,'reserved');
  await assert.rejects(()=>store.activateMarketOrder(a.token,{consent:true,termsVersion:'synthetic-v1'}),/al verwerkt/);
 });
});

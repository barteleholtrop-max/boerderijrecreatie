import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {marketBuilt,startMarketTest,prepareMarket} from './bloeimarkt-server.mjs';
import {memberCookie} from './sessie.mjs';
test('public Bloeimarkt: private register and documents, checkout, webhook and owner-only completion',{skip:!marketBuilt&&'eerst npm run build'},async t=>{
 const s=await startMarketTest(t),{call,admin}=s;
 await t.test('anonymous visitors see only published offers; trusted headers cannot open management',async()=>{
  assert.equal((await call('/api/public/bloeimarkt')).status,200);assert.deepEqual((await call('/api/public/bloeimarkt')).data.offers,[]);
  for(const p of ['/api/bloei/markt','/api/bloei/documenten']){const r=await call(p,{headers:{'x-boer-bart-verified-user':'owner','x-boer-bart-account':'market-owner','x-boer-bart-role':'owner'}});assert.equal(r.status,401,p)}
  assert.equal((await call('/api/bloei/markt',{method:'POST',owner:true,body:{action:'publish',id:randomUUID()},headers:{Origin:'https://evil.example'}})).status,403);
 });
 const id=await prepareMarket(s);
 await t.test('general documents are public only after confirmation; personal PDFs follow the existing identity',async()=>{
  async function upload(visibility,memberId=''){const f=new FormData();for(const [key,value] of Object.entries({title:visibility==='public'?'Reglement voorbeeld':'Overeenkomst voor de koper',category:visibility==='public'?'reglement':'overeenkomst',visibility,memberId,documentVersion:'voorbeeld-1',version:String((await call('/api/bloei/documenten',{owner:true})).data.version)}))f.set(key,value);f.set('file',new File(['%PDF-1.4\nsynthetic\n%%EOF'],'voorbeeld.pdf',{type:'application/pdf'}));return call('/api/bloei/documenten',{method:'POST',owner:true,form:f})}
  const a=await upload('public');assert.equal(a.status,200,JSON.stringify(a.data));const publicId=a.data.documents[0].id;
  assert.equal((await call('/api/public/bloeimarkt/documenten/'+publicId)).status,404);
  assert.equal((await admin({action:'document-publish',id:publicId,published:true,confirm:true})).status,200);
  const p=await call('/api/public/bloeimarkt/documenten/'+publicId,{headers:{'x-boer-bart-verified-user':'owner'}});assert.equal(p.status,200);assert.equal(p.headers.get('content-type'),'application/pdf');assert.equal(p.data,'%PDF-1.4\nsynthetic\n%%EOF');
  const b=await upload('member','buyer');assert.equal(b.status,200,JSON.stringify(b.data));const privateId=b.data.documents.at(-1).id;assert.equal((await admin({action:'document-publish',id:privateId,published:true,confirm:true})).status,200);
  assert.equal((await call('/api/public/bloeimarkt/documenten/'+privateId,{headers:{'x-boer-bart-verified-user':'owner'}})).status,404);
  assert.equal((await call('/api/bloei/documenten/'+privateId)).status,401);
  // Ledenlogin (9 november 2026): alleen de link is niet genoeg; elk lid met zijn eigen ledensessie.
  const asMember=(token,id)=>({headers:{cookie:memberCookie(token,{participantId:id})}});
  assert.equal((await call('/api/deelnemer/'+s.memberToken+'/bloei-documenten/'+privateId)).status,401);
  assert.equal((await call('/api/deelnemer/'+s.otherToken+'/bloei-documenten/'+privateId,asMember(s.otherToken,'other'))).status,404);
  assert.equal((await call('/api/deelnemer/'+s.memberToken+'/bloei-documenten/'+privateId,asMember(s.memberToken,'buyer'))).status,200);
  assert.equal((await call('/api/deelnemer/'+s.otherToken+'/bloei-documenten/'+privateId,asMember(s.memberToken,'buyer'))).status,401,'sessie van een ander lid');
  const member=(await call('/api/deelnemer/'+s.memberToken+'/bloei-documenten',asMember(s.memberToken,'buyer'))).data;assert.equal(member.documents.length,2);assert.ok(member.documents.every(d=>d.downloadUrl.startsWith('/api/deelnemer/'+s.memberToken+'/')));
  assert.equal((await call('/api/public/bloeimarkt')).data.documents.length,1);
 });
 let token,ref;
 await t.test('new visitors can reserve with server prices and pay via the provider without VAT',async()=>{
  let r=await admin({action:'settings',settings:{mode:'test',providerConfirmed:true,termsUrl:'https://example.invalid/voorwaarden.pdf',termsVersion:'test-1'}});assert.equal(r.status,200);
  const page=(await call('/api/public/bloeimarkt')).data;assert.equal(page.offers[0].checkoutReady,true);const json=JSON.stringify(page);for(const text of ['seller@example.invalid','buyer@example.invalid','test-instemming','org_exampleSeller','serials','memberId','iban'])assert.equal(json.includes(text),false,text);
  const b={action:'reserve',requestId:randomUUID(),secret:randomBytes(32).toString('base64url'),offerId:id,name:'Koper Voorbeeld',email:'buyer@example.invalid',quantity:1,amountCents:1,vatCents:1,consent:true,termsVersion:'test-1'};
  assert.equal((await call('/api/public/bloeimarkt',{method:'POST',body:b,headers:{Origin:'https://evil.example'}})).status,403);
  r=await call('/api/public/bloeimarkt',{method:'POST',body:b});assert.equal(r.status,201,JSON.stringify(r.data));token=r.data.token;assert.equal(r.data.receipt.amountCents,100000);assert.equal(r.data.receipt.vat,'vrijgesteld');assert.equal(r.data.receipt.vatCents,0);
  assert.equal((await call('/api/public/bloeimarkt',{method:'POST',body:{...b,secret:randomBytes(32).toString('base64url')}})).status,409);
  r=await call('/api/public/bloeimarkt',{method:'POST',body:{action:'pay',token}});assert.equal(r.status,200,JSON.stringify(r.data));assert.ok(r.data.checkoutUrl);ref=s.mock.last().id;
  assert.equal(s.mock.last().amount.value,'1000.00');assert.match(s.mock.last().redirectUrl,/#aankoop=/);assert.equal(s.mock.last().metadata.buyerId,undefined);
  assert.equal((await call('/api/public/bloeimarkt',{method:'POST',body:{action:'status',token:token.split('.')[0]+'.'+'a'.repeat(43)}})).status,404);
 });
 await t.test('forged webhook cannot mark paid; the real provider answer and owner review finish the test',async()=>{
  const webhook=()=>call('/api/public/bloeimarkt/mollie',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},form:'id='+ref});
  assert.equal((await webhook()).status,200);assert.equal((await call('/api/public/bloeimarkt',{method:'POST',body:{action:'status',token}})).data.status,'reserved');
  s.mock.setStatus(ref,'paid');assert.equal((await webhook()).status,200);
  assert.equal((await call('/api/public/bloeimarkt',{method:'POST',body:{action:'complete',token,buyerId:'buyer'}})).status,400);
  const complete={action:'complete',id:token.split('.')[0],buyerId:'buyer',createBuyer:false,agreementRef:'synthetic-document',buyerIdentityVerified:true,sellerApproved:true,transferDocumentVerified:true};
  assert.equal((await admin({...complete,buyerIdentityVerified:false})).status,400);assert.equal(s.mock.state.routes.size,0);
  let r=await admin(complete);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(s.mock.state.routes.size,1);r=await admin(complete);assert.equal(r.status,200);assert.equal(s.mock.state.routes.size,1);
  assert.equal((await call('/api/public/bloeimarkt',{method:'POST',body:{action:'status',token}})).data.status,'test-complete');
  assert.equal((await call('/api/bloei?lid=seller',{owner:true})).data.summary.bonds,600000,'test route has not transferred real capital');
 });
});

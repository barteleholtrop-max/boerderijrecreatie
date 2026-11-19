import './helpers/ts-resolve.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
// Betalingen bij evenementen van leden (besluit eigenaar 9 november 2026, „je mag door met betalingen”):
// - terugbetalen via Mollie met één knop van de coördinator, per betaling één keer;
// - afrekenen met de organisator: A/B/L als BB-tegoed, anders een bunq-concept na goedkeuring; moet het lid betalen (koffie), dan
//   van het BB-tegoed af en de rest „te ontvangen”.

test('terugbetalen, afrekenen en uitbetalen op een echte database met een nep-Mollie',async t=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'bb-evenement-geld-'));process.env.APP_DATA_DIR=tmp;process.env.DATABASE_URL='';
 // Nep-Mollie: onthoudt elke terugbetaling en antwoordt zoals de Refunds API.
 const calls=[];const server=http.createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{
  calls.push({method:req.method,url:req.url,key:req.headers['idempotency-key'],body:body?JSON.parse(body):null});
  const m=/^\/v2\/payments\/(tr_[A-Za-z0-9]+)\/refunds$/.exec(req.url||'');
  res.setHeader('Content-Type','application/json');
  if(req.method==='POST'&&m){const b=JSON.parse(body);res.end(JSON.stringify({resource:'refund',id:'re_'+m[1].slice(3),status:'pending',amount:b.amount,paymentId:m[1]}));return}
  res.statusCode=404;res.end('{}');
 })});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 process.env.MOLLIE_API_BASE='http://127.0.0.1:'+server.address().port;process.env.MOLLIE_API_KEY='test_'+'a'.repeat(30);
 const {closeDatabase}=await import('../lib/portable/env.ts');
 t.after(async()=>{server.close();delete process.env.MOLLIE_API_BASE;delete process.env.MOLLIE_API_KEY;process.env.APP_DATA_DIR=tmp;await closeDatabase();fs.rmSync(tmp,{recursive:true,force:true})});
 const {getDb}=await import('../db/index.ts'),S=await import('../db/schema.ts'),{eq}=await import('drizzle-orm');
 const SP=await import('../lib/signup-payments.ts'),ST=await import('../lib/member-event-settlement.ts'),{today}=await import('../lib/pot-agreements.ts');
 const db=getDb(),at=new Date().toISOString(),day0=today(),add=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
 const id=n=>`${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-${n.repeat(12)}`;
 const anna=id('1'),bert=id('2'),cor=id('3');
 await db.insert(S.coopParticipants).values([
  {id:anna,name:'Anna',memberClass:'A',units:'["evenementen"]',created:at,updated:at},
  {id:bert,name:'Bert',memberClass:'B',units:'["evenementen"]',created:at,updated:at},
  {id:cor,name:'Cor',memberClass:'C',units:'["evenementen"]',ibanSealed:'verzegeld',ibanLast4:'1234',holder:'C. de Vries',created:at,updated:at}]);
 const req=(o={})=>JSON.stringify({title:'Avond',description:'Een mooie avond op de boerderij.',date:add(day0,-2),from:'19:00',to:'21:00',altDate:'',place:'',capacity:null,priceCents:2500,needs:'',coffee:'gast',roles:[],shareSeenBp:2000,...o});
 const terms=(o={})=>JSON.stringify({date:add(day0,-2),from:'19:00',to:'21:00',farmShareBp:2000,coffeeCents:null,note:'',...o});
 const event=(n,participantId,status,o={})=>db.insert(S.memberEvents).values({id:id(n),participantId,status,request:req(o.request),terms:terms(o.terms),eventId:'ev-'+n,created:at,updated:at});
 const signup=(n,eventId,o={})=>db.insert(S.eventSignups).values({id:'s'+n,requestId:`00000000-0000-4000-8000-00000000000${n}`,eventId,name:'Gast '+n,email:`gast${n}@example.org`,people:1,amountCents:2500,paymentStatus:'betaald',paidBy:'Mollie (test)',created:at,updated:at,...o});

 // ---- 1. Terugbetalen via Mollie: één keer per betaling, met vaste sleutel; andere modus niet ----
 await event('4',anna,'geannuleerd');
 await signup('1','ev-4',{status:'geannuleerd'});await signup('2','ev-4',{status:'geannuleerd',paidBy:'Mollie'});await signup('3','ev-4',{status:'geannuleerd',paymentStatus:'',amountCents:0,paidBy:''});
 await db.insert(S.signupPayments).values([
  {id:'aanmelding-s1-1',requestId:'r1',signupId:'s1',amountCents:2500,status:'betaald',provider:'mollie-test',externalRef:'tr_abc123',created:at,updated:at},
  {id:'aanmelding-s2-1',requestId:'r2',signupId:'s2',amountCents:2500,status:'betaald',provider:'mollie-live',externalRef:'tr_live99',created:at,updated:at}]);
 let r=await SP.refundCancelledSignups('ev-4','rianne');
 assert.equal(r.refunded,1);assert.equal(r.cents,2500);assert.match(r.problems.join(),/Gast 2: betaald in de livemodus; terugbetalen in het Mollie-dashboard/);
 assert.equal(calls.length,1);assert.equal(calls[0].url,'/v2/payments/tr_abc123/refunds');assert.equal(calls[0].key,'terugbetaling:aanmelding-s1-1');assert.deepEqual(calls[0].body.amount,{currency:'EUR',value:'25.00'});
 const s1=(await db.select().from(S.eventSignups).where(eq(S.eventSignups.id,'s1')))[0];assert.equal(s1.paymentStatus,'terugbetaald');
 assert.equal((await db.select().from(S.signupPayments).where(eq(S.signupPayments.id,'aanmelding-s1-1')))[0].status,'terugbetaald');
 r=await SP.refundCancelledSignups('ev-4','rianne');assert.equal(r.refunded,0);assert.equal(calls.length,1,'nogmaals drukken betaalt niet nog eens terug');

 // ---- 2. Afrekenen: A-lid krijgt BB-tegoed, één keer ----
 await event('5',anna,'goedgekeurd');await signup('5','ev-5');await signup('6','ev-5');
 assert.match(await ST.settleEvent(id('5'),'rianne'),/€ 33,06 bijgeschreven als BB-tegoed/); // 2 × € 25 = € 50; zonder btw-keuze 21%: € 8,68 btw; € 41,32 − 20%
 const bbA=await db.select().from(S.bbEntries).where(eq(S.bbEntries.participantId,anna));
 assert.equal(bbA.length,1);assert.equal(bbA[0].kind,'evenement');assert.equal(bbA[0].amountCents,3306);assert.equal((await db.select().from(S.memberEventSettlements).where(eq(S.memberEventSettlements.id,id('5'))))[0].vatCents,868,'de btw staat bij de afrekening (voor de bankverdeling)');assert.equal(bbA[0].source,'evenement:'+id('5'));
 await assert.rejects(ST.settleEvent(id('5'),'rianne'),/al afgerekend/);
 // Nog niet geweest of nog een onbetaalde aanmelding: niet afrekenen.
 await event('6',anna,'goedgekeurd',{terms:{date:day0}});await assert.rejects(ST.settleEvent(id('6'),'rianne'),/dag na het evenement/);
 await event('7',anna,'goedgekeurd');await signup('7','ev-7',{paymentStatus:'open',paidBy:''});await assert.rejects(ST.settleEvent(id('7'),'rianne'),/onbetaalde aanmeldingen/);

 // ---- 3. C-lid: klaar om uit te betalen via bunq; zonder bunq Main een duidelijke melding ----
 await event('8',cor,'goedgekeurd',{terms:{vatBp:900}});await signup('8','ev-8');
 assert.match(await ST.settleEvent(id('8'),'rianne'),/€ 18,35 staat klaar om uit te betalen naar •••• 1234/);
 let st=(await ST.settlementsFor([id('8')])).get(id('8'));assert.equal(st.route,'bunq');assert.equal(st.status,'klaar');assert.equal('ibanSealed' in st,false,'geen verzegeld IBAN naar het scherm');
 assert.equal((await db.select().from(S.bbEntries).where(eq(S.bbEntries.participantId,cor))).length,0,'geen BB voor een C-lid');
 await assert.rejects(ST.approvePayout(id('8'),st.version,'rianne'),/bunq-rekening Main/);
 await assert.rejects(ST.approvePayout(id('8'),st.version+1,'rianne'),/al behandeld of net gewijzigd/);

 // ---- 4. Koffie hoger dan het deel: van het BB-tegoed af (niet onder nul), de rest te ontvangen ----
 await db.insert(S.bbEntries).values({id:'bb-bert',participantId:bert,day:day0,kind:'correctie',amountCents:1000,source:'proef',note:'',at,by:'test'});
 await event('9',bert,'goedgekeurd',{request:{priceCents:0,coffee:'organisator'},terms:{coffeeCents:3000}});
 assert.match(await ST.settleEvent(id('9'),'rianne'),/€ 10,00 van het BB-tegoed afgeschreven\. Nog te ontvangen van de organisator: € 20,00\./);
 const bbB=(await db.select().from(S.bbEntries).where(eq(S.bbEntries.participantId,bert))).reduce((n,e)=>n+e.amountCents,0);assert.equal(bbB,0,'tegoed niet onder nul');
 st=(await ST.settlementsFor([id('9')])).get(id('9'));assert.equal(st.status,'te-ontvangen');assert.equal(st.dueCents,2000);assert.equal(st.bbCents,-1000);
 await ST.markReceived(id('9'),st.version,'rianne');assert.equal((await ST.settlementsFor([id('9')])).get(id('9')).status,'ontvangen');
 await assert.rejects(ST.markReceived(id('9'),st.version,'rianne'),/al behandeld/);
 // Het lid ziet de afrekening op de ledenpagina.
 const {memberView}=await import('../lib/member-events.ts');
 const mine=(await memberView({id:bert,name:'Bert',holder:'',email:'',ibanEnd:''})).events.find(e=>e.id===id('9'));
 assert.deepEqual({route:mine.settled.route,due:mine.settled.dueCents,status:mine.settled.status},{route:'bb-af',due:2000,status:'ontvangen'});
});

test('schermen en route: knoppen alleen voor de eigenaar, met de opgeslagen sleutels',()=>{
 const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
 const r=read('app/api/ledenevenementen/route.ts');assert.match(r,/isOwnerRequest\(req\)/);assert.match(r,/withConnectionSettings\(\(\)=>payments\(/);
 const ui=read('app/goedkeuringen/ledenevenementen.tsx');for(const a of ['terugbetalen','afrekenen','uitbetaling-goedkeuren','bunq-ophalen','ontvangen'])assert.match(ui,new RegExp(`'${a}'`));
 assert.match(read('lib/mollie.ts'),/\/refunds',\{method:'POST',idempotencyKey:p\.idempotencyKey/);
});

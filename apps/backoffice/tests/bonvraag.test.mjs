import './helpers/ts-resolve.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// Bonvraag (wens eigenaar 9 november 2026): een nieuw product via een etiket mag worden afgerekend, maar vóór het uitbetalen moet
// gezegd worden bij wie de verkoop hoort (bijvoorbeeld vlees van Bartele, Ingeborg of Pieter). Per bonregel, met „Volgende keer ook”.

test('nieuwe producten via een etiket: vragen, beantwoorden, onthouden en pas daarna de week goedkeuren',async t=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'bb-bonvraag-'));process.env.APP_DATA_DIR=tmp;process.env.DATABASE_URL='';
 const {closeDatabase}=await import('../lib/portable/env.ts');t.after(async()=>{process.env.APP_DATA_DIR=tmp;await closeDatabase();fs.rmSync(tmp,{recursive:true,force:true})});
 const {getDb}=await import('../db/index.ts'),S=await import('../db/schema.ts'),{eq}=await import('drizzle-orm');
 const B=await import('../lib/shop-questions.ts'),C=await import('../lib/coop-store.ts');
 const db=getDb(),at=new Date().toISOString();
 // Een afgelopen week: maandag twee weken geleden.
 const add=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10),today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date());
 let monday=add(today,-14);while(new Date(monday+'T12:00:00Z').getUTCDay()!==1)monday=add(monday,-1);
 const bartele='11111111-1111-4111-8111-111111111111',ingeborg='22222222-2222-4222-8222-222222222222';
 await db.insert(S.coopParticipants).values([{id:bartele,name:'Bartele Holtrop',units:'["levert"]',created:at,updated:at},{id:ingeborg,name:'Ingeborg',units:'[]',created:at,updated:at}]);
 const product=(id,name,extra={})=>{const j=JSON.stringify({name,department:'Winkel',priceCents:1800,vat:'9',station:'winkel',available:true,customerPrice:true,...extra});return {id,draft:j,published:j,version:1}};
 await db.insert(S.products).values([
  product('lever','Runderlever',{viaEtiket:at,zelfkassa:{at,labelName:'RUNDERLEVER'}}),
  product('worst','Rookworst',{viaEtiket:at}),            // al nagekeken: kenmerk zelfkassa is weg, blijvend kenmerk niet
  product('eieren','Eieren'),                                // gewoon product van de coöperatie: geen vraag
 ]);
 let n=0;const order=async(lines,o={})=>{n++;const [r]=await db.insert(S.orders).values({requestId:'r'+n,request:'{}',data:'{}',created:`${add(monday,2)}T10:0${n}:00.000Z`,mode:'winkel',status:'vastgelegd',paymentStatus:'betaald',...o}).returning({id:S.orders.id});
  await db.insert(S.orderLines).values(lines.map((l,i)=>({orderId:r.id,position:i,productId:l.p,name:l.name,station:'winkel',quantity:1,unitCents:l.c,totalCents:l.c,vat:'9',vatCents:Math.round(l.c*9/109)})));return r.id};
 await order([{p:'lever',name:'Runderlever',c:1277},{p:'eieren',name:'Eieren',c:350}]);
 await order([{p:'lever',name:'Runderlever',c:980}]);
 await order([{p:'worst',name:'Rookworst',c:650}]);
 await order([{p:'lever',name:'Runderlever',c:500}],{test:1}); // proefbestelling: geen vraag

 let q=await B.openQuestions(monday);
 assert.deepEqual(q.map(x=>[x.productName,x.totalCents]),[['Runderlever',1277],['Runderlever',980],['Rookworst',650]]);
 assert.equal(q[0].labelName,'RUNDERLEVER');
 // Goedkeuren kan pas als alles beantwoord is.
 await assert.rejects(C.approveWeek(monday,'rianne'),/Eerst de bonvraag: bij wie horen 3 verkopen/);
 // De keuzes: wie producten levert bovenaan.
 assert.deepEqual((await B.answerChoices()).map(c=>c.name),['Bartele Holtrop','Ingeborg']);

 // Eerste lever bij Ingeborg, niet onthouden: de regel gaat naar Ingeborg, het product heeft nog geen eigenaar.
 await B.answerQuestion({lineId:q[0].lineId,participantId:ingeborg,remember:false},'rianne');
 assert.equal((await db.select().from(S.orderLines).where(eq(S.orderLines.id,q[0].lineId)))[0].ownerId,ingeborg);
 assert.equal((await db.select().from(S.productOwners)).length,0);
 await assert.rejects(B.answerQuestion({lineId:q[0].lineId,participantId:bartele},'rianne'),/al beantwoord/);
 // Tweede lever bij Bartele, wel onthouden: Bartele wordt eigenaar van Runderlever.
 await B.answerQuestion({lineId:q[1].lineId,participantId:bartele,remember:true},'rianne');
 assert.equal((await db.select().from(S.productOwners).where(eq(S.productOwners.productId,'lever')))[0].participantId,bartele);
 // Rookworst is van Boer Bart zelf, onthouden: product_owners met een lege eigenaar, de regel blijft van de coöperatie.
 await assert.rejects(B.answerQuestion({lineId:q[2].lineId,participantId:'onzin'},'rianne'),/Kies bij wie/);
 await B.answerQuestion({lineId:q[2].lineId,participantId:null,remember:true},'rianne');
 assert.equal((await db.select().from(S.productOwners).where(eq(S.productOwners.productId,'worst')))[0].participantId,null);
 assert.equal((await B.openQuestions(monday)).length,0);

 // De weekafrekening rekent de lever bij Ingeborg en Bartele; daarna kan de week worden goedgekeurd.
 const v=await C.weekView(monday);
 const by=Object.fromEntries(v.settlement.participants.map(p=>[p.name,p.revenueInclCents]));
 assert.deepEqual(by,{'Bartele Holtrop':980,Ingeborg:1277});
 await C.approveWeek(monday,'rianne');
 // Een nieuwe verkoop van Runderlever (nu met eigenaar) of Rookworst (Boer Bart zelf) geeft geen vraag meer.
 let mon2=add(monday,7);await order([{p:'lever',name:'Runderlever',c:700},{p:'worst',name:'Rookworst',c:650}],{created:`${add(mon2,1)}T10:00:00.000Z`});
 assert.equal((await B.openQuestions(mon2)).length,0);
});

test('scherm en route: de vraag staat in de weekafsluiting en in Goedkeuringen',()=>{
 const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
 assert.match(read('app/winkel/afrekening/deelnemers.tsx'),/<Bonvraag week=\{week\}/);
 assert.match(read('app/api/cooperatie/route.ts'),/case 'bonvraag'/);
 assert.match(read('app/goedkeuringen/page.tsx'),/Bij wie hoort de bon\?/);
 assert.match(read('lib/label-products.ts'),/viaEtiket:at/);
});

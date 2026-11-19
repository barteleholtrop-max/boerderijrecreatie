import './helpers/ts-resolve.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// Ledenpagina → „Waar gaat het geld heen?” (wens eigenaar 9 november 2026): alleen de eigen groepen, met de afspraken die nu gelden,
// inclusief inkoop (restaurant en Ite 30%) en het deel van de coöperatie bij evenementen (30%).
test('verdeling per lid: eigen potten met rollen en inkoop, winkel als leverancier, evenementen als organisator',async t=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'bb-verdeling-lid-'));process.env.APP_DATA_DIR=tmp;process.env.DATABASE_URL='';
 const {closeDatabase}=await import('../lib/portable/env.ts');t.after(async()=>{process.env.APP_DATA_DIR=tmp;await closeDatabase();fs.rmSync(tmp,{recursive:true,force:true})});
 const {getDb}=await import('../db/index.ts'),S=await import('../db/schema.ts'),{today}=await import('../lib/pot-agreements.ts');
 const {memberDistribution}=await import('../lib/member-distribution.ts');
 const db=getDb(),at=new Date().toISOString(),add=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
 const anna='11111111-1111-4111-8111-111111111111',kees='22222222-2222-4222-8222-222222222222',vera='33333333-3333-4333-8333-333333333333';
 await db.insert(S.coopParticipants).values([
  {id:anna,name:'Anna',memberClass:'B',units:'["restaurant","levert","evenementen"]',potRoles:'{"restaurant":["bediening"]}',created:at,updated:at},
  {id:kees,name:'Kees',memberClass:'C',units:'["winkel"]',created:at,updated:at},
  {id:'44444444-4444-4444-8444-444444444444',name:'Lot',memberClass:'B',units:'["levert"]',created:at,updated:at},
  {id:vera,name:'Vera',volunteer:1,units:'["restaurant"]',created:at,updated:at}]);
 await db.insert(S.potAgreements).values({id:'a1',pot:'restaurant',validFrom:add(today(),-30),percentBp:3000,status:'geldig',proposedAt:at,decidedAt:at,
  roles:JSON.stringify([{id:'chef-kok',name:'Chef-kok',points:4},{id:'bediening',name:'Bediening',points:2},{id:'schoonmaak',name:'Schoonmaak',points:1,week:true}])});
 await db.insert(S.coopRates).values({participantId:anna,validFrom:add(today(),-10),percentBp:1500,created:at,createdBy:'test'});
 const a=await memberDistribution(anna);
 assert.deepEqual(a.pots.map(p=>[p.pot,p.percentBp,p.purchaseBp]),[['restaurant',3000,3000]],'alleen het restaurant, met 30% inkoop (standaard)');
 assert.deepEqual(a.pots[0].roles.map(r=>[r.name,r.points,r.mine]),[['Chef-kok',4,false],['Bediening',2,true]],'geen weektaken; eigen rol gemarkeerd');
 assert.equal(a.shop.coopBp,1500);assert.equal(a.events.farmShareBp,3000,'evenementen: 30% voor de coöperatie (besluit eigenaar 9 november 2026)');
 assert.deepEqual((await memberDistribution('44444444-4444-4444-8444-444444444444')).shop,{coopBp:1500,shopPotBp:500,standard:true},'leverancier zonder eigen percentage: de vaste afspraak 15% + 5% (besluit eigenaar 9 november 2026)');
 const k=await memberDistribution(kees);assert.deepEqual(k,{pots:[],shop:null,events:null},'geen pot, geen leverancier, geen organisator');
 assert.deepEqual((await memberDistribution(vera)).pots,[],'vrijwilligers delen niet in een pot');
 // Inkoop aanpassen bij Bank & verdeling werkt door in de verdeling.
 const bank=await import('../lib/bank-split.ts');await bank.savePurchase({restaurant:'25',ite:'30'},0,'test');
 assert.equal((await memberDistribution(anna)).pots[0].purchaseBp,2500);
 await assert.rejects(bank.savePurchase({restaurant:'130'},1,'test'),/0 tot en met 100/);
});
test('route en scherm: alleen via de eigen link, bij Mijn saldo (zonder saldo bij Gegevens), ook in de demo',()=>{
 const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
 assert.match(read('app/api/deelnemer/[token]/verdeling/route.ts'),/participantByToken\(token\)/);
 assert.match(fs.readFileSync(new URL('../lib/member-routes.ts',import.meta.url),'utf8'),/'evenementen'[\s\S]*'verdeling'/);
 const page=read('app/deelnemer/[token]/lid-pagina.tsx');assert.match(page,/moneyTab==='beloning'&&<Verdeling api=\{api\} overleg=/);
 const scr=read('app/deelnemer/[token]/verdeling.tsx');assert.match(scr,/Dit zijn de afspraken op dit moment/);assert.doesNotMatch(scr,/per punt|jouw rol|m-verdeel-pot/,'geen verdeling per rol (te veel info, 9 november 2026)');assert.match(scr,/Medeorganisator/);assert.match(page,/moneyTab==='gegevens'&&<Verdeling/);
 assert.match(read('app/deelnemer/[token]/demo.ts'),/case 'verdeling'/);
});

import './helpers/ts-resolve.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// Personeelsplanning en openingstijden op een echte (PGlite) database (wens eigenaar 6 november 2026).

test('rooster, signalen, slot op goedgekeurde weken en melden aan de pool',async t=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'bb-open-dagen-'));process.env.APP_DATA_DIR=tmp;
 const {closeDatabase}=await import('../lib/portable/env.ts');t.after(async()=>{process.env.APP_DATA_DIR=tmp;await closeDatabase();fs.rmSync(tmp,{recursive:true,force:true})});
 const {getDb}=await import('../db/index.ts'),S=await import('../db/schema.ts');
 const P=await import('../lib/pot-planning.ts'),{editGuest}=await import('../lib/guest-store.ts'),{today}=await import('../lib/pot-agreements.ts');
 const add=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
 const day0=today(),db=getDb(),at=new Date().toISOString();
 // Een maandag over twee weken (gesloten) en een donderdag die week (open).
 let mon=add(day0,14);while(new Date(mon+'T12:00:00Z').getUTCDay()!==1)mon=add(mon,1);const thu=add(mon,3);
 await editGuest(s=>{s.hours=s.hours.map((h,i)=>({open:i>=4||i===0,from:'10:00',to:'18:00'}))}); // ma, di, wo dicht
 await db.insert(S.coopParticipants).values([{id:'11111111-1111-4111-8111-111111111111',name:'Anna',email:'',units:JSON.stringify(['restaurant']),potRoles:JSON.stringify({restaurant:['kok']}),created:at,updated:at},
  {id:'22222222-2222-4222-8222-222222222222',name:'Piet',email:'',units:JSON.stringify(['restaurant']),potRoles:JSON.stringify({restaurant:['afwas']}),created:at,updated:at}]);
 await db.insert(S.potAgreements).values({id:'a1',pot:'restaurant',validFrom:add(day0,-30),percentBp:3000,roles:JSON.stringify([{id:'kok',name:'Kok',points:3},{id:'afwas',name:'Afwas',points:1},{id:'schoonmaak',name:'Schoonmaak',points:1,week:true}]),status:'geldig',proposedAt:at,decidedAt:at});
 const anna='11111111-1111-4111-8111-111111111111';

 // 1. Gesloten maandag: 0 plekken; open donderdag: de standaard (1).
 let r=await P.roster('restaurant',mon,7);
 const m=r.days.find(d=>d.day===mon),th=r.days.find(d=>d.day===thu);
 assert.equal(m.open,false);assert.equal(m.slots.find(s=>s.roleId==='kok').need,0);assert.equal(th.slots.find(s=>s.roleId==='kok').need,1);
 assert.equal(m.slots.find(s=>s.roleId==='schoonmaak').need,1,'weektaak standaard ook op een gesloten dag');
 await assert.rejects(P.claim('restaurant',mon,'kok',anna,'test'),/gesloten/);
 assert.deepEqual(r.weekTasks,[{roleId:'schoonmaak',roleName:'Schoonmaak',onClosed:true}]);

 // 2. Een groep op de gesloten maandag geeft een signaal; „standaarddiensten” zet die dag de standaard en het signaal verdwijnt.
 await editGuest(s=>{s.reservations.push({id:crypto.randomUUID(),name:'Jansen',email:'',phone:'',activity:'groep',date:mon,from:'10:00',to:'12:00',people:30,sharing:false,status:'bevestigd',expires:'',notes:'',threadId:'',tables:[]})});
 let sig=await P.staffSignals();assert.equal(sig.length,1);assert.equal(sig[0].day,mon);assert.equal(sig[0].reason,'activiteit');
 await P.resolveSignal('restaurant',mon,'standaard','test');
 assert.equal((await P.staffSignals()).length,0);
 r=await P.roster('restaurant',mon,1);assert.equal(r.days[0].open,true,'werkdag: gesloten maar met eigen diensten');assert.equal(r.days[0].extra,true);
 assert.equal(await P.claim('restaurant',mon,'kok',anna,'test'),1,'nu kan Anna kiezen');

 // 3. Omschrijving per dienst; het aantal blijft gelijk.
 await P.setNeedNote('restaurant',mon,'kok','groep Jansen, 30 pers.','test');
 r=await P.roster('restaurant',mon,1);const kok=r.days[0].slots.find(s=>s.roleId==='kok');assert.equal(kok.note,'groep Jansen, 30 pers.');assert.equal(kok.need,1);

 // 4. Melden aan de pool: alleen wie voor de rol is aangenomen; niet twee keer binnen tien minuten.
 await P.setNeed('restaurant',thu,'afwas',2,'test');
 const res=await P.announceShifts('restaurant',thu,['afwas'],'test');assert.equal(res.members,1,'alleen Piet is aangenomen voor afwas');
 await assert.rejects(P.announceShifts('restaurant',thu,['afwas'],'test'),/net al gemeld/);

 // 5. Een inplanning op een dag die later dichtgaat blijft staan, met een waarschuwing.
 await P.claim('restaurant',thu,'kok',anna,'test');
 await editGuest(s=>{s.exceptions.push({date:thu,hours:{open:false,from:'10:00',to:'18:00'},note:'dicht'})});
 r=await P.roster('restaurant',thu,1);assert.equal(r.days[0].slots.find(s=>s.roleId==='kok').people.length,1);assert.match(r.days[0].warnings[0],/Anna staat ingepland als Kok op een gesloten dag/);

 // 6. Een goedgekeurde week ligt vast: geen bezetting en geen melding meer.
 await db.insert(S.potWeeks).values({pot:'restaurant',week:mon,status:'goedgekeurd',snapshot:'{}',approvedBy:'test',approvedAt:at});
 await assert.rejects(P.setNeed('restaurant',thu,'kok',3,'test'),/ligt vast/);
 await assert.rejects(P.announceShifts('restaurant',mon,['kok'],'test'),/ligt vast/);
 assert.equal((await P.staffSignals()).filter(x=>x.day>=mon&&x.day<add(mon,7)).length,0);

 // 7. Weektaak niet op gesloten dagen: per weektaak uit te zetten.
 await P.setNeed('restaurant','gesloten','schoonmaak',0,'test');
 r=await P.roster('restaurant',add(mon,7),7);
 assert.equal(r.weekTasks[0].onClosed,false);assert.equal(r.days.find(d=>d.day===add(mon,7)).slots.find(s=>s.roleId==='schoonmaak').need,0);
});

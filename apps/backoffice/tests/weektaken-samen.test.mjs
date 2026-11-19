import './helpers/ts-resolve.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// Eén persoon doet alle weektaken (wens eigenaar 6 november 2026): in één keer claimen, op een echte (PGlite) database.

test('alle weektaken in één keer: beheerder en lid zelf (alleen aangenomen rollen)',async t=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'bb-weektaken-'));process.env.APP_DATA_DIR=tmp;
 const {closeDatabase}=await import('../lib/portable/env.ts');t.after(async()=>{process.env.APP_DATA_DIR=tmp;await closeDatabase();fs.rmSync(tmp,{recursive:true,force:true})});
 const {getDb}=await import('../db/index.ts'),S=await import('../db/schema.ts');
 const P=await import('../lib/pot-planning.ts'),{editGuest}=await import('../lib/guest-store.ts'),{today}=await import('../lib/pot-agreements.ts');
 const add=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
 const day0=today(),db=getDb(),at=new Date().toISOString();
 let mon=add(day0,7);while(new Date(mon+'T12:00:00Z').getUTCDay()!==1)mon=add(mon,1);
 await editGuest(s=>{s.hours=s.hours.map(()=>({open:true,from:'10:00',to:'18:00'}))});
 const rianne='11111111-1111-4111-8111-111111111111',piet='22222222-2222-4222-8222-222222222222',anna='33333333-3333-4333-8333-333333333333';
 await db.insert(S.coopParticipants).values([
  {id:rianne,name:'Rianne',email:'',units:JSON.stringify(['restaurant']),potRoles:JSON.stringify({restaurant:['schoonmaak','organisatie']}),created:at,updated:at},
  {id:piet,name:'Piet',email:'',units:JSON.stringify(['restaurant']),potRoles:JSON.stringify({restaurant:['schoonmaak']}),created:at,updated:at},
  {id:anna,name:'Anna',email:'',units:JSON.stringify(['restaurant']),potRoles:JSON.stringify({restaurant:[]}),created:at,updated:at}]);
 await db.insert(S.potAgreements).values({id:'a1',pot:'restaurant',validFrom:add(day0,-30),percentBp:3000,roles:JSON.stringify([{id:'kok',name:'Kok',points:3},{id:'schoonmaak',name:'Schoonmaak',points:1,week:true},{id:'organisatie',name:'Organisatie',points:1,week:true}]),status:'geldig',proposedAt:at,decidedAt:at});

 // 1. Het lid zelf: alleen de weektaken waarvoor het is aangenomen; Piet krijgt schoonmaak, organisatie wordt overgeslagen.
 let r=await P.claimWeekTasks('restaurant',mon,piet,'Piet (ledenpagina)',true);
 assert.deepEqual(r.claimed,['Schoonmaak']);assert.equal(r.skipped.length,1);assert.equal(r.skipped[0].name,'Organisatie');
 // 2. Volle weektaak wordt overgeslagen; de beheerder zet Rianne op de rest.
 r=await P.claimWeekTasks('restaurant',mon,rianne,'Bartele');
 assert.deepEqual(r.claimed,['Organisatie']);assert.equal(r.skipped[0].name,'Schoonmaak');
 const ro=await P.roster('restaurant',mon,7);
 for(const d of ro.days){const org=d.slots.find(s=>s.roleId==='organisatie');assert.deepEqual(org.people.map(p=>p.participantId),[rianne],'organisatie de hele week bij Rianne')}
 // 3. Nog een keer: niets meer vrij, maar wat al van Rianne is telt als gedaan.
 r=await P.claimWeekTasks('restaurant',mon,rianne,'Bartele');assert.deepEqual(r.claimed,['Organisatie']);
 // 4. Anna is voor geen enkele weektaak aangenomen: een duidelijke reden.
 await assert.rejects(P.claimWeekTasks('restaurant',add(mon,7),anna,'Anna (ledenpagina)',true),/aangenomen|rol/);
 // 5. De volgende week in één keer alles voor Rianne.
 r=await P.claimWeekTasks('restaurant',add(mon,7),rianne,'Rianne (ledenpagina)',true);assert.deepEqual(r.claimed.sort(),['Organisatie','Schoonmaak']);
});

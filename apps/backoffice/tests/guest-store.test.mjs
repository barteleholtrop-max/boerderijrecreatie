import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import './helpers/ts-resolve.mjs';
const {loadGuest,saveGuest,editGuest}=await import('../lib/guest-store.ts');
const {initialGuestState,validateBooking}=await import('../lib/guest-core.ts');
const {runQuery,closeDatabase}=await import('../lib/portable/env.ts');

const future=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
const res=o=>({id:crypto.randomUUID(),name:'Gast',email:'',phone:'',activity:'groep',date:future(10),from:'10:00',to:'12:00',people:10,sharing:false,status:'bevestigd',expires:'',notes:'',threadId:'',tables:[],...o});
const noRev=s=>JSON.parse(JSON.stringify(s,(k,v)=>k==='rev'?undefined:v));

// Een database met een bestaand gastendocument, zoals de SQLite-migratie 0021 het in eigen tabellen zette. Sinds de overstap
// naar Postgres (Supabase, 4 november 2026) zet de test de rijen zelf neer in een verse PGlite-database.
const COLLECTIONS=[['reservations','guest_reservations',true],['customers','guest_customers',false],['events','guest_events',true],['pickups','guest_pickups',true],
 ['visits','guest_visits',true],['threads','guest_threads',false],['groupKnowledge','guest_knowledge',false]];
async function legacyDatabase(t,doc){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-guest-store-'));process.env.APP_DATA_DIR=dir;
 t.after(async()=>{process.env.APP_DATA_DIR=dir;await closeDatabase();fs.rmSync(dir,{recursive:true,force:true})});
 const q=async(sql,params=[])=>(await runQuery(sql,params,false)).rows;
 if(doc){
  const {reservations,customers,events,pickups,visits,threads,groupKnowledge,groupAdvice,audit,...settings}=doc;
  await q('INSERT INTO guest_workspace(id,version,data) VALUES(1,$1,$2)',[37,JSON.stringify(doc)]);
  await q('UPDATE guest_settings SET rev=$1,res_rev=0,data=$2 WHERE id=1',[37,JSON.stringify(settings)]);
  for(const [key,table,dated] of COLLECTIONS)for(const [pos,row] of (doc[key]||[]).entries()){
   const id=key==='visits'?row.date:row.id;if(id==null)continue;
   await q(`INSERT INTO ${table}(id,rev,pos,day,data) VALUES($1,1,$2,$3,$4) ON CONFLICT DO NOTHING`,[id,pos,dated?row.date??null:null,JSON.stringify(row)]);
  }
  for(const [pos,[id,row]] of Object.entries(groupAdvice||{}).entries())await q('INSERT INTO guest_advice(id,rev,pos,day,data) VALUES($1,1,$2,NULL,$3)',[id,pos+1,JSON.stringify(row)]);
  await q('INSERT INTO guest_days(day,rev) SELECT DISTINCT day,1 FROM guest_reservations WHERE day IS NOT NULL');
  for(const a of audit||[])await q('INSERT INTO guest_audit(at,"by",action,reference) VALUES($1,$2,$3,$4)',[a.at||'',a.by||'',a.action||'',a.reference||'']);
 }else await q('SELECT 1');
 return {dir,sql:q};
}
function legacyDocument(){
 const s=initialGuestState();
 s.hours=s.hours.map(()=>({open:true,from:'10:00',to:'17:00'}));
 s.dayparts=[{id:'ochtend',name:'Ochtend',from:'10:00',to:'12:30',bezoek:40,groep:30},{id:'middag',name:'Middag',from:'12:30',to:'15:00',bezoek:40,groep:20},{id:'namiddag',name:'Namiddag',from:'',to:'',bezoek:0,groep:0}];
 s.capacity={bezoek:100,groep:60};s.sync={agenda:{at:'2026-11-01T10:00:00Z',error:''}};
 s.reservations=[res({name:'Familie Hoekstra — 70 jaar',notes:'18 volw. · 6 kind. · schuur · 2× glutenvrij · café'}),res({name:'School',date:future(11),status:'optie',expires:new Date(Date.now()+5*86400000).toISOString()}),res({name:'Ite by Boer Bart',activity:'yte',from:'19:00',to:'22:00',people:4,tables:['1']})];
 s.customers=[{id:'c1',name:'Jansen',email:'jansen@example.com',phone:'',company:'',address:'',notes:'Vaste gast',updated:'2026-11-01'}];
 s.events=[{id:'e1',date:future(12),from:'14:00',to:'16:00',title:'Lammetjesdag',holiday:false,description:'Knuffelen',capacity:50}];
 s.pickups=[{id:'p1',date:future(13),time:'11:00',name:'Klant',description:'Groentepakket',status:'besteld'}];
 s.visits=[{date:'2025-11-02',visitors:120,temperature:12,rain:0}];
 s.threads=[{id:'chat:1',mailbox:'',externalId:'1',channel:'chat',subject:'Vraag',sender:'Gast',status:'nieuw',assigned:'',messages:[],draft:'',draftId:'',draftBase:'',draftVersion:0,editingBy:'',editingUntil:0,summary:'',transcript:'',customer:'Gast',updated:'2026-11-01'},{id:'gmail:oud',mailbox:'info',externalId:'x',channel:'gmail',subject:'Oude kopie',sender:'a@b.nl',status:'afgehandeld',assigned:'',messages:[],draft:'',draftId:'',draftBase:'',draftVersion:0,editingBy:'',editingUntil:0,summary:'',transcript:'',customer:'',updated:'2026-10-01'}];
 s.groupKnowledge=[{id:'k1',title:'Schoolreis',text:'Voorbeeld'}];
 s.groupAdvice={'gmail:test':{revision:2,note:'Bewaren',revisions:[]}};
 s.audit=[{at:'2026-11-01T09:00:00Z',by:'bart',action:'hours',reference:''},{at:'2026-11-01T09:01:00Z',by:'rianne',action:'reservation',reference:'x'}];
 s.futureField={blijft:'bewaard'};
 return s;
}

test('een bestaand document in eigen tabellen wordt volledig en ongewijzigd teruggelezen',async t=>{
 const doc=legacyDocument(),db=await legacyDatabase(t,doc),{version,state}=await loadGuest();
 assert.equal(version,37);
 const {audit,...expected}=doc;
 assert.deepEqual(noRev({...state,audit:undefined}),JSON.parse(JSON.stringify({...expected,audit:undefined})));
 assert.equal(state.reservations[0].rev,1);assert.equal(state.customers[0].rev,1);
 assert.deepEqual((await db.sql('SELECT "by",action FROM guest_audit ORDER BY seq')).map(r=>r.by),['bart','rianne']);
 assert.equal((await db.sql('SELECT data FROM guest_workspace'))[0].data,JSON.stringify(doc));
 assert.equal((await db.sql('SELECT COUNT(*) n FROM guest_days'))[0].n,2,'twee boekingen op dezelfde dag, één op een andere');
});

test('opslaan zonder wijziging schrijft niets; één wijziging schrijft alleen die rij en een logregel',async t=>{
 const db=await legacyDatabase(t,legacyDocument());
 let {version,state}=await loadGuest();await saveGuest(version,state,crypto.randomUUID());
 assert.deepEqual((await db.sql('SELECT DISTINCT rev FROM guest_reservations')).map(r=>r.rev),[1]);
 ({version,state}=await loadGuest());
 state.reservations[0].notes='Nieuwe notitie';state.audit.push({at:'2026-11-03T10:00:00Z',by:'rianne',action:'reservation',reference:state.reservations[0].id});
 await saveGuest(version,state,crypto.randomUUID());
 assert.deepEqual((await db.sql('SELECT rev FROM guest_reservations ORDER BY pos')).map(r=>r.rev),[2,1,1]);
 assert.equal((await db.sql('SELECT COUNT(*) n FROM guest_audit'))[0].n,3);
 const again=await loadGuest();assert.equal(again.state.reservations[0].notes,'Nieuwe notitie');assert.equal(again.state.reservations[0].rev,2);
 assert.equal(again.version,37,'instellingen ongewijzigd');assert.deepEqual(again.state.audit,[]);
 assert.equal((await db.sql('SELECT COUNT(*) n FROM guest_workspace'))[0].n,1);
});

test('lege database: dezelfde begininstellingen als voorheen; nieuwe gegevens en instellingen worden bewaard',async t=>{
 await legacyDatabase(t,null);
 let {version,state}=await loadGuest();
 assert.deepEqual(noRev(state),JSON.parse(JSON.stringify(initialGuestState())));
 state.capacity={bezoek:30,groep:20};state.reservations.push(res({people:5,activity:'bezoek'}));
 await saveGuest(version,state,crypto.randomUUID());
 ({version,state}=await loadGuest());
 assert.equal(version,1);assert.deepEqual(state.capacity,{bezoek:30,groep:20});assert.equal(state.reservations.length,1);
});

test('collega’s botsen alleen bij dezelfde dag, dezelfde rij of gewijzigde instellingen',async t=>{
 await legacyDatabase(t,legacyDocument());
 // Different days: both succeed.
 let a=await loadGuest(),b=await loadGuest();
 a.state.reservations.push(res({date:future(20)}));b.state.reservations.push(res({date:future(21)}));
 await saveGuest(a.version,a.state,crypto.randomUUID());await saveGuest(b.version,b.state,crypto.randomUUID());
 // Customer and pickup edits do not conflict with bookings.
 a=await loadGuest();b=await loadGuest();
 a.state.customers[0].notes='Bijgewerkt';b.state.reservations.push(res({date:future(22)}));
 await saveGuest(a.version,a.state,crypto.randomUUID());await saveGuest(b.version,b.state,crypto.randomUUID());
 // Same day: the second is refused.
 a=await loadGuest();b=await loadGuest();
 a.state.reservations.push(res({date:future(30)}));b.state.reservations.push(res({date:future(30),from:'12:30',to:'14:00'}));
 await saveGuest(a.version,a.state,crypto.randomUUID());
 await assert.rejects(saveGuest(b.version,b.state,crypto.randomUUID()),/elders iets gewijzigd/);
 // Same customer card: the second is refused.
 a=await loadGuest();b=await loadGuest();
 a.state.customers[0].phone='0612345678';b.state.customers[0].notes='Andere wijziging';
 await saveGuest(a.version,a.state,crypto.randomUUID());
 await assert.rejects(saveGuest(b.version,b.state,crypto.randomUUID()),/elders iets gewijzigd/);
 // Settings changed meanwhile: a booking checked against the old settings is refused, and vice versa.
 a=await loadGuest();b=await loadGuest();
 a.state.capacity={bezoek:10,groep:10};b.state.reservations.push(res({date:future(31)}));
 await saveGuest(a.version,a.state,crypto.randomUUID());
 await assert.rejects(saveGuest(b.version,b.state,crypto.randomUUID()),/elders iets gewijzigd/);
 a=await loadGuest();b=await loadGuest();
 a.state.reservations.push(res({date:future(32),people:5}));b.state.capacity={bezoek:50,groep:50};
 await saveGuest(a.version,a.state,crypto.randomUUID());
 await assert.rejects(saveGuest(b.version,b.state,crypto.randomUUID()),/elders iets gewijzigd/);
});

test('de laatste plek in een tijdblok kan maar één keer worden geboekt',async t=>{
 await legacyDatabase(t,legacyDocument());
 const day=future(40),first=await loadGuest(),second=await loadGuest();
 // Ochtend allows 30 group guests; both try to book 20 of them at the same time.
 for(const l of [first,second])l.state.reservations.push(validateBooking(l.state,res({date:day,people:20})));
 const results=await Promise.allSettled([saveGuest(first.version,first.state,crypto.randomUUID()),saveGuest(second.version,second.state,crypto.randomUUID())]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const after=await loadGuest();assert.equal(after.state.reservations.filter(r=>r.date===day).length,1);
 assert.throws(()=>validateBooking(after.state,res({date:day,people:20})),/vol/);
});

test('verwijderen, gelijktijdig bewerken van een verwijderde boeking en herhaalde verzoeken',async t=>{
 const db=await legacyDatabase(t,legacyDocument());
 const a=await loadGuest(),b=await loadGuest(),id=a.state.reservations[0].id;
 a.state.reservations=a.state.reservations.filter(r=>r.id!==id);b.state.reservations[0].people=12;
 await saveGuest(a.version,a.state,crypto.randomUUID());
 await assert.rejects(saveGuest(b.version,b.state,crypto.randomUUID()),/elders iets gewijzigd/);
 assert.equal((await db.sql(`SELECT COUNT(*) n FROM guest_reservations WHERE id='${id}'`))[0].n,0);
 const c=await loadGuest(),requestId=crypto.randomUUID();c.state.pickups[0].status='afgehaald';
 await saveGuest(c.version,c.state,requestId);
 const d=await loadGuest();d.state.pickups[0].status='besteld';await saveGuest(d.version,d.state,requestId);
 assert.equal((await loadGuest()).state.pickups[0].status,'afgehaald','zelfde verzoek wordt niet nogmaals uitgevoerd');
});

test('editGuest probeert opnieuw met verse gegevens; groepsadvies en kennis blijven per stuk bewaard',async t=>{
 const db=await legacyDatabase(t,legacyDocument());
 await editGuest(s=>{s.groupKnowledge.push({id:'k2',title:'Bedrijfsuitje',text:'Nieuw'});s.groupAdvice['gmail:nieuw']={revision:1,note:'',revisions:[]};});
 const {state}=await loadGuest();
 assert.deepEqual(state.groupKnowledge.map(k=>k.id),['k1','k2']);assert.deepEqual(Object.keys(state.groupAdvice).sort(),['gmail:nieuw','gmail:test']);
 assert.deepEqual((await db.sql('SELECT id,rev FROM guest_advice ORDER BY id')).map(r=>[r.id,r.rev]),[['gmail:nieuw',1],['gmail:test',1]]);
});

test('geheugen: een eerder geladen verzoek draait de wijziging van een collega nooit terug',async t=>{
 await legacyDatabase(t,legacyDocument());
 const a=await loadGuest(),b=await loadGuest(),id=a.state.customers[0].id;
 a.state.customers[0].notes='Door Rianne';await saveGuest(a.version,a.state,crypto.randomUUID());
 // b never touched the customer; saving its own booking must keep Rianne's note.
 b.state.reservations.push(res({date:future(50)}));await saveGuest(b.version,b.state,crypto.randomUUID());
 const {state}=await loadGuest();
 assert.equal(state.customers.find(c=>c.id===id).notes,'Door Rianne');assert.equal(state.reservations.length,4);
 // A stale copy of the same customer is still refused.
 const c=await loadGuest(),d=await loadGuest();
 c.state.customers[0].phone='1';await saveGuest(c.version,c.state,crypto.randomUUID());
 d.state.customers[0].phone='2';await assert.rejects(saveGuest(d.version,d.state,crypto.randomUUID()),/elders iets gewijzigd/);
});

test('geheugen: een wijziging door een ander proces wordt altijd gezien',async t=>{
 const db=await legacyDatabase(t,legacyDocument());
 await loadGuest();
 // Een ander proces (of een tweede server bij Supabase) wijzigt rechtstreeks in de database, buiten deze backoffice om.
 await db.sql("UPDATE guest_customers SET data=jsonb_set(data::jsonb,'{notes}','\"Ander proces\"')::text,rev=rev+1");
 await db.sql('UPDATE guest_settings SET seq=seq+1');
 const {state}=await loadGuest();
 assert.equal(state.customers[0].notes,'Ander proces');assert.equal(state.customers[0].rev,2);
});

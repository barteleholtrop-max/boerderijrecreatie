// Overleggen met gasten (wens eigenaar 9 november 2026): notities, actiepunten, optie in Planning en offerte, op
// Offertes & groepen en op de klantenkaart. Opgeslagen bij de gastgegevens, zonder eigen tabel.
import './helpers/ts-resolve.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const {saveMeeting,linkMeeting,openActions,meetingsForCard,optionExpiry}=await import('../lib/meetings.ts');
const read=f=>fs.readFileSync(new URL(f,import.meta.url),'utf8');
const at=new Date('2026-11-09T10:00:00Z');
const base={id:'c0000000-0000-4000-8000-000000000001',date:'2026-11-09',from:'14:00',subject:'Kennismaking teamuitje',customerId:'k1',customerName:'Familie Jansen',attendees:'Sanne, Anna',notes:'30 personen, liefst in mei.',
 actions:[{id:'x1',text:'Menu voorstellen',who:'Sanne',due:'2026-11-12',done:false},{id:'x2',text:'Datum nagaan',who:'',due:'',done:true}]};

test('overleg: nieuw krijgt revisie 1 en wie het maakte; wijzigen verhoogt de revisie; oude revisie wordt geweigerd',()=>{
 let {list,meeting}=saveMeeting([],base,'sanne',at);
 assert.equal(meeting.rev,1);assert.equal(meeting.createdBy,'sanne');assert.equal(meeting.reservationId,'');assert.equal(meeting.quoteId,'');
 assert.deepEqual(openActions(meeting).map(a=>a.id),['x1']);
 list=linkMeeting(list,base.id,{reservationId:'r1'},'sanne',at);
 ({list,meeting}=saveMeeting(list,{...base,rev:2,notes:'35 personen'},'jan',at));
 assert.equal(meeting.rev,3);assert.equal(meeting.reservationId,'r1','koppeling blijft bij opslaan');assert.equal(meeting.createdBy,'sanne');assert.equal(meeting.updatedBy,'jan');
 assert.throws(()=>saveMeeting(list,{...base,rev:1},'r',at),/door iemand anders gewijzigd/);
 assert.throws(()=>linkMeeting(list,'bestaat-niet',{quoteId:'q'},'r',at),/niet gevonden/);
});

test('overleg: controles op onderwerp, klant, actiepunten en datum',()=>{
 assert.throws(()=>saveMeeting([],{...base,subject:' '},'r',at),/onderwerp/);
 assert.throws(()=>saveMeeting([],{...base,customerId:'',customerName:''},'r',at),/klant of vul de naam/);
 assert.ok(saveMeeting([],{...base,customerId:'',customerName:'Sportclub De Hoek'},'r',at).meeting);
 assert.throws(()=>saveMeeting([],{...base,actions:[{id:'a',text:'',who:'',due:'',done:false}]},'r',at),/actiepunt/);
 assert.throws(()=>saveMeeting([],{...base,date:'2026-02-30'},'r',at));
 assert.throws(()=>saveMeeting([],{...base,id:'geen-uuid'},'r',at));
});

test('overleg op de klantenkaart: eigen klant of via de gekoppelde optie, nieuwste eerst',()=>{
 const one=saveMeeting([],base,'r',at).meeting,two={...saveMeeting([],{...base,id:'c0000000-0000-4000-8000-000000000002',date:'2026-11-20',customerId:'',customerName:'Jansen'},'r',at).meeting,reservationId:'r9'};
 const other={...one,id:'c3',customerId:'k2'};
 assert.deepEqual(meetingsForCard([one,two,other],{id:'k1',reservationIds:['r9']}).map(m=>m.id),[two.id,one.id]);
});

test('optie uit een overleg vervalt na 14 dagen, maar uiterlijk op de dag zelf en nooit in het verleden',()=>{
 assert.equal(optionExpiry('2027-05-01',at),'2026-11-23T10:00:00.000Z');
 assert.equal(optionExpiry('2026-11-15',at),'2026-11-15T08:00:00.000Z');
 assert.equal(optionExpiry('2026-11-09',at),'2026-11-09T21:00:00.000Z');
});

test('overleggen blijven bewaard bij de gastgegevens (geen eigen tabel) en de optie houdt capaciteit vast',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-overleg-'));process.env.APP_DATA_DIR=dir;
 const {loadGuest,saveGuest}=await import('../lib/guest-store.ts');
 const {validateBooking,reservationSchema,blocks}=await import('../lib/guest-core.ts');
 const {closeDatabase}=await import('../lib/portable/env.ts');
 t.after(async()=>{await closeDatabase();fs.rmSync(dir,{recursive:true,force:true})});
 let {version,state}=await loadGuest();
 state.capacity={bezoek:50,groep:60};state.meetings=saveMeeting([],{...base,customerId:'',customerName:'Sportclub De Hoek'},'sanne').list;
 await saveGuest(version,state,crypto.randomUUID());
 ({version,state}=await loadGuest());
 assert.equal(state.meetings.length,1);assert.equal(state.meetings[0].subject,'Kennismaking teamuitje');assert.equal(state.meetings[0].rev,1);
 // Zoals de actie meeting-option: een gewone reservering met status optie, gekoppeld aan het overleg.
 const d=new Date(Date.now()+30*864e5);d.setUTCDate(d.getUTCDate()+(6-d.getUTCDay()));const date=d.toISOString().slice(0,10);// een zaterdag: standaard open
 const r=validateBooking(state,reservationSchema.parse({id:crypto.randomUUID(),name:'Sportclub De Hoek',email:'',phone:'',activity:'groep',date,from:'10:00',to:'13:00',people:30,sharing:false,status:'optie',expires:optionExpiry(date),notes:'',threadId:'',tables:[]}));
 state.reservations.push(r);state.meetings=linkMeeting(state.meetings,base.id,{reservationId:r.id},'sanne');
 await saveGuest(version,state,crypto.randomUUID());
 ({state}=await loadGuest());
 const saved=state.reservations.find(x=>x.id===r.id);
 assert.equal(saved.status,'optie');assert.ok(blocks(saved),'de optie houdt de plek vast');assert.equal(state.meetings[0].reservationId,r.id);assert.equal(state.meetings[0].rev,2);
});

test('API: overleg-acties alleen met planningbeheer, optie via dezelfde boekingscontrole, agenda bijgewerkt',()=>{
 const api=read('../app/api/gasten/route.ts');
 assert.ok(api.indexOf("if(!p.manage)")<api.indexOf("case 'meeting':"),'achter de beheercontrole');
 for(const a of ['meeting','meeting-delete','meeting-option'])assert.match(api,new RegExp(`case '${a}':`));
 assert.match(api,/case 'meeting-option':[^\n]*\n[\s\S]*?validateBooking\(s,r\)/);
 assert.match(api,/'meeting-option','event'/);
 assert.match(api,/case 'quote':[\s\S]{0,400}?b\.meetingId[^\n]*linkMeeting/,'offerte en koppeling in één opslag');
});

test('scherm: knop Klantafspraak (heette Nieuw overleg; 16 november 2026), lijst met open actiepunten en de klantenkaart toont overleggen',()=>{
 const page=read('../app/offertes/page.tsx'),ui=read('../app/offertes/overleg.tsx'),card=read('../app/gesprekken/customers.tsx');
 assert.match(page,/\+ Klantafspraak/);assert.match(page,/<MeetingList/);assert.match(page,/meetingId:from/);
 assert.match(ui,/Als optie in Planning/);assert.match(ui,/Offerte maken/);assert.match(ui,/Actiepunten/);
 assert.match(card,/<h3>Klantafspraken<\/h3>/);assert.match(card,/Nieuwe klantafspraak met deze klant/);
});

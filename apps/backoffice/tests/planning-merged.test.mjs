import {test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/ts-resolve.mjs';
const {initialGuestState,validateBooking,defaultDayparts}=await import('../lib/guest-core.ts');
const {exampleEvents,exampleGroups}=await import('../lib/guest-examples.ts');
const {guestAvailability,publicPlanning}=await import('../lib/guest-public.ts');
const future=(n)=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
const nextDow=(dow,min=2)=>{for(let i=min;i<min+8;i++){const d=future(i);if(new Date(d+'T12:00:00Z').getUTCDay()===dow)return d}};
const state=()=>{const s=initialGuestState();s.hours=s.hours.map(()=>({open:true,from:'10:00',to:'17:00'}));s.dayparts=[{id:'ochtend',name:'Ochtend',from:'10:00',to:'12:30',bezoek:40,groep:30},{id:'middag',name:'Middag',from:'12:30',to:'15:00',bezoek:40,groep:20},{id:'namiddag',name:'Namiddag',from:'15:00',to:'17:00',bezoek:0,groep:0}];return s};
const res=(o)=>({id:crypto.randomUUID(),name:'Groep',email:'',phone:'',activity:'groep',date:future(10),from:'10:00',to:'12:00',people:10,sharing:false,status:'bevestigd',expires:'',notes:'',threadId:'',tables:[],...o});

test('nieuwe planning begint met drie lege tijdblokken: ochtend, middag, namiddag',()=>{
 assert.deepEqual(initialGuestState().dayparts.map(d=>[d.id,d.name,d.from,d.bezoek,d.groep]),[['ochtend','Ochtend','',0,0],['middag','Middag','',0,0],['namiddag','Namiddag','',0,0]]);
 assert.equal(defaultDayparts().length,3);
});
test('een groep moet binnen één tijdblok vallen en past alleen binnen het maximum van dat blok',()=>{
 const s=state();
 assert.equal(validateBooking(s,res({people:30})).status,'bevestigd');
 assert.throws(()=>validateBooking(s,res({from:'11:00',to:'13:30'})),/binnen een tijdblok/);
 s.reservations.push(res({people:25}));
 assert.throws(()=>validateBooking(s,res({people:10})),/Ochtend is vol/);
 assert.equal(validateBooking(s,res({people:10,from:'12:30',to:'14:30'})).status,'bevestigd');
 // Namiddag has no limit: not bookable.
 assert.throws(()=>validateBooking(s,res({from:'15:00',to:'16:30'})),/binnen een tijdblok/);
 // An option counts until it expires.
 const t=state();t.reservations.push(res({people:25,status:'optie',expires:new Date(Date.now()+86400000).toISOString()}));
 assert.throws(()=>validateBooking(t,res({people:10})),/vol/);
});
test('zonder tijdblokken met tijden geldt de bestaande totale capaciteit',()=>{
 const s=state();s.dayparts=defaultDayparts();
 assert.throws(()=>validateBooking(s,res()),/Capaciteit is niet ingesteld/);
 s.capacity.groep=50;assert.equal(validateBooking(s,res()).status,'bevestigd');
});
test('voorbeelden: vier evenementen en vier groepen, gemarkeerd; groepen die niet passen worden een aanvraag',()=>{
 const ev=exampleEvents(future(0));
 assert.equal(ev.length,4);assert.ok(ev.every(e=>e.example&&/^[0-9a-f-]{36}$/.test(e.id)&&e.from<e.to&&e.description));
 const ok=exampleGroups(state(),future(0));
 assert.equal(ok.length,4);assert.ok(ok.every(g=>g.example&&g.activity==='groep'));
 assert.ok(ok.some(g=>g.status==='bevestigd'));
 const none=exampleGroups(initialGuestState(),future(0));
 assert.ok(none.every(g=>g.status==='aanvraag'&&/Voorbeeld als aanvraag/.test(g.notes)));
});
test('website-leespunt uit de centrale planning: openingstijden, uitzonderingen, tijdblokken en evenementen, zonder capaciteit of groepen',()=>{
 const s=state();s.hours[3]={open:false,from:'10:00',to:'17:00'};// woensdag dicht
 const closed=nextDow(5),special=nextDow(6);
 s.exceptions=[{date:closed,hours:{open:false,from:'10:00',to:'17:00'},note:'Besloten feest'},{date:special,hours:{open:true,from:'12:00',to:'20:00'},note:''}];
 s.events=[...exampleEvents(future(0)),{id:'h',date:future(3),from:'',to:'',title:'Feestdag',holiday:true}];
 s.reservations.push(res({name:'Geheime groep'}));
 const a=guestAvailability(s);
 assert.equal(a.openingHours[2],null);assert.deepEqual(a.openingHours[0],{open:'10:00',close:'17:00'});
 const p=publicPlanning(s,new Date());
 assert.ok(!p.visit.days.includes(closed));assert.ok(p.visit.days.includes(special));
 assert.deepEqual(p.visit.blocks.map(b=>b.id),['ochtend','middag']);
 assert.equal(p.events.length,4);assert.ok(p.events.every(e=>e.example));
 const text=JSON.stringify(p);
 for(const secret of ['Geheime groep','bezoek','groep":','"visitors"','capacity'])assert.ok(!text.includes(secret),secret);
 assert.equal(p.yte.moments[0].time,'19:00');assert.ok(p.yte.moments.every(m=>m.weekday==='donderdag'));
});

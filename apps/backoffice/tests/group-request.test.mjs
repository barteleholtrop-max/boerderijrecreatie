import './helpers/ts-resolve.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const {groupIndication,addGroupRequest,groupRequestSchema,freeDates}=await import('../lib/group-request.ts');
const {initialGuestState}=await import('../lib/guest-core.ts');
// Vaste "nu": dinsdag 3 november 2026. Standaard open: zondag en donderdag t/m zaterdag 10–18 uur.
const NOW=Date.parse('2026-11-03T09:00:00Z'),SAT='2026-11-14',MON='2026-11-16';
const state=(groep=40)=>{const s=initialGuestState();s.capacity={bezoek:0,groep};return s};
const booking=(people,status='bevestigd',extra={})=>({id:crypto.randomUUID(),name:'Andere groep',email:'',phone:'',activity:'groep',date:SAT,from:'10:00',to:'18:00',people,sharing:false,status,expires:'',notes:'',threadId:'',tables:[],...extra});

test('zonder groepscapaciteit in de planning: geen belofte, we kijken het na',()=>{
 const r=groupIndication(state(0),SAT,10,NOW);assert.equal(r.state,'onbekend');assert.match(r.message,/kijken/);
});
test('open dag met plek: vrij; gesloten dag: gesloten met vrije data',()=>{
 assert.equal(groupIndication(state(),SAT,30,NOW).state,'vrij');
 const closed=groupIndication(state(),MON,30,NOW);assert.equal(closed.state,'gesloten');assert.match(closed.message,/gesloten/);
 assert.deepEqual(closed.alternatives,['2026-11-19','2026-11-20','2026-11-21'],'eerstvolgende open dagen');
 const s=state();s.exceptions.push({date:SAT,hours:{open:false,from:'10:00',to:'18:00'},note:'Besloten feest'});
 assert.equal(groupIndication(s,SAT,10,NOW).state,'gesloten');
});
test('te groot of al vol: vol; al een bevestigde groep maar nog plek: druk',()=>{
 assert.equal(groupIndication(state(),SAT,41,NOW).state,'vol');
 const s=state();s.reservations.push(booking(20));
 assert.equal(groupIndication(s,SAT,15,NOW).state,'druk');
 const full=groupIndication(s,SAT,25,NOW);assert.equal(full.state,'vol');assert.ok(full.alternatives.length>0);assert.ok(!full.alternatives.includes(SAT));
});
test('alleen bevestigde boekingen en geldige opties tellen; aanvragen en verlopen opties niet',()=>{
 const s=state();s.reservations.push(booking(35,'aanvraag'),booking(35,'optie',{expires:'2026-11-01T00:00:00Z'}));
 assert.equal(groupIndication(s,SAT,30,NOW).state,'vrij');
 s.reservations.push(booking(35,'optie',{expires:'2026-11-30T00:00:00Z'}));
 assert.equal(groupIndication(s,SAT,30,NOW).state,'vol');
});
test('met dagdelen: alleen de dagdelen waar de groep past',()=>{
 const s=state(0);s.dayparts=[{id:'ochtend',name:'Ochtend',from:'10:00',to:'13:00',bezoek:0,groep:30},{id:'middag',name:'Middag',from:'13:00',to:'18:00',bezoek:0,groep:30}];
 s.reservations.push(booking(20,'bevestigd',{from:'10:00',to:'13:00'}));
 const r=groupIndication(s,SAT,15,NOW);assert.equal(r.state,'druk');assert.deepEqual(r.parts,['Middag']);assert.match(r.message,/\(middag\)/);
});
test('ongeldige of verleden datum en onzinnige aantallen worden netjes geweigerd',()=>{
 assert.throws(()=>groupIndication(state(),'2026-11-02',10,NOW),/toekomst/);
 assert.throws(()=>groupIndication(state(),'2026-02-30',10,NOW),/geldige datum/);
 assert.throws(()=>groupIndication(state(),'2028-01-01',10,NOW),/vooruit/);
 assert.throws(()=>groupIndication(state(),SAT,0,NOW),/aantal/);
});
test('geen interne gegevens in het antwoord: alleen stand, data, dagdelen en tekst',()=>{
 const s=state();s.reservations.push(booking(20,'bevestigd',{name:'Familie Geheim',email:'geheim@example.nl'}));
 const r=groupIndication(s,SAT,15,NOW);
 assert.deepEqual(Object.keys(r).sort(),['alternatives','date','message','parts','state']);
 assert.doesNotMatch(JSON.stringify(r),/Geheim|geheim@|\b40\b|\b20\b/);
});
test('aanvraag komt als websitegesprek in de inbox met een concept-aanvraag in Planning, één keer',()=>{
 const s=state();const req=groupRequestSchema.parse({requestId:crypto.randomUUID(),activity:'Kinderfeestje',name:'Anna de Vries',email:'anna@example.nl',date:SAT,people:12,wishes:'Een feestje\u0007 met pannenkoeken.'});
 const first=addGroupRequest(s,req,NOW);assert.equal(first.added,true);assert.equal(first.indication.state,'vrij');
 const t=s.threads.find(t=>t.id==='web:'+req.requestId);
 assert.equal(t.channel,'chat');assert.equal(t.status,'nieuw');assert.equal(t.customer,'Anna de Vries');assert.equal(t.sender,'anna@example.nl');
 assert.match(t.subject,/Groepsaanvraag · Kinderfeestje · 2026-11-14/);assert.match(t.messages[0].text,/Aantal personen: 12[\s\S]*pannenkoeken/);
 assert.doesNotMatch(t.messages[0].text,/\u0007/);assert.match(t.summary,/indicatie, niets vastgehouden/);
 const r=s.reservations.find(r=>r.threadId===t.id);assert.equal(r.status,'aanvraag');assert.equal(r.activity,'groep');assert.equal(r.people,12);
 assert.equal(groupIndication(s,SAT,30,NOW).state,'vrij','een aanvraag houdt geen plaats vast');
 assert.equal(addGroupRequest(s,req,NOW).added,false);assert.equal(s.threads.length,1);assert.equal(s.reservations.length,1);
});
test('zonder datum of aantal alleen het gesprek, geen concept-aanvraag',()=>{
 const s=state();addGroupRequest(s,groupRequestSchema.parse({requestId:crypto.randomUUID(),activity:'Bedrijfsuitje',name:'Bas',email:'bas@example.nl',wishes:'Nog geen datum.'}),NOW);
 assert.equal(s.threads.length,1);assert.equal(s.reservations.length,0);assert.match(s.threads[0].messages[0].text,/Datum: nog open/);
});
test('verplichte velden met een begrijpelijke melding',()=>{
 const base={requestId:crypto.randomUUID(),activity:'Feest',name:'Anna',email:'anna@example.nl',wishes:'Feest'};
 assert.throws(()=>groupRequestSchema.parse({...base,email:'geen-mail'}),/geldig e-mailadres/);
 assert.throws(()=>groupRequestSchema.parse({...base,name:' '}),/naam/);
 assert.throws(()=>groupRequestSchema.parse({...base,wishes:''}),/wensen/);
 assert.throws(()=>groupRequestSchema.parse({...base,people:0}));
 assert.deepEqual(freeDates(state(),SAT,10,NOW,2),['2026-11-15','2026-11-19']);
});

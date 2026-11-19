import {test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/ts-resolve.mjs';
const {parseYteRequest,addYteRequest,endTime,reservationId}=await import('../lib/yte-requests-core.ts');
const {initialGuestState}=await import('../lib/guest-core.ts');
const {customerCards}=await import('../lib/guest-customers.ts');
const {publicPlanning}=await import('../lib/guest-public.ts');
const rid='6f1d2c3b-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const ok=(o={})=>({requestId:rid,date:'2026-11-05',time:'19:00',people:2,name:'Anna de Vries',email:'Anna@Example.nl',phone:'06 12345678',wishes:'Glutenvrij',consent:true,...o});
const state=()=>{const s=initialGuestState();s.yteService={weekday:4,from:'19:00',to:'',configured:false};return s};
const now=new Date('2026-11-03T10:00:00Z');
const moment=()=>publicPlanning(state(),now).yte.moments[0];

test('naam, e-mail en telefoon zijn verplicht; toestemming en een geldig moment ook',()=>{
 const r=parseYteRequest(ok());
 assert.equal(r.email,'anna@example.nl');assert.equal(r.phone,'06 12345678');assert.equal(r.wishes,'Glutenvrij');
 assert.throws(()=>parseYteRequest(ok({name:''})),/naam/);
 assert.throws(()=>parseYteRequest(ok({email:'anna@'})),/e-mailadres/);
 assert.throws(()=>parseYteRequest(ok({phone:'123'})),/telefoonnummer/);
 assert.throws(()=>parseYteRequest(ok({phone:'06-1234567x'})),/telefoonnummer/);
 assert.throws(()=>parseYteRequest(ok({consent:false})),/toestemming/);
 assert.throws(()=>parseYteRequest(ok({people:21})),/1 tot en met 20/);
 assert.throws(()=>parseYteRequest(ok({website:'spam'})),/niet worden verstuurd/);
 assert.throws(()=>parseYteRequest(ok({requestId:'x'})),/Ververs/);
});
test('de aanvraag komt als Ite-reservering met status aanvraag in de planning, zonder tafels of vastgelegde plaatsen',()=>{
 const s=state(),m=moment();
 const r=addYteRequest(s,parseYteRequest(ok({date:m.date,time:m.time})),now);
 assert.equal(r.id,reservationId(rid));assert.equal(r.activity,'yte');assert.equal(r.status,'aanvraag');assert.deepEqual(r.tables,[]);
 assert.equal(r.from,'19:00');assert.equal(r.to,'22:00');assert.match(r.notes,/Glutenvrij/);
 assert.equal(s.reservations.length,1);
 // Same request again: no second reservation; different data: refused.
 addYteRequest(s,parseYteRequest(ok({date:m.date,time:m.time})),now);assert.equal(s.reservations.length,1);
 assert.throws(()=>addYteRequest(s,parseYteRequest(ok({date:m.date,time:m.time,people:5})),now),/andere gegevens/);
});
test('alleen momenten die de website aanbiedt',()=>{
 const s=state();
 assert.throws(()=>addYteRequest(s,parseYteRequest(ok({date:'2026-11-06'})),now),/niet \(meer\) te reserveren/);
 s.exceptions=[{date:moment().date,hours:{open:false,from:'10:00',to:'18:00'},note:'Dicht'}];
 assert.ok(publicPlanning(s,now).yte.moments.every(x=>x.date!==moment().date));
});
test('klantenkaart: een bestaande kaart met hetzelfde e-mailadres wordt gekoppeld en aangevuld; anders ontstaat er een nieuwe',()=>{
 const s=state(),m=moment();
 s.customers=[{id:'klant-1',name:'Anna de Vries',email:'anna@example.nl',phone:'',company:'',address:'',notes:'',updated:''}];
 const r=addYteRequest(s,parseYteRequest(ok({date:m.date,time:m.time})),now);
 assert.equal(r.customerId,'klant-1');assert.equal(s.customers[0].phone,'06 12345678');
 assert.deepEqual(customerCards(s).find(c=>c.id==='klant-1').reservationIds,[r.id]);
 const t=state();addYteRequest(t,parseYteRequest(ok({date:m.date,time:m.time,email:'nieuw@example.nl'})),now);
 const card=customerCards(t).find(c=>c.email==='nieuw@example.nl');
 assert.ok(card);assert.equal(card.phone,'06 12345678');assert.equal(card.reservationIds.length,1);
});
test('eindtijd: de ingestelde Ite-avond, anders drie uur na de start',()=>{
 assert.equal(endTime('19:00','22:30'),'22:30');assert.equal(endTime('19:00',''),'22:00');assert.equal(endTime('22:00',''),'23:59');
});
test('aanschuiven bij andere gasten: het antwoord van de gast staat in de aanvraag (zonder antwoord: eigen tafel)',()=>{
 const m=moment();
 const ja=addYteRequest(state(),parseYteRequest(ok({date:m.date,time:m.time,sharing:true})),now);
 assert.equal(ja.sharing,true);assert.match(ja.notes,/Schuift graag aan bij andere gasten/);
 const nee=addYteRequest(state(),parseYteRequest(ok({date:m.date,time:m.time,sharing:'ja'})),now);
 assert.equal(nee.sharing,false,'alleen een echte ja telt');assert.match(nee.notes,/Liever een eigen tafel/);
});

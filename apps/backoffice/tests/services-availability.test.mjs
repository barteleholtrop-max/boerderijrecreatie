import './helpers/ts-resolve.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const {initialGuestState,validateBooking}=await import('../lib/guest-core.ts');
const {publicPlanning}=await import('../lib/guest-public.ts');
const {pickupSlots,pickupProblem}=await import('../lib/pickup-core.ts');
const {addYteRequest}=await import('../lib/yte-requests-core.ts');
const awaitImport=await import('../lib/availability.ts');
const now=new Date('2027-01-07T08:00:00Z');
function state(){const s=initialGuestState();s.hours=s.hours.map(()=>({open:true,from:'10:00',to:'18:00'}));s.capacity.bezoek=50;s.yteService={weekday:4,from:'19:00',to:'22:00',configured:true};return s}
test('alle acht combinaties: speelboerderij, winkel en Ite blijven onafhankelijk',()=>{
 for(const speelboerderij of [true,false])for(const winkel of [true,false])for(const yte of [true,false]){
  const s=state();s.services={speelboerderij,winkel,yte};const p=publicPlanning(s,now);
  assert.equal(p.visit.days.length>0,speelboerderij);
  assert.equal(p.yte.moments.length>0,yte);
  assert.equal(pickupSlots(s,now).length>0,winkel);
  assert.equal(pickupProblem({date:'2027-01-07',time:'10:00'},s,now)===null,winkel);
 }
});
test('zonder opgeslagen schakelaars blijft bestaande beschikbaarheid gelijk',()=>{
 const s=state();assert.ok(publicPlanning(s,now).visit.days.length);assert.ok(publicPlanning(s,now).yte.moments.length);assert.ok(pickupSlots(s,now).length);
});
test('uitgeschakelde onderdelen weigeren nieuwe bevestigingen en online Ite-aanvragen',()=>{
 const s=state();s.services={speelboerderij:false,winkel:true,yte:false};
 const r={id:'test',name:'Gast',email:'',phone:'',activity:'bezoek',date:'2099-01-08',from:'10:00',to:'12:00',people:2,sharing:false,status:'bevestigd',expires:'',notes:'',threadId:'',tables:[]};
 s.reservations.push({...r});
 assert.throws(()=>validateBooking(s,r),/uitgeschakeld/);
 assert.throws(()=>validateBooking(s,{...r,activity:'yte'}),/uitgeschakeld/);
 assert.throws(()=>addYteRequest(s,{requestId:crypto.randomUUID(),name:'Gast',email:'gast@example.com',phone:'',date:'2027-01-07',time:'19:00',people:2,sharing:false,wishes:''},now),/niet.*te reserveren/);
 assert.equal(s.reservations.length,1,'bestaande boekingen blijven bewaard');
 assert.ok(pickupSlots(s,now).length,'de winkel blijft open');
});
// Uit van … tot en met … (wens eigenaar 6 november 2026).
test('een periode „uit van … tot en met …” sluit alleen die dagen, per onderdeel',()=>{
 const {serviceOn}=awaitImport;
 const s=state();s.servicePauses={speelboerderij:{from:'2027-01-07',to:'2027-01-10'},winkel:{from:'2027-01-08',to:'2027-01-08'},yte:null};
 const p=publicPlanning(s,now);
 assert.ok(!p.visit.days.some(d=>d>='2027-01-07'&&d<='2027-01-10'),'speelboerderij dicht in de periode');
 assert.ok(p.visit.days.includes('2027-01-11'),'daarna weer open');
 assert.equal(p.open.state,'gesloten');assert.match(p.open.note,/tot en met 2027-01-10/);
 assert.ok(p.yte.moments.length,'Ite blijft aan');
 const days=pickupSlots(s,now).map(d=>d.date);assert.ok(!days.includes('2027-01-08'));assert.ok(days.includes('2027-01-07')&&days.includes('2027-01-09'));
 assert.equal(serviceOn(s,'speelboerderij','2027-01-06'),true);assert.equal(serviceOn(s,'speelboerderij','2027-01-10'),false);
 s.services={speelboerderij:true,winkel:true,yte:false};assert.equal(serviceOn(s,'yte','2030-01-01'),false,'het vinkje uit blijft uit');
});
test('een boeking in de periode wordt geweigerd met de datums, daarbuiten niet',()=>{
 const s=state();s.servicePauses={speelboerderij:{from:'2099-01-01',to:'2099-01-31'}};
 const r={id:'p',name:'Gast',email:'',phone:'',activity:'bezoek',date:'2099-01-08',from:'10:00',to:'12:00',people:2,sharing:false,status:'bevestigd',expires:'',notes:'',threadId:'',tables:[]};
 assert.throws(()=>validateBooking(s,r),/uit van 2099-01-01 tot en met 2099-01-31/);
 assert.doesNotThrow(()=>validateBooking(s,{...r,date:'2099-02-04'}));
});

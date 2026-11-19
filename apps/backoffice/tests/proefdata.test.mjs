// Proefdata (wens eigenaar 5 november 2026): zes weken fictieve bestellingen, leden, diensten en gasten.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/ts-resolve.mjs';
const {plan,orderRows,PREFIX,MEMBERS,ITE_ROLES,amsterdamIso}=await import('../lib/proefdata-core.ts');
const {START_ROLES}=await import('../lib/pot-core.ts');
const {iteMoment}=await import('../lib/pot-day-core.ts');
const hours=Array.from({length:7},(_,i)=>({open:i===0||i>=4,from:'10:00',to:'18:00'}));
const ite={weekday:4,from:'19:00',to:'22:00'};
const input=(today='2026-11-05')=>({today,hours,closed:['2026-10-11'],ite,roles:pot=>pot==='restaurant'?START_ROLES:ITE_ROLES});

test('hetzelfde begin geeft hetzelfde plan; alles heeft het kenmerk proefdata',()=>{
 const a=plan(input()),b=plan(input());
 assert.deepEqual(a,b);
 assert.equal(a.from,'2026-09-24');assert.equal(a.until,'2026-11-05');
 assert.ok(a.orders.length>500,'genoeg bestellingen: '+a.orders.length);
 assert.ok(a.orders.every(o=>o.requestId.startsWith(PREFIX)&&o.created<amsterdamIso('2026-11-05','00:00')),'alles vóór vandaag');
 assert.ok(MEMBERS.every(m=>m.id.startsWith(PREFIX)&&m.name.endsWith('(proef)')));
 assert.ok(a.reservations.every(r=>r.id.startsWith(PREFIX)&&r.name.endsWith('(proef)')));
 assert.equal(new Set(a.orders.map(o=>o.requestId)).size,a.orders.length,'unieke aanvraagnummers');
});
test('alleen op open dagen, gesloten uitzondering telt niet; Ite op de Ite-avond',()=>{
 const p=plan(input()),day=o=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date(o.created));
 const wd=d=>new Date(d+'T12:00:00Z').getUTCDay();
 for(const o of p.orders){const d=day(o);if(o.mode==='yte')assert.ok(iteMoment(o.created,ite),'Ite-bestelling op de Ite-avond '+o.created);else assert.ok(hours[wd(d)].open,'open dag '+d)}
 assert.ok(!p.orders.some(o=>day(o)==='2026-10-11'&&o.mode!=='yte'),'gesloten dag zonder bestellingen');
 assert.ok(p.visits.every(v=>hours[wd(v.date)].open));
 assert.ok(p.reservations.some(r=>r.activity==='yte')&&p.reservations.some(r=>r.activity==='groep'));
});
test('diensten: alleen bestaande rollen en leden van die pot, één rol per lid per dag',()=>{
 const p=plan(input()),keys=new Set();
 for(const s of p.shifts){
  const m=MEMBERS.find(x=>x.id===s.participantId);assert.ok(m.units.includes(s.pot),s.participantId+' in '+s.pot);
  assert.ok((s.pot==='restaurant'?START_ROLES:ITE_ROLES).some(r=>r.id===s.roleId));
  const k=s.pot+s.day+s.participantId;assert.ok(!keys.has(k));keys.add(k);
 }
 assert.ok(p.shifts.some(s=>s.pot==='ite')&&p.shifts.some(s=>s.pot==='restaurant'));
 assert.equal(plan({...input(),roles:()=>null}).shifts.length,0,'zonder afspraak geen diensten');
});
test('winkelproducten van deelnemers krijgen hun eigenaar; zelf gekozen bedrag klopt per regel',()=>{
 const p=plan(input());
 const shop=p.orders.flatMap(o=>o.lines.map((l,i)=>[l,o.owners[i]]));
 assert.ok(shop.some(([l,o])=>l.name.startsWith('Desembrood')&&o===PREFIX+'bakkerij'));
 assert.ok(shop.some(([l,o])=>l.name.startsWith('Jersey melk')&&o===null),'eigen product van de coöperatie');
 const own=p.orders.filter(o=>o.chosenCents!==null);assert.ok(own.length>20);
 for(const o of own.slice(0,30)){const r=orderRows(o);
  assert.equal(r.lines.reduce((s,l)=>s+l.paidCents,0),o.chosenCents);assert.equal(r.order.chosenCents,o.chosenCents);assert.equal(r.order.differenceCents,o.chosenCents-r.order.totalCents)}
 const r=orderRows(p.orders[0]);assert.equal(r.order.test,1,'altijd een proefbestelling');assert.match(r.order.data,/"proefdata":true/);
});

// Ledenpagina → Verdiensten (5 november 2026): dag, week en maand opgeteld uit de eigen potbedragen.
import './helpers/ts-resolve.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const E=await import('../lib/member-earnings.ts');
const d=(day,share,tip=0,role='Bediening')=>({day,roleName:role,points:2,shareCents:share,tipCents:tip,pointValueCents:500,people:3});
const pots=[
 {id:'rest',name:'Restaurant',weeks:[
  {week:'2026-11-02',label:'week 45',status:'open',days:[d('2026-11-05',2000,300),d('2026-11-02',1500)],totalCents:3800,payoutCents:3800},
  {week:'2026-10-26',label:'week 44',status:'uitbetaald',days:[d('2026-10-31',4000,500),d('2026-11-01',1000)],totalCents:5500,payoutCents:5500}]},
 {id:'speel',name:'Speelboerderij',weeks:[
  {week:'2026-11-02',label:'week 45',status:'goedgekeurd',days:[d('2026-11-05',1200,0,'Begeleiding')],totalCents:1200,payoutCents:1200}]},
];
test('per dag: potten opgeteld, fooien erbij, zwakste status telt',()=>{
 const days=E.earnedDays(pots);
 assert.deepEqual(days.map(x=>[x.day,x.cents]),[['2026-11-05',3500],['2026-11-02',1500],['2026-11-01',1000],['2026-10-31',4500]]);
 assert.equal(days[0].roles.length,2);assert.equal(days[0].status,'open');assert.equal(days[0].tipCents,300);
});
test('per week en per maand',()=>{
 assert.deepEqual(E.earnedWeeks(pots).map(w=>[w.week,w.cents,w.status]),[['2026-11-02',5000,'open'],['2026-10-26',5500,'uitbetaald']]);
 const months=E.earnedMonths(E.earnedDays(pots));
 assert.deepEqual(months.map(m=>[m.month,m.cents,m.settled]),[['2026-11',6000,false],['2026-10',4500,true]]);
 assert.match(months[0].label,/november 2026/);
});
test('samenvatting: vandaag, deze week, deze maand',()=>{
 assert.deepEqual(E.earnedSummary(pots,'2026-11-05'),{today:3500,week:5000,month:6000,daysThisMonth:3});
 assert.equal(E.mondayOf('2026-11-08'),'2026-11-02');assert.equal(E.mondayOf('2026-11-02'),'2026-11-02');
});

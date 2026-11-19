// Speelboerderij-verdeler (wens eigenaar 5 november 2026): entree € 9 per kind, per week verdeeld over de rollen; de
// coöperatie houdt een instelbaar deel in (start 2%); een verantwoordelijke met extra punten.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/ts-resolve.mjs';
const {weekPot,asWeekly,isWeeklyPot,PRODUCT_POTS,POT_STATIONS}=await import('../lib/pot-day-core.ts');
const {startRolesFor,startPercentFor}=await import('../lib/pot-core.ts');
const {buildLine}=await import('../lib/orders.ts');
const roles=[...startRolesFor('speelboerderij'),{id:'speeltuin',name:'Onderhoud speeltuin',points:2,week:true},{id:'erf',name:'Erf netjes',points:1,week:true}];
const agreement={id:'s1',pot:'speelboerderij',status:'geldig',validFrom:'2026-11-02',decidedAt:'2026-11-01',percentBp:startPercentFor('speelboerderij')*100,roles};
const names=new Map([['sanne','Sanne'],['jelle','Jelle'],['fenna','Fenna']]);
const entree=(day,kids)=>({day,normalExclCents:Math.round(kids*900/1.09),paidExclCents:Math.round(kids*900/1.09)});

test('startafspraak: weekpot, 98% naar de rollen (2% coöperatie), een verantwoordelijke met extra punten',()=>{
 assert.equal(isWeeklyPot('speelboerderij'),true);assert.equal(isWeeklyPot('restaurant'),false);
 assert.deepEqual(PRODUCT_POTS,['speelboerderij']);assert.deepEqual(POT_STATIONS.speelboerderij,[],'geen werkplek: de omzet komt uit de entree');
 assert.equal(startPercentFor('speelboerderij'),98);assert.equal(startPercentFor('restaurant'),30);
 const r=startRolesFor('speelboerderij');assert.equal(r[0].name,'Verantwoordelijke speelboerderij');assert.ok(r[0].points>1&&r[0].week);
});
test('per week: alle entree van de week, één keer verdeeld over de rollen van die week naar punten',()=>{
 const monday='2026-11-02';
 // Entree op donderdag t/m zondag; rollen voor de week op de maandag; een rol op woensdag telt niet (weekpot).
 const rev=[entree('2026-11-05',12),entree('2026-11-06',20),entree('2026-11-07',45),entree('2026-11-08',38)];
 const shifts=[{day:monday,participantId:'sanne',roleId:'verantwoordelijke-speelboerderij'},{day:monday,participantId:'jelle',roleId:'speeltuin'},{day:monday,participantId:'fenna',roleId:'erf'},{day:'2026-11-04',participantId:'jelle',roleId:'erf'}];
 const w=asWeekly(monday,rev,shifts);
 assert.equal(w.revenue.every(r=>r.day===monday),true);assert.equal(w.shifts.length,3);
 const res=weekPot({monday,pot:'speelboerderij',agreements:[agreement],shifts:w.shifts,revenue:w.revenue,names});
 const total=rev.reduce((s,r)=>s+r.normalExclCents,0),pot=Math.round(total*0.98);
 assert.equal(res.potCents,pot,'98% van de weekentree');
 assert.equal(total-res.potCents,Math.round(total*0.02),'2% houdt de coöperatie in');
 const by=Object.fromEntries(res.people.map(p=>[p.participantId,p.shareCents]));
 assert.equal(by.sanne+by.jelle+by.fenna,pot,'alles verdeeld');
 assert.equal(by.sanne,Math.round(pot*3/6),'verantwoordelijke: 3 van de 6 punten');assert.ok(Math.abs(by.jelle-pot*2/6)<=1);assert.ok(Math.abs(by.fenna-pot/6)<=1);
 assert.ok(res.people.every(p=>p.days===1),'één keer per week, niet per dag');
});
test('entree aan de kassa: werkafdeling „Geen” mag alleen voor een product dat voor een pot telt',()=>{
 const p={name:'Entree speelboerderij',priceCents:900,vat:'9',station:'geen',available:true,department:'Speelboerderij',pot:'speelboerderij'};
 const l=buildLine(p,{productId:'e1',version:1,quantity:3,selections:{},note:''});
 assert.equal(l.totalCents,2700);assert.equal(l.station,'geen','komt op geen enkele werkplek');
 assert.throws(()=>buildLine({...p,pot:undefined},{productId:'e1',version:1,quantity:1,selections:{},note:''}),/werkafdeling/);
});
test('een afspraak die midden in de week ingaat, geldt voor die hele week',async()=>{
 const {weeklyAgreements}=await import('../lib/pot-day-core.ts');
 assert.deepEqual(weeklyAgreements([{validFrom:'2026-11-05'},{validFrom:'2026-11-02'},{validFrom:'2026-11-08'}]).map(a=>a.validFrom),['2026-11-02','2026-11-02','2026-11-02']);
});

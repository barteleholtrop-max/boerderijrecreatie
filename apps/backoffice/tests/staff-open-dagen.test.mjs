import './helpers/ts-resolve.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
// Personeelsplanning koppelen aan openingstijden en groepen (wens eigenaar 6 november 2026).
const {needOf,noteOf,daySlots,claimProblem,closedDayWarnings,weekTaskOnClosed,CLOSED_DAYS}=await import('../lib/pot-day-core.ts');
const {daySignal,activitiesOn}=await import('../lib/staff-signals.ts');
const {initialGuestState}=await import('../lib/guest-core.ts');

const kok={id:'kok',name:'Kok',points:3},afwas={id:'afwas',name:'Afwas',points:1},schoonmaak={id:'schoonmaak',name:'Schoonmaak',points:1,week:true};
const needs=[{day:'',roleId:'kok',count:2,note:'mise en place'},{day:'',roleId:'schoonmaak',count:1}];
const names=new Map([['anna','Anna'],['piet','Piet']]);

test('op een gesloten dag staan standaard 0 plekken; op een open dag de standaard',()=>{
 assert.equal(needOf(needs,'2026-11-09',kok,true),2);
 assert.equal(needOf(needs,'2026-11-09',kok,false),0);
 assert.equal(needOf(needs,'2026-11-09',afwas,false),0);
 // Een getal voor precies die dag gaat altijd voor: zo krijgt een groep op een dichte dag toch diensten.
 assert.equal(needOf([...needs,{day:'2026-11-09',roleId:'kok',count:3}],'2026-11-09',kok,false),3);
});

test('weektaken mogen standaard ook op gesloten dagen; per weektaak uit te zetten',()=>{
 assert.equal(needOf(needs,'2026-11-11',schoonmaak,false),1);assert.equal(weekTaskOnClosed(needs,'schoonmaak'),true);
 const off=[...needs,{day:CLOSED_DAYS,roleId:'schoonmaak',count:0}];
 assert.equal(needOf(off,'2026-11-11',schoonmaak,false),0);assert.equal(weekTaskOnClosed(off,'schoonmaak'),false);
 assert.equal(needOf(off,'2026-11-12',schoonmaak,true),1,'op open dagen blijft de weektaak gewoon staan');
});

test('omschrijving per dag per rol, anders de vaste van de rol',()=>{
 assert.equal(noteOf(needs,'2026-11-12','kok'),'mise en place');
 assert.equal(noteOf([...needs,{day:'2026-11-12',roleId:'kok',count:2,note:'groep 40 pers.'}],'2026-11-12','kok'),'groep 40 pers.');
 assert.equal(daySlots([kok],needs,[],'2026-11-12',names,true)[0].note,'mise en place');
});

test('bestaande inplanningen op een dichte dag blijven staan en worden een waarschuwing',()=>{
 const shifts=[{day:'2026-11-09',participantId:'anna',roleId:'kok',status:'gepland'}];
 const slots=daySlots([kok,afwas],needs,shifts,'2026-11-09',names,false);
 assert.equal(slots[0].need,0);assert.equal(slots[0].people.length,1,'niet weggehaald');
 const w=closedDayWarnings(slots,false);assert.equal(w.length,1);assert.match(w[0],/Anna staat ingepland als Kok op een gesloten dag/);
 assert.deepEqual(closedDayWarnings(daySlots([kok],needs,shifts,'2026-11-09',names,true),true),[]);
});

test('kiezen op een gesloten dag kan alleen als er voor die dag zelf diensten staan',()=>{
 const base={day:'2026-11-09',today:'2026-11-06',open:false,locked:false,member:true,roles:[kok],roleId:'kok',shifts:[],participantId:'anna'};
 assert.equal(claimProblem({...base,needs}),'Op deze dag zijn we gesloten.');
 assert.equal(claimProblem({...base,needs:[...needs,{day:'2026-11-09',roleId:'kok',count:1}]}),null);
 assert.equal(claimProblem({...base,locked:true,needs:[...needs,{day:'2026-11-09',roleId:'kok',count:1}]}),'Deze week is al goedgekeurd en ligt vast.');
});

test('signaal: extra open dag, of een groep op een dag zonder diensten; weg zodra er een eigen bezetting staat',()=>{
 const o={day:'2026-11-09',today:'2026-11-06',locked:false,hasAgreement:true,hasDayRow:false,weekdayOpen:false,exceptionOpen:false,totalNeed:0,items:[]};
 assert.equal(daySignal(o),null);
 assert.equal(daySignal({...o,exceptionOpen:true}).reason,'extra-open');
 assert.equal(daySignal({...o,items:['groep Jansen']}).reason,'activiteit');
 assert.equal(daySignal({...o,items:['groep Jansen'],totalNeed:3}),null,'een groep op een dag met diensten: geen signaal');
 assert.equal(daySignal({...o,exceptionOpen:true,hasDayRow:true}),null,'afgehandeld (ook met 0)');
 assert.equal(daySignal({...o,exceptionOpen:true,locked:true}),null,'goedgekeurde week: niets');
 assert.equal(daySignal({...o,exceptionOpen:true,day:'2026-11-01'}),null,'verleden');
});

test('groepen, evenementen en offertes tellen mee; geannuleerd, afgewezen en feestdagen niet',()=>{
 const s=initialGuestState();
 s.reservations=[{id:'1',name:'Jansen',activity:'groep',date:'2026-11-09',people:30,status:'optie'},{id:'2',name:'Weg',activity:'groep',date:'2026-11-09',people:5,status:'geannuleerd'},{id:'3',name:'Bezoek',activity:'bezoek',date:'2026-11-09',people:2,status:'bevestigd'}];
 s.events=[{id:'e',date:'2026-11-09',title:'Oogstfeest',holiday:false},{id:'h',date:'2026-11-09',title:'Feestdag',holiday:true}];
 s.quotes=[{number:'OF-7',eventDate:'2026-11-09',people:40,status:'verstuurd'},{number:'OF-8',eventDate:'2026-11-09',people:10,status:'afgewezen'}];
 const items=activitiesOn(s,'2026-11-09');
 assert.equal(items.length,3);assert.match(items.join(' | '),/groep Jansen.*evenement Oogstfeest.*offerte OF-7/);
});

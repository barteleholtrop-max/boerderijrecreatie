// Weekagenda in Planning (3 november 2026): blokken op tijd, overlap naast elkaar, hele dag bovenaan.
import './helpers/ts-resolve.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const {assignLanes,agendaDay,hourRange,agendaHref}=await import('../lib/week-agenda.ts');
const item=(id,from,to,kind='groep',status='bevestigd')=>({kind,id,from,to,title:id,what:'Groepsbezoek',people:10,status,notes:'',example:false});
const day=(items,extra={})=>({date:'2026-11-14',open:true,hours:'10:00–18:00',note:'',holidays:[],sure:0,possible:0,byKind:{},possibleByKind:{},items,parts:[{id:'p1',name:'Ochtend',from:'10:00',to:'12:00',bezoek:{used:0,max:0},groep:{used:0,max:0}}],seats:0,pickups:0,forecast:null,...extra});
test('overlappende blokken krijgen elk een eigen baan; losse blokken de volle breedte',()=>{
 const l=assignLanes([{from:'10:00',to:'12:00',id:'a'},{from:'11:00',to:'13:00',id:'b'},{from:'14:00',to:'15:00',id:'c'}]);
 const by=Object.fromEntries(l.map(x=>[x.id,[x.lane,x.lanes]]));
 assert.deepEqual(by,{a:[0,2],b:[1,2],c:[0,1]});
});
test('dag: verlopen opties weg, zonder tijd naar hele dag, afhalen als blok van 30 minuten, feestdag bovenaan',()=>{
 const d=agendaDay({pickups:[{id:'w1',date:'2026-11-14',time:'15:00',name:'Jansen',description:'Eieren',status:'besteld'},{id:'w2',date:'2026-11-14',time:'16:00',name:'Klaar',description:'',status:'afgehaald'}]},
  day([item('feest','14:00','18:00'),item('oud','10:00','11:00','groep','verlopen'),item('markt','','','evenement'),item('kort','11:00','','yte','optie')],{holidays:['Sint-test']}));
 assert.deepEqual(d.blocks.map(b=>[b.title,b.from,b.to]).sort(),[['Afhalen: Jansen','15:00','15:30'],['feest','14:00','18:00'],['kort','11:00','12:00']]);
 assert.deepEqual(d.allDay.map(a=>a.title),['Sint-test','markt']);
 assert.equal(d.parts[0].name,'Ochtend');
});
test('urenbereik: openingstijden en blokken passen erin, minstens 9–18',()=>{
 assert.deepEqual(hourRange([agendaDay({pickups:[]},day([]))]),{from:9,to:18});
 assert.deepEqual(hourRange([agendaDay({pickups:[]},day([item('yte','19:00','22:30','yte')]))]),{from:9,to:23});
});

test('klikken op de agenda: tijd van de klik, afgerond op een kwartier (wens eigenaar 9 november 2026)',async()=>{
 const {slotTime}=await import('../lib/week-agenda.ts');
 assert.equal(slotTime(0,9,48),'09:00');
 assert.equal(slotTime(48*4.5,9,48),'13:30','halverwege 13 uur');
 assert.equal(slotTime(48*4.5+11,9,48),'13:30','naar beneden op een kwartier');
 assert.equal(slotTime(48*4.5+12,9,48),'13:45');
 assert.equal(slotTime(-20,9,48),'09:00','nooit voor het begin van de dag');
 assert.equal(slotTime(48*20,9,48),'23:45','nooit na het eind van de dag');
 const fs=await import('node:fs'),read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
 assert.match(read('app/planning/workspace.tsx'),/onSlot=\{\(day,time\)=>\{setAfspraakStart\(\{date:day,from:time\}\)/);
 assert.match(read('app/planning/afspraak.tsx'),/to:start\?later\(start\.from,30\)/,'een nieuwe afspraak duurt standaard een half uur');
 assert.match(read('app/planning/week-agenda.tsx'),/el\.closest\('\.agenda-block'\)\)return/,'klik op een bestaande boeking opent die, geen nieuwe afspraak');
});
test('telefoonagenda: een tik opent de details van het agenda-item, niet de algemene planning (10 november 2026)',()=>{
 const d=agendaDay({pickups:[],appointments:[{id:'af 1',date:'2026-11-14',from:'13:00',to:'14:00',subject:'Kennismaking',customerId:'',customerName:'',notes:'',created:'',createdBy:''}]},day([item('ev1','11:00','16:00','evenement'),item('r1','19:00','22:00','yte')]));
 const href=Object.fromEntries(d.blocks.map(b=>[b.title,agendaHref(b,d.date)]));
 assert.equal(href.Kennismaking,'/planning?afspraak=af%201');
 assert.equal(href.ev1,'/planning?evenement=ev1&datum=2026-11-14');
 assert.equal(href.r1,'/planning?reservering=r1');
 assert.equal(agendaHref({kind:'winkel'},'2026-11-14'),'/planning');
});

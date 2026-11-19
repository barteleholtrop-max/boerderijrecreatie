import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dayPlan,place} from '../lib/dagplanning-core.ts';
// Dagplanning (wens eigenaar 8 november 2026): de dag als tijdlijn met balkjes per soort.
const item=(o)=>({kind:'groep',id:'g1',from:'11:00',to:'13:00',title:'Schoolklas',what:'Groepsbezoek',people:30,status:'bevestigd',notes:'Lunch om 12.00\nmeer',example:false,...o});
const day=(o={})=>({date:'2026-11-13',open:true,hours:'10:00–18:00',note:'',holidays:[],sure:0,possible:0,byKind:{},possibleByKind:{},items:[],parts:[],seats:0,pickups:0,forecast:null,...o});

test('een groep om 11 uur wordt een balkje bij Groepen; de tijdas loopt minstens over de openingstijden',()=>{
 const p=dayPlan(day({items:[item()]}));
 assert.equal(p.start,10);assert.equal(p.end,18);
 const g=p.lanes.find(l=>l.id==='groep').bars;
 assert.deepEqual(g.map(b=>[b.from,b.to,b.title,b.people,b.sub]),[['11:00','13:00','Schoolklas',30,'Lunch om 12.00']]);
 const pos=place(g[0],p.start,p.end);assert.equal(pos.left,12.5);assert.equal(pos.width,25);
});

test('daggasten, voorspelling, Ite en evenementen elk in een eigen baan; verlopen opties tellen niet',()=>{
 const p=dayPlan(day({forecast:40,items:[item({kind:'bezoek',id:'b',from:'10:00',to:'12:00',title:'Familie',people:4,status:'optie'}),item({kind:'yte',id:'y',from:'19:00',to:'22:00',title:'Ite',people:12}),item({kind:'evenement',id:'e',from:'',to:'',title:'Markt',people:0}),item({id:'v',status:'verlopen'})]}));
 const by=Object.fromEntries(p.lanes.map(l=>[l.id,l.bars.map(b=>b.kind+':'+b.from+'-'+b.to)]));
 assert.deepEqual(by.bezoek,['verwacht:10:00-18:00','bezoek:10:00-12:00']);
 assert.deepEqual(by.yte,['yte:19:00-22:00']);
 assert.deepEqual(by.evenement,['evenement:10:00-18:00'],'zonder tijd over de openingstijden');
 assert.deepEqual(by.groep,[],'verlopen optie niet');
 assert.equal(p.end,22,'de as loopt door tot het einde van Ite');
 assert.equal(p.perHour.find(h=>h.hour===10).guests,44,'verwacht + familie');
 assert.equal(p.perHour.find(h=>h.hour===20).guests,12);
});

test('team en winkel: wie werkt tot hoe laat; teamleden tellen niet als gasten',()=>{
 const p=dayPlan(day(),[{pot:'restaurant',potName:'Restaurant',from:'10:00',to:'18:00',people:[{name:'Anna',role:'Barista',status:'aanwezig',half:false},{name:'Bram',role:'Kok',status:'gepland',half:true}]}],[{name:'Cor',from:'10:00',to:'14:00',part:'ochtend'},{name:'',from:'14:00',to:'18:00',part:'middag'}]);
 const team=p.lanes.find(l=>l.id==='team').bars;
 assert.deepEqual(team.map(b=>[b.title,b.to,b.status]),[['Anna','18:00','aanwezig'],['Bram','18:00','gepland']]);
 assert.match(team[1].sub,/halve dienst/);
 assert.deepEqual(p.lanes.find(l=>l.id==='winkel').bars.map(b=>b.title),['Cor','Nog niet ingevuld']);
 assert.equal(p.totals.team,3);
 assert.ok(p.perHour.every(h=>h.guests===0));
});

test('gesloten dag zonder iets gepland: lege banen, as over het standaardvenster',()=>{
 const p=dayPlan(day({open:false,hours:'Gesloten'}));
 assert.ok(p.lanes.every(l=>!l.bars.length));assert.equal(p.start,10);assert.equal(p.end,18);
});

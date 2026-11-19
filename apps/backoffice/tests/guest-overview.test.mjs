import {test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/ts-resolve.mjs';
const {initialGuestState}=await import('../lib/guest-core.ts');
const {overviewDay,overviewRange,weekStart,addDays,itemDetail,itemStatus}=await import('../lib/guest-overview.ts');

const day='2027-06-10',now=Date.parse('2027-06-01T12:00:00Z');
const res=(o)=>({id:crypto.randomUUID(),name:'Gast',email:'',phone:'',activity:'bezoek',date:day,from:'10:00',to:'12:00',people:4,sharing:false,status:'bevestigd',expires:'',notes:'',threadId:'',tables:[],...o});
function state(){
 const s=initialGuestState();
 s.dayparts=[{id:'ochtend',name:'Ochtend',from:'10:00',to:'12:30',bezoek:40,groep:30},{id:'middag',name:'Middag',from:'12:30',to:'15:00',bezoek:40,groep:20},{id:'namiddag',name:'Namiddag',from:'',to:'',bezoek:0,groep:0}];
 s.reservations=[
  res({name:'Familie de Vries',people:5}),
  res({name:'Kinderfeest Jansen',activity:'groep',people:15,notes:'Kinderfeest, 8 kinderen, pannenkoeken'}),
  res({name:'Basisschool',activity:'groep',people:25,from:'12:30',to:'14:30',status:'optie',expires:'2027-06-05T00:00:00Z'}),
  res({name:'Vereniging',activity:'groep',people:12,from:'12:30',to:'14:00',status:'aanvraag'}),
  res({name:'Verlopen',activity:'groep',people:9,status:'optie',expires:'2027-05-01T00:00:00Z'}),
  res({name:'Geannuleerd',people:7,status:'geannuleerd'}),
  res({name:'Diner',activity:'yte',from:'19:00',to:'22:00',people:6,tables:['1','2']}),
  res({name:'Andere dag',date:'2027-06-11',people:3}),
 ];
 s.events=[{id:'e1',date:day,from:'14:00',to:'16:00',title:'Lammetjesdag',holiday:false,description:'Lammetjes knuffelen',capacity:50}];
 s.pickups=[{id:'p',date:day,time:'11:00',name:'Klant',description:'Groentepakket',status:'besteld'}];
 return s;
}
const signups=[{event_id:'e1',people:3,status:'aangemeld'},{event_id:'e1',people:2,status:'geannuleerd'},{event_id:'e1',people:4,status:'aangemeld'}];

test('telt zekere en mogelijke gasten per soort en laat verlopen en geannuleerd niet meetellen',()=>{
 const d=overviewDay(state(),day,signups,{},now);
 assert.equal(d.sure,5+15+6+7); // bezoek, groep, yte, evenement-aanmeldingen
 assert.equal(d.possible,25+12); // optie + aanvraag
 assert.deepEqual(d.byKind,{bezoek:5,groep:15,yte:6,evenement:7});
 assert.deepEqual(d.possibleByKind,{bezoek:0,groep:25+12,yte:0,evenement:0});
 assert.equal(d.items.some(i=>i.title==='Geannuleerd'),false);
 assert.equal(d.items.find(i=>i.title==='Verlopen').status,'verlopen');
 assert.equal(d.items.some(i=>i.title==='Andere dag'),false);
 assert.equal(d.pickups,1);assert.equal(d.seats,state().tables.reduce((n,t)=>n+t.seats,0));
});

test('toont wat gasten komen doen, op volgorde van tijd',()=>{
 const d=overviewDay(state(),day,signups,{},now);
 assert.deepEqual(d.items.map(i=>i.from),[...d.items.map(i=>i.from)].sort());
 const feest=d.items.find(i=>i.title==='Kinderfeest Jansen');
 assert.equal(feest.what,'Groepsbezoek');assert.match(feest.notes,/pannenkoeken/);
 const event=d.items.find(i=>i.kind==='evenement');
 assert.equal(event.title,'Lammetjesdag');assert.equal(event.people,7);assert.equal(event.capacity,50);assert.equal(event.notes,'Lammetjes knuffelen');
 assert.equal(d.items.find(i=>i.kind==='yte').what,'Ite-diner');
});

test('bezetting per tijdblok volgt dezelfde regel als boeken: bevestigd en geldige opties, geen aanvragen',()=>{
 const d=overviewDay(state(),day,signups,{},now);
 assert.deepEqual(d.parts.map(p=>p.id),['ochtend','middag']); // blok zonder tijden telt niet
 const [ochtend,middag]=d.parts;
 assert.deepEqual(ochtend.bezoek,{used:5,max:40});assert.deepEqual(ochtend.groep,{used:15,max:30});
 assert.deepEqual(middag.groep,{used:25,max:20});
});

test('openingstijden, feestdagen, uitzonderingen en prognose staan bij de dag',()=>{
 const s=state();s.exceptions=[{date:'2027-12-25',hours:{open:false,from:'10:00',to:'18:00'},note:'Kerst'}];
 const kerst=overviewDay(s,'2027-12-25',[],{},now);
 assert.equal(kerst.open,false);assert.equal(kerst.hours,'Gesloten');assert.equal(kerst.note,'Kerst');assert.deepEqual(kerst.holidays,['Eerste kerstdag']);
 assert.equal(overviewDay(s,day,[],{[day]:120},now).forecast,120);
 assert.equal(overviewDay(s,day,[],{},now).forecast,null);
});

test('een week begint op maandag en telt zeven dagen; de planning wordt niet gewijzigd',()=>{
 assert.equal(weekStart('2027-06-10'),'2027-06-07');assert.equal(weekStart('2027-06-13'),'2027-06-07');assert.equal(weekStart('2027-06-07'),'2027-06-07');
 assert.equal(addDays('2027-12-31',1),'2028-01-01');
 const s=state(),before=JSON.stringify(s),week=overviewRange(s,'2027-06-07',7,signups,{},now);
 assert.deepEqual(week.map(d=>d.date),['2027-06-07','2027-06-08','2027-06-09','2027-06-10','2027-06-11','2027-06-12','2027-06-13']);
 assert.equal(week.find(d=>d.date==='2027-06-11').sure,3);
 assert.equal(JSON.stringify(s),before);
});

test('elke regel zegt hoeveel en wat ze komen doen, met een status zoals in het ontwerp',()=>{
 const d=overviewDay(state(),day,signups,{},now),get=t=>d.items.find(i=>i.title===t);
 assert.equal(itemDetail(get('Kinderfeest Jansen')),'15 personen · Kinderfeest, 8 kinderen, pannenkoeken');
 assert.equal(itemDetail(get('Diner')),'2 tafels · 6 gasten');
 assert.equal(itemDetail(get('Lammetjesdag')),'7 aangemeld van 50 · Lammetjes knuffelen');
 assert.equal(itemDetail({...get('Familie de Vries'),people:1}),'1 persoon');
 assert.deepEqual(itemStatus(get('Familie de Vries')),{label:'Bevestigd',color:'green'});
 assert.deepEqual(itemStatus(get('Basisschool')),{label:'Optie tot 05-06',color:'orange'});
 assert.deepEqual(itemStatus(get('Vereniging')),{label:'Aanvraag',color:''});
 assert.deepEqual(itemStatus(get('Verlopen')),{label:'Optie verlopen',color:'red'});
 assert.deepEqual(itemStatus(get('Lammetjesdag')),{label:'Plek over',color:'orange'});
 assert.deepEqual(itemStatus({...get('Lammetjesdag'),people:50}),{label:'Vol',color:'red'});
 assert.equal(itemDetail({...get('Kinderfeest Jansen'),notes:'\n  Rondleiding stal\nTweede regel'}),'15 personen · Rondleiding stal');
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {emptyAvailability,validateAvailability,openStatus,yteMoments,publicAvailability} from '../lib/availability.ts';
// Times are given in UTC; in November Amsterdam is UTC+1. 2026-11-05 is a Thursday.
const at=s=>new Date(s);
const week=(h)=>[h,h,null,h,h,h,null];
const settings=(o={})=>validateAvailability({...emptyAvailability(),openingHours:week({open:'10:00',close:'17:00'}),yte:{weekdays:[4],times:['19:00'],capacityGuests:50,weeksAhead:3,closedDates:[]},...o});

test('zonder openingstijden is de status onbekend: de website toont dan geen lampje',()=>{
 assert.equal(openStatus(emptyAvailability(),at('2026-11-05T12:00:00Z')).state,'onbekend');
});
test('open en gesloten volgens de lokale tijd in Amsterdam, met het volgende openingsmoment',()=>{
 const a=settings();
 assert.deepEqual(openStatus(a,at('2026-11-05T09:30:00Z')),{state:'open',today:{open:'10:00',close:'17:00'},note:'',nextOpen:null});
 const early=openStatus(a,at('2026-11-05T08:00:00Z'));assert.equal(early.state,'gesloten');assert.deepEqual(early.nextOpen,{date:'2026-11-05',weekday:'donderdag',open:'10:00'});
 assert.equal(openStatus(a,at('2026-11-05T16:00:00Z')).state,'gesloten');// 17:00 local: just closed
 // Wednesday is closed; the next opening is Thursday.
 const wed=openStatus(a,at('2026-11-04T12:00:00Z'));assert.equal(wed.state,'gesloten');assert.equal(wed.nextOpen.weekday,'donderdag');
});
test('een gesloten dag gaat voor de gewone openingstijden en geeft de toelichting mee',()=>{
 const a=settings({closedDays:[{date:'2026-11-05',note:'Besloten feest'}]});
 const s=openStatus(a,at('2026-11-05T12:00:00Z'));
 assert.equal(s.state,'gesloten');assert.equal(s.note,'Besloten feest');assert.equal(s.nextOpen.date,'2026-11-06');
});
test('Ite by Boer Bart toont alleen boekbare dagen en tijden, vanaf nu tot het ingestelde aantal weken',()=>{
 const a=settings({yte:{weekdays:[4],times:['19:00'],capacityGuests:50,weeksAhead:3,closedDates:['2026-11-12']}});
 assert.deepEqual(yteMoments(a,at('2026-11-02T10:00:00Z')).map(m=>m.date+' '+m.time),['2026-11-05 19:00','2026-11-19 19:00']);
 // On the Thursday itself, after 19:00 the moment is gone.
 assert.deepEqual(yteMoments(a,at('2026-11-05T18:30:00Z')).map(m=>m.date),['2026-11-19']);
 assert.ok(yteMoments(a,at('2026-11-02T10:00:00Z')).every(m=>m.weekday==='donderdag'));
});
test('Ite by Boer Bart gaat niet door op een dag dat de boerderij gesloten is',()=>{
 const a=settings({closedDays:[{date:'2026-11-05',note:''}]});
 assert.equal(yteMoments(a,at('2026-11-02T10:00:00Z'))[0].date,'2026-11-12');
});
test('onjuiste invoer wordt geweigerd met een duidelijke melding',()=>{
 assert.throws(()=>validateAvailability({...emptyAvailability(),openingHours:[{open:'17:00',close:'10:00'},null,null,null,null,null,null]}),/na de openingstijd/);
 assert.throws(()=>validateAvailability({...emptyAvailability(),openingHours:[{open:'9u',close:'17:00'},null,null,null,null,null,null]}),/10:00/);
 assert.throws(()=>validateAvailability({...emptyAvailability(),yte:{...emptyAvailability().yte,weekdays:[8]}}),/weekdagen/);
 assert.throws(()=>validateAvailability({...emptyAvailability(),closedDays:[{date:'2026-02-30',note:''}]}),/geldige datum/);
});
test('het publieke overzicht bevat geen capaciteit en alleen komende gesloten dagen',()=>{
 const a=settings({closedDays:[{date:'2026-10-01',note:'oud'},{date:'2026-11-20',note:'Kerstmarkt'}]});
 const p=publicAvailability(a,at('2026-11-02T10:00:00Z'));
 assert.deepEqual(p.closedDays,[{date:'2026-11-20',note:'Kerstmarkt'}]);
 assert.ok(!JSON.stringify(p).includes('capacity'));
 assert.equal(p.openingHours[2].hours,null);
});
test('migratie 0009 zet Ite by Boer Bart volgens de planbordafspraak klaar en laat openingstijden leeg',()=>{
 const dir=new URL('../drizzle/',import.meta.url),db=new DatabaseSync(':memory:');
 for(const n of fs.readdirSync(dir).filter(n=>n.endsWith('.sql')).sort())db.exec(fs.readFileSync(new URL(n,dir),'utf8'));
 const row=db.prepare('SELECT * FROM availability_settings').get();
 const a=validateAvailability(JSON.parse(row.data));
 assert.equal(row.version,1);
 assert.deepEqual(a.yte,{weekdays:[4],times:['19:00'],capacityGuests:50,weeksAhead:8,closedDates:[]});
 assert.ok(a.openingHours.every(h=>h===null));
});

import {groupOccupancy,openDays,exampleContent,defaultBlocks} from '../lib/availability.ts';
test('oude opgeslagen instellingen krijgen drie lege tijdblokken: ochtend, middag, namiddag',()=>{
 const old={openingHours:[null,null,null,null,null,null,null],closedDays:[],yte:{weekdays:[4],times:['19:00'],capacityGuests:50,weeksAhead:8,closedDates:[]}};
 const a=validateAvailability(old);
 assert.deepEqual(a.visit.blocks.map(b=>[b.id,b.name,b.visitors,b.groups]),[['ochtend','Ochtend',null,null],['middag','Middag',null,null],['namiddag','Namiddag',null,null]]);
 assert.deepEqual(a.events,[]);assert.deepEqual(a.groups,[]);
});
test('tijdblokken: alleen blokken met een maximum zijn voor gasten zichtbaar, zonder de maxima zelf',()=>{
 const blocks=defaultBlocks();blocks[0]={...blocks[0],start:'10:00',end:'12:30',visitors:40,groups:30};blocks[2]={...blocks[2],groups:20};
 const a=settings({visit:{blocks,dayMaxVisitors:100,daysAhead:7}});
 const p=publicAvailability(a,at('2026-11-02T08:00:00Z'));
 assert.deepEqual(p.visit.blocks,[{id:'ochtend',name:'Ochtend',start:'10:00',end:'12:30'}]);
 assert.deepEqual(p.groups.blocks.map(b=>b.id),['ochtend','namiddag']);
 assert.deepEqual(p.visit.days,['2026-11-02','2026-11-03','2026-11-05','2026-11-06','2026-11-07']);// wo en zo dicht
 assert.ok(!/visitors|"groups"|dayMax/.test(JSON.stringify(p.visit)+JSON.stringify(p.groups.blocks)));
 assert.throws(()=>validateAvailability({...a,visit:{...a.visit,blocks:[{...blocks[0],start:'12:00',end:'10:00'}]}}),/einde na het begin/);
 assert.throws(()=>validateAvailability({...a,visit:{...a.visit,blocks:[{...blocks[0],visitors:-1}]}}),/0 tot en met 5000/);
});
test('agenda: komende evenementen op volgorde, voorbeelden gemarkeerd; oude evenementen niet op de website',()=>{
 const a=settings({events:[{id:'b',date:'2026-11-10',start:'14:00',end:'',title:'Later',description:'',example:false},{id:'a',date:'2026-11-05',start:'',end:'',title:'Eerst',description:'x',example:true},{id:'c',date:'2026-10-01',start:'',end:'',title:'Oud',description:'',example:false}]});
 assert.deepEqual(publicAvailability(a,at('2026-11-02T08:00:00Z')).events.map(e=>[e.title,e.example]),[['Eerst',true],['Later',false]]);
 assert.throws(()=>validateAvailability({...a,events:[{id:'x',date:'2026-11-05',start:'',end:'',title:'',description:'',example:false}]}),/titel/);
});
test('groepen: bezetting per dag en tijdblok tegen het maximum, opties tellen mee',()=>{
 const blocks=defaultBlocks();blocks[1]={...blocks[1],groups:30};
 const g=(id,guests,status='optie')=>({id,date:'2026-11-11',blockId:'middag',name:'Groep '+id,guests,status,note:'',example:false});
 const a=settings({visit:{blocks,dayMaxVisitors:null,daysAhead:28},groups:[g('a',20,'bevestigd'),g('b',14)]});
 assert.deepEqual(groupOccupancy(a),[{date:'2026-11-11',blockId:'middag',guests:34,limit:30,over:true}]);
 assert.throws(()=>validateAvailability({...a,groups:[{...g('c',5),blockId:'avond'}]}),/tijdblok/);
});
test('voorbeeldinhoud: vier evenementen en vier groepen in de komende weken, gemarkeerd als voorbeeld',()=>{
 const ex=exampleContent('2026-11-02',defaultBlocks());
 assert.equal(ex.events.length,4);assert.equal(ex.groups.length,4);
 assert.ok([...ex.events,...ex.groups].every(x=>x.example&&x.date>'2026-11-02'&&x.date<'2026-12-15'));
 assert.ok(validateAvailability({...emptyAvailability(),...ex}));
 assert.deepEqual(openDays(settings(),at('2026-11-02T08:00:00Z'),3),['2026-11-02','2026-11-03']);
});

test('website krijgt per onderdeel de echte stand: komende pauzes, afwijkende tijden en de Ite-eindtijd',()=>{
 const a=emptyAvailability();a.openingHours[6]={open:'10:00',close:'18:00'};a.yte={...a.yte,weekdays:[5],times:['19:00'],end:'22:00'};
 a.servicePauses={speelboerderij:{from:'2026-11-01',to:'2027-03-04'},winkel:{from:'2026-01-01',to:'2026-02-01'}};
 a.specialHours=[{date:'2026-10-01',open:'10:00',close:'12:00'},{date:'2026-12-24',open:'10:00',close:'14:00'}];
 const p=publicAvailability(a,at('2026-11-08T10:00:00Z'));
 assert.deepEqual(p.servicePauses,{speelboerderij:{from:'2026-11-01',to:'2027-03-04'}});
 assert.deepEqual(p.specialHours,[{date:'2026-12-24',open:'10:00',close:'14:00'}]);
 assert.equal(p.yte.end,'22:00');
 assert.equal(p.open.state,'gesloten');
});

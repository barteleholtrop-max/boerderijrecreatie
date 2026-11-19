import {test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/ts-resolve.mjs';
const {tableBoard,nextYteDate}=await import('../lib/yte-tables.ts');
const {openRequest}=await import('../lib/reserve-update.ts');
const {initialGuestState}=await import('../lib/guest-core.ts');

const res=(o)=>({id:o.id,name:o.name||o.id,email:'',phone:'',activity:'yte',date:'2026-11-05',from:'19:00',to:'22:00',people:4,sharing:false,status:'bevestigd',expires:'',notes:'',threadId:'',tables:[],...o});
const NOW=Date.parse('2026-11-03T12:00:00Z');

test('volgende Ite-avond volgt de weekdag van het eetmoment, vandaag telt mee',()=>{
 const s=initialGuestState();s.yteService.weekday=4; // donderdag
 assert.equal(nextYteDate(s,'2026-11-03'),'2026-11-05');assert.equal(nextYteDate(s,'2026-11-05'),'2026-11-05');
});
test('per tafel: bevestigd en geldige optie tellen, verlopen optie en aanvraag niet; gasten over tafels verdeeld',()=>{
 const s=initialGuestState();
 s.reservations=[
  res({id:'a',name:'Familie De Vries',people:6,tables:['1','2']}),
  res({id:'b',name:'Jansen',people:2,status:'optie',expires:'2026-11-04T22:59:00Z',tables:['3']}),
  res({id:'c',name:'Verlopen',people:2,status:'optie',expires:'2026-11-01T22:59:00Z',tables:['4']}),
  res({id:'d',name:'Alleen aanvraag',people:3,status:'aanvraag',tables:['5']}),
  res({id:'e',name:'Zonder tafel',people:5}),
  res({id:'f',name:'Andere dag',date:'2026-11-12',tables:['6']}),
  res({id:'g',name:'Groep overdag',activity:'groep',tables:['7']}),
 ];
 const b=tableBoard(s,'2026-11-05',NOW),t=id=>b.tiles.find(x=>x.id===id);
 assert.deepEqual([t('1').guests,t('2').guests],[4,2],'6 gasten: 4 aan tafel 1 (4 plaatsen), 2 aan tafel 2');
 assert.equal(t('3').entries[0].status,'optie');
 for(const id of ['4','5','6','7'])assert.equal(t(id).entries.length,0,'tafel '+id+' is vrij');
 assert.equal(b.guests,13);assert.deepEqual(b.unassigned.map(r=>r.id),['e']);
 assert.equal(b.freeTables,b.tiles.length-3);assert.equal(b.seats,64);
});
test('gedeelde tafel: twee gezelschappen met a/b',()=>{
 const s=initialGuestState();s.reservations=[res({id:'x1',name:'Een',people:2,sharing:true,tables:['9']}),res({id:'x2',name:'Twee',people:3,sharing:true,tables:['9']})];
 const t=tableBoard(s,'2026-11-05',NOW).tiles.find(x=>x.id==='9');
 assert.deepEqual(t.entries.map(e=>e.label),['9a','9b']);assert.equal(t.guests,5);
});
test('reserveren vanuit een gesprek werkt de open aanvraag of optie bij in plaats van een tweede te maken',()=>{
 const list=[res({id:'oud',threadId:'chat-1',status:'bevestigd'}),res({id:'open',threadId:'chat-1',status:'aanvraag'}),res({id:'ander',threadId:'chat-2',status:'optie'})];
 assert.equal(openRequest(list,'chat-1').id,'open');
 assert.equal(openRequest(list,'chat-3'),null);
 assert.equal(openRequest([res({id:'z',threadId:'chat-1',status:'geannuleerd'})],'chat-1'),null);
});

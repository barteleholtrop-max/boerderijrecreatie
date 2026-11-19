// Besluit eigenaar 18 november 2026: „Handmatig inboeken kan altijd, ongeacht openingstijden. Openingstijden zijn bedoeld voor online
// reserveringen die automatisch ingeboekt kunnen worden.” Voorbeeld: Mariejanne, 23 januari 2027 15:00–19:30, in de winterstop.
import './helpers/ts-resolve.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const G=await import('../lib/guest-core.ts');
const DAY='2030-01-23',NOW=Date.parse('2029-11-18T12:00:00Z');
function winter(){const s=G.initialGuestState();s.servicePauses={speelboerderij:{from:'2029-11-06',to:'2030-03-01'},winkel:null,yte:null};return s}
const r=(o={})=>G.reservationSchema.parse({id:'mj',name:'Mariejanne Brink',email:'',phone:'',activity:'groep',date:DAY,from:'15:00',to:'19:30',people:10,sharing:false,status:'optie',expires:'2029-11-25T23:00:00.000Z',notes:'',threadId:'',tables:[],...o});

test('online (niet handmatig): de gesloten periode houdt het tegen',()=>{
 assert.throws(()=>G.validateBooking(winter(),r(),NOW),/Dit onderdeel is uit van/);
});
test('handmatig: in de gesloten periode, buiten openingstijden, ook voor daggasten',()=>{
 const s=winter();
 const ok=G.validateBooking(s,r({manual:true}),NOW);assert.equal(ok.manual,true);assert.equal(ok.status,'optie');
 assert.equal(G.opening(s,DAY).open,false,'de dag gaat niet open voor online reserveringen');
 assert.ok(G.validateBooking(s,r({manual:true,id:'dag',activity:'bezoek',from:'20:00',to:'23:00'}),NOW));
});
test('handmatig: wel nog een geldige datum en geen dubbele groep (de vervaldatum controleert de route)',()=>{
 const s=winter();
 assert.throws(()=>G.validateBooking(s,r({manual:true,date:'2029-11-17'}),NOW),/vanaf vandaag/);
 s.reservations.push(G.validateBooking(s,r({manual:true}),NOW));
 assert.throws(()=>G.validateBooking(s,r({manual:true,id:'ander',name:'Ander'}),NOW),/al een groep/);
});
test('de backoffice boekt handmatig; openbare routes niet',()=>{
 const api=fs.readFileSync(new URL('../app/api/gasten/route.ts',import.meta.url),'utf8');
 assert.match(api,/validateBooking\(s,\{\.\.\.r,manual:true,/);assert.match(api,/\.\.\.\(card\?\{customerId:card\.id\}:\{\}\),manual:true\}\)/);
 for(const f of fs.readdirSync(new URL('../app/api/public/',import.meta.url),{recursive:true}).filter(f=>String(f).endsWith('.ts')))
  assert.doesNotMatch(fs.readFileSync(new URL('../app/api/public/'+f,import.meta.url),'utf8'),/manual:true/,f+' boekt nooit handmatig');
});

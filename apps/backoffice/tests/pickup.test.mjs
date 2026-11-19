// Afhaalmoment bij vooraf bestellen in de winkel (3 november 2026).
import './helpers/ts-resolve.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const P=await import('../lib/pickup-core.ts');
const {parseGuestOrder}=await import('../lib/public-orders.ts');
// do t/m zo open 10:00–18:00 (zondag = 0); ma–wo dicht.
const hours=Array.from({length:7},(_,i)=>({open:i===0||i>=4,from:'10:00',to:'18:00'}));
const s={hours,exceptions:[{date:'2026-11-07',hours:{open:false,from:'',to:''},note:'Gesloten'}]};
test('momenten per half uur binnen de openingstijden, vandaag pas over een uur, gesloten dagen niet',()=>{
 // donderdag 5 november 2026, 13:10 in Nederland (12:10 UTC)
 const days=P.pickupSlots(s,new Date('2026-11-05T12:10:00Z'),7);
 assert.deepEqual(days.map(d=>d.date),['2026-11-05','2026-11-06','2026-11-08'],'za 7 nov gesloten, ma–wo dicht');
 assert.equal(days[0].times[0],'14:30','vandaag pas vanaf een uur na nu, op het halve uur');
 assert.equal(days[0].times.at(-1),'17:30','laatste moment een half uur voor sluiten');
 assert.equal(days[1].times[0],'10:00');assert.equal(days[1].times.length,16);
});
test('controle: alleen bestaande momenten, met naam; alleen bij de winkel',()=>{
 const now=new Date('2026-11-05T12:10:00Z');
 assert.equal(P.pickupProblem({date:'2026-11-06',time:'10:30',name:'Jansen'},s,now),null);
 assert.match(P.pickupProblem({date:'2026-11-05',time:'13:30',name:'Jansen'},s,now),/niet \(meer\) beschikbaar/);
 assert.match(P.pickupProblem({date:'2026-11-07',time:'10:30',name:'Jansen'},s,now),/niet \(meer\) beschikbaar/);
 assert.throws(()=>P.parsePickup({date:'2026-11-06',time:'10:30',name:'J'}),/naam/);
 assert.deepEqual(P.parsePickup({date:'2026-11-06',time:'10:30',name:'  Piet   Jansen '}),{date:'2026-11-06',time:'10:30',name:'Piet Jansen'});
 const base={requestId:'0d6f9c1e-6a2b-4c4f-9f2e-1a2b3c4d5e6f',lines:[{productId:'p',version:1,quantity:1}]};
 assert.equal(parseGuestOrder({...base,route:'winkel',pickup:{date:'2026-11-06',time:'10:30',name:'Jansen'}}).pickup.name,'Jansen');
 assert.equal(parseGuestOrder({...base,route:'winkel'}).pickup,null);
 assert.throws(()=>parseGuestOrder({...base,route:'eten-drinken',pickup:{date:'2026-11-06',time:'10:30',name:'Jansen'}}),/alleen bij winkelbestellingen/);
 assert.equal(P.pickupLabel({date:'2026-11-06',time:'10:30'}),'vr 6 nov om 10:30');
});

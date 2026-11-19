import {test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/ts-resolve.mjs';
const {guessBooking}=await import('../lib/booking-guess.ts');
const today='2026-11-03';

test('herkent datum, tijden en aantal uit gewone Nederlandse mails en adviezen',()=>{
 assert.deepEqual(guessBooking(['Familiefeest 40-jarig huwelijk, zaterdag 17 april 2027, 14.00–18.00 uur, 25 volwassenen en 12 kinderen'],today),{date:'2027-04-17',from:'14:00',to:'18:00',people:37});
 assert.deepEqual(guessBooking(['We komen op 5 december van 10:30 tot 12:00 met 18 personen.'],today),{date:'2026-12-05',from:'10:30',to:'12:00',people:18});
 assert.deepEqual(guessBooking(['Graag op 17-4-2027, 14 tot 18 uur. We zijn een groep van 40.'],today),{date:'2027-04-17',from:'14:00',to:'18:00',people:40});
 assert.equal(guessBooking(['Kan het op 12 jan?'],today).date,'2027-01-12','zonder jaartal: de eerstvolgende');
 assert.equal(guessBooking(['Op 2027-06-14 met 30 collega\'s'],today).people,30);
});

test('de eerste duidelijke tekst gaat voor; de rest vult aan',()=>{
 const g=guessBooking(['Advies: zaterdag 17 april 2027, 14.00–18.00 uur',undefined,'Wij zijn met 37 personen. Eerder dachten we aan 3 mei.'],today);
 assert.deepEqual(g,{date:'2027-04-17',from:'14:00',to:'18:00',people:37});
});

test('onduidelijk blijft leeg: verleden, onmogelijke data, leeftijden en bedragen worden geen tijd of datum',()=>{
 assert.deepEqual(guessBooking(['Vorig jaar op 3 mei 2025 was het gezellig.'],today),{});
 assert.equal(guessBooking(['Op 31 februari 2027?'],today).date,undefined);
 assert.equal(guessBooking(['Kinderen van 2–11 jaar en een budget van 15-20 euro p.p.'],today).from,undefined);
 assert.equal(guessBooking(['Om 18.00–14.00?'],today).from,undefined,'eindtijd vóór begintijd');
 assert.deepEqual(guessBooking(['',null,'Hallo, wat kost een uitje?'],today),{});
});

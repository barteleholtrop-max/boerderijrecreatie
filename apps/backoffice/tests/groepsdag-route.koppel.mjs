// Koppeltest groepsdag en uitzondering via de echte route Planning (/api/gasten) en de database (PGlite).
// Draait met `npm run test:groepsdag` (de route heeft --experimental-transform-types nodig; daarom niet in `npm test`).
import './helpers/ts-resolve.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const G=await import('../lib/guest-core.ts');
const DAY='2030-11-24';

test('in de database, via de echte route Planning: uitzondering, groepsdag, bevestigen; daggasten blijven geweigerd',async t=>{
 const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'bb-groepsdag-'));process.env.APP_DATA_DIR=tmp;
 const {closeDatabase}=await import('../lib/portable/env.ts');t.after(async()=>{process.env.APP_DATA_DIR=tmp;await closeDatabase();fs.rmSync(tmp,{recursive:true,force:true})});
 const {loadGuest,saveGuest}=await import('../lib/guest-store.ts'),S=await import('../lib/hulp-store.ts');
 let {version,state}=await loadGuest();
 state.servicePauses={speelboerderij:{from:'2030-11-06',to:'2031-03-01'},winkel:null,yte:null};
 await saveGuest(version,state,crypto.randomUUID());
 await S.startHulpThread('gesprek-erna1','Sanne','/planning','Zet Erna in de agenda');
 const ctx=await S.hulpContext(await S.hulpThread('gesprek-erna1','Sanne'));
 const act=(type,input)=>ctx.propose({type,input,title:type,details:[]});
 assert.equal((await act('klant_aanmaken',{name:'Erna',email:'erna@example.nl',phone:'',company:'',address:'',notes:''})).status,'uitgevoerd');
 const klant=(await loadGuest()).state.customers.find(c=>c.name==='Erna');assert.ok(klant);
 const boeking={customerId:klant.id,name:'Erna',email:'erna@example.nl',phone:'',activity:'groep',date:DAY,from:'14:00',to:'17:00',people:20,expiresDay:'2030-11-20',notes:'Koffie/thee met taart, daarna borrel'};
 const geweigerd=await act('optie_zetten',{...boeking,status:'optie'});
 assert.equal(geweigerd.status,'mislukt');assert.match(geweigerd.result,/Dit onderdeel is uit/);
 const optie=await act('optie_zetten',{...boeking,status:'optie',exception:'Toegezegd door Sanne'});
 assert.equal(optie.status,'uitgevoerd',optie.result);
 let s=(await loadGuest()).state,r=s.reservations.find(x=>x.name==='Erna'&&x.status==='optie');
 assert.equal(r.exception,'Toegezegd door Sanne');
 const bevestigd=await act('boeking_bevestigen',{reservationId:r.id,note:'Erna akkoord'});
 assert.equal(bevestigd.status,'uitgevoerd',bevestigd.result);
 s=(await loadGuest()).state;r=s.reservations.find(x=>x.id===r.id);
 assert.equal(r.status,'bevestigd');assert.equal(r.exception,'Toegezegd door Sanne','de uitzondering blijft bij het bevestigen');
 assert.equal((await act('groepsdag_instellen',{date:DAY,from:'13:00',to:'18:00',note:'Besloten groep Erna'})).status,'uitgevoerd');
 s=(await loadGuest()).state;assert.equal(s.groupDays[0].note,'Besloten groep Erna');
 assert.deepEqual(s.servicePauses.speelboerderij,{from:'2030-11-06',to:'2031-03-01'},'de gesloten periode blijft gelijk');
 assert.equal(G.opening(s,DAY).open,false,'dicht voor daggasten');
 const dag=await act('optie_zetten',{...boeking,activity:'bezoek',name:'Daggast',status:'optie'});
 assert.equal(dag.status,'mislukt');assert.match(dag.result,/Dit onderdeel is uit/);
 // Voorrang (wens eigenaar 13 november 2026): op verzoek toch ingeboekt, ook 's avonds buiten de openingstijden.
 const voorrang=await act('optie_zetten',{...boeking,name:'Avondfeest',from:'19:00',to:'23:00',status:'bevestigd',exception:'Op verzoek ingeboekt via de assistent',override:true});
 assert.equal(voorrang.status,'uitgevoerd',voorrang.result);assert.match(voorrang.result,/voorrang/);
 s=(await loadGuest()).state;const av=s.reservations.find(x=>x.name==='Avondfeest');
 assert.equal(av.status,'bevestigd');assert.equal(av.override,true);assert.equal(G.opening(s,DAY).open,false,'daggasten blijven dicht');
});

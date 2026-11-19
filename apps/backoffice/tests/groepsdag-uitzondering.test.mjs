// Wens administratie (13 november 2026): afspraken met een besloten groep moeten in de agenda kunnen, ook als het onderdeel
// uit staat (winterperiode), zonder dat de dag opengaat voor daggasten. Voorbeeld: Erna, zondag, 14:00–17:00, koffie/taart en borrel.
import './helpers/ts-resolve.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const G=await import('../lib/guest-core.ts');
const {overviewDay}=await import('../lib/guest-overview.ts');
const {runTool}=await import('../lib/hulp-tools.ts');
const {executeAction}=await import('../lib/hulp-actions.ts');

const DAY='2030-11-24'; // een zondag ver vooruit, binnen de winterstop
function winter(extra={}){
 const s=G.initialGuestState();
 s.servicePauses={speelboerderij:{from:'2030-11-06',to:'2031-03-01'},winkel:null,yte:null};
 return Object.assign(s,extra);
}
const groep=(o={})=>G.reservationSchema.parse({id:'r-erna',name:'Erna',email:'',phone:'',activity:'groep',date:DAY,from:'14:00',to:'17:00',people:20,sharing:false,status:'bevestigd',expires:'',notes:'Koffie/thee met taart, daarna borrel met borrelplank',threadId:'',tables:[],...o});

test('zonder uitzondering blijft een groep geweigerd als het onderdeel uit staat',()=>{
 assert.throws(()=>G.validateBooking(winter(),groep()),/Dit onderdeel is uit van 2030-11-06 tot en met 2031-03-01/);
});

test('een besloten groep met een reden past; daggasten blijven dicht',()=>{
 const s=winter(),r=G.validateBooking(s,groep({exception:'Toegezegd door Sanne'}));
 assert.equal(r.exception,'Toegezegd door Sanne');
 assert.equal(G.opening(s,DAY).open,false,'de dag gaat niet open');
 assert.throws(()=>G.validateBooking(s,groep({activity:'bezoek',id:'dag'})),/Dit onderdeel is uit/);
 assert.throws(()=>G.validateBooking(s,groep({activity:'bezoek',id:'dag2',exception:'zonder voorrang'})),/Dit onderdeel is uit/,'zonder voorrang geldt een reden alleen voor groepen');
});

test('ook een uitzondering wordt gecontroleerd op overlap en capaciteit',()=>{
 const s=winter();s.reservations.push(G.validateBooking(s,groep({exception:'Erna'})));
 assert.throws(()=>G.validateBooking(s,groep({id:'r-2',name:'Jansen',from:'16:00',to:'18:00',exception:'ook toegezegd'})),/al een groep \(Erna, 14:00–17:00\)/);
 assert.ok(G.validateBooking(s,groep({id:'r-3',name:'Jansen',from:'17:00',to:'19:00',exception:'na Erna'})));
 const vol=winter({capacity:{bezoek:0,groep:30}});vol.reservations.push(G.validateBooking(vol,groep({exception:'Erna'})));
 assert.throws(()=>G.validateBooking(vol,groep({id:'r-4',name:'Groot',people:15,exception:'x'})),/capaciteit voor groepen/);
 assert.throws(()=>G.validateBooking(winter(),groep({date:'2020-01-05',exception:'oud'})),/toekomstige datum/);
});

test('groepsdag: groepen binnen de tijden op één datum, daggasten en de rest van de periode blijven dicht',()=>{
 const s=winter({groupDays:[G.groupDaySchema.parse({date:DAY,from:'13:00',to:'18:00',note:'Besloten groep Erna'})]});
 assert.ok(G.validateBooking(s,groep()));
 assert.throws(()=>G.validateBooking(s,groep({from:'12:00'})),/groepen welkom van 13:00 tot 18:00/);
 assert.throws(()=>G.validateBooking(s,groep({activity:'bezoek'})),/Dit onderdeel is uit/);
 assert.throws(()=>G.validateBooking(s,groep({date:'2030-12-01'})),/Dit onderdeel is uit/,'een andere dag in de periode blijft dicht');
 assert.equal(G.opening(s,DAY).open,false);
 assert.throws(()=>G.groupDaySchema.parse({date:DAY,from:'13:00',to:'18:00',note:''}),/waarom/);
});

test('in de agenda: de uitzondering en de groepsdag staan er met de reden bij',()=>{
 const s=winter({groupDays:[{date:DAY,from:'13:00',to:'18:00',note:'Besloten groep Erna'}]});
 s.reservations.push(G.validateBooking(s,groep({exception:'Toegezegd door Sanne'})));
 const d=overviewDay(s,DAY);
 assert.equal(d.open,false);assert.match(d.note,/Groepsdag 13:00–18:00 \(dicht voor daggasten\): Besloten groep Erna/);
 assert.equal(d.items[0].exception,'Toegezegd door Sanne');assert.match(d.items[0].notes,/^Uitzondering: Toegezegd door Sanne\nKoffie/);
});

test('assistent: optie of boeking met uitzondering, groepsdag en bevestigen',async()=>{
 const proposed=[],checks=[];
 const ctx={today:'2026-11-13',customers:async()=>[{id:'k-erna',name:'Erna',email:'erna@example.nl',phone:'',company:'',address:'',notes:'',bookings:0,conversations:0}],
  checkOption:async o=>{checks.push(o);return o.exception?null:'Dit onderdeel is uit van 2026-11-06 tot en met 2027-03-01. Kies een andere datum.'},
  propose:async a=>{proposed.push(a);return {id:'a'+proposed.length,status:'uitgevoerd',result:'ok'}}};
 const o={klant_id:'k-erna',datum:'2026-11-22',van:'14:00',tot:'17:00',soort:'groep',soort_evenement:'koffie met taart en borrel',aantal_gasten:20,geldig_tot:'2026-11-22',notitie:'',status:'bevestigd'};
 const met=await runTool('optie_zetten',{...o,uitzondering_reden:'Toegezegd door Sanne'},ctx);
 assert.equal(met.isError,false);assert.equal(checks.at(-1).status,'bevestigd');
 assert.equal(proposed[0].input.status,'bevestigd');assert.equal(proposed[0].input.exception,'Toegezegd door Sanne');assert.equal(proposed[0].input.override,true);
 const v=JSON.parse(met.content);assert.match(v.buiten_de_gewone_regels,/Dit onderdeel is uit/);assert.match(v.vervolgvragen,/ledenplanning/);
 assert.ok((await runTool('groepsdag_instellen',{datum:'2026-11-22',van:'13:00',tot:'18:00',notitie:'Besloten groep Erna'},ctx)).content.includes('uitgevoerd'));

 const posts=[],r={id:'r1',name:'Erna',status:'optie',expires:'2026-11-20T22:00:00.000Z',notes:'borrel',rev:2};
 const d={post:async(route,body)=>{posts.push(body);return {ok:true,status:200,data:{ok:true}}},guest:async()=>({version:5,hours:[],exceptions:[],reservations:[r]}),uuid:()=>'00000000-0000-4000-8000-000000000000'};
 assert.match(await executeAction({type:'optie_zetten',input:{customerId:'k-erna',name:'Erna',email:'',phone:'',activity:'groep',date:'2026-11-22',from:'14:00',to:'17:00',people:20,expiresDay:'2026-11-22',notes:'',status:'bevestigd',exception:'Toegezegd door Sanne'}},d),/uitzondering/);
 assert.equal(posts[0].reservation.status,'bevestigd');assert.equal(posts[0].reservation.exception,'Toegezegd door Sanne');assert.equal(posts[0].reservation.expires,'');
 await executeAction({type:'groepsdag_instellen',input:{date:'2026-11-22',from:'13:00',to:'18:00',note:'Besloten groep Erna'}},d);
 assert.deepEqual(posts[1].groupDay,{date:'2026-11-22',from:'13:00',to:'18:00',note:'Besloten groep Erna'});assert.equal(posts[1].action,'group-day');
 await executeAction({type:'boeking_bevestigen',input:{reservationId:'r1',note:'Erna heeft gemaild'}},d);
 assert.equal(posts[2].reservation.status,'bevestigd');assert.equal(posts[2].reservation.rev,2,'versiecontrole zoals de knop');assert.match(posts[2].reservation.notes,/borrel\nBevestigd: Erna heeft gemaild/);
 await assert.rejects(executeAction({type:'boeking_bevestigen',input:{reservationId:'weg',note:''}},d),/bestaat niet/);
});


test('voorrang (wens eigenaar 13 november 2026): inboeken mag altijd, ook buiten openingstijden of boven de capaciteit',async()=>{
 const s=winter({capacity:{bezoek:0,groep:10}});
 // Buiten de winterstop en buiten de openingstijden (zondag 10:00–18:00), en boven de capaciteit.
 const laat=groep({date:'2030-10-27',from:'19:00',to:'23:00',people:40});
 assert.match(G.bookingProblem(s,laat),/openingstijden/);
 assert.throws(()=>G.validateBooking(s,{...laat,override:true}),/openingstijden/,'zonder reden geen voorrang');
 assert.throws(()=>G.reservationSchema.parse({...laat,override:true}),/reden/);
 const ok=G.validateBooking(s,{...laat,exception:'Toegezegd door Jan',override:true});
 assert.equal(ok.override,true);s.reservations.push(ok);
 // Ook daggasten op verzoek, en een tweede groep tegelijk: het mag, de regel komt terug als waarschuwing.
 const dag={...groep({id:'d1',activity:'bezoek',date:DAY,people:6}),exception:'Familie van Sanne',override:true};
 assert.ok(G.validateBooking(s,dag));assert.match(G.bookingProblem(s,dag),/Dit onderdeel is uit/);
 assert.ok(G.validateBooking(s,{...laat,id:'r9',exception:'nog een',override:true}));
 assert.equal(G.opening(s,DAY).open,false,'de openingstijden voor daggasten veranderen niet');
 assert.throws(()=>G.validateBooking(s,{...laat,date:'2020-01-01',exception:'x',override:true}),/vanaf vandaag/);
 assert.throws(()=>G.reservationSchema.parse({...laat,activity:'yte',exception:'x'}),/Ite/);

 // Assistent: past het niet, dan toch inboeken met voorrang; zonder probleem geen voorrang.
 const proposed=[];
 const ctx={today:'2026-11-13',customers:async()=>[{id:'k1',name:'Jansen',email:'',phone:'',company:'',address:'',notes:'',bookings:0,conversations:0}],
  checkOption:async o=>o.from>='19:00'?'Deze aanvraag past niet binnen de openingstijden.':null,
  propose:async a=>{proposed.push(a);return {id:'a'+proposed.length,status:'uitgevoerd',result:'ok'}}};
 const o={klant_id:'k1',datum:'2026-11-28',van:'19:00',tot:'23:00',soort:'groep',soort_evenement:'bedrijfsfeest',aantal_gasten:40,geldig_tot:'2026-11-20',notitie:'',status:'optie',uitzondering_reden:''};
 const r=JSON.parse((await runTool('optie_zetten',o,ctx)).content);
 assert.equal(r.uitgevoerd,true);assert.match(r.buiten_de_gewone_regels,/openingstijden/);
 assert.equal(proposed[0].input.override,true);assert.equal(proposed[0].input.exception,'Op verzoek ingeboekt via de assistent');
 const gewoon=JSON.parse((await runTool('optie_zetten',{...o,van:'14:00',tot:'17:00'},ctx)).content);
 assert.equal(gewoon.buiten_de_gewone_regels,undefined);assert.equal(proposed[1].input.override,false);assert.equal(proposed[1].input.exception,'');
 assert.match(gewoon.vervolgvragen,/rol in de ledenplanning|ledenplanning/);
 // Uitvoering: voorrang gaat mee naar de route.
 const posts=[],d={post:async(route,body)=>{posts.push(body);return {ok:true,status:200,data:{ok:true}}},guest:async()=>({version:1,hours:[],exceptions:[],reservations:[]}),uuid:()=>'00000000-0000-4000-8000-000000000000'};
 assert.match(await executeAction({type:'optie_zetten',input:proposed[0].input},d),/voorrang/);
 assert.equal(posts[0].reservation.override,true);assert.equal(posts[0].reservation.exception,'Op verzoek ingeboekt via de assistent');
 await executeAction({type:'optie_zetten',input:proposed[1].input},d);assert.equal(posts[1].reservation.override,undefined);
});

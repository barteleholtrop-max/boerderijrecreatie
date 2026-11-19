// Backoffice-assistent bij Gasten (wens eigenaar 9 november 2026): klanten zoeken en aanmaken, klantgesprek inplannen, optie zetten,
// agenda bekijken. Alles klaarzetten; de beheerder klikt zelf op Uitvoeren. Nooit offertes, bevestigingen, aanbetalingen, facturen of prijzen.
import './helpers/ts-resolve.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const {runTool}=await import('../lib/hulp-tools.ts');
const {executeAction}=await import('../lib/hulp-actions.ts');
const {desiredItems}=await import('../lib/calendar-core.ts');
const {agendaDay}=await import('../lib/week-agenda.ts');
const {overviewDay}=await import('../lib/guest-overview.ts');
const {initialGuestState}=await import('../lib/guest-core.ts');

const customers=[{id:'k1',name:'Familie Jansen',email:'jansen@example.nl',phone:'06-12345678',company:'',address:'',notes:'',bookings:1,conversations:2}];
function context(over={}){
 const proposed=[];
 return {proposed,ctx:{today:'2026-11-09',customers:async()=>customers,
  agenda:async(from)=>[{dag:from,open:true,openingstijden:'10:00–18:00',notitie:'',feestdagen:[],boekingen:[],afspraken:[{van:'10:00',tot:'11:00',onderwerp:'Rondleiding',klant:''}],evenementen:[],dagdelen:[]}],
  checkOption:async()=>null,propose:async a=>{proposed.push(a);return {id:'a'+proposed.length}},...over}};
}
const run=(name,input,ctx)=>runTool(name,input,ctx);

test('klant zoeken op naam, e-mail of telefoon',async()=>{
 const {ctx}=context();
 assert.equal(JSON.parse((await run('klanten_zoeken',{zoekterm:'jansen'},ctx)).content).aantal_gevonden,1);
 assert.equal(JSON.parse((await run('klanten_zoeken',{zoekterm:'0612345678'},ctx)).content).klanten[0].klant_id,'k1');
});
test('geen dubbele klantenkaart: op e-mail, telefoon of naam',async()=>{
 const {ctx,proposed}=context();
 const base={naam:'Nieuw',email:'',telefoon:'',adres:'',bedrijf:'',notitie:''};
 for(const v of [{email:'JANSEN@example.nl'},{telefoon:'0612345678'},{naam:'familie jansen'}]){const r=await run('klant_aanmaken',{...base,...v},ctx);assert.equal(r.isError,true);assert.match(r.content,/klant_id k1/)}
 const ok=await run('klant_aanmaken',{...base,naam:'Sportclub De Hoek',email:'info@dehoek.nl'},ctx);
 assert.equal(ok.isError,false);assert.equal(proposed.length,1);assert.equal(proposed[0].type,'klant_aanmaken');
});
test('klantgesprek: duur wordt eindtijd, overlap wordt gemeld, niet in het verleden',async()=>{
 const {ctx,proposed}=context();
 const r=await run('klantgesprek_inplannen',{datum:'2026-11-12',van:'10:30',duur_minuten:45,klant_id:'k1',onderwerp:'Kennismakingsgesprek',notitie:''},ctx);
 assert.equal(r.isError,false);assert.equal(proposed[0].input.to,'11:15');assert.equal(proposed[0].input.customerName,'Familie Jansen');
 assert.ok(proposed[0].details.some(d=>/tegelijk met Rondleiding/.test(d)));
 assert.equal((await run('klantgesprek_inplannen',{datum:'2026-11-01',van:'10:00',duur_minuten:30,klant_id:'',onderwerp:'x',notitie:''},ctx)).isError,true);
 assert.equal((await run('klantgesprek_inplannen',{datum:'2026-11-12',van:'23:50',duur_minuten:30,klant_id:'',onderwerp:'x',notitie:''},ctx)).isError,true);
});
test('optie: altijd bij een klant, past in de planning, vervalt uiterlijk op de dag zelf',async()=>{
 const o={klant_id:'k1',datum:'2026-11-21',van:'14:00',tot:'17:00',soort:'groep',soort_evenement:'kinderfeest',aantal_gasten:null,geldig_tot:'2026-11-16',notitie:''};
 const {ctx,proposed}=context();
 assert.equal((await run('optie_zetten',{...o,klant_id:'onbekend'},ctx)).isError,true);
 assert.equal((await run('optie_zetten',{...o,geldig_tot:'2026-11-22'},ctx)).isError,true);
 const r=await run('optie_zetten',o,ctx);assert.equal(r.isError,false);
 assert.equal(proposed[0].input.people,1);assert.match(proposed[0].input.notes,/kinderfeest\nAantal gasten nog onbekend/);
 assert.ok(proposed[0].details.includes('optie geldig tot en met maandag 16 november 2026'));assert.ok(proposed[0].details.includes('Geen offerte en geen factuur.'));assert.equal(proposed[0].input.status,'optie');
 const full=context({checkOption:async()=>'Er is onvoldoende capaciteit.'});
 assert.match((await run('optie_zetten',o,full.ctx)).content,/onvoldoende capaciteit/);
});
test('uitvoeren: klantenkaart, afspraak en optie via de route gasten; een optie is nooit bevestigd',async()=>{
 const posts=[],d={post:async(route,body)=>{posts.push({route,body});return {ok:true,status:200,data:{ok:true}}},guest:async()=>({version:9,hours:[],exceptions:[]}),uuid:()=>'00000000-0000-4000-8000-000000000000'};
 await executeAction({type:'klant_aanmaken',input:{name:'Sportclub',email:'info@dehoek.nl',phone:'',address:'',company:'De Hoek',notes:''}},d);
 await executeAction({type:'klantgesprek_inplannen',input:{date:'2026-11-12',from:'10:30',to:'11:15',subject:'Kennismaking',customerId:'k1',customerName:'Familie Jansen',notes:''}},d);
 await executeAction({type:'optie_zetten',input:{customerId:'k1',name:'Familie Jansen',email:'jansen@example.nl',phone:'',activity:'groep',date:'2026-11-21',from:'14:00',to:'17:00',people:1,expiresDay:'2026-11-16',notes:'kinderfeest'}},d);
 assert.deepEqual(posts.map(p=>[p.route,p.body.action]),[['gasten','customer'],['gasten','appointment'],['gasten','reservation']]);
 assert.equal(posts[2].body.reservation.status,'optie');assert.equal(posts[2].body.reservation.expires,'2026-11-16T22:00:00.000Z');assert.equal(posts[2].body.reservation.customerId,'k1');
 assert.ok(posts.every(p=>p.body.version===9&&p.body.requestId));
});
test('een afspraak staat in de weekagenda en in de Klanten-agenda, en houdt geen plaats vast',()=>{
 const s={...initialGuestState(),appointments:[{id:'a1',date:'2026-11-12',from:'10:30',to:'11:15',subject:'Kennismaking',customerId:'k1',customerName:'Familie Jansen',notes:'bruiloft',created:'',createdBy:''}]};
 const day=agendaDay(s,overviewDay(s,'2026-11-12'));
 assert.deepEqual(day.blocks.map(b=>[b.kind,b.from,b.to,b.appointmentId]),[['afspraak','10:30','11:15','a1']]);
 assert.equal(overviewDay(s,'2026-11-12').possible,0,'telt niet mee als gasten');
 const items=desiredItems(s,'klanten','2026-11-09');
 assert.deepEqual(items.map(i=>[i.ref,i.body.summary]),[['afspraak:a1','Afspraak · Kennismaking · Familie Jansen']]);
});

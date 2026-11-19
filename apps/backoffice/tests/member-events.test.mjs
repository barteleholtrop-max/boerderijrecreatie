import './helpers/ts-resolve.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// Evenementen van leden (besluit eigenaar 8 november 2026): aanvragen door een lid, goedkeuren door de coördinator (nu Rianne),
// daarna vanzelf in de agenda, diensten in het rooster met een hulpvraag, en een marketingconcept. Koffie: de gast betaalt zelf
// (restaurantpot), of de organisator betaalt een voorgesteld bedrag waar hij eerst akkoord op geeft.
const C=await import('../lib/member-events-core.ts');
const add=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const base=(today,o={})=>({title:'Avond over zingeving',description:'Een avond met verhalen en gesprek bij de kachel.',date:add(today,20),from:'19:30',to:'21:30',place:'de schuur',capacity:'25',price:'12,50',coffee:'gast',vatKind:'cultuur',roles:[{roleId:'barista',count:1}],...o});

test('regels: aanvraag controleren, met duidelijke meldingen',()=>{
 const today='2026-11-08',r=C.parseRequest(base(today),today,['barista','bediening'],2000);
 assert.equal(r.priceCents,1250);assert.equal(r.capacity,25);assert.deepEqual(r.roles,[{roleId:'barista',count:1}]);assert.equal(r.shareSeenBp,2000);
 assert.throws(()=>C.parseRequest(base(today,{date:today}),today,['barista'],2000),/datum in de toekomst/);
 assert.throws(()=>C.parseRequest(base(today,{to:'19:00'}),today,['barista'],2000),/einde na het begin/);
 assert.throws(()=>C.parseRequest(base(today,{coffee:''}),today,['barista'],2000),/koffie/);
 assert.throws(()=>C.parseRequest(base(today,{roles:[{roleId:'kok',count:1}]}),today,['barista'],2000),/rollen uit de lijst/);
 assert.throws(()=>C.parseRequest(base(today,{price:'veel'}),today,['barista'],2000),/prijs per persoon/);
 assert.equal(C.parseRequest(base(today,{capacity:'',price:'',roles:[{roleId:'barista',count:0}]}),today,['barista'],2000).capacity,null,'leeg = geen maximum');
 assert.deepEqual(C.parseRequest(base(today,{roles:[{roleId:'barista',count:0}]}),today,['barista'],2000).roles,[],'0 mensen = geen rol');
 // Btw (besluit eigenaar 9 november 2026): bij een betaald evenement kiest de organisator het soort; gratis mag zonder keuze.
 assert.equal(r.vatKind,'cultuur');
 assert.throws(()=>C.parseRequest(base(today,{vatKind:undefined}),today,['barista'],2000),/wat voor evenement/);
 assert.throws(()=>C.parseRequest(base(today,{vatKind:'laag'}),today,['barista'],2000),/wat voor evenement/);
 assert.equal(C.parseRequest(base(today,{vatKind:undefined,price:''}),today,['barista'],2000).vatKind,'workshop');
});

test('regels: koffie door de organisator vraagt een bedrag en akkoord; percentage nooit stilzwijgend 0',()=>{
 const today='2026-11-08',gast=C.parseRequest(base(today),today,['barista'],2000),org=C.parseRequest(base(today,{coffee:'organisator'}),today,['barista'],2000);
 assert.deepEqual(C.needsAcceptance(gast,C.parseTerms({},gast,today)),[],'zelfde datum en deel, gast betaalt: direct goedkeuren');
 assert.throws(()=>C.parseTerms({},org,today),/stel een bedrag voor/);
 const t=C.parseTerms({coffee:'40,00'},org,today);assert.equal(t.coffeeCents,4000);assert.deepEqual(C.needsAcceptance(org,t),['koffiebedrag']);
 assert.deepEqual(C.needsAcceptance(gast,C.parseTerms({farmSharePercent:'25',date:add(today,21)},gast,today)),['andere datum of tijd','andere verdeling']);
 assert.throws(()=>C.parseTerms({farmSharePercent:''},gast,today),/percentage/);
 // Btw: het tarief volgt het soort; de coördinator kan het aanpassen (dan eerst akkoord), en vrijgesteld moet zij bevestigen.
 assert.equal(C.parseTerms({},gast,today).vatBp,900);
 assert.deepEqual(C.needsAcceptance(gast,C.parseTerms({vatBp:2100},gast,today)),['ander btw-tarief']);
 assert.throws(()=>C.parseTerms({vatBp:600},gast,today),/0%, 9% of 21%/);
 assert.throws(()=>C.parseTerms({vatBp:0},gast,today),/echt vrijgesteld/);
 const vrij=C.parseRequest(base(today,{vatKind:'vrijgesteld'}),today,['barista'],2000);
 assert.throws(()=>C.parseTerms({},vrij,today),/echt vrijgesteld/);
 assert.deepEqual(C.parseTerms({vatChecked:true},vrij,today).vatBp,0);
 assert.equal(C.percentToBp('12,5'),1250);assert.ok(Number.isNaN(C.percentToBp('')));
 assert.equal(C.coffeeSuggestion({capacity:25},300),7500);assert.equal(C.coffeeSuggestion({capacity:null},300),C.DEFAULT_GUESTS*300);assert.equal(C.coffeeSuggestion({capacity:5},null),null);
});

test('regels: afrekening, rooster-verschil, alleen-tekst-wijziging en websitetekst',()=>{
 // Eerst de btw eraf (de coöperatie draagt die af), dan het deel van de boerderij van de kaartverkoop zonder btw.
 assert.deepEqual(C.settlement(25000,{farmShareBp:2000,coffeeCents:4000,vatBp:900}),{revenueCents:25000,vatBp:900,vatCents:2064,exclCents:22936,farmCents:4587,organiserCents:18349,coffeeCents:4000,payoutCents:14349});
 assert.equal(C.settlement(2500,{farmShareBp:3000,coffeeCents:null,vatBp:2100}).organiserCents,1446,'€ 25 workshop: € 4,34 btw, € 6,20 boerderij, € 14,46 organisator');
 assert.equal(C.settlement(2500,{farmShareBp:3000,coffeeCents:null,vatBp:0}).organiserCents,1750,'vrijgesteld: geen btw');
 assert.equal(C.settlement(2500,{farmShareBp:3000,coffeeCents:null}).vatBp,2100,'afspraken van vóór de btw-keuze: 21%');
 assert.deepEqual(C.perTicket(2500,3000,900),{vatCents:206,farmCents:688,organiserCents:1606});
 assert.equal(C.settlement(0,{farmShareBp:2000,coffeeCents:4000}).payoutCents,-4000,'geen kaartverkoop: de organisator betaalt de koffie');
 assert.deepEqual(C.staffingDelta([{roleId:'barista',count:1}],[{roleId:'barista',count:2},{roleId:'afwas',count:1}]),[{roleId:'barista',delta:1},{roleId:'afwas',delta:1}]);
 assert.deepEqual(C.staffingDelta([{roleId:'barista',count:1}],[]),[{roleId:'barista',delta:-1}]);
 const today='2026-11-08',a=C.parseRequest(base(today),today,['barista'],2000);
 assert.ok(C.textOnlyChange(a,{...a,title:'Nieuwe titel',description:'Andere tekst voor de website.'}));
 assert.ok(!C.textOnlyChange(a,{...a,priceCents:1500}));assert.ok(!C.textOnlyChange(a,{...a,vatKind:'workshop'}),'ander soort = ander btw-tarief: langs de coördinator');assert.ok(!C.textOnlyChange(a,{...a,from:'20:00'}));
 const d=C.publicDescription(a,'Pieter de Vries');assert.match(d,/Georganiseerd door Pieter · de schuur\./);assert.match(d,/zelf af in ons restaurant/);assert.doesNotMatch(d,/de Vries/,'alleen de voornaam op de website');
 const m=C.marketingDrafts(a,C.parseTerms({},a,today),'Pieter de Vries');assert.match(m.instagram,/€ 12,50 per persoon/);assert.match(m.nieuwsbrief,/Avond over zingeving/);
});

test('van aanvraag tot agenda, rooster, hulpvraag en marketing; wijzigen en annuleren',async t=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'bb-ledenevenementen-'));process.env.APP_DATA_DIR=tmp;process.env.DATABASE_URL='';
 const {closeDatabase}=await import('../lib/portable/env.ts');t.after(async()=>{process.env.APP_DATA_DIR=tmp;await closeDatabase();fs.rmSync(tmp,{recursive:true,force:true})});
 const {getDb}=await import('../db/index.ts'),S=await import('../db/schema.ts'),{eq}=await import('drizzle-orm');
 const E=await import('../lib/member-events.ts'),P=await import('../lib/pot-planning.ts'),{loadGuest}=await import('../lib/guest-store.ts'),{today}=await import('../lib/pot-agreements.ts');
 const db=getDb(),at=new Date().toISOString(),day0=today();
 const pieter='11111111-1111-4111-8111-111111111111',rianne='22222222-2222-4222-8222-222222222222',bart='33333333-3333-4333-8333-333333333333',kees='44444444-4444-4444-8444-444444444444';
 await db.insert(S.coopParticipants).values([
  {id:pieter,name:'Pieter de Vries',email:'',units:JSON.stringify(['evenementen']),created:at,updated:at},
  {id:rianne,name:'Rianne',email:'',units:JSON.stringify(['restaurant']),created:at,updated:at},
  {id:bart,name:'Bart',email:'',units:JSON.stringify(['restaurant']),potRoles:JSON.stringify({restaurant:['barista']}),created:at,updated:at},
  {id:kees,name:'Kees',email:'',units:JSON.stringify(['restaurant']),created:at,updated:at}]);
 await db.insert(S.potAgreements).values({id:'a1',pot:'restaurant',validFrom:add(day0,-30),percentBp:3000,roles:JSON.stringify([{id:'barista',name:'Barista',points:2},{id:'afwas',name:'Afwas',points:1},{id:'schoonmaak',name:'Schoonmaak',points:1,week:true}]),status:'geldig',proposedAt:at,decidedAt:at});
 const P_=id=>({id,name:'',holder:'',email:'',ibanEnd:''});

 // Zonder „Organiseert evenementen” op de ledenkaart: niet aanvragen.
 assert.equal((await E.memberView(P_(kees))).allowed,false);
 await assert.rejects(E.submit(P_(kees),base(day0)),/ledenkaart/);
 // De rollen komen uit de restaurantpot (alleen dagrollen); de coördinator is nu Rianne.
 let v=await E.memberView(P_(pieter));assert.equal(v.allowed,true);assert.deepEqual(v.roles.map(r=>r.id),['barista','afwas']);assert.equal(v.coordinator,'Rianne');
 assert.equal((await E.getSettings()).coordinatorId,rianne);

 // 1. Aanvraag, gast betaalt de koffie: Rianne krijgt bericht en keurt meteen goed.
 const date=add(day0,20);
 assert.match(await E.submit(P_(pieter),base(day0,{date})),/verstuurd naar Rianne/);
 const msgs=async id=>(await db.select().from(S.memberMessages).where(eq(S.memberMessages.participantId,id))).map(m=>m.title);
 assert.ok((await msgs(rianne)).some(m=>/Nieuwe evenementaanvraag/.test(m)));
 let o=await E.ownerList(),e=o.events[0];assert.equal(e.status,'aangevraagd');assert.equal(e.organiser,'Pieter de Vries');
 await assert.rejects(E.decide({action:'goedkeuren',id:e.id,version:e.version+1},'rianne'),/intussen gewijzigd/);
 const need=async role=>(await P.roster('restaurant',date,1)).days[0].slots.find(s=>s.roleId===role).need;
 const before={barista:await need('barista'),afwas:await need('afwas')}; // standaard op die dag (open of dicht)
 const r1=await E.decide({action:'goedkeuren',id:e.id,version:e.version,terms:{}},'rianne');assert.match(r1.message,/agenda/);assert.deepEqual(r1.warnings,[]);
 o=await E.ownerList();e=o.events[0];assert.equal(e.status,'goedgekeurd');
 // In de agenda, met aanmelden, prijs en maximum; op de website alleen de voornaam.
 let ev=(await loadGuest()).state.events.find(x=>x.title==='Avond over zingeving');
 assert.ok(ev);assert.equal(ev.date,date);assert.equal(ev.priceCents,1250);assert.equal(ev.capacity,25);assert.equal(ev.signup,true);assert.match(ev.description,/Georganiseerd door Pieter/);
 // Rooster: één barista extra op die dag, en Bart (aangenomen als barista) kreeg de hulpvraag.
 let day=(await P.roster('restaurant',date,1)).days[0];assert.equal(day.slots.find(s=>s.roleId==='barista').need,before.barista+1);assert.match(day.slots.find(s=>s.roleId==='barista').note,/Evenement: Avond over zingeving/);
 assert.ok((await msgs(bart)).some(m=>/Nieuwe dienst/.test(m)),'hulpvraag aan de barista');assert.ok(!(await msgs(kees)).some(m=>/Nieuwe dienst/.test(m)),'niet aan wie niet is aangenomen');
 assert.deepEqual(e.staffing,[{roleId:'barista',count:1}]);
 // Marketingconcept staat klaar.
 let mk=await E.marketingList();assert.equal(mk.length,1);assert.match(mk[0].drafts.instagram,/Avond over zingeving/);
 assert.ok((await msgs(pieter)).some(m=>/Goedgekeurd/.test(m)));

 // 2. Alleen de tekst wijzigen gaat meteen door; een andere tijd gaat langs Rianne.
 v=await E.memberView(P_(pieter));let mine=v.events[0];
 assert.match(await E.submit(P_(pieter),{...base(day0,{date}),title:'Avond over zingeving en zin'},mine.id,mine.version),/meteen in de agenda/);
 assert.ok((await loadGuest()).state.events.some(x=>x.title==='Avond over zingeving en zin'));
 mine=(await E.memberView(P_(pieter))).events[0];
 assert.match(await E.submit(P_(pieter),{...base(day0,{date}),title:'Avond over zingeving en zin',from:'20:00',to:'22:00',roles:[{roleId:'barista',count:1},{roleId:'afwas',count:1}]},mine.id,mine.version),/eerst langs de coördinator/);
 assert.equal((await loadGuest()).state.events.find(x=>x.title==='Avond over zingeving en zin').from,'19:30','tot goedkeuring blijft het zoals het was');
 e=(await E.ownerList()).events[0];assert.ok(e.change);
 await E.decide({action:'wijziging-goedkeuren',id:e.id,version:e.version},'rianne');
 ev=(await loadGuest()).state.events.find(x=>x.title==='Avond over zingeving en zin');assert.equal(ev.from,'20:00');
 assert.equal(await need('barista'),before.barista+1,'barista niet dubbel');assert.equal(await need('afwas'),before.afwas+1);
 e=(await E.ownerList()).events[0];assert.deepEqual(e.staffing.sort((a,b)=>a.roleId.localeCompare(b.roleId)),[{roleId:'afwas',count:1},{roleId:'barista',count:1}]);

 // 3. Annuleren: uit de agenda, diensten weer weg, aanmeldingen geannuleerd, marketing vervallen.
 await db.insert(S.eventSignups).values({id:'s1',requestId:'00000000-0000-4000-8000-000000000001',eventId:ev.id,name:'Gast',email:'gast@example.org',people:2,amountCents:2500,paymentStatus:'betaald',paidBy:'Mollie (test)',created:at,updated:at});
 e=(await E.ownerList()).events[0];assert.equal(e.signups.people,2);assert.equal(e.settlement.revenueCents,2500);assert.equal(e.settlement.payoutCents,1606,"€ 25 cultuur: € 2,06 btw, 30% van € 22,94 voor de coöperatie (besluit eigenaar 9 november 2026)");
 // Annuleringsmail (9 november 2026): zonder Gmail-koppeling zegt de melding wie je zelf bericht stuurt.
 const cancel=await E.decide({action:'annuleren',id:e.id,version:e.version,note:'Ziek'},'rianne');
 assert.ok(cancel.warnings.some(w=>/geen mail/.test(w)&&/gast@example\.org/.test(w)),'zonder Gmail: wie je zelf bericht stuurt');
 assert.doesNotMatch(cancel.message,/krijgen een mail/);
 // Met Gmail gaat de mail als opdracht in de rij, één keer per aanmelding, met de gegevens van het evenement erbij.
 const ES=await import('../lib/event-signups.ts');
 await ES.queueCancellation('s1',{title:'Avond over zingeving en zin',date,from:'20:00',to:'22:00'});await ES.queueCancellation('s1',{title:'Avond over zingeving en zin',date,from:'20:00',to:'22:00'});
 const jobs=await db.select().from(S.outboxJobs).where(eq(S.outboxJobs.kind,'aanmelding-annulering'));
 assert.equal(jobs.length,1,'dubbel in de rij zetten verstuurt niets dubbel');assert.equal(jobs[0].key,'aanmelding-annulering:s1');assert.equal(JSON.parse(jobs[0].payload).event.title,'Avond over zingeving en zin');
 await ES.sendCancellation(JSON.parse(jobs[0].payload)); // zonder Gmail: niets, en geen fout
 assert.ok(!(await loadGuest()).state.events.some(x=>x.id===ev.id));
 assert.equal(await need('barista'),before.barista,'diensten weer weg');assert.equal(await need('afwas'),before.afwas);
 assert.equal((await db.select().from(S.eventSignups))[0].status,'geannuleerd');
 e=(await E.ownerList()).events[0];assert.equal(e.status,'geannuleerd');assert.deepEqual(e.refunds,[{name:'Gast',email:'gast@example.org',amountCents:2500}],'terugstorten via Mollie');
 assert.equal((await E.marketingList()).length,0);

 // 4. De organisator betaalt de koffie: Rianne stelt een bedrag voor, pas na akkoord van Pieter in de agenda.
 await E.submit(P_(pieter),base(day0,{date:add(day0,30),title:'Rondleiding door de tuin',coffee:'organisator',roles:[]}));
 e=(await E.ownerList()).events.find(x=>x.status==='aangevraagd');assert.equal(e.coffeeSuggestionCents,null,'geen koffie op de kaart: zelf invullen');
 await assert.rejects(E.decide({action:'goedkeuren',id:e.id,version:e.version,terms:{}},'rianne'),/bedrag/);
 assert.match((await E.decide({action:'goedkeuren',id:e.id,version:e.version,terms:{coffee:'45'}},'rianne')).message,/zodra het lid akkoord/);
 assert.ok(!(await loadGuest()).state.events.some(x=>x.title==='Rondleiding door de tuin'));
 mine=(await E.memberView(P_(pieter))).events.find(x=>x.status==='voorstel');assert.equal(mine.terms.coffeeCents,4500);assert.deepEqual(mine.acceptWhy,['koffiebedrag']);
 await assert.rejects(E.memberAction(P_(kees),'akkoord',mine.id,mine.version),/bestaat niet/,'alleen de eigen evenementen');
 await E.memberAction(P_(pieter),'akkoord',mine.id,mine.version);
 ev=(await loadGuest()).state.events.find(x=>x.title==='Rondleiding door de tuin');assert.ok(ev);assert.match(ev.description,/inbegrepen/);
 mine=(await E.memberView(P_(pieter))).events.find(x=>x.id===mine.id);assert.equal(mine.settlement.payoutCents,-4500);

 // 5. Afwijzen vraagt een reden; intrekken kan alleen vóór goedkeuring.
 await E.submit(P_(pieter),base(day0,{date:add(day0,40),title:'Derde avond'}));
 e=(await E.ownerList()).events.find(x=>x.status==='aangevraagd');
 await assert.rejects(E.decide({action:'afwijzen',id:e.id,version:e.version,note:''},'rianne'),/waarom/);
 await E.decide({action:'afwijzen',id:e.id,version:e.version,note:'Die week is de boerderij dicht.'},'rianne');
 assert.ok((await msgs(pieter)).some(m=>/Niet doorgegaan: Derde avond/.test(m)));
 await assert.rejects(E.memberAction(P_(pieter),'intrekken',mine.id,mine.version),/nog niet is goedgekeurd/);

 // Instellingen: percentage verplicht, versie bewaakt.
 const s=await E.getSettings();
 await assert.rejects(E.saveSettings({coordinatorId:rianne,farmSharePercent:'',version:s.version},'test'),/percentage/);
 await E.saveSettings({coordinatorId:rianne,farmSharePercent:'15',version:s.version},'test');assert.equal((await E.getSettings()).farmShareBp,1500);
 await assert.rejects(E.saveSettings({coordinatorId:rianne,farmSharePercent:'15',version:s.version},'test'),/intussen gewijzigd/);
});

test('ledenpagina, toegang en scherm: alleen via de eigen link, beslissen alleen als eigenaar',()=>{
 const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
 const r=read('app/api/deelnemer/[token]/evenementen/route.ts');assert.match(r,/participantByToken\(token\)/);assert.match(r,/isSameOrigin\(req\)/);
 assert.match(fs.readFileSync(new URL('../lib/member-routes.ts',import.meta.url),'utf8'),/'evenementen'/);
 const o=read('app/api/ledenevenementen/route.ts');assert.match(o,/isOwnerRequest\(req\)/);assert.match(o,/authorizeSheet\(req,true\)/);
 assert.match(read('app/deelnemer/[token]/lid-pagina.tsx'),/<Evenementen /);assert.match(read('app/goedkeuringen/page.tsx'),/<LedenEvenementen /);
 assert.match(read('lib/members-core.ts'),/\['evenementen','Organiseert evenementen'\]/);
});

test('annuleringsmail: wat de gast leest, met of zonder betaling',async()=>{
 const {cancellationText}=await import('../lib/event-signups-core.ts');
 const e={title:'Avond over zingeving',date:'2026-11-20',from:'19:30',to:'21:30'};
 const online=cancellationText(e,{name:'Anna',people:2,amountCents:2500,paid:true,paidOnline:true});
 assert.match(online.subject,/^Gaat niet door: Avond over zingeving/);assert.match(online.body,/^Hallo,/);assert.doesNotMatch(online.body,/Anna/);assert.match(online.body,/2 personen/);
 assert.match(online.body,/€ 25,00 betaald\. Dat storten we terug/);
 assert.match(cancellationText(e,{name:'Bo',people:1,amountCents:1250,paid:true,paidOnline:false}).body,/We nemen contact met je op om dat terug te betalen/);
 const free=cancellationText(e,{name:'Cas',people:1,amountCents:0,paid:false,paidOnline:false}).body;assert.match(free,/1 persoon\)/);assert.doesNotMatch(free,/betaald/);
 assert.match(fs.readFileSync(new URL('../lib/assistant-jobs.ts',import.meta.url),'utf8'),/'aanmelding-annulering':async payload=>/,'de achtergrondtaak kent de annuleringsmail');
});

// Samen organiseren (wens eigenaar 9 november 2026).
test('team: leden uitnodigen met een percentage van het organisatordeel',async()=>{
 const {parseTeam,ownShareBp,splitPayout,publicDescription}=await import('../lib/member-events-core.ts');
 const members=[{id:'a',name:'Anna de Vries'},{id:'p',name:'Piet Bakker'},{id:'me',name:'Ingeborg'}];
 const team=parseTeam([{participantId:'a',sharePercent:'30'},{participantId:'p',sharePercent:'12,5'}],'me',members);
 assert.deepEqual(team.map(v=>[v.participantId,v.shareBp,v.status]),[['a',3000,'uitgenodigd'],['p',1250,'uitgenodigd']]);
 assert.equal(ownShareBp(team),5750);
 assert.throws(()=>parseTeam([{participantId:'me',sharePercent:'10'}],'me',members),/andere leden/);
 assert.throws(()=>parseTeam([{participantId:'x',sharePercent:'10'}],'me',members),/uit de lijst/);
 assert.throws(()=>parseTeam([{participantId:'a',sharePercent:'60'},{participantId:'p',sharePercent:'50'}],'me',members),/hoogstens 100%/);
 assert.throws(()=>parseTeam([{participantId:'a',sharePercent:'0'}],'me',members),/percentage/);
 // Akkoord blijft bij hetzelfde percentage; een ander percentage vraagt opnieuw akkoord.
 const accepted=team.map(v=>({...v,status:'akkoord'}));
 assert.equal(parseTeam([{participantId:'a',sharePercent:'30'}],'me',members,accepted)[0].status,'akkoord');
 assert.equal(parseTeam([{participantId:'a',sharePercent:'40'}],'me',members,accepted)[0].status,'uitgenodigd');
 // Verdelen: precies op, afronding naar de organisator; wie afslaat telt niet mee.
 const split=splitPayout(10001,{id:'me',name:'Ingeborg'},[{...accepted[0]},{...accepted[1],status:'afgewezen'}]);
 assert.deepEqual(split.map(x=>[x.participantId,x.cents]),[['me',7001],['a',3000]]);
 assert.equal(split.reduce((n,x)=>n+x.cents,0),10001);
 assert.match(publicDescription({description:'Een mooie avond over zingeving.',place:'de schuur',coffee:'geen',team:accepted},'Ingeborg Smit'),/Georganiseerd door Ingeborg, Anna en Piet · de schuur/);
});
test('team: uitgenodigde leden zien het evenement en kunnen alleen meedoen of afslaan',()=>{
 const src=fs.readFileSync(new URL('../lib/member-events.ts',import.meta.url),'utf8');
 assert.match(src,/or\(eq\(memberEvents\.participantId,p\.id\),inTeam\(p\.id\)\)/);
 assert.match(src,/if\(action!=='team-akkoord'&&action!=='team-afwijzen'\)throw new EventRuleError\('Dit kan alleen de organisator\.',403\)/);
});
test('afrekenen: mede-organisatoren die meedoen krijgen hun deel als BB-tegoed; de organisator de rest via de gewone route',()=>{
 const src=fs.readFileSync(new URL('../lib/member-event-settlement.ts',import.meta.url),'utf8');
 assert.match(src,/team=\(req\.team\|\|\[\]\)\.filter\(v=>v\.status==='akkoord'\)/);
 assert.match(src,/payoutCents:s0\.payoutCents-shares\.reduce/,'de organisator houdt de rest');
 assert.equal((src.match(/await creditTeam\(\)/g)||[]).length,3,'bij BB, bunq en niets voor de organisator');
});


test('mede-organisator: alleen echte leden, geen obligatiehouder (wens eigenaar 9 november 2026)',async()=>{
 const {canCoOrganise}=await import('../lib/member-events-core.ts');
 for(const c of ['A','B','L'])assert.equal(canCoOrganise({memberClass:c,volunteer:0,units:[]}),true,c+'-lid');
 assert.equal(canCoOrganise({memberClass:'',volunteer:1,units:[]}),true,'vrijwilliger');
 assert.equal(canCoOrganise({memberClass:'',volunteer:0,units:['evenementen']}),true,'organiseert evenementen');
 assert.equal(canCoOrganise({memberClass:'',volunteer:0,units:[]}),false,'alleen obligatiehouder');
 assert.equal(canCoOrganise({memberClass:'C',volunteer:0,units:[]}),false,'C-lid (ondersteunend)');
 const src=fs.readFileSync(new URL('../lib/member-events.ts',import.meta.url),'utf8');
 assert.match(src,/members:coOrganisers\(members\)\.filter/,'de keuzelijst toont alleen wie kan meeorganiseren');
 assert.match(src,/parseTeam\(\(raw as \{team\?:unknown\}\)\?\.team,p\.id,coOrganisers\(members\)\)/,'ook de server weigert een obligatiehouder');
});

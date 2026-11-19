// Bankverdeling en BB-tegoed (wens eigenaar 6 november 2026): de hele keten tegen een echte, tijdelijke database (PGlite) en een
// nagebootste bunq. Akkoord → overboekingen naar de eigen subrekeningen → BB-tegoed bij de leden → uitbetaling aanvragen →
// goedkeuren als conceptbetaling → bevestigd in de bunq-app. Plus: nooit dubbel, ook niet als het antwoord van bunq verloren gaat.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const run=(name,code)=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-'+name+'-'));
 try{const r=spawnSync(process.execPath,['--experimental-transform-types','--input-type=module','-e',"import './tests/helpers/ts-resolve.mjs';import assert from 'node:assert/strict';"+code],
  {cwd:new URL('../',import.meta.url),env:{...process.env,APP_DATA_DIR:dir,APP_ORIGIN:'http://127.0.0.1:3001',PUBLIC_ORDER_ORIGINS:'',SHEETS_CONFIG_KEY:'ab'.repeat(32),GUEST_BUNQ_API_KEY:'sandbox_'+'k'.repeat(40),BUNQ_LIVE_ENABLED:''},encoding:'utf8',timeout:120000});
  assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/ok/)}finally{fs.rmSync(dir,{recursive:true,force:true})}};

test('verdelen, BB-tegoed en uitbetalen: de hele keten',()=>run('bank',`
 const {bunqMock}=await import('./tests/helpers/bunq-mock.mjs');const mock=bunqMock();mock.state.apiKey=process.env.GUEST_BUNQ_API_KEY;process.env.BUNQ_API_BASE=await mock.start();
 const {getDb}=await import('./db/index.ts');const s=await import('./db/schema.ts');const {seal}=await import('./lib/sheets.ts');
 const bank=await import('./lib/bank-split.ts');const {memberBb}=await import('./lib/bb.ts');
 const db=getDb(),t=new Date().toISOString(),W='2026-10-26';
 const A='aaaaaaaa-0000-4000-8000-000000000001',B='bbbbbbbb-0000-4000-8000-000000000002',C='cccccccc-0000-4000-8000-000000000003';
 await db.insert(s.coopParticipants).values([{id:A,name:'Anna',memberClass:'A',holder:'A. de Vries',ibanSealed:await seal('NL91ABNA0417164300'),ibanLast4:'4300',created:t,updated:t},{id:B,name:'Bauke',memberClass:'B',created:t,updated:t},{id:C,name:'Cees',created:t,updated:t}]);
 // Goedgekeurde winkelweek: Anna 120, Bauke 80, Cees 5 (geen lid: via het betaalbestand); btw 73, waarvan Bauke 3 zelf krijgt (inclusief btw).
 const P=(id,name,payout,vat,share)=>({id,name,vatInclusive:share>0,revenueInclCents:0,vatCents:vat,revenueExclCents:0,retainedCents:0,vatShareCents:share,payoutCents:payout,rates:[],lines:1,missingRate:false});
 const coop={week:W,label:'week 44',computedAt:t,settlement:{participants:[P(A,'Anna',12000,2000,0),P(B,'Bauke',8000,1000,300),P(C,'Cees',500,0,0)],coop:{revenueExclCents:0,vatCents:4600,lines:3},retainedTotalCents:0,payoutTotalCents:20500,testLines:0,warnings:[]},included:[],corrections:[],products:[]};
 await db.insert(s.coopWeeks).values({week:W,status:'goedgekeurd',snapshot:JSON.stringify(coop),approvedBy:'Rianne',approvedAt:t});
 // Goedgekeurde restaurantweek: Anna 30.
 const pot={pot:'restaurant',week:W,label:'week 44',computedAt:t,result:{days:[],people:[{participantId:A,name:'Anna',days:1,points:3,shareCents:3000,tipCents:0,totalCents:3000,payoutCents:3000}],potCents:3000,tipCents:0,distributedCents:3000,payoutTotalCents:3000,warnings:[]},shifts:[],dayRoles:[],members:[]};
 await db.insert(s.potWeeks).values({pot:'restaurant',week:W,status:'goedgekeurd',snapshot:JSON.stringify(pot),approvedBy:'Rianne',approvedAt:t});
 // Bij het goedkeuren kregen de A- en B-leden hun deel als BB (PR 252, lib/bb.ts): dat is de enige bron van het tegoed.
 const {credit}=await import('./lib/bb.ts');
 await credit([{participantId:A,day:W,kind:'winkel-week',amountCents:12000,source:'winkel:'+W,note:'Producten in de winkel'},{participantId:B,day:W,kind:'winkel-week',amountCents:8000,source:'winkel:'+W,note:'Producten in de winkel'},
  {participantId:A,day:W,kind:'pot-week',amountCents:3000,source:'pot:restaurant:'+W,note:'Voorschot op de winst'}],'Rianne');
 // Mollie betaalde 600 en 400 uit op Main; er kwam ook iets anders binnen dat niet meetelt.
 mock.add(1,60000,{name:'Stichting Mollie Payments',description:'Mollie settlement'});mock.add(1,40000,{name:'Stichting Mollie Payments'});mock.add(1,5000,{name:'Rianne',description:'kas'});

 // Evenement van een lid, afgerekend in deze week (besluit eigenaar 9 november 2026): de btw van de kaartjes (€ 5) gaat naar Btw.
 await db.insert(s.memberEvents).values({id:'eeeeeeee-0000-4000-8000-000000000001',participantId:A,status:'goedgekeurd',request:'{}',created:t,updated:t});
 await db.insert(s.memberEventSettlements).values({id:'eeeeeeee-0000-4000-8000-000000000001',participantId:A,revenueCents:5500,vatCents:500,farmCents:1500,coffeeCents:0,payoutCents:3500,route:'bb',status:'geboekt',createdAt:'2026-10-28T10:00:00.000Z'});
 let v=await bank.splitView(W);assert.equal(v.ready,false);assert.match(v.blockers.join(),/Main/,'eerst de rekeningen kiezen');
 await bank.saveAccounts({main:1,tegoed:2,btw:3,potten:4,cooperatie:5},0,'Bartele');
 await assert.rejects(()=>bank.saveAccounts({main:1,tegoed:1},0,'Bartele'),/andere rekening/);
 v=await bank.splitView(W);
 assert.ok(v.ready,v.blockers.join());assert.equal(v.receivedCents,100000);
 // Een leverancier moet lid zijn: Cees wordt gemeld; zijn deel gaat via het betaalbestand en blijft in het coöperatiedeel.
 assert.match(v.warnings.join(' '),/Geen lid: Cees/);assert.deepEqual(v.members.map(m=>m.name),['Anna','Bauke']);
 const amounts=Object.fromEntries(v.lines.map(l=>[l.target,l.cents]));
 assert.match(v.notes.join(' '),/Btw van afgerekende evenementen van leden: € 5,00/);
 assert.deepEqual(amounts,{tegoed:23000,potten:0,btw:7800,inkoop:0,cooperatie:100000-23000-7800}); // geen restaurantomzet in deze proef: geen inkoop

 // Wat de eigenaar zag moet kloppen met de stand op het moment van akkoord.
 await assert.rejects(()=>bank.approveSplit(W,{receivedCents:99999,lines:amounts},'Bartele'),/net veranderd/);
 // Na akkoord zet de backoffice één concept klaar; het antwoord van bunq gaat verloren. Nooit een tweede concept.
 mock.state.loseDraft=true;const drafts0=mock.state.drafts.size;
 v=await bank.approveSplit(W,{receivedCents:100000,lines:amounts},'Bartele');
 assert.equal(v.status,'goedgekeurd');assert.ok(v.transfers.every(x=>x.status==='bezig'),JSON.stringify(v.transfers));
 v=await bank.executeSplit(W,{create:true});
 assert.equal(mock.state.drafts.size,drafts0+1,'precies één concept');assert.ok(v.transfers.every(x=>x.status==='in-bunq'));
 const [splitDraft,sd]=[...mock.state.drafts].at(-1);assert.equal(sd.from,1);assert.deepEqual(sd.entries.map(e=>e.amount.value).sort(),['230.00','692.00','78.00']);
 // Niets verplaatst tot bevestigen in de bunq-app; ververs en opnieuw klaarzetten maken geen tweede concept.
 assert.equal(mock.balance(1),105000);v=await bank.executeSplit(W,{create:true});assert.equal(mock.state.drafts.size,drafts0+1);assert.equal(v.status,'goedgekeurd');
 // Geweigerd in de bunq-app: de regels staan weer open; opnieuw klaarzetten geeft één nieuw concept.
 mock.state.drafts.get(splitDraft).status='REJECTED';v=await bank.executeSplit(W);assert.ok(v.transfers.every(x=>x.status==='fout'&&/Geweigerd/.test(x.error)));
 v=await bank.executeSplit(W,{create:true});assert.equal(mock.state.drafts.size,drafts0+2);assert.ok(v.transfers.every(x=>x.status==='in-bunq'));
 const redo=[...mock.state.drafts].at(-1)[0];
 mock.accept(redo);v=await bank.executeSplit(W);
 assert.equal(v.status,'uitgevoerd');assert.ok(v.transfers.every(x=>x.status==='verstuurd'&&x.bunqId));
 assert.equal(mock.balance(2),23000);assert.equal(mock.balance(3),7800);assert.equal(mock.balance(5),69200);assert.equal(mock.balance(1),5000,'alleen het niet-Mollie-geld blijft op Main');
 assert.equal(mock.state.calls.filter(c=>c==='POST /v1/user/42/monetary-account/1/payment').length,0,'de backoffice boekt nooit zelf over');
 await assert.rejects(()=>bank.approveSplit(W,{receivedCents:100000,lines:amounts},'Bartele'),/al verdeeld/);
 // Het tegoed zelf verandert niet door het verdelen: dat stond al in bb_entries. Alleen het geld staat nu op BB-tegoed leden.
 let a=await bank.memberTegoed(A);assert.equal(a.balanceCents,15000);assert.equal((await bank.memberTegoed(B)).balanceCents,8000);
 assert.deepEqual(v.members.find(m=>m.name==='Anna').sources.map(x=>x.label).sort(),['Restaurant (Ite en koffie)','Winkel']);
 // De volgende week: het Mollie-geld van deze week is al verdeeld.
 const next=await bank.splitView('2026-11-02');assert.equal(next.receivedCents,0);

 // Uitbetalen. Zonder IBAN niet; nooit meer dan het tegoed; tegelijk aanvragen geeft er precies één.
 await assert.rejects(()=>bank.requestPayout(B,1000,'Bauke'),/IBAN/);
 await assert.rejects(()=>bank.requestPayout(A,15001,'Anna'),/maximaal € 150,00/);
 const tries=await Promise.allSettled([1,2,3].map(()=>bank.requestPayout(A,6000,'Anna')));
 assert.equal(tries.filter(x=>x.status==='fulfilled').length,1,tries.map(x=>x.reason?.message).join(' | '));
 a=await bank.memberTegoed(A);assert.equal(a.availableCents,9000);assert.equal(a.heldCents,6000);
 let o=await bank.bankOverview();const req=o.payouts.find(p=>p.status==='aangevraagd');assert.equal(req.name,'Anna');
 await assert.rejects(()=>bank.approvePayout(req.id,req.version+1,'Bartele'),/al behandeld/);
 await bank.approvePayout(req.id,req.version,'Bartele');
 const [draftId,draft]=[...mock.state.drafts].find(([,d])=>d.from===2);assert.equal(draft.from,2,'vanaf BB-tegoed leden');assert.equal(draft.entry.amount.value,'60.00');assert.equal(draft.entry.counterparty_alias.value,'NL91ABNA0417164300');
 assert.equal(mock.balance(2),23000,'er is nog niets weg: eerst bevestigen in de bunq-app');
 assert.equal(await bank.refreshPayouts('Bartele'),0);
 // Bevestigd, maar de betaling mislukte (bijvoorbeeld te weinig saldo): niet van het tegoed af, maar „aandacht”.
 mock.accept(draftId,false);assert.equal(await bank.refreshPayouts('Bartele'),1);
 a=await bank.memberTegoed(A);assert.equal(a.balanceCents,15000);assert.equal(a.availableCents,9000,'het tegoed blijft vastgehouden');assert.equal(a.payouts[0].status,'aandacht');
 // Daarna gaat de betaling wel door.
 mock.accept(draftId);
 assert.equal(await bank.refreshPayouts('Bartele'),1);assert.equal(await bank.refreshPayouts('Bartele'),0,'herhaalbaar');
 a=await bank.memberTegoed(A);assert.equal(a.balanceCents,9000);assert.equal(a.availableCents,9000);assert.equal(a.payouts[0].status,'uitbetaald');
 const ledger=await memberBb(A);assert.equal(ledger.balanceCents,9000,'één grootboek');assert.ok(ledger.entries.some(e=>e.kind==='opname'&&e.amountCents===-6000));
 // Afwijzen geeft het tegoed weer vrij.
 await bank.requestPayout(A,2000,'Anna');o=await bank.bankOverview();const r2=o.payouts.find(p=>p.status==='aangevraagd');
 await bank.rejectPayout(r2.id,r2.version,'Graag na de jaarvergadering','Bartele');
 a=await bank.memberTegoed(A);assert.equal(a.availableCents,9000);assert.equal(a.payouts[0].note,'Graag na de jaarvergadering');
 // Antwoord verloren bij goedkeuren (bunq maakte het concept wel): nooit een tweede concept.
 await bank.requestPayout(A,1500,'Anna');o=await bank.bankOverview();const lost=o.payouts.find(p=>p.status==='aangevraagd');
 mock.state.loseDraft=true;const before=mock.state.drafts.size;
 await assert.rejects(()=>bank.approvePayout(lost.id,lost.version,'Bartele'),/Keur niet opnieuw goed/);
 o=await bank.bankOverview();let row=o.payouts.find(p=>p.id===lost.id);assert.equal(row.status,'in-bunq');
 await assert.rejects(()=>bank.approvePayout(lost.id,row.version,'Bartele'),/al behandeld/,'opnieuw goedkeuren kan niet');
 await bank.refreshPayouts('Bartele');assert.equal(mock.state.drafts.size,before+1,'precies één concept');
 const found=[...mock.state.drafts].find(([,d])=>d.entry.description.includes(lost.id))[0];mock.accept(found);await bank.refreshPayouts('Bartele');
 a=await bank.memberTegoed(A);assert.equal(a.balanceCents,7500);assert.equal(a.payouts[0].status,'uitbetaald');
 // Geen week overslaan: na week 44 eerst week 45, dan pas week 46.
 const skip=await bank.splitView('2026-11-09');assert.match(skip.blockers.join(' '),/Verdeel eerst week 45/);
 // Weigert bunq het concept zeker (4xx), dan staat de aanvraag weer open en kan hij opnieuw worden goedgekeurd.
 await bank.requestPayout(A,1000,'Anna');o=await bank.bankOverview();const r3=o.payouts.find(p=>p.status==='aangevraagd');
 mock.state.fail=(m,p)=>m==='POST'&&p.includes('draft-payment')?400:false;
 await assert.rejects(()=>bank.approvePayout(r3.id,r3.version,'Bartele'),/bunq/);mock.state.fail=null;
 o=await bank.bankOverview();const again=o.payouts.find(p=>p.id===r3.id);assert.equal(again.status,'aangevraagd');
 await bank.approvePayout(again.id,again.version,'Bartele');
 assert.deepEqual(o.tegoed.map(x=>[x.name,x.balanceCents]),[['Anna',7500],['Bauke',8000]]);
 await mock.stop();console.log('ok');`));

// BB stap 2 (besluiten eigenaar 6 november 2026): uitbetalen alleen via de maandagvraag, via dezelfde bunq-uitbetaling; na de afschrijving
// een creditfactuur (lid met bedrijf, btw die al in het BB zit) of een uitbetalingsoverzicht. Nooit dubbel.
test('maandagvraag: keuze → aanvraag → goedkeuren in bunq → document',()=>run('maandag',`
 const {bunqMock}=await import('./tests/helpers/bunq-mock.mjs');const mock=bunqMock();mock.state.apiKey=process.env.GUEST_BUNQ_API_KEY;process.env.BUNQ_API_BASE=await mock.start();
 const {getDb}=await import('./db/index.ts');const s=await import('./db/schema.ts');const {seal}=await import('./lib/sheets.ts');
 const bank=await import('./lib/bank-split.ts');const bb=await import('./lib/bb-payout.ts');const {credit}=await import('./lib/bb.ts');
 const db=getDb(),t=new Date().toISOString(),W='2026-10-26',M='2026-11-02';
 const A='aaaaaaaa-0000-4000-8000-000000000001',B='bbbbbbbb-0000-4000-8000-000000000002',C='cccccccc-0000-4000-8000-000000000003',D='dddddddd-0000-4000-8000-000000000004';
 const company=JSON.stringify({name:'Tuinderij Anna',kvk:'12345678',vatNumber:'NL123456789B01',kor:false,address:'Schoterweg 30',postcode:'8462 TD',city:'Rotstergaast',invoiceEmail:'',selfBilling:true,since:'2026-11-01'});
 const iban=await seal('NL91ABNA0417164300');
 await db.insert(s.coopParticipants).values([{id:A,name:'Anna',memberClass:'A',company,holder:'A. de Vries',ibanSealed:iban,ibanLast4:'4300',created:t,updated:t},
  {id:B,name:'Bauke',memberClass:'B',ibanSealed:iban,ibanLast4:'4300',created:t,updated:t},{id:C,name:'Cato',memberClass:'B',ibanSealed:iban,ibanLast4:'4300',created:t,updated:t},
  {id:D,name:'Dirk',memberClass:'C',ibanSealed:iban,ibanLast4:'4300',created:t,updated:t}]);
 // Anna: producten 9% (excl 1000 + btw 90, inclusief btw) en een voorschot op de winst 4200. Bauke 10000, Cato 3000 (nooit gekozen).
 await credit([{participantId:A,day:W,kind:'winkel-week',amountCents:1090,source:'winkel:'+W,note:'Producten',meta:JSON.stringify({vat:{'9':1000},vatIn:{'9':90}})},
  {participantId:A,day:W,kind:'pot-week',amountCents:4200,source:'pot:restaurant:'+W,note:'Voorschot op de winst'},
  {participantId:B,day:W,kind:'pot-week',amountCents:10000,source:'pot:restaurant:'+W,note:'Voorschot op de winst'},
  {participantId:C,day:W,kind:'pot-week',amountCents:3000,source:'pot:restaurant:'+W,note:'Voorschot op de winst'}],'Rianne');
 await bank.saveAccounts({main:1,tegoed:2,btw:3,potten:4,cooperatie:5},0,'Bartele');
 await assert.rejects(()=>bb.setChoice(A,{choice:'deel'},'Anna'),/blijft staan/);
 await bb.setChoice(A,{choice:'alles'},'Anna');await bb.setChoice(B,{choice:'deel',keepCents:2500},'Bauke');
 let v=await bb.mondayView(M);
 assert.deepEqual(v.rows.map(r=>[r.name,r.amountCents,r.status,r.kind]),[['Anna',5290,'aanvragen','creditfactuur'],['Bauke',7500,'aanvragen','overzicht'],['Cato',0,'geen','overzicht']],'C-leden niet; nooit gekozen = laten staan');
 assert.deepEqual(v.rows.flatMap(r=>r.warnings),[]);
 // Tegelijk twee keer draaien geeft per lid precies één aanvraag.
 const runs=await Promise.all([bb.runMonday(M,'Bartele'),bb.runMonday(M,'Rianne')]);assert.equal(runs[0]+runs[1],2);
 assert.equal(await bb.runMonday(M,'Bartele'),0,'nooit dubbel');
 v=await bb.mondayView(M);assert.deepEqual(v.rows.map(r=>r.status),['aangevraagd','aangevraagd','geen']);
 // Een keuze wijzigen na het aanvragen verandert de aanvraag van deze maandag niet.
 await bb.setChoice(B,{choice:'alles'},'Bauke');assert.equal((await bb.mondayView(M)).rows[1].amountCents,7500);
 // Goedkeuren en bevestigen gaat zoals elke uitbetaling.
 let o=await bank.bankOverview();
 for(const p of o.payouts.filter(p=>p.status==='aangevraagd'))await bank.approvePayout(p.id,p.version,'Bartele');
 for(const [id] of mock.state.drafts)mock.accept(id);
 await bank.refreshPayouts('Bartele');
 assert.equal((await bank.memberTegoed(A)).balanceCents,0);assert.equal((await bank.memberTegoed(B)).balanceCents,2500);
 // Documenten: Anna een creditfactuur met de btw die al in het BB zat (niet nog eens erbovenop); Bauke een uitbetalingsoverzicht.
 const docs=await bb.documentList();assert.deepEqual(docs.map(d=>[d.name,d.kind,d.totalCents]).sort(),[['Anna','creditfactuur',5290],['Bauke','overzicht',7500]]);
 const fa=await bb.documentView(docs.find(d=>d.name==='Anna').id,A);assert.match(fa.number,/^BBC-\\d{4}-0001$/);
 assert.match(fa.text,/Geleverde producten \\(9% btw\\): €\\s10,00 \\+ btw 9% €\\s0,90/);assert.match(fa.text,/Voorschot op de winst \\(winstverdeling, geen btw\\): €\\s42,00/);assert.match(fa.text,/overgemaakt naar je rekening: €\\s52,90/);
 await assert.rejects(()=>bb.documentView(fa.id,B),/niet gevonden/,'alleen het eigen document');
 assert.equal((await bb.memberDocuments(B))[0].kind,'overzicht');
 assert.equal(await bb.ensureDocuments('Bartele'),0,'één document per uitbetaling');
 // De regels staan op het document: bij een volgende uitbetaling komen ze er niet nog eens op.
 const linked=(await db.select().from(s.bbEntries)).filter(e=>e.participantId===A);assert.ok(linked.every(e=>e.documentId===fa.id));
 await mock.stop();console.log('ok');`));

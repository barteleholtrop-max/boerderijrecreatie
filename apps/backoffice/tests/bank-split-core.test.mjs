// Bankverdeling en BB-tegoed (wens eigenaar 6 november 2026): rekenregels.
import {test} from 'node:test';
import assert from 'node:assert/strict';
const core=await import('../lib/bank-split-core.ts');
const acc=(id,iban)=>({id,iban,description:'r'+id});
const ACCOUNTS={main:acc(1,'NL11'),tegoed:acc(2,'NL22'),btw:acc(3,'NL33'),potten:acc(4,'NL44'),cooperatie:acc(5,'NL55')};
const mollie=(id,cents,o={})=>({id,created:'2026-11-03T08:00:00Z',amountCents:cents,description:'',counterpartyName:'Stichting Mollie Payments',counterpartyIban:'NL00',...o});
const input=o=>({week:'2026-11-02',label:'week 45',inflows:[mollie(1,60000),mollie(2,40000)],members:[],funds:[],vatCents:0,blockers:[],notes:[],accounts:ACCOUNTS,...o});
const line=(p,t)=>p.lines.find(l=>l.target===t).cents;

test('alleen bijschrijvingen van Mollie tellen',()=>{
 assert.ok(core.isMollieInflow(mollie(1,100)));
 assert.ok(core.isMollieInflow(mollie(1,100,{counterpartyName:'',description:'Uitbetaling Mollie st.2026...'})));
 assert.equal(core.isMollieInflow(mollie(1,-100)),false,'afschrijving');
 assert.equal(core.isMollieInflow(mollie(1,100,{counterpartyName:'Rianne',description:'broodjes'})),false);
});

test('de verdeling: leden, potten en btw eerst; de rest naar de coöperatie, dus die draagt de Mollie-kosten',()=>{
 const members=core.sumMembers([{participantId:'a',name:'Anna',source:'winkel',label:'Winkel',cents:12000},{participantId:'a',name:'Anna',source:'pot:restaurant',label:'Restaurant',cents:3050},{participantId:'b',name:'Bauke',source:'winkel',label:'Winkel',cents:8000}]);
 const p=core.planSplit(input({members,funds:[{fundId:'k',name:'Kippen',cents:1500}],vatCents:7300,inflows:[mollie(1,60000),mollie(2,40000),mollie(3,999,{counterpartyName:'Rianne'})]}));
 assert.equal(p.receivedCents,100000,'alleen Mollie');assert.deepEqual(p.inflows.map(x=>x.id),[1,2]);
 assert.equal(line(p,'tegoed'),23050);assert.equal(line(p,'potten'),1500);assert.equal(line(p,'btw'),7300);
 assert.equal(line(p,'cooperatie'),100000-23050-1500-7300);
 assert.equal(p.lines.reduce((n,l)=>n+l.cents,0),p.receivedCents,'alles samen is precies wat er binnenkwam');
 assert.ok(p.ready);assert.deepEqual(p.members.map(m=>m.name),['Anna','Bauke']);
 assert.equal(p.members[0].sources.length,2);
});

test('te weinig binnengekomen, geen rekening of niets van Mollie: niet verdelen',()=>{
 const members=[{participantId:'a',name:'Anna',cents:200000,sources:[]}];
 const p=core.planSplit(input({members}));
 assert.equal(p.ready,false);assert.match(p.blockers.join(' '),/Wacht op de volgende uitbetaling van Mollie/);assert.equal(line(p,'cooperatie'),0);
 assert.equal(core.planSplit(input({inflows:[]})).ready,false);
 const noBtw=core.planSplit(input({vatCents:100,accounts:{...ACCOUNTS,btw:undefined}}));assert.match(noBtw.blockers.join(' '),/Btw-reserve/);
 const same=core.planSplit(input({members:[{participantId:'a',name:'A',cents:100,sources:[]}],accounts:{...ACCOUNTS,tegoed:ACCOUNTS.main}}));assert.match(same.blockers.join(' '),/niet dezelfde rekening/);
 const blocked=core.planSplit(input({blockers:['Keur eerst de weekafsluiting goed.']}));assert.equal(blocked.ready,false);
});

test('negatieve bedragen worden niet verrekend maar wel gemeld',()=>{
 const p=core.planSplit(input({members:[{participantId:'a',name:'Anna',cents:-500,sources:[]}],funds:[{fundId:'k',name:'Kippen',cents:-200}],vatCents:-50}));
 assert.equal(line(p,'tegoed'),0);assert.equal(line(p,'potten'),0);assert.equal(line(p,'btw'),0);assert.equal(p.warnings.length,3);assert.ok(p.ready);
});

test('coöperatie mag bunq Main zelf zijn: dan blijft dat deel staan',()=>{
 const p=core.planSplit(input({accounts:{...ACCOUNTS,cooperatie:ACCOUNTS.main},vatCents:100}));
 assert.ok(p.ready);assert.deepEqual(core.transfersOf(p,ACCOUNTS.main).map(l=>l.target),['btw']);
 assert.equal(core.transferRef('2026-11-02','btw'),'BB-VERDELING 2026-11-02 btw');
});

test('BB-tegoed: saldo, vastgehouden aanvragen en de controle van een uitbetaalaanvraag',()=>{
 const b=core.tegoedBalance([{amountCents:5000},{amountCents:2500},{amountCents:-1000}],[{amountCents:2000,status:'aangevraagd'},{amountCents:1000,status:'uitbetaald'},{amountCents:500,status:'afgewezen'}]);
 assert.deepEqual(b,{balanceCents:6500,heldCents:2000,availableCents:4500});
 const ok={availableCents:4500,hasIban:true,open:0};
 assert.equal(core.checkPayoutRequest(4500,ok),4500);
 assert.match(core.checkPayoutRequest(4501,ok),/maximaal € 45,00/);
 assert.match(core.checkPayoutRequest(99,ok),/vanaf € 1,00/);
 assert.match(core.checkPayoutRequest(12.5,ok),/Vul een bedrag in/);
 assert.match(core.checkPayoutRequest('4500',ok),/Vul een bedrag in/);
 assert.match(core.checkPayoutRequest(100,{...ok,hasIban:false}),/IBAN/);
 assert.match(core.checkPayoutRequest(100,{...ok,open:1}),/al een uitbetaling/);
 assert.equal(core.payoutStatusFromDraft('ACCEPTED',true),'uitbetaald');assert.equal(core.payoutStatusFromDraft('ACCEPTED'),'aandacht','bevestigd zonder afschrijving');
 assert.deepEqual(core.tegoedBalance([{amountCents:1000}],[{amountCents:400,status:'aandacht'}]).availableCents,600,'aandacht houdt het tegoed vast');assert.equal(core.payoutStatusFromDraft('PENDING'),'in-bunq');
 assert.equal(core.payoutStatusFromDraft('REJECTED'),'geweigerd-in-bunq');assert.equal(core.payoutStatusFromDraft('CANCELLED'),'geweigerd-in-bunq');
});

test('BB stap 3: met BB betaald gaat van de lijn BB-tegoed af en blijft bij de coöperatie',async()=>{
 const {planSplit}=await import('../lib/bank-split-core.ts');
 const acc={main:{id:1,iban:'NL01',description:'Main'},tegoed:{id:2,iban:'NL02',description:'BB'},btw:{id:3,iban:'NL03',description:'Btw'},potten:{id:4,iban:'NL04',description:'Potten'},cooperatie:{id:5,iban:'NL05',description:'Coop'}};
 const base={week:'2027-03-01',label:'week 9',inflows:[{id:1,created:'2027-03-02',amountCents:10000,description:'Mollie',counterpartyName:'Stichting Mollie Payments',counterpartyIban:''}],
  members:[{participantId:'a',name:'Anna',cents:3000,sources:[]}],funds:[],vatCents:700,blockers:[],notes:[],accounts:acc};
 let p=planSplit({...base,bbSpentCents:1200});const by=Object.fromEntries(p.lines.map(l=>[l.target,l.cents]));
 assert.deepEqual(by,{tegoed:1800,potten:0,btw:700,inkoop:0,cooperatie:7500});assert.equal(p.bbSpentCents,1200);assert.equal(p.warnings.length,0);
 p=planSplit({...base,bbSpentCents:4000});assert.equal(p.lines.find(l=>l.target==='tegoed').cents,0);assert.match(p.warnings.join(' '),/met de hand over van BB-tegoed leden naar de coöperatie/);
});

test('inkoop (besluit eigenaar 9 november 2026): 30% van de restaurant- en Ite-omzet zonder btw naar Inkoop, uit het coöperatiedeel',async()=>{
 const {planSplit,purchaseOf,readPurchase,DEFAULT_PURCHASE}=await import('../lib/bank-split-core.ts');
 assert.deepEqual(DEFAULT_PURCHASE,{restaurant:3000,ite:3000});
 assert.deepEqual(readPurchase('{"restaurant":2500,"ite":3000,"x":99999}'),{restaurant:2500,ite:3000},'ongeldige waarde valt weg');
 assert.deepEqual(readPurchase('kapot'),DEFAULT_PURCHASE);
 const p=purchaseOf([{pot:'restaurant',exclCents:100000},{pot:'ite',exclCents:50001},{pot:'speelboerderij',exclCents:30000}],DEFAULT_PURCHASE);
 assert.equal(p.cents,30000+15000,'speelboerderij heeft geen inkoop; afronden op hele centen');assert.equal(p.lines.length,2);
 const acc={main:{id:1,iban:'NL01',description:'Main'},tegoed:{id:2,iban:'NL02',description:'BB'},btw:{id:3,iban:'NL03',description:'Btw'},potten:{id:4,iban:'NL04',description:'Potten'},cooperatie:{id:5,iban:'NL05',description:'Coop'}};
 // € 1.090 binnen via Mollie: € 90 btw, € 300 naar de pot (BB-tegoed leden), € 300 inkoop, € 400 coöperatie.
 const base={week:'2027-03-01',label:'week 9',inflows:[{id:1,created:'2027-03-02',amountCents:109000,description:'Mollie',counterpartyName:'Stichting Mollie Payments',counterpartyIban:''}],
  members:[{participantId:'a',name:'Anna',cents:30000,sources:[]}],funds:[],vatCents:9000,purchaseCents:30000,blockers:[],notes:[],accounts:acc};
 let plan=planSplit(base);const by=Object.fromEntries(plan.lines.map(l=>[l.target,l.cents]));
 assert.deepEqual(by,{tegoed:30000,potten:0,btw:9000,inkoop:30000,cooperatie:40000});
 assert.match(plan.blockers.join(' '),/Kies eerst de bunq-rekening voor Inkoop/,'zonder rekening Inkoop eerst kiezen');
 plan=planSplit({...base,accounts:{...acc,inkoop:{id:6,iban:'NL06',description:'Inkoop'}}});assert.equal(plan.ready,true);
});

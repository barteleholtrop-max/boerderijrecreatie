// Restaurantpot per dag en weekafrekening (besluit eigenaar 5 november 2026).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './helpers/ts-resolve.mjs';
const {split,dayPot,weekPot,lineAmounts,weekDays,POT_STATIONS}=await import('../lib/pot-day-core.ts');
const roles=[{id:'chef-kok',name:'Chef-kok',points:4},{id:'bediening',name:'Bediening',points:2},{id:'afwas',name:'Afwas',points:2}];
const agreement={id:'a1',pot:'restaurant',status:'geldig',validFrom:'2026-11-02',decidedAt:'2026-11-01',percentBp:3000,roles};
const names=new Map([['anna','Anna'],['bram','Bram'],['cees','Cees']]);
const base={pot:'restaurant',agreements:[agreement],names};

test('delen tellen altijd precies op tot de pot, ook negatief',()=>{
 assert.deepEqual(split(100,[1,1,1]),[34,33,33]);
 assert.deepEqual(split(-100,[1,1,1]),[-34,-33,-33]);
 assert.deepEqual(split(1000,[4,2,2]),[500,250,250]);
 assert.deepEqual(split(1001,[4,2,2]),[501,250,250]);
 assert.deepEqual(split(50,[]),[]);assert.deepEqual(split(50,[0,0]),[0,0]);
 for(const t of [0,1,7,999,12345,-77])assert.equal(split(t,[3,1.5,2,0.5]).reduce((s,x)=>s+x,0),t);
});

test('de pot van de dag: percentage van de normale omzet excl. btw, naar punten; fooienpot gelijk per persoon',()=>{
 const d=dayPot({...base,day:'2026-11-04',
  shifts:[{day:'2026-11-04',participantId:'anna',roleId:'chef-kok'},{day:'2026-11-04',participantId:'bram',roleId:'bediening'},{day:'2026-11-04',participantId:'cees',roleId:'afwas'}],
  revenue:[{day:'2026-11-04',normalExclCents:100000,paidExclCents:103000},{day:'2026-11-04',normalExclCents:20000,paidExclCents:19000},{day:'2026-11-05',normalExclCents:50000,paidExclCents:50000}]});
 assert.equal(d.normalExclCents,120000);assert.equal(d.potCents,36000);assert.equal(d.tipCents,2000);assert.equal(d.totalPoints,8);assert.equal(d.pointValueCents,4500);
 assert.deepEqual(d.people.map(p=>[p.name,p.points,p.shareCents,p.tipCents]),[['Anna',4,18000,667],['Bram',2,9000,667],['Cees',2,9000,666]]);
 assert.equal(d.distributedCents,38000);assert.deepEqual(d.warnings,[]);
});

test('lager gekozen bedrag: de fooienpot is negatief en gaat er gelijk per persoon af',()=>{
 const d=dayPot({...base,day:'2026-11-04',shifts:[{day:'2026-11-04',participantId:'anna',roleId:'bediening'},{day:'2026-11-04',participantId:'bram',roleId:'bediening'}],revenue:[{day:'2026-11-04',normalExclCents:10000,paidExclCents:9000}]});
 assert.deepEqual(d.people.map(p=>p.tipCents),[-500,-500]);assert.deepEqual(d.people.map(p=>p.shareCents),[1500,1500]);
});

test('waarschuwingen: geen afspraak, niemand met een rol, onbekende rol',()=>{
 const none=dayPot({...base,day:'2026-11-01',shifts:[],revenue:[{day:'2026-11-01',normalExclCents:5000,paidExclCents:5500}]});
 assert.equal(none.potCents,0);assert.match(none.warnings.join(' '),/nog geen afspraak/);
 const empty=dayPot({...base,day:'2026-11-03',shifts:[],revenue:[{day:'2026-11-03',normalExclCents:10000,paidExclCents:10500}]});
 assert.equal(empty.potCents,3000);assert.match(empty.warnings.join(' '),/niet verdeeld/);assert.equal(empty.distributedCents,0);
 const odd=dayPot({...base,day:'2026-11-03',shifts:[{day:'2026-11-03',participantId:'anna',roleId:'dj'}],revenue:[{day:'2026-11-03',normalExclCents:10000,paidExclCents:10000}]});
 assert.match(odd.warnings.join(' '),/bestaat niet in de afspraak/);assert.equal(odd.people[0].points,0);
});

test('de week: zeven dagen, totaal per lid, een negatief weektotaal wordt niet overgemaakt',()=>{
 assert.deepEqual(weekDays('2026-11-02'),['2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-07','2026-11-08']);
 const w=weekPot({...base,monday:'2026-11-02',
  shifts:[{day:'2026-11-02',participantId:'anna',roleId:'chef-kok'},{day:'2026-11-03',participantId:'anna',roleId:'chef-kok'},{day:'2026-11-03',participantId:'bram',roleId:'afwas'},{day:'2026-11-04',participantId:'cees',roleId:'afwas'}],
  revenue:[{day:'2026-11-02',normalExclCents:10000,paidExclCents:11000},{day:'2026-11-03',normalExclCents:60000,paidExclCents:60000},{day:'2026-11-04',normalExclCents:0,paidExclCents:-5000}]});
 const anna=w.people.find(p=>p.name==='Anna'),cees=w.people.find(p=>p.name==='Cees');
 assert.equal(anna.days,2);assert.equal(anna.points,8);assert.equal(anna.shareCents,3000+12000);assert.equal(anna.tipCents,1000);assert.equal(anna.payoutCents,16000);
 assert.equal(cees.totalCents,-5000);assert.equal(cees.payoutCents,0);assert.match(w.warnings.join(' '),/Cees: negatief weektotaal/);
 assert.equal(w.payoutTotalCents,w.people.reduce((s,p)=>s+p.payoutCents,0));
});

test('verkoopregels: normaal en betaald bedrag excl. btw; alleen kok en barista tellen voor de restaurantpot',()=>{
 assert.deepEqual(lineAmounts({totalCents:1090,vatCents:90,paidCents:null,paidVatCents:null}),{normalExclCents:1000,paidExclCents:1000});
 assert.deepEqual(lineAmounts({totalCents:1090,vatCents:90,paidCents:1308,paidVatCents:108}),{normalExclCents:1000,paidExclCents:1200});
 assert.deepEqual(POT_STATIONS.restaurant,['kok','barista']);
});

test('Supabase-indeling en toegang: tabellen met beveiliging per rij, ledenpagina alleen lezen',()=>{
 const sql=fs.readFileSync(new URL('../drizzle-pg/0011_restaurantpot.sql',import.meta.url),'utf8');
 for(const t of ['pot_shifts','pot_weeks']){assert.match(sql,new RegExp(`CREATE TABLE "${t}"`));assert.match(sql,new RegExp(`ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY`))}
 assert.match(fs.readFileSync(new URL('../lib/member-routes.ts',import.meta.url),'utf8'),/'beloning'/);
 const member=fs.readFileSync(new URL('../app/api/deelnemer/[token]/beloning/route.ts',import.meta.url),'utf8');assert.doesNotMatch(member,/export async function POST/);
 const lib=fs.readFileSync(new URL('../lib/pot-days.ts',import.meta.url),'utf8');assert.match(lib,/al goedgekeurd en ligt vast/);assert.match(lib,/Keur weken op volgorde goed/);
 // Oefenstand (proefbestellingen meerekenen) kan nooit worden goedgekeurd: goedkeuren rekent altijd zonder proefbestellingen.
 assert.match(lib,/export async function approvePotWeek[^]*?const v=await potWeek\(potId,monday\);/);assert.match(lib,/withTest\|\|Number\(r\.test\)!==1/);
});

// ---- Personeelsplanning (besluit eigenaar 5 november 2026)
const {needOf,daySlots,claimProblem}=await import('../lib/pot-day-core.ts');
const {isWeekTask,parseProposal}=await import('../lib/pot-core.ts');

test('meer rollen op een dag: punten tellen op, de fooienpot blijft per persoon',()=>{
 const d=dayPot({...base,day:'2026-11-04',shifts:[{day:'2026-11-04',participantId:'anna',roleId:'bediening'},{day:'2026-11-04',participantId:'anna',roleId:'afwas'},{day:'2026-11-04',participantId:'bram',roleId:'chef-kok'}],
  revenue:[{day:'2026-11-04',normalExclCents:80000,paidExclCents:81000}]});
 assert.deepEqual(d.people.map(p=>[p.name,p.roleName,p.points,p.shareCents,p.tipCents]),[['Anna','Bediening + Afwas',4,12000,500],['Bram','Chef-kok',4,12000,500]]);
});

test('alleen aanwezig telt mee; gepland zonder aanmelden geeft na de dag een waarschuwing',()=>{
 const shifts=[{day:'2026-11-04',participantId:'anna',roleId:'chef-kok',status:'aanwezig'},{day:'2026-11-04',participantId:'bram',roleId:'bediening',status:'gepland'}];
 const after=dayPot({...base,day:'2026-11-04',shifts,revenue:[{day:'2026-11-04',normalExclCents:10000,paidExclCents:10000}],today:'2026-11-05'});
 assert.deepEqual(after.people.map(p=>p.name),['Anna']);assert.equal(after.people[0].shareCents,3000);assert.match(after.warnings.join(' '),/Bram: Bediening gepland, maar niet aangemeld/);
 const same=dayPot({...base,day:'2026-11-04',shifts,revenue:[],today:'2026-11-04'});assert.deepEqual(same.warnings,[]);
});

test('behoefte per rol: per dag, anders standaard, anders 1 (extra bij drukte 0)',()=>{
 const needs=[{day:'',roleId:'bediening',count:2},{day:'2026-11-07',roleId:'bediening',count:3}];
 assert.equal(needOf(needs,'2026-11-06',{id:'bediening'}),2);assert.equal(needOf(needs,'2026-11-07',{id:'bediening'}),3);
 assert.equal(needOf(needs,'2026-11-06',{id:'afwas'}),1);assert.equal(needOf(needs,'2026-11-06',{id:'extra-bediening'}),0);
 const slots=daySlots(roles,needs,[{day:'2026-11-06',participantId:'anna',roleId:'bediening',status:'gepland'}],'2026-11-06',names);
 assert.deepEqual(slots.map(s=>[s.roleId,s.need,s.people.length,s.open]),[['chef-kok',1,0,1],['bediening',2,1,1],['afwas',1,0,1]]);
});

test('claimen: alleen leden, open dagen, vanaf vandaag, niet dubbel en niet boven de behoefte',()=>{
 const o={day:'2026-11-06',today:'2026-11-05',open:true,locked:false,member:true,roles,roleId:'afwas',needs:[],shifts:[],participantId:'anna'};
 assert.equal(claimProblem(o),null);
 assert.match(claimProblem({...o,day:'2026-11-04'}),/voorbij/);
 assert.match(claimProblem({...o,day:'2026-12-31'}),/zes weken/);
 assert.match(claimProblem({...o,open:false}),/gesloten/);
 assert.match(claimProblem({...o,member:false}),/niet bij deze pot/);
 assert.match(claimProblem({...o,locked:true}),/goedgekeurd/);
 assert.match(claimProblem({...o,roleId:'dj'}),/niet in de afspraak/);
 assert.match(claimProblem({...o,shifts:[{day:'2026-11-06',participantId:'anna',roleId:'afwas'}]}),/heb je al/);
 assert.match(claimProblem({...o,participantId:'bram',shifts:[{day:'2026-11-06',participantId:'anna',roleId:'afwas'}]}),/vol/);
});

test('weektaken: schoonmaak en organisatie, ook in oudere afspraken; in een voorstel aan of uit te zetten',()=>{
 assert.equal(isWeekTask({id:'schoonmaak'}),true);assert.equal(isWeekTask({id:'organisatie'}),true);assert.equal(isWeekTask({id:'afwas'}),false);
 assert.equal(isWeekTask({id:'schoonmaak',week:false}),false);
 const p=parseProposal({pot:'restaurant',validFrom:'2026-11-09',percentBp:3000,roles:[{name:'Schoonmaak',points:1},{name:'Afwas',points:2,week:true}]},'2026-11-05');
 assert.deepEqual(p.roles.map(r=>[r.id,r.week]),[['schoonmaak',true],['afwas',true]]);
});

test('aanmelden kan alleen in de backoffice (tablet), niet via de ledenlink',()=>{
 const member=fs.readFileSync(new URL('../app/api/deelnemer/[token]/rooster/route.ts',import.meta.url),'utf8');
 assert.doesNotMatch(member,/checkIn|aanwezig/);assert.match(member,/isSameOrigin/);
 const owner=fs.readFileSync(new URL('../app/api/pot-planning/route.ts',import.meta.url),'utf8');assert.match(owner,/authorizeSheet\(req,true\)/);
 const sql=fs.readFileSync(new URL('../drizzle-pg/0012_personeelsplanning.sql',import.meta.url),'utf8');assert.match(sql,/ALTER TABLE "pot_needs" ENABLE ROW LEVEL SECURITY/);
});

test('Ite by Boer Bart: verkoop op de Ite-avond naar de Ite-pot, de rest naar het restaurant, nooit allebei',async()=>{
 const {iteMoment,lineForPot,POT_STATIONS}=await import('../lib/pot-day-core.ts');
 const donderdagAvond={weekday:4,from:'19:00',to:''};
 // 5 november 2026 is een donderdag; Amsterdam = UTC+1 in november.
 assert.equal(iteMoment('2026-11-05T18:30:00Z',donderdagAvond),true,'19.30 uur op donderdag');
 assert.equal(iteMoment('2026-11-05T17:30:00Z',donderdagAvond),false,'18.30 uur: nog geen Ite');
 assert.equal(iteMoment('2026-11-06T18:30:00Z',donderdagAvond),false,'vrijdagavond: geen Ite');
 assert.equal(iteMoment('2026-11-05T21:30:00Z',{weekday:4,from:'19:00',to:'22:00'}),false,'na de eindtijd');
 for(const at of ['2026-11-05T18:30:00Z','2026-11-05T10:00:00Z'])assert.equal(lineForPot('ite',at,donderdagAvond)!==lineForPot('restaurant',at,donderdagAvond),true,'precies één van de twee');
 assert.deepEqual(POT_STATIONS.ite,['kok','barista']);assert.deepEqual(POT_STATIONS.boerderij,[],'boerderij: geen omzet en geen dagrooster');
});

test('rollen per lid: zelf claimen alleen voor de rol waarvoor je bent aangenomen; Rianne en Bartele plannen iedereen in',()=>{
 const o={day:'2026-11-06',today:'2026-11-05',open:true,locked:false,member:true,roles,roleId:'afwas',needs:[],shifts:[],participantId:'anna'};
 assert.equal(claimProblem({...o,hired:['afwas']}),null);
 assert.match(claimProblem({...o,hired:[]}),/niet aangenomen/);
 assert.match(claimProblem({...o,hired:['chef-kok']}),/niet aangenomen/);
 assert.equal(claimProblem(o),null,'zonder hired (beheer) geen beperking');
 const planning=fs.readFileSync(new URL('../lib/pot-planning.ts',import.meta.url),'utf8');
 assert.match(planning,/hired:self\?/,'claim beperkt alleen bij de ledenpagina');
 const member=fs.readFileSync(new URL('../app/api/deelnemer/[token]/rooster/route.ts',import.meta.url),'utf8');
 assert.match(member,/\(ledenpagina\)',true\)/,'de ledenpagina claimt als lid zelf');
 const owner=fs.readFileSync(new URL('../app/api/pot-planning/route.ts',import.meta.url),'utf8');assert.match(owner,/await claim\(pot,b\.day,b\.roleId,b\.participantId,by\)/);
 const sql=fs.readFileSync(new URL('../drizzle-pg/0013_ledenrollen.sql',import.meta.url),'utf8');assert.match(sql,/ALTER TABLE "coop_participants" ADD COLUMN "pot_roles" text DEFAULT '\{\}' NOT NULL/);
});

test('aanbieden voor overname: teruggeven kan niet, een aangenomen collega neemt over',async()=>{
 const {takeOverProblem,daySlots}=await import('../lib/pot-day-core.ts');
 const shifts=[{day:'2026-11-08',participantId:'anna',roleId:'afwas',status:'gepland',offered:'2026-11-05T10:00:00Z'}];
 const o={day:'2026-11-08',today:'2026-11-05',locked:false,member:true,hired:['afwas'],roleId:'afwas',from:'anna',taker:'bram',shifts};
 assert.equal(takeOverProblem(o),null);
 assert.match(takeOverProblem({...o,hired:[]}),/niet aangenomen/);
 assert.match(takeOverProblem({...o,shifts:[{...shifts[0],offered:''}]}),/niet \(meer\) aangeboden/);
 assert.match(takeOverProblem({...o,shifts:[{...shifts[0],status:'aanwezig'}]}),/niet \(meer\) aangeboden/,'al aangemeld = niet meer over te nemen');
 assert.match(takeOverProblem({...o,taker:'anna'}),/eigen dienst/);
 assert.match(takeOverProblem({...o,day:'2026-11-04'}),/voorbij/);assert.match(takeOverProblem({...o,locked:true}),/vast/);
 assert.match(takeOverProblem({...o,shifts:[...shifts,{day:'2026-11-08',participantId:'bram',roleId:'afwas',status:'gepland'}]}),/al/);
 const slot=daySlots([{id:'afwas',name:'Afwas',points:2}],[],shifts,'2026-11-08',new Map([['anna','Anna']]))[0];
 assert.equal(slot.people[0].offered,true);assert.equal(slot.open,0,'een aangeboden dienst blijft bezet');
 const member=fs.readFileSync(new URL('../app/api/deelnemer/[token]/rooster/route.ts',import.meta.url),'utf8');
 assert.doesNotMatch(member,/release|vrijgeven/,'een lid kan niet teruggeven');assert.match(member,/action==='overnemen'/);
 const sql=fs.readFileSync(new URL('../drizzle-pg/0015_dienst_overnemen.sql',import.meta.url),'utf8');assert.match(sql,/ADD COLUMN "offered" text DEFAULT '' NOT NULL/);
 assert.match(fs.readFileSync(new URL('../lib/pot-planning.ts',import.meta.url),'utf8'),/set\(\{status:'aanwezig',offered:'',/,'aanmelden op de tablet haalt het aanbod weg');
});

test('halve dienst: de helft van de punten, de fooienpot blijft gelijk per persoon',async()=>{
 const {dayPot}=await import('../lib/pot-day-core.ts');
 const a={id:'a',pot:'restaurant',status:'geldig',validFrom:'2026-11-01',decidedAt:'x',percentBp:3000,roles:[{id:'bediening',name:'Bediening',points:2}]};
 const r=dayPot({day:'2026-11-06',pot:'restaurant',agreements:[a],names:new Map([['anna','Anna'],['bram','Bram']]),revenue:[{day:'2026-11-06',normalExclCents:30000,paidExclCents:30000}],
  shifts:[{day:'2026-11-06',participantId:'anna',roleId:'bediening',status:'aanwezig'},{day:'2026-11-06',participantId:'bram',roleId:'bediening',status:'aanwezig',half:true}]});
 const anna=r.people.find(p=>p.participantId==='anna'),bram=r.people.find(p=>p.participantId==='bram');
 assert.equal(bram.points,1);assert.equal(anna.points,2);assert.match(bram.roleName,/halve dienst/);
 assert.equal(anna.shareCents+bram.shareCents,9000);assert.equal(anna.shareCents,6000);
});
test('personeelsnorm uit de verwachting: gasten × € 15, norm van de eigenaar, met de hand gaat voor',async()=>{
 const {staffNorm,normNeeds,needOf,daySlots,claimProblem,SPEND_PER_GUEST_CENTS}=await import('../lib/pot-day-core.ts');
 assert.equal(SPEND_PER_GUEST_CENTS,1500);
 const sum=c=>Object.values(c).reduce((n,x)=>n+x,0);
 assert.deepEqual([750,1500,2500,5000,5001].map(e=>sum(staffNorm(e*100))),[2,3,4,5,6]);
 assert.deepEqual(staffNorm(400000),{chef:1,kok:1,hoofdbediening:1,bediening:1,afwas:1,extra:0});
 const roles=[{id:'chef-kok',name:'Chef-kok',points:4},{id:'kok',name:'Kok',points:3},{id:'hoofdbediening',name:'Hoofdbediening',points:3},{id:'bediening',name:'Bediening',points:2},
  {id:'extra-bediening',name:'Extra bediening bij drukte',points:2},{id:'afwas',name:'Afwas',points:2},{id:'schoonmaak',name:'Schoonmaak',points:1,week:true}];
 const auto=normNeeds(roles,100*SPEND_PER_GUEST_CENTS); // 100 gasten = € 1.500
 assert.deepEqual(auto,{'chef-kok':1,kok:0,hoofdbediening:1,bediening:1,'extra-bediening':0,afwas:0},'weektaken niet');
 assert.equal(needOf([],'2027-05-01',roles[3],true,auto),1);
 assert.equal(needOf([{day:'2027-05-01',roleId:'bediening',count:3}],'2027-05-01',roles[3],true,auto),3,'met de hand gaat voor');
 assert.equal(needOf([],'2027-05-01',roles[3],false,auto),0,'gesloten: geen automatische plekken');
 const slots=daySlots(roles,[],[],'2027-05-01',new Map(),true,normNeeds(roles,300*SPEND_PER_GUEST_CENTS)); // € 4.500
 assert.deepEqual(slots.filter(s=>s.need&&s.roleId!=='schoonmaak').map(s=>s.roleId),['chef-kok','kok','hoofdbediening','bediening','afwas']); // weektaak houdt eigen plek
 const base={day:'2027-05-01',today:'2027-04-28',open:true,locked:false,member:true,roles,roleId:'bediening',needs:[],participantId:'b'};
 assert.equal(claimProblem({...base,shifts:[{day:'2027-05-01',participantId:'a',roleId:'bediening',status:'gepland'}],auto:normNeeds(roles,50*SPEND_PER_GUEST_CENTS)}),'Deze rol is al vol op die dag.');
 assert.equal(claimProblem({...base,shifts:[{day:'2027-05-01',participantId:'a',roleId:'bediening',status:'gepland'}],auto:normNeeds(roles,150*SPEND_PER_GUEST_CENTS)}),null,'bij € 2.250 twee bediening');
});

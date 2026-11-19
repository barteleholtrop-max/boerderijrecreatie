// Pot-afspraken (besluit eigenaar 5 november 2026): voorstel controleren, instemming van alle leden, welke afspraak geldt.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseProposal,consentState,agreementOn,START_ROLES,POTS,percentText} from '../lib/pot-core.ts';
const today='2026-11-05';
const ok={pot:'restaurant',validFrom:'2026-11-09',percentBp:3000,roles:START_ROLES.map(r=>({name:r.name,points:r.points})),note:'  Startpunt 19 oktober '};

test('een geldig voorstel: percentage van de omzet excl. btw, rollen met punten per dag, fooi gelijk per persoon',()=>{
 const p=parseProposal(ok,today);
 assert.equal(p.pot,'restaurant');assert.equal(p.percentBp,3000);assert.equal(p.tipRule,'gelijk');assert.equal(p.note,'Startpunt 19 oktober');
 assert.deepEqual(p.roles.map(r=>r.id),['chef-kok','hoofdbediening','bediening','extra-bediening-bij-drukte','afwas','schoonmaak','organisatie']);
 assert.equal(percentText(3000),'30%');assert.equal(percentText(1250),'12,5%');
 assert.deepEqual(POTS.map(p=>p.unit),['restaurant','speelboerderij','ite','boerderij']); // Groepen & feesten weg (besluit eigenaar 6 november 2026) // Ite en Boerderij erbij (besluit eigenaar 5 november 2026)
});

test('een voorstel wordt geweigerd bij onjuiste invoer',()=>{
 assert.throws(()=>parseProposal({...ok,pot:'winkel'},today),/Kies een pot/);
 assert.throws(()=>parseProposal({...ok,validFrom:'2026-11-04'},today),/vanaf vandaag/);
 assert.throws(()=>parseProposal({...ok,validFrom:'2026-02-30'},today),/vanaf vandaag/);
 assert.throws(()=>parseProposal({...ok,percentBp:0},today),/percentage/);
 assert.throws(()=>parseProposal({...ok,percentBp:12.5},today),/percentage/);
 assert.throws(()=>parseProposal({...ok,roles:[]},today),/1 tot 20 rollen/);
 assert.throws(()=>parseProposal({...ok,roles:[{name:'Afwas',points:1.25}]},today),/halve punten/);
 assert.throws(()=>parseProposal({...ok,roles:[{name:'Afwas',points:0}]},today),/0,5 tot 20/);
 assert.throws(()=>parseProposal({...ok,roles:[{name:'Afwas',points:1},{name:'afwas',points:2}]},today),/dezelfde naam/);
 assert.throws(()=>parseProposal({...ok,tipRule:'punten'},today),/fooiregel/);
 assert.equal(parseProposal({...ok,roles:[{name:'Afwas',points:1.5}]},today).roles[0].points,1.5);
});

test('pas geldig als ALLE leden van de pot akkoord zijn; een niet-akkoord houdt het tegen',()=>{
 const c=(participantId,decision)=>({participantId,decision,via:'ledenkaart',at:'',note:''});
 assert.deepEqual(consentState(['a','b','c'],[c('a','akkoord')]),{agreed:['a'],objected:[],missing:['b','c'],complete:false});
 assert.equal(consentState(['a','b'],[c('a','akkoord'),c('b','niet-akkoord')]).complete,false);
 assert.equal(consentState(['a','b'],[c('a','akkoord'),c('b','akkoord')]).complete,true);
 assert.equal(consentState(['a'],[c('a','akkoord'),c('x','niet-akkoord')]).complete,true,'alleen de leden van de pot tellen');
 assert.equal(consentState([],[]).complete,false,'zonder leden geen geldige afspraak');
});

test('de geldende afspraak: de laatste geldige die op of vóór de dag is ingegaan; voorstellen tellen niet',()=>{
 const a=(id,validFrom,status='geldig',pot='restaurant',decidedAt='2026-11-01')=>({id,pot,status,validFrom,decidedAt});
 const list=[a('oud','2026-10-19'),a('nieuw','2026-11-09'),a('voorstel','2026-11-02','voorstel'),a('weg','2026-11-03','ingetrokken'),a('ander','2026-11-04','geldig','groepen')];
 assert.equal(agreementOn(list,'restaurant','2026-11-05').id,'oud');
 assert.equal(agreementOn(list,'restaurant','2026-11-09').id,'nieuw');
 assert.equal(agreementOn(list,'restaurant','2026-10-01'),null);
 assert.equal(agreementOn([a('x','2026-11-01','geldig','restaurant','2026-11-01T08'),a('y','2026-11-01','geldig','restaurant','2026-11-02T08')],'restaurant','2026-11-05').id,'y');
});

test('Supabase-indeling: tabellen in schema.ts, migratie in drizzle-pg met beveiliging per rij',()=>{
 const sql=fs.readFileSync(new URL('../drizzle-pg/0007_pot_afspraken.sql',import.meta.url),'utf8');
 for(const t of ['pot_agreements','pot_consents']){assert.match(sql,new RegExp(`CREATE TABLE "${t}"`));assert.match(sql,new RegExp(`ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY`))}
 const schema=fs.readFileSync(new URL('../db/schema.ts',import.meta.url),'utf8');
 assert.match(schema,/pgTable\('pot_agreements'/);assert.match(schema,/pgTable\('pot_consents'/);
 assert.ok(!fs.readdirSync(new URL('../drizzle/',import.meta.url)).some(f=>/pot/.test(f)),'geen SQLite-migratie');
});

test('de ledenpagina mag de afspraken openen; een lid beslist alleen voor zichzelf',()=>{
 const proxy=fs.readFileSync(new URL('../proxy.ts',import.meta.url),'utf8');assert.match(fs.readFileSync(new URL('../lib/member-routes.ts',import.meta.url),'utf8'),/'afspraken'/);
 const route=fs.readFileSync(new URL('../app/api/deelnemer/[token]/afspraken/route.ts',import.meta.url),'utf8');
 assert.match(route,/isSameOrigin/);assert.match(route,/decide\(b\.id,p\.id,/);
 const lib=fs.readFileSync(new URL('../lib/pot-agreements.ts',import.meta.url),'utf8');assert.match(lib,/hoort niet bij deze pot/);
});

test('potten: Ite by Boer Bart en Boerderij erbij, met eigen leden; alleen het restaurant begint met de rollen van oktober',async()=>{
 const {POTS,startRolesFor,START_ROLES}=await import('../lib/pot-core.ts');
 const {UNITS}=await import('../lib/members-core.ts');
 assert.deepEqual(POTS.map(p=>p.id),['restaurant','speelboerderij','ite','boerderij']); // Groepen & feesten weg (6 november 2026)
 for(const p of POTS)assert.ok(UNITS.some(([k])=>k===p.unit),'elk onderdeel staat op de ledenkaart: '+p.unit);
 assert.equal(POTS.find(p=>p.id==='ite').name,'Ite by Boer Bart');
 assert.deepEqual(startRolesFor('restaurant'),START_ROLES);assert.deepEqual(startRolesFor('ite'),[]);assert.deepEqual(startRolesFor('boerderij'),[]);
});

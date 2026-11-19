import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {votingRight,aCandidate,yearsBetween,anniversary,parseMemberFields,parseSelfFields,readUnits} from '../lib/members-core.ts';
const today='2026-11-05';
const m=(memberClass,memberSince='',voting='auto')=>({memberClass,memberSince,voting});

test('stemrecht volgens het reglement: A ja, C nee, B pas na 5 jaar; het bestuur kan het per lid aanpassen',()=>{
 assert.equal(votingRight(m('A'),today).has,true);
 assert.equal(votingRight(m('C','2010-01-01'),today).has,false);
 assert.deepEqual(votingRight(m('B','2022-03-01'),today),{has:false,reason:'B-lid: stemrecht vanaf 2027-03-01'});
 assert.equal(votingRight(m('B','2021-11-05'),today).has,true);
 assert.equal(votingRight(m('B','2021-11-06'),today).has,false);
 assert.match(votingRight(m('B',''),today).reason,/lid sinds/);
 assert.equal(votingRight(m('','', 'auto'),today).has,false);
 assert.equal(votingRight(m('C','', 'ja'),today).has,true);
 assert.equal(votingRight(m('A','', 'nee'),today).has,false);
});
test('B-lid van 5 jaar of langer kan A-lid worden',()=>{
 assert.equal(aCandidate(m('B','2020-01-01'),today),true);
 assert.equal(aCandidate(m('B','2024-01-01'),today),false);
 assert.equal(aCandidate(m('A','2000-01-01'),today),false);
 assert.equal(yearsBetween('2020-02-29','2026-02-28'),5);assert.equal(anniversary('2020-02-29',5),'2025-03-01');
});
test('ledenkaart invullen: geldige keuzes, geen datum in de toekomst, alleen bekende onderdelen',()=>{
 const f=parseMemberFields({memberClass:'B',memberSince:'2024-04-01',voting:'auto',phone:'06 12345678',address:'Schoterweg 26',units:['restaurant','winkel','winkel'],bloeiMemberId:'BL-12'},today);
 assert.deepEqual(f.units,['restaurant','winkel']);
 // Levert producten (wens eigenaar 5 november 2026), bijvoorbeeld een deelnemer van de coöperatieve winkel.
 assert.deepEqual(parseMemberFields({memberClass:'C',memberSince:'',voting:'auto',units:['levert']},today).units,['levert']);assert.equal(f.bloeiMemberId,'BL-12');
 assert.throws(()=>parseMemberFields({memberClass:'D',memberSince:'',voting:'auto',units:[]},today),/A, B, C of leverancierslid/);
 assert.throws(()=>parseMemberFields({memberClass:'B',memberSince:'2030-01-01',voting:'auto',units:[]},today),/toekomst/);
 assert.throws(()=>parseMemberFields({memberClass:'B',memberSince:'',voting:'misschien',units:[]},today),/stemrecht/);
 assert.throws(()=>parseMemberFields({memberClass:'B',memberSince:'',voting:'auto',units:['kantoor']},today),/onderdelen/);
 assert.throws(()=>parseMemberFields({memberClass:'B',memberSince:'',voting:'auto',units:[],phone:'12'},today),/telefoonnummer/);
});
test('zelf wijzigen: alleen telefoon, adres en e-mail (een IBAN niet)',()=>{
 const f=parseSelfFields({phone:'+31 6 1234 5678',address:'Dorpsstraat 1',email:'Anna@Example.nl',iban:'NL00BANK0123456789',memberClass:'A'});
 assert.deepEqual(f,{phone:'+31 6 1234 5678',address:'Dorpsstraat 1',email:'anna@example.nl'});
 assert.throws(()=>parseSelfFields({email:'anna@'}),/e-mailadres/);
 assert.deepEqual(readUnits('["winkel"]'),['winkel']);assert.deepEqual(readUnits('kapot'),[]);
});
test('Supabase-indeling: de ledenkaart staat in de Postgres-opbouw, niet in een nieuwe SQLite-migratie',()=>{
 const pg=fs.readFileSync(new URL('../drizzle-pg/0006_ledenkaart.sql',import.meta.url),'utf8');
 for(const c of ['member_class','member_since','voting','phone','address','units','bloei_member_id'])assert.match(pg,new RegExp(`ADD COLUMN "${c}"`));
 const sqlite=fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).map(f=>fs.readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8')).join('\n');
 assert.ok(!sqlite.includes('member_class'));
});

test('rollen per lid: per pot aanvinken, alleen bij een aangevinkt onderdeel, en terug te lezen',async()=>{
 const {parsePotRoles,readPotRoles,hiredFor,POT_UNIT}=await import('../lib/members-core.ts');
 const {POTS}=await import('../lib/pot-core.ts');
 assert.deepEqual(Object.entries(POT_UNIT),POTS.map(p=>[p.id,p.unit]),'zelfde potten als pot-core');
 assert.deepEqual(parsePotRoles({restaurant:['afwas','afwas','chef-kok'],ite:['kok']},['restaurant']),{restaurant:['afwas','chef-kok']},'onderdeel uit = rollen uit');
 assert.deepEqual(parsePotRoles(undefined,['restaurant']),{});
 assert.throws(()=>parsePotRoles({kantoor:['x']},[]),/pot/);assert.throws(()=>parsePotRoles({restaurant:['<b>']},['restaurant']),/rollen/);
 assert.deepEqual(readPotRoles('{"restaurant":["afwas"],"x":["y"]}'),{restaurant:['afwas']});assert.deepEqual(readPotRoles('kapot'),{});
 assert.equal(hiredFor({restaurant:['afwas']},'restaurant','afwas'),true);assert.equal(hiredFor({restaurant:['afwas']},'ite','afwas'),false);
 const f=parseMemberFields({memberClass:'B',memberSince:'',voting:'auto',units:['restaurant'],potRoles:{restaurant:['afwas']}},'2026-11-05');
 assert.deepEqual(f.potRoles,{restaurant:['afwas']});
});
test('leverancierslid (besluit eigenaar 7 november 2026): geldig soort lid, geen stemrecht in de coöperatie, wel BB',async()=>{
 const {getsBb}=await import('../lib/bb-core.ts');
 assert.equal(parseMemberFields({memberClass:'L',memberSince:'',voting:'auto',units:['levert']},today).memberClass,'L');
 const v=votingRight({memberClass:'L',memberSince:'2020-01-01',voting:'auto'},today);assert.equal(v.has,false);assert.match(v.reason,/Winkel & leveranciers/);
 assert.equal(getsBb('L'),true);assert.equal(getsBb('C'),false);
});

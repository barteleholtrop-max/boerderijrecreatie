// Lid als bedrijf (wens eigenaar 6 november 2026): het lidmaatschap blijft hetzelfde, facturen gaan naar de bedrijfsgegevens.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './helpers/ts-resolve.mjs';
const {parseCompany,readCompany,invoiceParty}=await import('../lib/members-core.ts');
const ok={name:' Tuinderij  Bindert ',kvk:'1234 5678',vatNumber:'nl 123.456.789 b01',address:'Schoterweg 30',postcode:'8462td',city:'Rotstergaast',invoiceEmail:'',selfBilling:true};

test('bedrijfsgegevens worden netjes overgenomen',()=>{
 const c=parseCompany(ok,'2026-11-06');
 assert.deepEqual(c,{name:'Tuinderij Bindert',kvk:'12345678',vatNumber:'NL123456789B01',kor:false,address:'Schoterweg 30',postcode:'8462 TD',city:'Rotstergaast',invoiceEmail:'',selfBilling:true,since:'2026-11-06'});
 assert.equal(parseCompany(ok,'2026-12-01',c).since,'2026-11-06','instemming blijft van de eerste keer');
});
test('KvK, btw-nummer of KOR, adres en instemming zijn verplicht',()=>{
 for(const [k,v,msg] of [['name','',/naam/],['kvk','1234',/KvK/],['vatNumber','DE123',/NL123456789B01/],['vatNumber','',/KOR/],['postcode','84622',/postcode/],['city','',/plaats/],['selfBilling',false,/akkoord/],['invoiceEmail','geen-mail',/e-mailadres/]])
  assert.throws(()=>parseCompany({...ok,[k]:v},'2026-11-06'),msg,k);
 assert.equal(parseCompany({...ok,vatNumber:'',kor:true},'2026-11-06').kor,true,'onder de KOR zonder btw-nummer mag');
});
test('factuur gaat naar het bedrijf als dat er is, anders naar de persoon',()=>{
 const m={name:'Bindert de Vries',address:'Schoterweg 30, Rotstergaast',email:'bindert@example.com'};
 const c=parseCompany(ok,'2026-11-06');
 assert.deepEqual(invoiceParty(m,c),{kind:'bedrijf',name:'Tuinderij Bindert',lines:['Schoterweg 30','8462 TD Rotstergaast'],kvk:'12345678',vatNumber:'NL123456789B01',kor:false,email:'bindert@example.com'});
 assert.equal(invoiceParty(m,null).kind,'persoon');
 assert.equal(readCompany(''),null);assert.equal(readCompany('kapot'),null);assert.equal(readCompany(JSON.stringify(c)).kvk,'12345678');
});
test('migratie: kolom company op de bestaande ledenkaart, geen nieuw register',()=>{
 const sql=fs.readFileSync(new URL('../drizzle-pg/0021_lid_als_bedrijf.sql',import.meta.url),'utf8');
 assert.match(sql,/ALTER TABLE "coop_participants" ADD COLUMN "company" text DEFAULT '' NOT NULL/);assert.doesNotMatch(sql,/CREATE TABLE/);
});

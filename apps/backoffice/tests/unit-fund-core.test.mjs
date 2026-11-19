// Onderdeelpotten, eerst de kippenpot (wens eigenaar 5 november 2026): rekenwerk en controles.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './helpers/ts-resolve.mjs';
const {fundRevenue,fundBalance,parseEntry,parseShare,MAX_ENTRY_CENTS}=await import('../lib/unit-fund-core.ts');
const line=(o)=>({productId:'eieren',day:'2026-11-03',exclCents:1000,ownerId:null,counts:true,test:false,...o});

test('opbrengst: gekoppelde producten vanaf de koppeldag, excl. btw, min het coöperatiedeel',()=>{
 const r=fundRevenue([line(),line({day:'2026-11-04',exclCents:500}),line({day:'2026-11-01'}),line({productId:'jam'})],[{productId:'eieren',since:'2026-11-02'}],1000);
 assert.equal(r.exclCents,1500);assert.equal(r.shareCents,150);assert.equal(r.netCents,1350);
 assert.deepEqual(r.days.map(d=>d.day),['2026-11-04','2026-11-03'],'nieuwste eerst, niets van vóór de koppeldag of van andere producten');
});
test('opbrengst: niet wat een deelnemer toekomt, niet wat wacht of terugbetaald is, geen proef tenzij oefenen',()=>{
 const links=[{productId:'eieren',since:'2026-01-01'}];
 assert.equal(fundRevenue([line({ownerId:'ingeborg'})],links,0).exclCents,0,'regel van een deelnemer blijft van de deelnemer');
 assert.equal(fundRevenue([line({counts:false})],links,0).exclCents,0);
 assert.equal(fundRevenue([line({test:true})],links,0).exclCents,0);
 assert.equal(fundRevenue([line({test:true})],links,0,true).exclCents,1000);
});
test('saldo: opbrengst min uitgaven plus correcties; ingetrokken regels tellen niet',()=>{
 const e=(o)=>({id:'x',day:'2026-11-03',kind:'uitgave',amountCents:300,description:'Legmeel',paidBy:'cooperatie',voided:null,...o});
 const b=fundBalance(1350,[e(),e({amountCents:200,voided:'2026-11-04'}),e({kind:'correctie-plus',amountCents:100}),e({kind:'correctie-min',amountCents:50})]);
 assert.deepEqual(b,{revenueCents:1350,spentCents:300,correctionCents:50,balanceCents:1100});
});
test('nieuwe regel: beheerder alleen uitgaven, met bedrag, omschrijving en datum tot vandaag',()=>{
 const ctx={today:'2026-11-05',owner:false};
 const ok=parseEntry({amountCents:1895,description:'  Legmeel 25 kg,   Welkoop ',paidBy:'beheerder'},ctx);
 assert.deepEqual(ok,{day:'2026-11-05',kind:'uitgave',amountCents:1895,description:'Legmeel 25 kg, Welkoop',paidBy:'beheerder'});
 assert.match(parseEntry({kind:'correctie-plus',amountCents:100,description:'Fout hersteld'},ctx),/Alleen Boer Bart/);
 assert.equal(typeof parseEntry({kind:'correctie-plus',amountCents:100,description:'Fout hersteld'},{...ctx,owner:true}),'object');
 for(const amountCents of [0,-5,1.5,'10',MAX_ENTRY_CENTS+1])assert.equal(typeof parseEntry({amountCents,description:'Voer'},ctx),'string',String(amountCents));
 assert.match(parseEntry({amountCents:100,description:'x'},ctx),/waarvoor/);
 assert.match(parseEntry({amountCents:100,description:'Voer',day:'2026-11-06'},ctx),/tot en met vandaag/);
 assert.equal(parseEntry({amountCents:100,description:'Voer',paidBy:'iemand'},ctx).paidBy,'cooperatie');
});
test('coöperatiedeel: 0 tot en met 100%',()=>{
 assert.equal(parseShare(1500),1500);assert.equal(parseShare(0),0);
 for(const v of [-1,10001,1.5,'10',null])assert.equal(parseShare(v),null);
});
test('migratie: drie nieuwe tabellen met beveiliging per rij',()=>{
 const sql=fs.readFileSync(new URL('../drizzle-pg/0020_onderdeelpotten.sql',import.meta.url),'utf8');
 for(const t of ['unit_funds','unit_fund_products','unit_fund_entries']){assert.match(sql,new RegExp(`CREATE TABLE "${t}"`));assert.match(sql,new RegExp(`ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY`))}
});

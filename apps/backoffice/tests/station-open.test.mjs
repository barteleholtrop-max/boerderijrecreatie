// Werkplek open of dicht (wens eigenaar 14 november 2026): per werkplek altijd open, de openingstijden van de speelboerderij,
// winkel of Ite volgen, eigen tijden, of gesloten; plus „Nu niet beschikbaar”. Regels en opslag.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import './helpers/ts-resolve.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-werkplek-open-'));process.env.APP_DATA_DIR=dir;
const C=await import('../lib/station-open-core.ts');
const S=await import('../lib/station-open.ts');
const {closeDatabase}=await import('../lib/portable/env.ts');

// Zaterdag 14 november 2026, 14:00 en 20:30 Amsterdamse tijd (wintertijd: UTC+1).
const SAT_14=new Date('2026-11-14T13:00:00Z'),SAT_2030=new Date('2026-11-14T19:30:00Z'),THU_20=new Date('2026-11-12T19:00:00Z');
// Speelboerderij open za 10–17; winkel dezelfde tijden; Ite donderdag 19:00–22:00.
const guest={hours:Array.from({length:7},(_,i)=>({open:i===6||i===0,from:'10:00',to:'17:00'})),exceptions:[],services:{speelboerderij:true,winkel:true,yte:true},servicePauses:{},yteService:{weekday:4,from:'19:00',to:'22:00',configured:true}};
const rule=(patch={})=>({...C.defaultRule(),...patch});

test('regels: altijd, gesloten, openingstijden, eigen tijden en Ite',()=>{
 assert.equal(C.stationStatus('kok',rule(),guest,SAT_2030).open,true,'standaard altijd open: er verandert niets');
 assert.deepEqual(C.stationStatus('kok',rule({mode:'dicht'}),guest,SAT_14),{open:false,reason:'De keuken is nu gesloten.'});
 assert.equal(C.stationStatus('barista',rule({mode:'openingstijden',source:'speelboerderij'}),guest,SAT_14).open,true);
 assert.equal(C.stationStatus('barista',rule({mode:'openingstijden',source:'speelboerderij'}),guest,SAT_2030).open,false,'na sluitingstijd');
 assert.equal(C.stationStatus('kok',rule({mode:'openingstijden',source:'speelboerderij'}),{...guest,exceptions:[{date:'2026-11-14',hours:{open:false,from:'10:00',to:'17:00'},note:'dicht'}]},SAT_14).open,false,'uitzondering telt mee');
 assert.equal(C.stationStatus('kok',rule({mode:'openingstijden',source:'speelboerderij'}),{...guest,services:{speelboerderij:false,winkel:true,yte:true}},SAT_14).open,false,'onderdeel uit');
 assert.equal(C.stationStatus('kok',rule({mode:'openingstijden',source:'yte'}),guest,THU_20).open,true,'Ite-avond');
 assert.equal(C.stationStatus('kok',rule({mode:'openingstijden',source:'yte'}),guest,SAT_14).open,false);
 const own=rule({mode:'eigen',hours:Array.from({length:7},(_,i)=>({open:i===6,from:'20:00',to:'00:00'}))});
 assert.equal(C.stationStatus('kok',own,guest,SAT_2030).open,true,'eigen tijden, tot middernacht');
 assert.equal(C.stationStatus('kok',own,guest,SAT_14).open,false);
});
test('Nu niet beschikbaar: wint van alles, tot een tijd of tot iemand hem weer aanzet',()=>{
 const later=new Date(SAT_14.getTime()+3600000).toISOString(),earlier=new Date(SAT_14.getTime()-60000).toISOString();
 assert.deepEqual(C.stationStatus('barista',rule({paused:{until:null,at:'',by:'Sanne'}}),guest,SAT_14),{open:false,reason:'De koffiebar is nu even niet beschikbaar.'});
 assert.equal(C.stationStatus('barista',rule({paused:{until:later,at:'',by:''}}),guest,SAT_14).open,false);
 assert.equal(C.stationStatus('barista',rule({paused:{until:earlier,at:'',by:''}}),guest,SAT_14).open,true,'pauze voorbij');
 assert.equal(C.closedProblem([{station:'kok'},{station:'barista'}],{kok:{open:true,reason:''},barista:{open:false,reason:'De koffiebar is nu gesloten.'}}),'De koffiebar is nu gesloten. Haal dit uit je mandje of vraag het aan een van ons.');
 assert.equal(C.closedProblem([{station:'kok'}],{kok:{open:true,reason:''}}),null);
});
test('instellen controleren: geldige keuzes en tijden, de pauze blijft staan',()=>{
 const keep={...C.defaultSettings(),kok:rule({paused:{until:null,at:'x',by:'Bart'}})};
 const ok=C.checkSettings({...C.defaultSettings(),kok:rule({mode:'openingstijden',source:'winkel'})},keep);
 assert.equal(ok.kok.mode,'openingstijden');assert.equal(ok.kok.source,'winkel');assert.equal(ok.kok.paused.by,'Bart','pauze blijft');
 assert.throws(()=>C.checkSettings({...C.defaultSettings(),kok:rule({mode:'soms'})},keep),/Kies bij Kok/);
 const bad=rule({mode:'eigen'});bad.hours[1]={open:true,from:'18:00',to:'10:00'};
 assert.throws(()=>C.checkSettings({...C.defaultSettings(),barista:bad},keep),/na de openingstijd/);
 assert.equal(C.readSettings('{kapot').kok.mode,'altijd','onleesbaar: standaard');
});
test('opslag: instellen met versie, pauze aan en uit, stand',async t=>{
 const first=await S.getStationSettings();assert.equal(first.version,0);assert.equal(first.settings.kok.mode,'altijd');
 const v=await S.saveStationSettings({...first.settings,kok:rule({mode:'dicht'})},0,'Bart');assert.equal(v,1);
 await assert.rejects(()=>S.saveStationSettings(first.settings,0,'Rianne'),/net gewijzigd/);
 await S.setPaused('barista',true,null,'Sanne');
 const now=await S.getStationSettings();assert.equal(now.settings.kok.mode,'dicht');assert.equal(now.settings.barista.paused.by,'Sanne');
 const st=await S.stationStatuses();assert.equal(st.kok.open,false);assert.equal(st.barista.open,false);assert.equal(st.winkel.open,true);
 await S.setPaused('barista',false,null,'Sanne');assert.equal((await S.stationStatuses()).barista.open,true);
 await S.saveStationSettings({...(await S.getStationSettings()).settings,kok:rule()},3,'Bart');
 assert.equal((await S.getStationSettings()).settings.barista.paused,null,'pauze blijft uit na instellen');
});
test('werkplek stelt eigen tijden in: alleen die werkplek, pauze blijft (wens eigenaar 15 november 2026)',async()=>{
 const now=await S.getStationSettings();
 await S.setPaused('winkel',true,null,'Sanne');
 const v=(await S.getStationSettings()).version;
 await S.saveStationRule('winkel',rule({mode:'openingstijden',source:'winkel'}),v,'tablet winkel');
 const after=(await S.getStationSettings()).settings;
 assert.equal(after.winkel.mode,'openingstijden');assert.equal(after.winkel.paused.by,'Sanne','pauze blijft');
 assert.deepEqual(after.kok,now.settings.kok,'andere werkplek onveranderd');
 await assert.rejects(()=>S.saveStationRule('winkel',rule({mode:'soms'}),v+1,'x'),/Kies bij Winkel/);
 await assert.rejects(()=>S.saveStationRule('winkel',rule(),v,'x'),/net gewijzigd/);
 await S.setPaused('winkel',false,null,'Sanne');
});
test('database: eigen tabel met beveiliging per rij',()=>{
 const sql=fs.readFileSync(new URL('../drizzle-pg/0067_werkplek_open.sql',import.meta.url),'utf8');
 assert.match(sql,/CREATE TABLE "station_settings"/);assert.match(sql,/ALTER TABLE "station_settings" ENABLE ROW LEVEL SECURITY/);
});

test('opruimen',async()=>{await closeDatabase();fs.rmSync(dir,{recursive:true,force:true})});

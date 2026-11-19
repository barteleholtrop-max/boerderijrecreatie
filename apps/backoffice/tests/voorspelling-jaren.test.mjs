// Voorspelling daggasten: vergelijken met de jaren dat we open waren (besluit eigenaar 6 november 2026: in 2026 dicht → 2024 en 2025).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './helpers/ts-resolve.mjs';
import {allPgSql} from './helpers/pg-sql.mjs';
const {compareYears,parseYears,parseSettings,DEFAULT_SETTINGS}=await import('../lib/forecast-core.ts');
const {predict}=await import('../lib/guest-forecast.ts');

test('vergelijkingsjaren: de twee meest recente open jaren; 2026 telt standaard niet mee',()=>{
 assert.deepEqual(DEFAULT_SETTINGS.closedYears,[2026]);
 assert.deepEqual(compareYears(2026,[2026]),[2024,2025]);
 assert.deepEqual(compareYears(2027,[2026]),[2024,2025]);
 assert.deepEqual(compareYears(2028,[2026]),[2025,2027]);
 assert.deepEqual(compareYears(2027,[]),[2025,2026]);
 assert.deepEqual(parseYears('2026, 2020'),[2020,2026]);assert.throws(()=>parseYears('twintig'),/jaartallen/);
 assert.deepEqual(parseSettings({periodDays:28,manualPct:0}).closedYears,[2026],'zonder invoer blijft 2026 dicht');
});

test('de basis zoekt vergelijkbare dagen in 2024 én 2025, niet in 2026',()=>{
 // 12 november 2026 is een donderdag; donderdagen rond 12 november in 2025 en 2024.
 const v=(date,visitors)=>({date,visitors,temperature:10,rain:0});
 const visits=[v('2025-11-13',100),v('2025-11-06',120),v('2024-11-14',80),v('2024-11-07',90),v('2026-11-05',999)];
 const r=predict(visits,'2026-11-12',{temperature:11,rain:0},[2024,2025]);
 assert.equal(r.samples,4);assert.equal(r.expected,98);assert.match(r.reason,/2024 en 2025/);
 assert.equal(predict(visits,'2026-11-12',{temperature:11,rain:0}).samples,2,'zonder jaren: alleen vorig jaar (oud gedrag)');
 assert.equal(predict([v('2025-11-13',100)],'2026-11-12',{temperature:11,rain:0},[2024,2025]).expected,null,'minder dan drie dagen: geen basis');
});

test('instelling in de database en op het scherm',()=>{
 assert.match(allPgSql(),/"closed_years" text DEFAULT '\[2026\]'/);
 assert.match(fs.readFileSync(new URL('../app/planning/voorspelling-beheer.tsx',import.meta.url),'utf8'),/Jaren dat we dicht waren/);
 assert.match(fs.readFileSync(new URL('../lib/forecast.ts',import.meta.url),'utf8'),/predict\(visits,date,wd,compareYears\(/);
});

// Waakhond voor de database (7 november 2026): een hangende verbinding mag niet alle verzoeken 5 minuten laten wachten.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './helpers/ts-resolve.mjs';
const {withDeadline,DatabaseTimeout,queryLimitMs}=await import('../lib/portable/deadline.ts');

test('op tijd: gewoon de uitkomst, geen vernieuwing',async()=>{
 let resets=0;assert.equal(await withDeadline(Promise.resolve(7),50,()=>resets++),7);
 await assert.rejects(withDeadline(Promise.reject(Error('fout')),50,()=>resets++),/fout/);assert.equal(resets,0);
});
test('te laat: duidelijke fout en één keer vernieuwen',async()=>{
 let resets=0;await assert.rejects(withDeadline(new Promise(()=>{}),20,()=>resets++),e=>e instanceof DatabaseTimeout&&/antwoordt niet binnen/.test(e.message));
 assert.equal(resets,1);
});
test('grens standaard 20 seconden, instelbaar; Postgres-verbinding gebruikt de waakhond',()=>{
 const old=process.env.DATABASE_QUERY_SECONDS;delete process.env.DATABASE_QUERY_SECONDS;assert.equal(queryLimitMs(),20000);
 process.env.DATABASE_QUERY_SECONDS='5';assert.equal(queryLimitMs(),5000);if(old===undefined)delete process.env.DATABASE_QUERY_SECONDS;else process.env.DATABASE_QUERY_SECONDS=old;
 const env=fs.readFileSync(new URL('../lib/portable/env.ts',import.meta.url),'utf8');
 assert.match(env,/connect_timeout:10,max_lifetime:5\*60/);assert.match(env,/withDeadline\(p,ms,reset\)/);assert.match(env,/postgresJs\(url,forget\)/);
});

// Melding eigenaar 12 november 2026: „Het duurde 23 seconden” (ledenpagina). Dode verbindingen na stilte niet meer afwachten.
test('na stilte een verse pool; niet tijdens lopend werk; daarna dezelfde pool',async()=>{
 const {freshPool,staleMs}=await import('../lib/portable/deadline.ts');
 let t=0,made=0;const ended=[];const make=()=>{const id=++made;return {id,end:async()=>{ended.push(id)}}};
 const pool=freshPool(make,1000,()=>t);
 assert.equal(pool.get().id,1);t=500;assert.equal(pool.get().id,1,'kort na elkaar: dezelfde pool');
 t=2000;assert.equal(pool.get().id,2,'na stilte: vers');assert.deepEqual(ended,[1],'de oude pool wordt gesloten');
 let release;const busy=pool.use(p=>new Promise(r=>{release=()=>r(p.id)}));
 t=5000;assert.equal(pool.get().id,2,'tijdens lopend werk niet vervangen');release();assert.equal(await busy,2);
 const old=process.env.DATABASE_STALE_SECONDS;delete process.env.DATABASE_STALE_SECONDS;assert.equal(staleMs(),15000);if(old!==undefined)process.env.DATABASE_STALE_SECONDS=old;
 const env=fs.readFileSync(new URL('../lib/portable/env.ts',import.meta.url),'utf8');assert.match(env,/freshPool\(make,staleMs\(\)\)/);assert.match(env,/pool\.use\(q=>q\.begin/);
});

// Cloud Run-logboek 12 november 2026: telkens één onderdeel van de ledenpagina 60 seconden (de waakhond), de rest direct klaar.
// Oorzaak: postgres.js stuurt bij volle pool een vraag mee over een bezette verbinding; Supavisor raakt die soms kwijt.
test('beurten: nooit meer tegelijk dan vrije verbindingen, de rest wacht in volgorde; ook na een fout',async()=>{
 const {slots}=await import('../lib/portable/deadline.ts');
 const turn=slots(2);let now=0,peak=0;const order=[];
 const job=(id,ms,fail)=>turn(async()=>{now++;peak=Math.max(peak,now);await new Promise(r=>setTimeout(r,ms));now--;order.push(id);if(fail)throw Error('x')});
 const all=await Promise.allSettled([job(1,30),job(2,10,true),job(3,5),job(4,5),job(5,1)]);
 assert.equal(peak,2,'hooguit twee tegelijk');assert.equal(all.filter(r=>r.status==='rejected').length,1);assert.equal(order.length,5,'iedereen komt aan de beurt');
 const env=fs.readFileSync(new URL('../lib/portable/env.ts',import.meta.url),'utf8');
 assert.match(env,/const turn=slots\(Math\.max\(1,max-1\)\)/);assert.match(env,/await turn\(\(\)=>pool\.use\(q=>ask/);assert.match(env,/transaction:fn=>turn\(\(\)=>pool\.use\(q=>q\.begin/);
 assert.doesNotMatch(env,/max_pipeline/,'max_pipeline 0 breekt postgres.js 3.4');
});

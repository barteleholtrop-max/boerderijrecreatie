// Systeem & koppelingen zegt waarom online betalen aan of uit staat (12 november 2026: „staat nog niet aan” zonder reden).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('online betalen: status met reden, nooit de sleutel zelf',()=>{
 const code=`
 import './tests/helpers/ts-resolve.mjs';import assert from 'node:assert/strict';
 const {onlinePaymentStatus,connections}=await import('./lib/guest-connections.ts');const {runWithConnectionValues}=await import('./lib/connection-runtime.ts');
 const live='A'.repeat(64),run=(v,live)=>{if(live)process.env.BUNQ_LIVE_ENABLED='1';else delete process.env.BUNQ_LIVE_ENABLED;return runWithConnectionValues(v,onlinePaymentStatus)};
 assert.match(run({ONLINE_BETALEN:'bunq'},true).text,/geen bunq-sleutel/);
 assert.match(run({ONLINE_BETALEN:'bunq',GUEST_BUNQ_API_KEY:live},false).text,/BUNQ_LIVE_ENABLED/);
 assert.match(run({ONLINE_BETALEN:'bunq',GUEST_BUNQ_API_KEY:'abc-def'},true).text,/niet de goede vorm/);
 const ok=run({ONLINE_BETALEN:'bunq',GUEST_BUNQ_API_KEY:live},true);assert.equal(ok.on,true);assert.match(ok.text,/echte bank/);assert.doesNotMatch(ok.text,/AAAA/);
 assert.equal(run({ONLINE_BETALEN:'mollie',MOLLIE_API_KEY:'test_'+'a'.repeat(30)},false).on,true);
 assert.match(run({},false).text,/kies bij/);
 process.env.BUNQ_LIVE_ENABLED='1';
 const list=runWithConnectionValues({ONLINE_BETALEN:'bunq',GUEST_BUNQ_API_KEY:live},connections);
 assert.equal(list.find(c=>c.id==='mollie').status.on,true);assert.equal(list.find(c=>c.id==='bunq').status.on,true);assert.equal(list.find(c=>c.id==='gmail').status,undefined);
 `;
 const r=spawnSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',code],{cwd:new URL('../',import.meta.url),encoding:'utf8',env:{...process.env,BUNQ_API_BASE:''}});
 assert.equal(r.status,0,r.stderr+r.stdout);
});

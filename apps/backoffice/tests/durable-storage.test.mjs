// Online (Cloud Run) nooit stil tijdelijke opslag: zonder DATABASE_URL of Supabase Storage weigert de backoffice (#185/#190).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import './helpers/ts-resolve.mjs';
const D=await import('../lib/portable/durable.ts');

test('regels: alleen online (K_SERVICE) of met REQUIRE_DURABLE_STORAGE=1; ALLOW_EPHEMERAL_STORAGE=1 is de bewuste uitzondering',()=>{
 assert.deepEqual(D.durableProblems({}),[]);
 assert.deepEqual(D.durableProblems({K_SERVICE:'boerbart-backoffice'}),['DATABASE_URL','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY']);
 assert.deepEqual(D.durableProblems({REQUIRE_DURABLE_STORAGE:'1',DATABASE_URL:'postgres://x'}),['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY']);
 assert.deepEqual(D.durableProblems({K_SERVICE:'x',DATABASE_URL:'postgres://x',SUPABASE_URL:'https://x.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'k'}),[]);
 assert.deepEqual(D.durableProblems({K_SERVICE:'x',ALLOW_EPHEMERAL_STORAGE:'1'}),[]);
 assert.deepEqual(D.durableProblems({K_SERVICE:'x',DATABASE_URL:'  '}),['DATABASE_URL','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'],'alleen spaties telt niet');
});

test('de melding noemt namen, nooit waarden',()=>{
 const geheim='postgres://gebruiker:supergeheim@host/db';
 assert.throws(()=>D.assertDurableStorage({K_SERVICE:'x',DATABASE_URL:geheim}),e=>/SUPABASE_URL/.test(e.message)&&!e.message.includes('supergeheim'));
});

test('op Cloud Run zonder DATABASE_URL: database en bestanden weigeren, geen pgdata op de schijf, health geeft 503',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-durable-'));
 const code=`import './tests/helpers/ts-resolve.mjs';
const {env}=await import('./lib/portable/env.ts');
const {GET}=await import('./app/api/health/route.ts');
const out={};
try{await env.DB.prepare('SELECT 1').first();out.db='open'}catch(e){out.db=e.message}
try{await env.BUCKET.get('00000000-0000-0000-0000-000000000000');out.bucket='open'}catch(e){out.bucket=e.message}
const h=await GET();out.status=h.status;out.body=await h.json();
console.log(JSON.stringify(out));`;
 const envs={...process.env,K_SERVICE:'boerbart-backoffice',APP_DATA_DIR:dir};
 for(const k of ['DATABASE_URL','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','ALLOW_EPHEMERAL_STORAGE','REQUIRE_DURABLE_STORAGE'])delete envs[k];
 const r=spawnSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',code],{cwd:new URL('..',import.meta.url),env:envs,encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
 const out=JSON.parse(r.stdout.trim().split('\n').at(-1));
 assert.match(out.db,/Online opslag ontbreekt: DATABASE_URL/);assert.match(out.bucket,/Online opslag ontbreekt/);
 assert.equal(out.status,503);assert.equal(out.body.ok,false);assert.ok(out.body.problems.includes('DATABASE_URL ontbreekt'));
 assert.equal(fs.existsSync(path.join(dir,'pgdata')),false,'geen tijdelijke database aangemaakt');
 fs.rmSync(dir,{recursive:true,force:true});
});

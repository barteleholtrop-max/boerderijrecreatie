// Pushmeldingen online (#157): op Cloud Run nooit zelf sleutels aanmaken op de tijdelijke schijf.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const run=(extra)=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-push-'));
 const code=`import './tests/helpers/ts-resolve.mjs';
const P=await import('./lib/push.ts');
const out={};try{out.key=P.vapidKeys().publicKey.length>0}catch(e){out.error=e.message;out.off=e instanceof P.PushOff}
console.log(JSON.stringify(out));`;
 const env={...process.env,APP_DATA_DIR:dir,...extra};
 for(const k of ['K_SERVICE','VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','REQUIRE_DURABLE_STORAGE','ALLOW_EPHEMERAL_STORAGE'])if(!(k in extra))delete env[k];
 const r=spawnSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',code],{cwd:new URL('..',import.meta.url),env,encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
 const out=JSON.parse(r.stdout.trim().split('\n').at(-1));out.file=fs.existsSync(path.join(dir,'push-sleutels.json'));fs.rmSync(dir,{recursive:true,force:true});return out;
};

test('online zonder VAPID-instellingen: pushmeldingen uit, geen sleutelbestand op de tijdelijke schijf',()=>{
 const out=run({K_SERVICE:'boerbart-backoffice'});
 assert.equal(out.off,true);assert.match(out.error,/VAPID_PUBLIC_KEY en VAPID_PRIVATE_KEY/);assert.equal(out.file,false);
});
test('online met VAPID-instellingen: die sleutels worden gebruikt',()=>{
 const out=run({K_SERVICE:'boerbart-backoffice',VAPID_PUBLIC_KEY:'BPubliek',VAPID_PRIVATE_KEY:'geheim'});
 assert.equal(out.key,true);assert.equal(out.file,false);
});
test('op de eigen computer: sleutels worden één keer zelf gemaakt, zoals voorheen',()=>{
 const out=run({});assert.equal(out.key,true);assert.equal(out.file,true);
});

// Herinnering de dag ervoor, van begin tot eind: echte database-opbouw (PGlite in een tijdelijke map), een nep-pushdienst op deze
// computer en het versturen voor morgen (lib/member-push.ts → sendShiftReminders).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-herinnering-'));
process.env.APP_DATA_DIR=dir;
import './helpers/ts-resolve.mjs';
const {runQuery,closeDatabase,numberParams}=await import('../lib/portable/env.ts');
const {sendShiftReminders,subscribeMember}=await import('../lib/member-push.ts');
const got=[];const srv=http.createServer((q,s)=>{q.resume();q.on('end',()=>{got.push(q.url);s.writeHead(q.url.includes('weg')?410:201);s.end()})});
await new Promise(r=>srv.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+srv.address().port;
test.after(async()=>{srv.close();await closeDatabase();fs.rmSync(dir,{recursive:true,force:true})});
const q=async(sql,...p)=>(await runQuery(numberParams(sql),p,false)).rows;
const sub=p=>{const e=crypto.createECDH('prime256v1');e.generateKeys();return {endpoint:base+'/push/'+p,keys:{p256dh:e.getPublicKey().toString('base64url'),auth:crypto.randomBytes(16).toString('base64url')}}};

test('om 18.00 uur: één melding per lid met een rol morgen; weektaak alleen de eerste dag; afgewezen telefoon wordt opgeruimd',async()=>{
 const now=new Date().toISOString();
 for(const [id,name] of [['11111111-1111-1111-1111-111111111111','Anna Bakker'],['22222222-2222-2222-2222-222222222222','Bram Boer'],['33333333-3333-3333-3333-333333333333','Cees Kok']])
  await q(`INSERT INTO coop_participants(id,name,created,updated,units) VALUES(?,?,?,?,'["restaurant"]')`,id,name,now,now);
 await q(`INSERT INTO pot_agreements(id,pot,valid_from,percent_bp,roles,required,status,proposed_at) VALUES('a1','restaurant','2026-11-01',3000,?,'[]','geldig',?)`,
  JSON.stringify([{id:'bediening',name:'Bediening',points:2},{id:'schoonmaak',name:'Schoonmaak',points:1,week:true}]),now);
 const shift=(day,p,r)=>q(`INSERT INTO pot_shifts(pot,day,participant_id,role_id,status,at) VALUES('restaurant',?,?,?,'gepland',?)`,day,p,r,now);
 await shift('2026-11-06','11111111-1111-1111-1111-111111111111','bediening');
 await shift('2026-11-05','22222222-2222-2222-2222-222222222222','schoonmaak');await shift('2026-11-06','22222222-2222-2222-2222-222222222222','schoonmaak');
 await shift('2026-11-06','33333333-3333-3333-3333-333333333333','bediening');
 process.env.PUSH_TEST_ORIGINS=base;
 await subscribeMember('11111111-1111-1111-1111-111111111111',sub('anna'));
 await subscribeMember('22222222-2222-2222-2222-222222222222',sub('bram'));
 await subscribeMember('33333333-3333-3333-3333-333333333333',sub('weg-cees'));
 const n=await sendShiftReminders('2026-11-06');
 assert.deepEqual(got.sort(),['/push/anna','/push/weg-cees'],'Bram doet schoonmaak al sinds gisteren: geen herhaling');
 assert.equal(n,1,'alleen Anna is echt bezorgd');
 assert.equal((await q(`SELECT count(*)::int AS n FROM member_push WHERE endpoint LIKE '%weg-cees'`))[0].n,0,'een telefoon die de dienst afwijst wordt verwijderd');
 assert.equal(await sendShiftReminders('2026-11-09'),0,'zonder rollen niets');
});

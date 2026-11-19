// Leden uitschrijven en verwijderen (wens eigenaar 7 november 2026): verwijderen alleen zonder geschiedenis, uitschrijven bewaart alles.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import './helpers/ts-resolve.mjs';
test('uitschrijven, terugzetten en verwijderen',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-removal-'));process.env.APP_DATA_DIR=dir;process.env.DATABASE_URL='';
 const {env,closeDatabase}=await import('../lib/portable/env.ts'),r=await import('../lib/member-removal.ts'),{dayOf}=await import('../lib/member-agreement-core.ts');
 t.after(async()=>{await closeDatabase();fs.rmSync(dir,{recursive:true,force:true})});
 const at=new Date().toISOString(),today=dayOf(),later=new Date(Date.parse(today+'T12:00:00Z')+3*86400000).toISOString().slice(0,10),earlier=new Date(Date.parse(today+'T12:00:00Z')-3*86400000).toISOString().slice(0,10);
 const add=async name=>{const id=randomUUID();await env.DB.prepare('INSERT INTO coop_participants(id,name,email,member_class,units,pot_roles,created,updated) VALUES(?,?,?,?,?,?,?,?)').bind(id,name,'','B','["restaurant"]','{}',at,at).run();return id};
 const one=async(sql,...p)=>(await env.DB.prepare(sql).bind(...p).first());
 const dubbel=await add('Dubbel lid'),werker=await add('Werkend lid');
 for(const id of [dubbel,werker]){
  await env.DB.prepare('INSERT INTO coop_portal_links(participant_id,token_hash,token_sealed,created,created_by) VALUES(?,?,?,?,?)').bind(id,'h'+id,'s',at,'test').run();
  await env.DB.prepare("INSERT INTO pot_shifts(pot,day,participant_id,role_id,at,by,status) VALUES('restaurant',?,?,'afwas',?,'test','gepland')").bind(later,id,at).run();
 }
 await env.DB.prepare("INSERT INTO pot_shifts(pot,day,participant_id,role_id,at,by,status) VALUES('restaurant',?,?,'afwas',?,'test','aanwezig')").bind(earlier,werker,at).run();

 assert.deepEqual(await r.removalBlockers(dubbel),[]);
 assert.deepEqual(await r.removalBlockers(werker),['gewerkte diensten']);
 await assert.rejects(()=>r.deleteMember(werker,'test'),/gewerkte diensten.*Schrijf het lid uit/);
 assert.ok(await one('SELECT id FROM coop_participants WHERE id=?',werker),'geweigerd verwijderen laat alles staan');

 await r.signOffMember(werker,'test');
 assert.equal(Number((await one('SELECT active FROM coop_participants WHERE id=?',werker)).active),0);
 assert.equal(await one('SELECT participant_id FROM coop_portal_links WHERE participant_id=?',werker),null,'link ingetrokken');
 assert.equal(await one('SELECT day FROM pot_shifts WHERE participant_id=? AND day=?',werker,later),null,'toekomstige dienst vrij');
 assert.ok(await one('SELECT day FROM pot_shifts WHERE participant_id=? AND day=?',werker,earlier),'gewerkte dienst blijft bewaard');
 await r.restoreMember(werker,'test');assert.equal(Number((await one('SELECT active FROM coop_participants WHERE id=?',werker)).active),1);

 await r.deleteMember(dubbel,'test');
 assert.equal(await one('SELECT id FROM coop_participants WHERE id=?',dubbel),null);
 assert.equal(await one('SELECT participant_id FROM coop_portal_links WHERE participant_id=?',dubbel),null);
 await assert.rejects(()=>r.deleteMember(dubbel,'test'),/bestaat niet/);
});

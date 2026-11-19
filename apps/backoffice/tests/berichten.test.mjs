// Berichten (wens eigenaar 8 november 2026): elk pushbericht wordt bewaard; een tik op de melding opent dat bericht in de app.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import './helpers/ts-resolve.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('berichten worden bewaard per lid, ook zonder telefoon; lezen en gelezen markeren alleen eigen berichten',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-berichten-'));process.env.APP_DATA_DIR=dir;process.env.DATABASE_URL='';
 const {env,closeDatabase}=await import('../lib/portable/env.ts'),m=await import('../lib/member-push.ts');
 t.after(async()=>{await closeDatabase();fs.rmSync(dir,{recursive:true,force:true})});
 const at=new Date().toISOString(),a=randomUUID(),b=randomUUID();
 for(const id of [a,b])await env.DB.prepare('INSERT INTO coop_participants(id,name,email,created,updated) VALUES(?,?,?,?,?)').bind(id,'Lid '+id.slice(0,4),'',at,at).run();
 assert.equal(await m.notifyMembers([a,b],{title:'Drukker dan verwacht',body:'Help je een halve dienst mee?',tag:'hulp'}),0,'geen telefoons: niets verstuurd');
 const la=await m.memberMessageList(a);assert.equal(la.messages.length,1);assert.equal(la.unread,1);assert.equal(la.messages[0].title,'Drukker dan verwacht');
 await m.markMessagesRead(a);assert.equal((await m.memberMessageList(a)).unread,0);assert.equal((await m.memberMessageList(b)).unread,1,'ander lid ongemoeid');
});
test('melding opent de app op het bericht; route alleen eigen berichten via de persoonlijke link',()=>{
 const sw=read('public/deelnemer-sw.js');assert.match(sw,/'\?app=leden'\+\(m\.id\?'&bericht='\+encodeURIComponent\(String\(m\.id\)\)/);assert.match(sw,/c\.navigate\(url\)/);
 const r=read('app/api/deelnemer/[token]/berichten/route.ts');assert.match(r,/participantByToken\(token\)/);assert.match(r,/isSameOrigin\(req\)/);
 assert.match(fs.readFileSync(new URL('../lib/member-routes.ts',import.meta.url),'utf8'),/'berichten'/);assert.match(read('app/deelnemer/[token]/lid-pagina.tsx'),/<InboxBell /);
});

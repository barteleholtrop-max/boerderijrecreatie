// Omwisselen obligatie → participatie (wens eigenaar 8 november 2026): een aanvraag wordt een voorstel dat alleen de A-leden beslissen.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import './helpers/ts-resolve.mjs';
test('aanvraag → voorstel voor de A-leden; geldige keuze; niet twee tegelijk',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-omwissel-'));process.env.APP_DATA_DIR=dir;process.env.DATABASE_URL='';process.env.SHEETS_CONFIG_KEY='cd'.repeat(32);
 const {env,closeDatabase}=await import('../lib/portable/env.ts'),store=await import('../lib/bloei-real-store.ts'),swap=await import('../lib/bond-swap.ts'),o=await import('../lib/overleg.ts');
 t.after(async()=>{await closeDatabase();fs.rmSync(dir,{recursive:true,force:true})});
 const at=new Date().toISOString(),A1=randomUUID(),A2=randomUUID(),B=randomUUID(),H=randomUUID(),bloei='sc:H1';
 for(const [id,name,cls,bm] of [[A1,'Rianne','A',''],[A2,'Bartele','A',''],[B,'Bauke','B',''],[H,'Hanna','',bloei]])await env.DB.prepare('INSERT INTO coop_participants(id,name,email,member_class,bloei_member_id,created,updated) VALUES(?,?,?,?,?,?,?)').bind(id,name,'',cls,bm,at,at).run();
 const state={schema:1,mode:'imported',importedAt:at,digest:'t',members:[{id:bloei,externalId:null,name:'Hanna',emails:[],address:'',legalType:'person',iban:'',sourceRefs:[],issuer:false}],
  positions:[{id:'p1',memberId:bloei,scheme:'cash2',rate:2,units:3,unitCents:25000,serials:[],issued:null,matures:null,sourceRef:'t',origin:'foundation'}],credits:[],history:[],warnings:[],sources:[]};
 await env.DB.prepare("INSERT INTO bloei_administration(id,digest,data_sealed,sources_sealed,imported_at,imported_by) VALUES('main',?,?,?,?,?)").bind('t',store.sealImport(state),store.sealImport({files:[],extras:[],creditYear:2026}),at,'test').run();
 await assert.rejects(()=>swap.requestSwap(H,{scheme:'grocery6',units:1}),/Kies een van je obligaties/);
 await assert.rejects(()=>swap.requestSwap(H,{scheme:'cash2',units:4}),/1 tot en met 3/);
 const open=await swap.requestSwap(H,{scheme:'cash2',units:2});assert.equal(open.status,'voorstel');assert.match(open.title,/Hanna, 2 obligaties naar participatie/);
 const row=await env.DB.prepare("SELECT pot,voters,text FROM overleg_proposals WHERE pot='a-leden'").first();
 assert.deepEqual(JSON.parse(row.voters).sort(),[A1,A2].sort(),'alleen de A-leden');assert.match(row.text,/kan niet worden teruggedraaid/);
 await assert.rejects(()=>swap.requestSwap(H,{scheme:'cash2',units:1}),/al een aanvraag lopen/);
 const aView=await o.memberView(A1),bView=await o.memberView(B);assert.equal(aView.open.length,1);assert.equal(bView.open.length,0,'B-leden zien het niet');
});

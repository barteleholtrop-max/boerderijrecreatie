// Kaarten voor obligatiehouders (wens eigenaar 8 november 2026): automatisch, zonder dubbele kaarten.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import './helpers/ts-resolve.mjs';
test('nieuwe kaart met link, koppelen op e-mail, niets dubbel; uitgevers en houders zonder obligaties niet',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-houders-'));process.env.APP_DATA_DIR=dir;process.env.DATABASE_URL='';process.env.SHEETS_CONFIG_KEY='ab'.repeat(32);
 const {env,closeDatabase}=await import('../lib/portable/env.ts'),store=await import('../lib/bloei-real-store.ts'),{ensureHolderCards}=await import('../lib/bondholder-cards.ts');
 t.after(async()=>{await closeDatabase();fs.rmSync(dir,{recursive:true,force:true})});
 const id=()=>randomUUID(),at=new Date().toISOString(),pos=(memberId,units)=>({id:id(),memberId,scheme:'grocery6',rate:6,units,unitCents:25000,serials:[],issued:null,matures:null,sourceRef:'t',origin:'foundation'});
 const m=(name,email,issuer=false)=>({id:id(),externalId:null,name,emails:email?[email]:[],address:'',legalType:'person',iban:'',sourceRefs:[],issuer});
 const anna=m('Anna de Vries','anna@example.invalid'),piet=m('Piet Jansen','piet@example.invalid'),geen=m('Zonder Obligatie','z@example.invalid'),uitgever=m('Boer Bart','bb@example.invalid',true);
 const state={schema:1,mode:'imported',importedAt:at,digest:'t',members:[anna,piet,geen,uitgever],positions:[pos(anna.id,2),pos(piet.id,1),pos(uitgever.id,5),pos(geen.id,0)],credits:[],history:[],warnings:[],sources:[]};
 await env.DB.prepare("INSERT INTO bloei_administration(id,digest,data_sealed,sources_sealed,imported_at,imported_by) VALUES('main',?,?,?,?,?)").bind('t',store.sealImport(state),store.sealImport({files:[],extras:[],creditYear:2026}),at,'test').run();
 const pietCard=id();await env.DB.prepare('INSERT INTO coop_participants(id,name,email,created,updated) VALUES(?,?,?,?,?)').bind(pietCard,'Piet','PIET@example.invalid',at,at).run();
 const r=await ensureHolderCards('test');
 assert.deepEqual(r.created.map(c=>c.name),['Anna de Vries']);assert.deepEqual(r.linked.map(c=>c.name),['Piet Jansen']);assert.equal(r.holders,2);
 const annaRow=await env.DB.prepare('SELECT id,member_class,bloei_member_id,email FROM coop_participants WHERE bloei_member_id=?').bind(anna.id).first();
 assert.equal(annaRow.member_class,'');assert.equal(annaRow.email,'anna@example.invalid');
 assert.ok(await env.DB.prepare('SELECT participant_id FROM coop_portal_links WHERE participant_id=?').bind(annaRow.id).first(),'persoonlijke link gemaakt');
 assert.equal((await env.DB.prepare('SELECT bloei_member_id FROM coop_participants WHERE id=?').bind(pietCard).first()).bloei_member_id,piet.id);
 const again=await ensureHolderCards('test');assert.equal(again.created.length+again.linked.length,0);assert.equal(again.already,2);
});

// Wens eigenaar 8 november 2026: een obligatiehouder is geen coöperatielid. Bij Leden een eigen kopje, en een kaart zonder lidvelden.
test('Leden: obligatiehouders onder een eigen kopje, hun kaart zonder soort lid, stemrecht, vrijwilliger of onderdelen',()=>{
 const p=fs.readFileSync(new URL('../app/leden/page.tsx',import.meta.url),'utf8');
 assert.match(p,/const holderOnly=\(m:[^)]*\)=>!m\.memberClass&&!m\.volunteer&&!m\.units\.length&&!!m\.bloeiMemberId/);
 assert.match(p,/members\.filter\(m=>m\.active&&!holderOnly\(m\)\)\.map\(row\)/,'leden zonder obligatiehouders');
 assert.match(p,/<details className="member-holders">[\s\S]*Obligatiehouders \(\{holders\.length\}\)/,'eigen kopje');
 assert.match(p,/\{holderView\?<p className="small member-holder-note"[\s\S]*geen coöperatielid[\s\S]*Lid maken[\s\S]*<label>Soort lid/,'soort lid alleen voor leden');
 assert.match(p,/\{!holderView&&<>\n    \{\/\* Vrijwilliger/,'vrijwilliger en onderdelen alleen voor leden');
 assert.match(p,/\{!holderView&&<div className="member-stop">/);
 assert.match(p,/\{holderOnly\(m\)\?<Pill>Obligatiehouder<\/Pill>:m\.vote\.has/,'geen stemrecht-label bij een houder');
});

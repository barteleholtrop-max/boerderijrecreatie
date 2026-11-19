// Bon bij een uitgave van een pot (wens eigenaar 10 november 2026: „bij uitgaven de mogelijkheid geven om een foto of een bon
// toe te voegen”). Alleen de beheerder van de pot en de eigenaar; alleen foto (jpg/png/webp) of pdf; hooguit 5 MB.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import './helpers/ts-resolve.mjs';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
const JPG=new Uint8Array([255,216,255,224,0,16,74,70,73,70]).buffer,PDF=new TextEncoder().encode('%PDF-1.4\nbon\n%%EOF').buffer;
const text=async body=>Buffer.from(await new Response(body).arrayBuffer());
test('bon toevoegen, vervangen en bekijken; alleen beheerder en eigenaar',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-pot-bon-'));process.env.APP_DATA_DIR=dir;process.env.DATABASE_URL='';
 const {env,closeDatabase}=await import('../lib/portable/env.ts'),F=await import('../lib/unit-funds.ts');
 t.after(async()=>{await closeDatabase();fs.rmSync(dir,{recursive:true,force:true})});
 const at=new Date().toISOString(),lid=randomUUID(),ander=randomUUID();
 for(const id of [lid,ander])await env.DB.prepare('INSERT INTO coop_participants(id,name,email,created,updated) VALUES(?,?,?,?,?)').bind(id,'Lid '+id.slice(0,4),'',at,at).run();
 const fund=await F.createFund({name:'Kippen',managerId:lid},'eigenaar');
 const me={owner:false,name:'Lid',participantId:lid},other={owner:false,name:'Ander',participantId:ander},owner={owner:true,name:'eigenaar'};
 const e=await F.addEntry(fund,{kind:'uitgave',amountCents:1895,description:'Legmeel 25 kg',paidBy:'beheerder',day:at.slice(0,10)},me);
 assert.equal(await F.receiptOf(fund,e,me),null,'nog geen bon');
 await assert.rejects(F.attachReceipt(fund,e,new TextEncoder().encode('<html>').buffer,me),/Alleen een foto/);
 await assert.rejects(F.attachReceipt(fund,e,new ArrayBuffer(F.MAX_RECEIPT+1),me),/te groot/);
 await assert.rejects(F.attachReceipt(fund,e,JPG,other),/beheert deze pot niet/);
 await F.attachReceipt(fund,e,JPG,me);
 let r=await F.receiptOf(fund,e,me);assert.equal(r.mime,'image/jpeg');assert.deepEqual(new Uint8Array(await text(r.body)),new Uint8Array(JPG));
 const firstKey=(await env.DB.prepare('SELECT receipt_key FROM unit_fund_entries WHERE id=?').bind(e).first()).receipt_key;
 await F.attachReceipt(fund,e,PDF,me);r=await F.receiptOf(fund,e,owner);assert.equal(r.mime,'application/pdf');assert.match(r.name,/\.pdf$/);
 assert.equal(await env.BUCKET.get(firstKey),null,'de vervangen foto is weg');
 await assert.rejects(F.receiptOf(fund,e,other),/beheert deze pot niet/);
 const view=(await F.fundsManagedBy(lid))[0].entries.find(x=>x.id===e);assert.equal(view.receipt,'pdf');assert.ok(!('receiptKey' in view),'nooit de sleutel');
 await F.voidEntry(fund,e,me);await assert.rejects(F.attachReceipt(fund,e,JPG,me),/niet is ingetrokken/);
});
test('routes: beheerder via de ledenpagina, eigenaar via de backoffice; nooit in de beeldbank',()=>{
 const m=read('app/api/deelnemer/[token]/potbeheer/route.ts');assert.match(m,/receiptOf\(fund,entry,\{owner:false/);assert.match(m,/attachReceipt\(fund,entry/);assert.match(m,/sandbox/);
 const o=read('app/api/onderdeelpotten/route.ts');assert.match(o,/authorizeSheet\(req\)/);assert.match(o,/receiptOf\(/);
 assert.doesNotMatch(read('lib/unit-funds.ts').split('Bon bij een uitgave')[1],/insert\(media\)/);
 assert.match(read('app/deelnemer/[token]/potbeheer.tsx'),/accept="image\/\*,application\/pdf"/);
});

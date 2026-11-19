// Officiële documenten van de coöperatie (wens eigenaar 6 november 2026): bij Bedrijfsgegevens toevoegen, „Beschikbaar voor leden?”,
// alleen zichtbare documenten op de ledenpagina, controle bij downloaden.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
test('documenten: toevoegen, zichtbaar voor leden, downloaden en weghalen',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-docs-'));
 try{
  const code=`import './tests/helpers/ts-resolve.mjs';import assert from 'node:assert/strict';
   const d=await import('./lib/coop-documents.ts');
   const pdf=new File([Buffer.from('%PDF-1.4 akte van oprichting')],'akte.pdf',{type:'application/pdf'});
   await assert.rejects(()=>d.saveDocument(new File([Buffer.from('hallo wereld')],'x.pdf'),{title:'Akte',category:'akte'},'Bartele'),/geen herkenbare PDF/);
   await assert.rejects(()=>d.saveDocument(pdf,{title:'Akte',category:'iets'},'Bartele'),/soort document/);
   const id=await d.saveDocument(pdf,{title:'Akte van oprichting',category:'akte',version:'12 juni 2023'},'Bartele');
   const kvk=await d.saveDocument(new File([Buffer.from('%PDF-1.4 kvk')],'kvk.pdf'),{title:'KvK-uittreksel',category:'kvk',version:'2026',forMembers:'on'},'Bartele');
   assert.deepEqual((await d.memberDocuments()).map(x=>x.title),['KvK-uittreksel'],'alleen wat beschikbaar is voor leden');
   await assert.rejects(()=>d.downloadDocument(id,true),/niet gevonden/);
   assert.equal((await d.downloadDocument(id,false)).status,200,'de eigenaar kan alles downloaden');
   await d.setForMembers(id,true);assert.equal((await d.memberDocuments()).length,2);
   const r=await d.downloadDocument(id,true);assert.equal(Buffer.from(await r.arrayBuffer()).toString(),'%PDF-1.4 akte van oprichting');
   await d.removeDocument(kvk);assert.equal((await d.listDocuments()).length,1);await assert.rejects(()=>d.downloadDocument(kvk,false),/niet gevonden/);
   console.log('ok');`;
  const r=spawnSync(process.execPath,['--experimental-transform-types','--input-type=module','-e',code],{cwd:new URL('../',import.meta.url),env:{...process.env,APP_DATA_DIR:dir,SHEETS_CONFIG_KEY:'ab'.repeat(32)},encoding:'utf8',timeout:120000});
  assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/ok/);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

// Verhalen van de oude site (wens eigenaar 15 november 2026: „ga verder met de verhalen van de oude site”): vaste lijst
// gewone pagina's van Wix, als concept in Inhoud. Zonder internet; Wix wordt nagebootst. Bewaakt: alleen de tekst van de
// pagina (geen kop- en voettekst van de site), gewone tekst in kopstijl, letters met accenten, dubbele koppen één keer,
// alleen de vaste lijst, nooit dubbel, en een opmerking bij oude prijzen.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import './helpers/ts-resolve.mjs';
const W=await import('../lib/wix-blog.ts');
const {storyPage,PAGE_PHOTO}=await import('./helpers/wix-pagina.mjs');

test('een gewone pagina lezen',()=>{
 const p=W.parsePage(storyPage('Prijs per kind 17 euro.'),'jerseys');
 assert.equal(p.title,'Jerseys');assert.equal(p.slug,'jerseys');assert.equal(p.url,'https://www.example.nl/jerseys');
 assert.equal(p.summary,'Wij melken Jerseys, omdat ze de meeste melk van gras kunnen maken.');
 assert.equal(p.body,'## Fokkerij\n\nWij geloven in een koe die op onze grond optimaal presteert. We creëren een koe die van gras melk kan maken, met eigen stieren.\n\n• Licht van gewicht\n• Goed karakter\n\n## Bekijk\n\nPrijs per kind 17 euro.');
 for(const t of ['Menu Home','KvK','Schoterweg'])assert.ok(!p.body.includes(t),'geen kop- of voettekst van de site: '+t);
 assert.equal(p.photo,PAGE_PHOTO);
 assert.equal(W.parsePage(storyPage(),'obligatie'),null,'alleen de vaste lijst');
 assert.equal(W.parsePage('<main id="PAGES_CONTAINER"><p>Kort.</p></main>','gras'),null,'(bijna) geen tekst: niets');
 assert.ok(!Object.hasOwn(W.STORY_PAGES,'rondleiding'),'de rondleiding komt niet mee (besluit eigenaar)');
});

test('ophalen tegen een echte database: concept, nooit dubbel, opmerking bij prijzen',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-verhalen-'));
 try{const code=`
 import './tests/helpers/ts-resolve.mjs';import assert from 'node:assert/strict';
 const {storyPage}=await import('./tests/helpers/wix-pagina.mjs');
 const JPEG=new Uint8Array([255,216,255,224,0,16,74,70,73,70,0,1]);const calls=[];
 globalThis.fetch=async(url)=>{const u=String(url);calls.push(u);
  const ok=(b,t)=>({ok:true,status:200,url:u,headers:new Headers({'content-type':t}),arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)});
  if(u==='https://www.example.nl/jerseys')return ok(new TextEncoder().encode(storyPage('Prijs per kind 17 euro.')),'text/html');
  if(u==='https://www.example.nl/gras')return ok(new TextEncoder().encode('<main id="PAGES_CONTAINER"><p>Kort.</p></main>'),'text/html');
  if(u.startsWith('https://static.wixstatic.com/media/'))return ok(JPEG,'image/jpeg');
  throw new Error('onverwacht '+u);
 };
 const X=await import('./lib/wix-import.ts');const I=await import('./lib/inhoud.ts');
 let l=await X.wixStoryList();assert.equal(l.stories.length,17);assert.ok(l.stories.every(s=>!s.imported));
 await assert.rejects(()=>X.wixImportStories(['a','b','c','d']),/1 tot 3/);
 const r=await X.wixImportStories(['jerseys','gras','obligatie']);
 assert.deepEqual(r.map(x=>x.status),['nieuw','leeg','mislukt']);
 assert.match(r[0].note,/oude prijzen/);
 const it=(await I.listInhoud())[0];
 assert.equal(it.status,'concept');assert.equal(it.title,'Jerseys');assert.equal(it.source,'wix-pagina:jerseys');assert.equal(it.publishedAt,'');assert.match(it.photo,/^\\/api\\/media\\//);
 assert.deepEqual(I.publicInhoud(await I.publishedRows(),{site:'boerbart'}),[],'concept: nog niet op de site');
 assert.deepEqual((await X.wixImportStories(['jerseys'])).map(x=>x.status),['al-overgehaald']);
 assert.equal((await X.wixStoryList()).stories.find(s=>s.path==='jerseys').imported,true);
 assert.ok(!calls.some(c=>c.includes('obligatie')),'een adres buiten de lijst wordt nooit opgevraagd');
 // Publiceren zet de datum op vandaag.
 const p=await I.publishMany([it.id],'jan');assert.equal(p.published,1);
 assert.match((await I.listInhoud())[0].publishedAt,/^\\d{4}-\\d{2}-\\d{2}$/);
 console.log('verhalen ok');
 `;const r=spawnSync(process.execPath,['--experimental-transform-types','--input-type=module','-e',code],{cwd:new URL('../',import.meta.url),env:{...process.env,APP_DATA_DIR:dir,DATABASE_URL:''},encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stderr+'\n'+r.stdout);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

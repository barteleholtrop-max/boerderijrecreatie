// Oude blogs van example.nl (Wix) overhalen naar Inhoud, als concept (besluit eigenaar 13 november 2026: „Eerst concept”).
// Met een nagemaakte Wix-pagina in de vorm van de echte (BlogPosting-gegevens, content-viewer, post-footer), zodat de test
// zonder internet draait. Bewaakt: tekst, koppen en opsommingen, datum, coverfoto, filmpje, vertalingen overslaan, alleen
// vaste adressen, nooit dubbel, en daarna in één keer publiceren met de oude datum.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import './helpers/ts-resolve.mjs';
const W=await import('../lib/wix-blog.ts');

const {page,COVER}=await import('./helpers/wix-pagina.mjs');

test('een Wix-blog lezen: inleiding, koppen, alinea\'s, opsomming, datum, foto en filmpje',()=>{
 const p=W.parsePost(page(),'https://www.example.nl/post/onze-ideale-koe');
 assert.equal(p.title,'Onze ideale koe');assert.equal(p.publishedAt,'2018-03-11');assert.equal(p.slug,'onze-ideale-koe');
 assert.equal(p.summary,'Gras zo goedkoop mogelijk omzetten in voedsel. Daar hoort een ideale koe bij, maar hoe vind je die?');
 assert.equal(p.body,'## Kijken naar de omgeving\n\nAls je op zoek gaat naar de ideale koe & de juiste grond, moet je jezelf vragen stellen.\nTweede regel.\n\n• De geit\n• De Jersey\n\nSlot.');
 assert.ok(!p.body.includes('Facebook')&&!p.body.includes('color'),'geen knoppen of opmaakcode');
 assert.equal(p.photo,COVER);assert.equal(p.video,'https://www.youtube.com/watch?v=TfT49gaiktg');assert.equal(p.translation,'');
 // Datum in Nederlandse tijd: 30 juni 23.30 uur UTC is 1 juli.
 assert.equal(W.parsePost(page({date:'2018-06-30T23:30:00.000Z'}),'https://www.example.nl/post/x').publishedAt,'2018-07-01');
 assert.equal(W.parsePost('<html>geen blog</html>','https://www.example.nl/post/x'),null);
 // Oud adres met ö: leesbaar herkend, en een geldig nieuw adres.
 const u=W.parsePost(page(),'https://www.example.nl/post/van-boerderij-naar-co%C3%B6peratie');assert.equal(u.wixSlug,'van-boerderij-naar-coöperatie');assert.equal(u.slug,'van-boerderij-naar-cooperatie');
});

test('vertalingen herkennen (Engels, Duits), Nederlands niet',()=>{
 const en='<p>'+'We think that our cows and the grass are the best for you and this farm, but it is not that easy to have it from the start. '.repeat(3)+'</p>';
 const de='<p>'+'Wir sind auf dem Bauernhof und ihr seid nicht weit weg, das ist eine schöne Sache und wir freuen uns auf euch mit der Familie. '.repeat(3)+'</p>';
 assert.equal(W.parsePost(page({title:'The ideal cow',body:en}),'https://www.example.nl/post/a').translation,'Engels');
 assert.equal(W.parsePost(page({title:'Bauer Bart',body:de}),'https://www.example.nl/post/b').translation,'Duits');
 assert.equal(W.parsePost(page({title:'Wat is natuurinclusieve landbouw?'}),'https://www.example.nl/post/c').translation,'');
});

test('alleen blogadressen van de eigen site',()=>{
 const xml='<urlset><url><loc>https://www.example.nl/post/onze-ideale-koe</loc></url><url><loc>https://www.example.nl/blog</loc></url>'+
  '<url><loc>https://evil.example/post/x</loc></url><url><loc>https://www.example.nl/post/onze-ideale-koe</loc></url><url><loc>https://www.example.nl/post/a/b</loc></url></urlset>';
 assert.deepEqual(W.postUrls(xml),['https://www.example.nl/post/onze-ideale-koe']);
 for(const u of ['http://www.example.nl/post/x','https://example.nl.evil.example/post/x','https://www.example.nl/post/x?y=1','https://www.example.nl/post/'])assert.equal(W.WIX_POST.test(u),false,u);
});

test('overhalen tegen een echte database: concept met oude datum, foto in de beeldbank, nooit dubbel, daarna publiceren',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-oude-blogs-'));
 try{const code=`
 import './tests/helpers/ts-resolve.mjs';import assert from 'node:assert/strict';
 const {page}=await import('./tests/helpers/wix-pagina.mjs');
 const JPEG=new Uint8Array([255,216,255,224,0,16,74,70,73,70,0,1]);const calls=[];
 const en='<p>'+'We think that our cows and the grass are the best for you and this farm, but it is not that easy to have it from the start. '.repeat(3)+'</p>';
 globalThis.fetch=async(url)=>{calls.push(String(url));const u=String(url);
  const ok=(body,type)=>({ok:true,status:200,url:u,headers:new Headers({'content-type':type}),arrayBuffer:async()=>typeof body==='string'?new TextEncoder().encode(body).buffer:body.buffer});
  if(u.endsWith('/blog-posts-sitemap.xml'))return ok('<urlset><url><loc>https://www.example.nl/post/onze-ideale-koe</loc></url><url><loc>https://www.example.nl/post/the-ideal-cow</loc></url><url><loc>https://www.example.nl/post/kapot</loc></url></urlset>','text/xml');
  if(u.endsWith('/post/onze-ideale-koe'))return ok(page(),'text/html');
  if(u.endsWith('/post/the-ideal-cow'))return ok(page({title:'The ideal cow',body:en}),'text/html');
  if(u.endsWith('/post/kapot'))return {ok:false,status:500,url:u,headers:new Headers(),arrayBuffer:async()=>new ArrayBuffer(0)};
  if(u.startsWith('https://static.wixstatic.com/'))return ok(JPEG,'image/jpeg');
  throw new Error('onverwacht adres '+u);
 };
 const I=await import('./lib/inhoud.ts');const X=await import('./lib/wix-import.ts');
 const {getDb}=await import('./db/index.ts');const {media}=await import('./db/schema.ts');const before=(await getDb().select().from(media)).length;
 let l=await X.wixList();assert.equal(l.total,3);assert.ok(l.posts.every(p=>!p.imported));
 await assert.rejects(()=>X.wixImport(['a','b','c','d','e','f']),/1 tot 5/);
 const r=await X.wixImport(l.posts.map(p=>p.url).concat('https://evil.example/post/x'));
 assert.deepEqual(r.map(x=>x.status),['nieuw','vertaling','mislukt','mislukt']);
 assert.ok(!calls.some(c=>c.includes('evil')),'een vreemd adres wordt nooit opgevraagd');
 let items=await I.listInhoud();assert.equal(items.length,1);const it=items[0];
 assert.equal(it.status,'concept');assert.equal(it.publishedAt,'2018-03-11');assert.equal(it.source,'wix:onze-ideale-koe');assert.equal(it.createdBy,'oude blog van example.nl');
 assert.match(it.photo,/^\\/api\\/media\\/[a-f0-9-]{36}$/);assert.equal(it.video,'https://www.youtube.com/watch?v=TfT49gaiktg');assert.deepEqual(it.sites,['boerbart']);
 assert.deepEqual(I.publicInhoud(await I.publishedRows(),{site:'boerbart'}),[],'concept: nog niet op de site');
 // Nog eens: niets dubbel, ook de foto niet.
 l=await X.wixList();assert.equal(l.posts.find(p=>p.slug==='onze-ideale-koe').imported,true);
 assert.deepEqual((await X.wixImport([l.posts[0].url])).map(x=>x.status),['al-overgehaald']);
 assert.equal((await getDb().select().from(media)).length,before+1,'één foto erbij, niet twee');assert.equal((await I.listInhoud()).length,1);
 // Een eigen stuk met hetzelfde adres: het oude blog krijgt een vrij adres.
 await I.saveInhoud({kind:'nieuws',title:'Iets anders',slug:'de-geit',body:'x'},'r');
 const g=await I.insertImported({kind:'blog',title:'De geit',slug:'de-geit',summary:'',body:'Tekst',photo:'',video:'',publishedAt:'2019-01-01',source:'wix:de-geit'},'oude blog van example.nl');
 assert.equal((await I.listInhoud()).find(x=>x.id===g.id).slug,'de-geit-2');
 // In één keer publiceren: oude datum blijft, site = hoofdsite.
 const p=await I.publishMany([it.id,g.id],'jan');assert.equal(p.published,2);assert.deepEqual(p.failed,[]);
 const pub=I.publicInhoud(await I.publishedRows(),{site:'boerbart'});assert.deepEqual(pub.map(x=>[x.slug,x.publishedAt]),[['de-geit-2','2019-01-01'],['onze-ideale-koe','2018-03-11']]);
 await assert.rejects(()=>I.publishMany([],'b'),/1 en 200/);
 console.log('oude blogs ok');
 `;const r=spawnSync(process.execPath,['--experimental-transform-types','--input-type=module','-e',code],{cwd:new URL('../',import.meta.url),env:{...process.env,APP_DATA_DIR:dir,DATABASE_URL:''},encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stderr+'\n'+r.stdout);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

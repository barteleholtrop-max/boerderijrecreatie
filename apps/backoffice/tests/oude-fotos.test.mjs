// Foto's van de oude site in de beeldbank, in originele kwaliteit, en een lichte webversie voor sites en schermen (besluit
// eigenaar 13 november 2026). Zonder internet: Wix wordt nagebootst. Bewaakt: welke pagina's, welke foto's, originele
// kwaliteit met terugval, nooit dubbel, verdwenen foto's niet eindeloos opnieuw, en de webversie (verkleind, rechtop,
// zonder cameragegevens, één keer gemaakt).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import './helpers/ts-resolve.mjs';
const P=await import('../lib/wix-photos.ts');
const {wixMediaId}=await import('../lib/wix-import.ts');

const A='04235c_'+'a'.repeat(32)+'~mv2.jpg',B='04235c_'+'b'.repeat(32)+'~mv2.png';
test('pagina\'s van de oude site: eigen adressen, rondleiding en agenda-items niet',()=>{
 const xml='<loc>https://www.boerbart.nl/overons</loc><loc>https://www.boerbart.nl/menu?menu=voorjaarskaart</loc><loc>https://www.boerbart.nl/post/onze-ideale-koe</loc>'+
  '<loc>https://www.boerbart.nl/rondleiding</loc><loc>https://www.boerbart.nl/rondleiding/melken</loc><loc>https://www.boerbart.nl/event-details/dagticket</loc>'+
  '<loc>https://evil.example/overons</loc><loc>https://www.boerbart.nl/overons</loc>';
 assert.deepEqual(P.pageUrls([xml]),['https://www.boerbart.nl','https://www.boerbart.nl/overons','https://www.boerbart.nl/menu?menu=voorjaarskaart','https://www.boerbart.nl/post/onze-ideale-koe']);
});
test('foto\'s op een pagina: elk één keer, ook met %7E en verkleinde adressen',()=>{
 const html=`<img src="https://static.wixstatic.com/media/${A}/v1/fill/w_192,h_192/${A}"><img src="https://static.wixstatic.com/media/${A.replace('~','%7E')}/v1/fit/w_50/x.jpg">`+
  `"uri":"${B}" <img src="https://static.wixstatic.com/media/${B}"> <img src="https://static.wixstatic.com/media/nee.svg">`;
 assert.deepEqual(P.photoIds(html),[A,B]);
 assert.equal(wixMediaId('https://static.wixstatic.com/media/'+A+'/v1/fill/w_10/x.jpg'),A);
 assert.equal(wixMediaId('https://evil.example/media/'+A),null);
 assert.equal(P.pageTitle('<title>Over ons | Rianne &amp; Bart (Boer Bart)</title>','https://www.boerbart.nl/overons'),'Over ons');
 assert.equal(P.pageTitle('','https://www.boerbart.nl'),'Homepage');
});

test('ophalen en webversie, tegen een echte database en echte fotobewerking',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-oude-fotos-'));
 try{const code=`
 import './tests/helpers/ts-resolve.mjs';import assert from 'node:assert/strict';
 const sharp=(await import('sharp')).default;
 // Een "camerafoto" van 4000 x 3000 met cameragegevens (EXIF) en een gedraaide stand.
 const big=new Uint8Array(await sharp({create:{width:4000,height:3000,channels:3,background:{r:120,g:160,b:90}}}).jpeg({quality:95}).withExif({IFD0:{Make:'Camera',Copyright:'geheim'}}).withMetadata({orientation:6}).toBuffer());
 const png=new Uint8Array(await sharp({create:{width:300,height:300,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer());
 const A='${A}',B='${B}',G='04235c_'+'c'.repeat(32)+'~mv2.jpg';const calls=[];
 const pages={'https://www.boerbart.nl/overons':'<title>Over ons | Boer Bart</title><img src="https://static.wixstatic.com/media/'+A+'/v1/fill/w_192/x.jpg"><img src="https://static.wixstatic.com/media/'+G+'/v1/fill/w_9/x.jpg">',
  'https://www.boerbart.nl/keuken':'<title>Keuken</title>'+Array.from({length:10},(_,i)=>'<img src="https://static.wixstatic.com/media/04235c_'+String(i).repeat(32)+'~mv2.jpg/v1/fill/w_9/x.jpg">').join('')+'<img src="https://static.wixstatic.com/media/'+A+'">'};
 globalThis.fetch=async(url)=>{const u=String(url);calls.push(u);
  const ok=(b,t)=>({ok:true,status:200,url:u,headers:new Headers({'content-type':t}),arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)});
  const no=s=>({ok:false,status:s,url:u,headers:new Headers(),arrayBuffer:async()=>new ArrayBuffer(0)});
  if(u.endsWith('-sitemap.xml'))return ok(new TextEncoder().encode(u.includes('pages')?'<loc>https://www.boerbart.nl/overons</loc><loc>https://www.boerbart.nl/keuken</loc><loc>https://www.boerbart.nl/rondleiding</loc>':''),'text/xml');
  if(pages[u])return ok(new TextEncoder().encode(pages[u]),'text/html');
  if(u==='https://www.boerbart.nl/')return ok(new TextEncoder().encode('<title>Home</title>'),'text/html');
  if(u==='https://static.wixstatic.com/media/'+A)return ok(big,'image/jpeg');
  if(u==='https://static.wixstatic.com/media/'+B)return ok(png,'image/png');
  if(u.includes(G))return no(403);
  if(/media\\/04235c_(\\d)\\1{31}~mv2\\.jpg$/.test(u))return ok(big,'image/jpeg');
  throw new Error('onverwacht '+u);
 };
 const P=await import('./lib/wix-photos.ts');const {getDb}=await import('./db/index.ts');const {media}=await import('./db/schema.ts');const {like}=await import('drizzle-orm');
 const wix=async()=>getDb().select().from(media).where(like(media.sourceId,'wix:%'));
 const l=await P.wixPhotoPages();assert.deepEqual(l.pages,['https://www.boerbart.nl','https://www.boerbart.nl/overons','https://www.boerbart.nl/keuken']);assert.equal(l.inBeeldbank,0);
 let r=await P.wixPhotosFromPage('https://www.boerbart.nl/overons');
 assert.deepEqual([r.title,r.total,r.added,r.gone,r.remaining],['Over ons',2,1,1,0]);
 const rows=await wix();assert.equal(rows.length,1);assert.equal(rows[0].sourceId,'wix:'+A);assert.equal(rows[0].name,'Over ons – oude site');assert.equal(rows[0].source,'https://www.boerbart.nl/overons');
 assert.equal(rows[0].size,big.length,'het origineel, niet de verkleinde versie van de pagina');
 assert.ok(!calls.some(c=>c.includes('w_192')),'nooit de verkleinde paginaversie als het origineel er is');
 // Keuken: 11 foto's, waarvan A al binnen. Porties van 8; daarna de rest. Niets dubbel.
 r=await P.wixPhotosFromPage('https://www.boerbart.nl/keuken');assert.deepEqual([r.total,r.added,r.remaining],[11,8,2]);
 r=await P.wixPhotosFromPage('https://www.boerbart.nl/keuken',r.gone+r.skipped);assert.deepEqual([r.added,r.remaining],[2,0]);
 assert.equal((await wix()).length,11);
 r=await P.wixPhotosFromPage('https://www.boerbart.nl/keuken');assert.deepEqual([r.added,r.remaining],[0,0]);
 // Verdwenen foto: met after wordt hij overgeslagen in plaats van eindeloos opnieuw geprobeerd.
 r=await P.wixPhotosFromPage('https://www.boerbart.nl/overons',1);assert.deepEqual([r.added,r.gone,r.remaining],[0,0,0]);
 await assert.rejects(()=>P.wixPhotosFromPage('https://www.boerbart.nl/rondleiding/melken'),/Geen pagina/);
 await assert.rejects(()=>P.wixPhotosFromPage('https://evil.example/x'),/Geen pagina/);
 // Webversie: hooguit 1920, rechtop gezet, zonder cameragegevens, kleiner; één keer gemaakt en bewaard.
 const W=await import('./lib/web-photo.ts');const {env}=await import('./lib/portable/env.ts');
 const id=rows[0].id;const w=await W.webPhoto(id);const bytes=new Uint8Array(await new Response(w.body).arrayBuffer());
 const meta=await sharp(bytes).metadata();assert.equal(w.type,'image/jpeg');
 assert.deepEqual([meta.width,meta.height],[1440,1920],'staand gezet (oriëntatie 6) en verkleind tot 1920');
 assert.equal(meta.exif,undefined,'geen cameragegevens');assert.ok(bytes.length<big.length);
 assert.ok(await env.BUCKET.get(W.webKey(id)),'webversie bewaard');
 assert.equal((await env.BUCKET.get(id)) && (await new Response((await env.BUCKET.get(id)).body).arrayBuffer()).byteLength,big.length,'origineel onaangeroerd');
 // Doorzichtige PNG blijft doorzichtig (WebP).
 const {storeWixPhoto}=await import('./lib/wix-import.ts');const s=await storeWixPhoto(B,'Logo','https://www.boerbart.nl');
 const pw=await W.webPhoto(s.url.split('/').pop());assert.equal(pw.type,'image/webp');
 assert.equal(W.webKey(id),W.webKey(id));assert.notEqual(W.webKey(id),id);assert.match(W.webKey(id),/^[a-f0-9-]{36}$/);
 console.log('oude fotos ok');
 `;const r=spawnSync(process.execPath,['--experimental-transform-types','--input-type=module','-e',code],{cwd:new URL('../',import.meta.url),env:{...process.env,APP_DATA_DIR:dir,DATABASE_URL:''},encoding:'utf8',timeout:120000});assert.equal(r.status,0,r.stderr+'\n'+r.stdout);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

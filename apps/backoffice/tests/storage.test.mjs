// Foto's in Supabase Storage (overstap naar Supabase, stap 3). Getest tegen een nagebootste Storage-API met dezelfde
// adressen als Supabase; geen echte Supabase nodig.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import './helpers/ts-resolve.mjs';
const {supabaseBucket,migrateDisk,diskBucket,storageConfig}=await import('../lib/portable/storage.ts');

function fakeStorage(key){
 const buckets=new Map(),files=new Map(),seen=[];
 const server=http.createServer(async(req,res)=>{
  const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);
  seen.push({method:req.method,url:req.url,apikey:req.headers.apikey});
  if(req.headers.apikey!==key){res.writeHead(401);return res.end('{}')}
  let m;
  if(req.method==='GET'&&(m=/^\/storage\/v1\/bucket\/([^/]+)$/.exec(req.url))){const b=buckets.get(m[1]);res.writeHead(b?200:404,{'content-type':'application/json'});return res.end(JSON.stringify(b||{error:'not found'}))}
  if(req.method==='POST'&&req.url==='/storage/v1/bucket'){const b=JSON.parse(body);buckets.set(b.id,b);res.writeHead(200);return res.end('{}')}
  if((m=/^\/storage\/v1\/object\/([^/]+)\/([a-f0-9-]{36})$/.exec(req.url))){
   const k=m[1]+'/'+m[2];
   if(!buckets.has(m[1])){res.writeHead(400);return res.end('{"error":"Bucket not found"}')}
   if(req.method==='POST'){files.set(k,{body,type:req.headers['content-type']});res.writeHead(200);return res.end('{}')}
   if(req.method==='GET'){const f=files.get(k);if(!f){res.writeHead(400);return res.end('{"error":"not_found"}')}res.writeHead(200,{'content-type':f.type});return res.end(f.body)}
   if(req.method==='DELETE'){files.delete(k);res.writeHead(200);return res.end('{}')}
  }
  res.writeHead(404);res.end('{}');
 });
 return {buckets,files,seen,listen:()=>new Promise(r=>server.listen(0,'127.0.0.1',()=>r('http://127.0.0.1:'+server.address().port))),close:()=>server.close()};
}
const id=n=>'aaaaaaaa-0000-4000-8000-'+String(n).padStart(12,'0');

test('Supabase Storage: privé-bucket wordt aangemaakt; opslaan, ophalen en verwijderen',async t=>{
 const s=fakeStorage('sb_secret_test'),url=await s.listen();t.after(()=>s.close());
 const b=supabaseBucket({url,key:'sb_secret_test',bucket:'media'});
 await b.put(id(1),new TextEncoder().encode('foto-1').buffer,{httpMetadata:{contentType:'image/jpeg'}});
 assert.deepEqual(s.buckets.get('media'),{id:'media',name:'media',public:false},'bucket is privé');
 const o=await b.get(id(1));assert.equal(o.httpMetadata.contentType,'image/jpeg');assert.equal(await new Response(o.body).text(),'foto-1');
 assert.equal(await b.get(id(2)),null,'ontbrekend bestand: niets');
 await b.delete(id(1));assert.equal(await b.get(id(1)),null);
 assert.ok(s.seen.every(r=>r.apikey==='sb_secret_test'));
 await assert.rejects(b.get('../geheim'),/Invalid object key/);
});
test('Supabase Storage: een bucket die voor iedereen open staat wordt geweigerd',async t=>{
 const s=fakeStorage('k'),url=await s.listen();t.after(()=>s.close());
 s.buckets.set('media',{id:'media',public:true});
 await assert.rejects(supabaseBucket({url,key:'k',bucket:'media'}).get(id(1)),/open voor iedereen/);
});
test('verhuizing: alle bestanden uit var/media gaan over en blijven op de schijf staan',async t=>{
 const s=fakeStorage('k'),url=await s.listen();t.after(()=>s.close());
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-media-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const disk=diskBucket(()=>dir);
 await disk.put(id(1),new TextEncoder().encode('een').buffer,{httpMetadata:{contentType:'image/png'}});
 await disk.put(id(2),new TextEncoder().encode('twee').buffer,{httpMetadata:{contentType:'image/webp'}});
 fs.writeFileSync(path.join(dir,'niet-een-foto.txt'),'x');
 const target=supabaseBucket({url,key:'k',bucket:'media'});
 assert.equal(await migrateDisk(dir,target),2);
 assert.equal(await new Response((await target.get(id(2))).body).text(),'twee');assert.equal(s.files.get('media/'+id(1)).type,'image/png');
 assert.ok(fs.existsSync(path.join(dir,id(1))),'reservekopie blijft op de schijf');
});
test('instellingen: alleen https (of de eigen computer), anders schijf',()=>{
 const old={...process.env};
 try{
  delete process.env.SUPABASE_URL;delete process.env.SUPABASE_SERVICE_ROLE_KEY;assert.equal(storageConfig(),null);
  process.env.SUPABASE_URL='https://abc.supabase.co/';process.env.SUPABASE_SERVICE_ROLE_KEY='k';assert.deepEqual(storageConfig(),{url:'https://abc.supabase.co',key:'k',bucket:'media'});
  process.env.SUPABASE_URL='http://voorbeeld.nl';assert.throws(()=>storageConfig(),/https/);
 }finally{process.env=old}
});
test('backoffice met Supabase Storage: bestaande foto’s verhuizen één keer bij het eerste gebruik',async t=>{
 const s=fakeStorage('k'),url=await s.listen();t.after(()=>s.close());
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-media-env-'));
 await diskBucket(()=>path.join(dir,'media')).put(id(7),new TextEncoder().encode('oud').buffer,{httpMetadata:{contentType:'image/jpeg'}});
 Object.assign(process.env,{APP_DATA_DIR:dir,SUPABASE_URL:url,SUPABASE_SERVICE_ROLE_KEY:'k'});
 const {env,runQuery,closeDatabase}=await import('../lib/portable/env.ts');
 t.after(async()=>{process.env.APP_DATA_DIR=dir;await closeDatabase();delete process.env.SUPABASE_URL;delete process.env.SUPABASE_SERVICE_ROLE_KEY;fs.rmSync(dir,{recursive:true,force:true})});
 assert.equal(await new Response((await env.BUCKET.get(id(7))).body).text(),'oud');
 await env.BUCKET.put(id(8),new TextEncoder().encode('nieuw').buffer,{httpMetadata:{contentType:'image/png'}});
 assert.ok(s.files.has('media/'+id(8)),'nieuwe foto staat in Supabase');assert.ok(!fs.existsSync(path.join(dir,'media',id(8))),'en niet op de schijf');
 assert.deepEqual((await runQuery("SELECT id FROM _portable_imports WHERE id='media-storage-v1'",[],false)).rows,[{id:'media-storage-v1'}]);
});

// Pushmelding "Je bestelling staat klaar" tegen de gebouwde backoffice en een nagebootste pushdienst op deze computer.
// Er gaat niets naar Google, Apple of Mozilla. Eerst `npm run build`, dan: npm run test:push
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {randomUUID,randomBytes,createECDH} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {startPostgres} from './test-postgres.mjs';
import {loginEnv,sessionCookie} from './sessie.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),app=path.join(repo,'apps/backoffice');
const built=fs.existsSync(path.join(app,'.next/standalone/server.js'));
const SITE='http://localhost:3002',owner={user:'bart',pass:randomBytes(16).toString('hex')};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b64url=b=>Buffer.from(b).toString('base64url');

test('pushmelding: aanmelden na bestellen, melding bij Gereed, één keer per werkplek, weg bij 410',{skip:!built&&'eerst npm run build'},async t=>{
 // Nagebootste pushdienst: onthoudt wat binnenkomt; antwoordt 201, of 410 als de telefoon "weg" is.
 const got=[];let gone=new Set();
 const push=http.createServer((req,res)=>{const chunks=[];req.on('data',c=>chunks.push(c));req.on('end',()=>{got.push({path:req.url,headers:req.headers,body:Buffer.concat(chunks)});res.writeHead(gone.has(req.url)?410:201);res.end()})});
 push.listen(0,'127.0.0.1');await once(push,'listening');t.after(()=>push.close());
 const pushOrigin='http://127.0.0.1:'+push.address().port;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-push-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const port=5200+Math.floor(Math.random()*400),base='http://127.0.0.1:'+port;
 const pg=await startPostgres();
 const env={...Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^(BASIC_AUTH|MOLLIE_|LOCAL_NO_LOGIN|TUNNEL_NO_LOGIN|BACKOFFICE_TUNNEL|PUBLIC_ORDER|GUEST_|VAPID_|PUSH_)/.test(k))),
  APP_DATA_DIR:dir,PORT:String(port),APP_ORIGIN:base,SHEETS_CONFIG_KEY:'cd'.repeat(32),NEXT_TELEMETRY_DISABLED:'1',PUSH_TEST_ORIGINS:pushOrigin,...pg.env,...loginEnv};
 const log=[];const child=spawn(process.execPath,['../../tools/start-app.mjs'],{cwd:app,env,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',d=>log.push(String(d)));child.stderr.on('data',d=>log.push(String(d)));
 t.after(async()=>{await new Promise(r=>{child.once('exit',r);child.kill()});await pg.stop()});
 let up=false;for(let i=0;i<100&&!up;i++){try{up=(await fetch(base+'/api/health')).ok}catch{}if(!up)await sleep(200)}
 assert.ok(up,'backoffice start niet:\n'+log.join(''));
 const call=async(p,{method='GET',body,origin,asOwner}={})=>{
  const headers={...(asOwner?{cookie:sessionCookie(owner.user),Origin:base}:{}),...(origin?{Origin:origin}:{}),...(body?{'Content-Type':'application/json'}:{})};
  const r=await fetch(base+p,{method,headers,body:body?JSON.stringify(body):undefined});const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}return {status:r.status,data};
 };
 // Een product en nul euro (eigen bedrag), zodat de bestelling zonder betalen naar de werkplek gaat.
 assert.equal((await call('/api/products',{method:'POST',asOwner:true,body:{action:'create-publish',product:{name:'Koffie',department:'Koffiebar',priceCents:350,vat:'9',station:'barista',available:true,photo:'',note:'',check:'',sourceId:'',optionGroups:[]}}})).status,200);
 assert.equal((await call('/api/bestelopties',{method:'POST',asOwner:true,body:{action:'instelling',version:0,setting:{context:'website',enabled:true,maxPercent:300,allowZero:true}}})).status,200);
 const product=(await call('/api/public/products')).data.products.find(p=>p.name==='Koffie');
 const order=async()=>{const requestId=randomUUID();const r=await call('/api/public/orders',{method:'POST',origin:SITE,body:{requestId,route:'eten-drinken',lines:[{productId:product.id,version:product.version,quantity:1}],chosenCents:0}});assert.equal(r.status,201,JSON.stringify(r.data));return {requestId,id:Number(r.data.number.slice(1)),number:r.data.number}};
 const phones=new Map();
 const phone=p=>{const ecdh=createECDH('prime256v1'),auth=randomBytes(16);const s={endpoint:pushOrigin+p,keys:{p256dh:b64url(ecdh.generateKeys()),auth:b64url(auth)}};phones.set(p,{ecdh,auth});return s};
 // Zoals de telefoon: ontsleutelen met de eigen sleutel (http_ece, onderdeel van web-push).
 const ece=createRequire(path.join(app,'package.json'))('http_ece');
 const read=m=>{const {ecdh,auth}=phones.get(m.path);return JSON.parse(ece.decrypt(m.body,{version:'aes128gcm',privateKey:ecdh,authSecret:auth}).toString('utf8'))};
 const move=async(id,status)=>{const list=(await call('/api/workplaces?station=barista',{asOwner:true})).data;const o=list.find(x=>x.id===id);assert.ok(o,'bestelling staat bij de koffiebar');const r=await call('/api/workplaces',{method:'PUT',asOwner:true,body:{orderId:id,station:'barista',status,version:o.version}});assert.equal(r.status,200,JSON.stringify(r.data))};
 const waitFor=async n=>{for(let i=0;i<50&&got.length<n;i++)await sleep(100);return got.length};

 await t.test('openbare sleutel; de geheime sleutel blijft in de gegevensmap',async()=>{
  const k=await call('/api/public/push');assert.equal(k.status,200);assert.equal(k.data.available,true);assert.match(k.data.publicKey,/^[A-Za-z0-9_-]{80,}$/);
  const file=path.join(dir,'push-sleutels.json');assert.ok(fs.existsSync(file));assert.equal(fs.statSync(file).mode&0o077,0,'alleen leesbaar voor de eigenaar');
  assert.equal(JSON.stringify(k.data).includes(JSON.parse(fs.readFileSync(file,'utf8')).privateKey),false);
 });
 const a=await order();
 await t.test('aanmelden: alleen vanaf de website, alleen bekende pushdiensten, alleen een bestaande bestelling',async()=>{
  assert.equal((await call('/api/public/push',{method:'POST',origin:'http://evil.example',body:{requestId:a.requestId,subscription:phone('/a')}})).status,403);
  assert.equal((await call('/api/public/push',{method:'POST',origin:SITE,body:{requestId:a.requestId,subscription:{...phone('/a'),endpoint:'https://evil.example/x'}}})).status,400);
  assert.equal((await call('/api/public/push',{method:'POST',origin:SITE,body:{requestId:randomUUID(),subscription:phone('/a')}})).status,404);
  const ok=await call('/api/public/push',{method:'POST',origin:SITE,body:{requestId:a.requestId,subscription:phone('/a')}});assert.equal(ok.status,200,JSON.stringify(ok.data));
 });
 await t.test('Gereed bij de koffiebar: één versleutelde melding, na terughalen en opnieuw Gereed nog één',async()=>{
  await move(a.id,'behandeling');await sleep(300);assert.equal(got.length,0,'nog niets bij In behandeling');
  await move(a.id,'gereed');assert.equal(await waitFor(1),1);
  const m=got[0];assert.equal(m.path,'/a');assert.match(m.headers.authorization,/^vapid t=.+, k=/);assert.equal(m.headers['content-encoding'],'aes128gcm');assert.equal(m.headers.ttl,'3600');
  assert.ok(m.body.length>0);assert.equal(m.body.includes(Buffer.from('koffiebar')),false,'de inhoud is versleuteld');
  // Tag met de ronde (versie van de werkplekstatus): In behandeling = 1, Gereed = 2.
  assert.deepEqual(read(m),{title:'Je bestelling staat klaar',body:`Je drinken (${a.number}) staat klaar bij de koffiebar. Geniet ervan!`,tag:a.number+'-barista-2'});
  // Terughalen na een foutje en opnieuw Gereed (melding eigenaar 14 november 2026): de gast krijgt opnieuw een melding.
  await move(a.id,'behandeling');await sleep(300);assert.equal(got.length,1,'terughalen zelf stuurt niets');
  await move(a.id,'gereed');assert.equal(await waitFor(2),2,'opnieuw Gereed: opnieuw een melding');assert.equal(read(got[1]).tag,a.number+'-barista-4');
 });
 await t.test('telefoon niet meer bereikbaar (410): aanmelding wordt vergeten',async()=>{
  const b=await order();gone.add('/weg');
  assert.equal((await call('/api/public/push',{method:'POST',origin:SITE,body:{requestId:b.requestId,subscription:phone('/weg')}})).status,200);
  await move(b.id,'behandeling');await move(b.id,'gereed');assert.equal(await waitFor(3),3);
  await sleep(300);
  const rows=(await pg.query('SELECT endpoint FROM push_subscriptions ORDER BY endpoint')).map(r=>r.endpoint);
  assert.deepEqual(rows,[pushOrigin+'/a']);
 });
});

// Groepen & feesten op de website: direct antwoord op de datum en de aanvraag naar de inbox, tegen de gebouwde backoffice.
// Er wordt niets gereserveerd en geen mail verstuurd. Eerst `npm run build`, dan: npm run test:groepsaanvraag
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID,randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loginEnv,sessionCookie} from './sessie.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),app=path.join(repo,'apps/backoffice');
const built=fs.existsSync(path.join(app,'.next/standalone/server.js'));
const SITE='http://localhost:3002',owner={user:'bart',pass:randomBytes(16).toString('hex')};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
// Eerstvolgende zaterdag en maandag, minstens een week vooruit (standaard open: zo en do t/m za, dicht op maandag).
const ahead=weekday=>{const d=new Date();d.setUTCDate(d.getUTCDate()+7);while(d.getUTCDay()!==weekday)d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)};
const SAT=ahead(6),MON=ahead(1);

async function startApp(dir,port){
 const env={...Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^(BASIC_AUTH|MOLLIE_|LOCAL_NO_LOGIN|TUNNEL_NO_LOGIN|BACKOFFICE_TUNNEL|PUBLIC_ORDER|GUEST_|GMAIL_|MAIL_)/.test(k))),
  APP_DATA_DIR:dir,PORT:String(port),APP_ORIGIN:'http://127.0.0.1:'+port,SHEETS_CONFIG_KEY:'ef'.repeat(32),NEXT_TELEMETRY_DISABLED:'1',...loginEnv};
 const log=[];const child=spawn(process.execPath,['../../tools/start-app.mjs'],{cwd:app,env,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',d=>log.push(String(d)));child.stderr.on('data',d=>log.push(String(d)));
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/api/health`)).ok)return {stop:()=>new Promise(r=>{child.once('exit',r);child.kill()})}}catch{}await sleep(200)}
 child.kill();throw Error('backoffice start niet:\n'+log.join(''));
}

test('groepsaanvraag: direct antwoord uit de planning en de aanvraag in de inbox',{skip:!built&&'eerst npm run build'},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-groep-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const port=5200+Math.floor(Math.random()*400),base='http://127.0.0.1:'+port;
 const server=await startApp(dir,port);t.after(()=>server.stop());
 const call=async(p,{method='GET',body,origin,owner:asOwner}={})=>{
  const headers={...(asOwner?{cookie:sessionCookie(owner.user),Origin:base}:{}),...(origin?{Origin:origin}:{}),...(body?{'Content-Type':'application/json'}:{})};
  const r=await fetch(base+p,{method,headers,body:body?JSON.stringify(body):undefined});const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}return {status:r.status,data};
 };
 const check=(date,people)=>call(`/api/public/group-requests?datum=${date}&personen=${people}`);
 const gasten=async()=>(await call('/api/gasten',{owner:true})).data;
 const planning=async(action,payload)=>{const g=await gasten();const r=await call('/api/gasten',{method:'POST',owner:true,body:{action,requestId:randomUUID(),version:g.version,...payload}});assert.equal(r.status,200,JSON.stringify(r.data));};

 await t.test('zonder groepscapaciteit belooft de website niets',async()=>{
  const r=await check(SAT,10);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.state,'onbekend');
 });
 await planning('capacity',{capacity:{bezoek:0,groep:40}});
 await t.test('vrij, vol en gesloten volgens de centrale planning',async()=>{
  assert.equal((await check(SAT,30)).data.state,'vrij');
  assert.equal((await check(SAT,41)).data.state,'vol');
  const closed=(await check(MON,10)).data;assert.equal(closed.state,'gesloten');assert.ok(closed.alternatives.length>0);
  assert.equal((await check('2020-01-01',10)).status,400);
  assert.equal((await check('morgen',10)).status,400);
 });
 await t.test('een bevestigde groep die dag: druk, en vol als het niet meer past; geen gegevens van andere gasten',async()=>{
  await planning('reservation',{reservation:{id:randomUUID(),name:'Familie Geheim',email:'geheim@example.nl',phone:'',activity:'groep',date:SAT,from:'10:00',to:'18:00',people:20,sharing:false,status:'bevestigd',expires:'',notes:'',threadId:'',tables:[]}});
  const busy=(await check(SAT,15)).data;assert.equal(busy.state,'druk');
  assert.doesNotMatch(JSON.stringify(busy),/Geheim|geheim@/);
  assert.equal((await check(SAT,25)).data.state,'vol');
 });
 const request={requestId:randomUUID(),activity:'Kinderfeestje',name:'Anna de Vries',email:'anna@example.nl',phone:'',date:SAT,daypart:'',people:12,wishes:'Een kinderfeestje met pannenkoeken.'};
 await t.test('alleen de website mag versturen; onvolledige aanvraag krijgt een duidelijke melding',async()=>{
  assert.equal((await call('/api/public/group-requests',{method:'POST',origin:'http://evil.example',body:request})).status,403);
  const bad=await call('/api/public/group-requests',{method:'POST',origin:SITE,body:{...request,requestId:randomUUID(),email:'geen-mail'}});
  assert.equal(bad.status,400);assert.match(bad.data.error,/e-mailadres/);
 });
 await t.test('versturen: één websitegesprek in de inbox met een concept-aanvraag in Planning',async()=>{
  const sent=await call('/api/public/group-requests',{method:'POST',origin:SITE,body:request});
  assert.equal(sent.status,201,JSON.stringify(sent.data));assert.equal(sent.data.indication.state,'druk');
  const again=await call('/api/public/group-requests',{method:'POST',origin:SITE,body:request});assert.equal(again.status,200);assert.equal(again.data.duplicate,true);
  const g=await gasten(),threads=g.state.threads.filter(t=>t.id==='web:'+request.requestId);
  assert.equal(threads.length,1,'niet dubbel');const t1=threads[0];
  assert.equal(t1.channel,'chat');assert.equal(t1.status,'nieuw');assert.equal(t1.customer,'Anna de Vries');assert.match(t1.messages[0].text,/pannenkoeken/);
  const r=g.state.reservations.filter(r=>r.threadId===t1.id);assert.equal(r.length,1);assert.equal(r[0].status,'aanvraag');assert.equal(r[0].people,12);
  assert.equal((await check(SAT,15)).data.state,'druk','een aanvraag houdt geen plaats vast');
 });
});

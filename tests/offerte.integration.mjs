// Offerte naar de gast sturen (wens eigenaar 5 november 2026), tegen de gebouwde backoffice en een nagebootste Gmail.
// Er gaat geen echte mail weg. Draait mee met npm run test:gmail (na npm run build).
// Poort 4850-4999: fetch weigert o.a. 5060/5061 (SIP), dus niet in die buurt kiezen.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID,randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createGmailMock} from './gmail-mock.mjs';
import {startPostgres} from './test-postgres.mjs';
import {loginEnv,sessionCookie} from './sessie.mjs';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),app=path.join(repo,'apps/backoffice');
const built=fs.existsSync(path.join(app,'.next/standalone/server.js'));
const ME='info@example.nl',owner={user:'bart',pass:randomBytes(16).toString('hex')},sanne={user:'sanne',pass:randomBytes(16).toString('hex')};
const auth=a=>sessionCookie(a.user,a===owner?'eigenaar':'medewerker'),sleep=ms=>new Promise(r=>setTimeout(r,ms));

test('offerte versturen: mail vanaf de gastenmailbox met persoonlijke link, één keer; de gast ziet alleen de offerte',{skip:!built&&'eerst npm run build'},async t=>{
 const mock=createGmailMock({mailbox:ME}),mockPort=await mock.listen();t.after(()=>mock.close());
 const pg=await startPostgres(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-offerte-')),port=4850+Math.floor(Math.random()*150),base='http://127.0.0.1:'+port;
 const env={...Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^(BASIC_AUTH|GOOGLE_|GMAIL_|MAIL_|LOCAL_NO_LOGIN|GUEST_)/.test(k))),
  BOER_BART_LOGIN:'aan',...loginEnv,
  APP_DATA_DIR:dir,PORT:String(port),APP_ORIGIN:base,SHEETS_CONFIG_KEY:'ab'.repeat(32),NEXT_TELEMETRY_DISABLED:'1',...pg.env,MAIL_SEND_ENABLED:'1',
  GUEST_ACCESS:JSON.stringify({bart:{mailboxes:['gmail'],send:true,calendar:true,manage:true},sanne:{mailboxes:['gmail'],send:false}}),
  GUEST_GOOGLE_CLIENT_ID:'test-client',GUEST_GOOGLE_CLIENT_SECRET:'test-secret',GOOGLE_OAUTH_BASE:'http://127.0.0.1:'+mockPort,GMAIL_API_BASE:'http://127.0.0.1:'+mockPort,GOOGLE_CALENDAR_API_BASE:'http://127.0.0.1:'+mockPort};
 const log=[],child=spawn(process.execPath,['../../tools/start-app.mjs'],{cwd:app,env,stdio:['ignore','pipe','pipe'],detached:true});child.stdout.on('data',d=>log.push(String(d)));child.stderr.on('data',d=>log.push(String(d)));
 t.after(async()=>{const kill=sig=>{try{process.kill(-child.pid,sig)}catch{}};if(child.exitCode===null&&child.signalCode===null){const exited=new Promise(r=>child.once('exit',r));kill('SIGTERM');const late=setTimeout(()=>kill('SIGKILL'),10000);await exited;clearTimeout(late)}kill('SIGKILL');await pg.stop();fs.rmSync(dir,{recursive:true,force:true})});
 let up=false,last='';for(let i=0;i<300&&!up;i++){try{const h=await fetch(base+'/api/health',{signal:AbortSignal.timeout(5000)});up=h.ok;last='status '+h.status}catch(e){last=String(e?.cause?.code||e?.message||e)}if(!up)await sleep(200)}assert.ok(up,'backoffice start niet ('+last+'):\n'+log.join(''));
 const api=async(p,{body,as=owner}={})=>{const r=await fetch(base+p,{method:body?'POST':'GET',redirect:'manual',headers:{cookie:auth(as),...(body?{'Content-Type':'application/json',Origin:base}:{})},body:body?JSON.stringify(body):undefined});const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}return {status:r.status,data,headers:r.headers}};
 const guest=async(body,as)=>{const v=(await api('/api/gasten',{as})).data.version;return api('/api/gasten',{as,body:{version:v,requestId:randomUUID(),...body}})};
 // Gmail koppelen (nagebootst).
 const a=await api('/api/mail/oauth/start');assert.equal(a.status,302);const g=await fetch(a.headers.get('location'),{redirect:'manual'});const cb=g.headers.get('location');assert.equal((await api(cb.replace(/^https?:\/\/[^/]+/,''))).status,302);
 const id=randomUUID();
 const quote={id,customer:{name:'Anna de Vries',email:'anna@example.nl',phone:'',company:'Teamuitje BV'},title:'Teamuitje 24 personen',people:24,eventDate:'2026-12-04',intro:'Beste Anna,\n\nHierbij ons voorstel.',terms:'',validUntil:'2026-12-01',
  lines:[{description:'Pannenkoek',quantity:24,unitCents:750,vat:'9'},{description:'Rondleiding',quantity:24,unitCents:600,vat:'21'}]};
 assert.equal((await guest({action:'quote',quote})).status,200);
 const send=(requestId,as=owner,extra={})=>api('/api/gasten',{as,body:{action:'quote-send',id,to:'anna@example.nl',subject:'Offerte OFF-2026-001: Teamuitje',body:'Beste Anna,\n\nBekijk hier:\n[link naar de offerte]\n\nGroet, Sanne',requestId,...extra}});
 // Alleen wie de planning beheert, mag versturen.
 assert.equal((await send(randomUUID(),sanne)).status,400);assert.equal(mock.state.direct.length,0);
 const rid=randomUUID(),r1=await send(rid);assert.equal(r1.status,200,JSON.stringify(r1.data));
 assert.equal(mock.state.direct.length,1);const m=mock.state.direct[0];
 assert.equal(m.headers.To,'anna@example.nl');assert.match(m.headers.From,/info@example\.nl/);
 const link=(m.body.match(/http:\/\/127\.0\.0\.1:\d+\/offerte\/[A-Za-z0-9_-]{43}/)||[])[0];assert.ok(link,'persoonlijke link in de mail: '+m.body);assert.ok(!m.body.includes('[link naar de offerte]'));
 assert.equal(r1.data.url,link);
 // Dubbelklik of opnieuw proberen met dezelfde aanvraag: niet nog een keer.
 assert.equal((await send(rid)).status,200);assert.equal(mock.state.direct.length,1);
 const q=(await api('/api/gasten')).data.state.quotes.find(x=>x.id===id);assert.equal(q.status,'verstuurd');assert.equal(q.mails.length,1);assert.ok(q.sentAt);
 // Opnieuw versturen (nieuwe aanvraag) gebruikt dezelfde link.
 assert.equal((await send(randomUUID())).status,200);assert.equal(mock.state.direct.length,2);assert.ok(mock.state.direct[1].body.includes(link));
 // De gast opent de link zonder login en ziet de offerte, zonder interne gegevens.
 const page=await fetch(link);assert.equal(page.status,200);const html=await page.text();
 assert.match(html,/Teamuitje 24 personen/);assert.match(html,/OFF-2026-\d{3}/);assert.match(html,/324,00/);
 assert.ok(!html.includes('anna@example.nl'),'geen e-mailadres op de gastpagina');assert.ok(!html.includes(owner.user+' ·'),'geen medewerker');
 assert.equal((await fetch(base+'/offerte/'+'x'.repeat(43))).status,404);
 assert.equal((await fetch(base+'/offerte/kort',{redirect:'manual'})).status===200,false);
 assert.equal((await fetch(base+'/offertes',{redirect:'manual'})).status===200,false,'backoffice zelf blijft achter de login');
 // Afgewezen: niet meer versturen.
 assert.equal((await guest({action:'quote',quote:{...quote,rev:q.rev+1,status:'afgewezen'}})).status,200);
 const no=await send(randomUUID());assert.equal(no.status,400);assert.match(no.data.error,/afgewezen of vervallen/);
 // Online akkoord of een vraag van de gast (wens eigenaar 5 november 2026).
 const tokenOf=link.split('/').pop(),respond=(body,origin=base,tok=tokenOf)=>fetch(base+'/api/public/offerte/'+tok,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)}).then(async r=>({status:r.status,data:await r.json()}));
 const cur=async()=>(await api('/api/gasten')).data.state.quotes.find(x=>x.id===id);
 assert.equal((await respond({kind:'akkoord',rev:(await cur()).rev,name:'Anna',agree:true})).status,409,'afgewezen: geen akkoord');
 assert.equal((await guest({action:'quote',quote:{...quote,rev:(await cur()).rev,status:'verstuurd'}})).status,200);
 let rev=(await cur()).rev;
 assert.equal((await respond({kind:'akkoord',rev,name:'Anna',agree:true},'https://evil.example')).status,403,'andere website');
 assert.equal((await respond({kind:'akkoord',rev,name:'Anna',agree:true},base,'y'.repeat(43))).status,404);
 assert.equal((await respond({kind:'akkoord',rev,name:'Anna'})).status,400,'zonder vinkje');
 const mails=mock.state.direct.length,v=await respond({kind:'vraag',rev,name:'Anna',message:'Graag met 20 personen.'});assert.equal(v.status,200);
 assert.equal(mock.state.direct.length,mails+1,'melding in de gastenmailbox');assert.match(mock.state.direct.at(-1).headers.To,/info@example\.nl/);assert.match(mock.state.direct.at(-1).body,/Graag met 20 personen/);
 assert.equal((await respond({kind:'akkoord',rev:rev-1,name:'Anna',agree:true})).status,409,'oude versie');
 const okr=await respond({kind:'akkoord',rev,name:'Anna de Vries',agree:true});assert.equal(okr.status,200,JSON.stringify(okr.data));assert.deepEqual(okr.data.quote.accepted?.name,'Anna de Vries');
 const done=await cur();assert.equal(done.status,'geaccepteerd');assert.equal(done.accepted.totalCents,32400);assert.equal(done.accepted.rev,rev);
 assert.match(mock.state.direct.at(-1).headers.Subject,/Akkoord/);
 assert.equal((await respond({kind:'akkoord',rev:done.rev,name:'Anna',agree:true})).status,409,'niet twee keer');
 assert.match(await (await fetch(link)).text(),/Akkoord gegeven/);
});

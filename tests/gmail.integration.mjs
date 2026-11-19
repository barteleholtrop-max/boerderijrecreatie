// End-to-end test of the Klantgesprekken Gmail connection against the built backoffice and a simulated Gmail.
// No real Google account is used and no real mail is sent. Run after `npm run build`: npm run test:gmail
import test from 'node:test';
import {createServer} from 'node:http';
import {connect} from 'node:net';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID,randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createGmailMock} from './gmail-mock.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),app=path.join(repo,'apps/backoffice');
const built=fs.existsSync(path.join(app,'.next/standalone/server.js'));
const testFixture=JSON.parse(fs.readFileSync(new URL('./fixtures/familiefeest-2027.json',import.meta.url),'utf8'));
const originalDraftText=testFixture.existingDraftHtml.replace(/<\/p>/g,'\n\n').replace(/<br\s*\/?>/g,'\n').replace(/<[^>]+>/g,'').trim();
const ME='info@boerbart.nl',LABEL='Label_7731';
const owner={user:'bart',pass:randomBytes(16).toString('hex')},rianne={user:'rianne',pass:randomBytes(16).toString('hex')};
const auth=a=>sessionCookie(a.user,a===owner?'eigenaar':'medewerker');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

import {startPostgres} from './test-postgres.mjs';
import {loginEnv,sessionCookie} from './sessie.mjs';
let pg; // Postgres van deze test (zie test-postgres.mjs); blijft bestaan als de backoffice opnieuw start.
// Alles wat in de database staat, als tekst: om te controleren dat tokens en volledige mails er niet leesbaar in staan.
async function dump(){const out=[];for(const {t} of await pg.query("SELECT table_name t FROM information_schema.tables WHERE table_schema='public'"))out.push(...(await pg.query(`SELECT t::text AS r FROM "${t}" t`)).map(x=>x.r));return Buffer.from(out.join('\n'))}
async function startApp(dir,port,mockPort,extra={}){
 const env={...Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^(BASIC_AUTH|GOOGLE_|GMAIL_|MAIL_|LOCAL_NO_LOGIN|GUEST_)/.test(k))),
  BOER_BART_LOGIN:'aan',...loginEnv,
  APP_DATA_DIR:dir,PORT:String(port),APP_ORIGIN:'http://127.0.0.1:'+port,SHEETS_CONFIG_KEY:'ab'.repeat(32),NEXT_TELEMETRY_DISABLED:'1',...pg.env,
  GUEST_GOOGLE_CLIENT_ID:'test-client',GUEST_GOOGLE_CLIENT_SECRET:'test-secret',GOOGLE_OAUTH_BASE:'http://127.0.0.1:'+mockPort,GMAIL_API_BASE:'http://127.0.0.1:'+mockPort,GOOGLE_CALENDAR_API_BASE:'http://127.0.0.1:'+mockPort,...extra};
 const log=[];
 // De poort moet vrij zijn: anders beantwoordt een achtergebleven backoffice de gezondheidscontrole en test je de verkeerde instellingen.
 if(!await portFree(port))throw Error('poort '+port+' is nog bezet door een vorige backoffice');
 // Eigen procesgroep, zodat stoppen ook de Next-server onder start-app.mjs raakt en er nooit iets blijft hangen.
 const child=spawn(process.execPath,['../../tools/start-app.mjs'],{cwd:app,env,stdio:['ignore','pipe','pipe'],detached:true});
 child.stdout.on('data',d=>log.push(String(d)));child.stderr.on('data',d=>log.push(String(d)));
 const exited=new Promise(r=>child.once('exit',r));
 const kill=sig=>{try{process.kill(-child.pid,sig)}catch{}};
 const stop=async()=>{
  if(child.exitCode===null&&child.signalCode===null){kill('SIGTERM');const late=setTimeout(()=>kill('SIGKILL'),10000);await exited;clearTimeout(late)}
  kill('SIGKILL'); // eventuele achterblijvers in de groep
  for(let i=0;i<50&&!await portFree(port);i++)await sleep(200);
 };
 for(let i=0;i<150;i++){
  if(child.exitCode!==null||child.signalCode!==null)break;
  try{if((await fetch(`http://127.0.0.1:${port}/api/health`,{headers:{connection:'close'}})).ok)return {child,log,stop}}catch{}
  await sleep(200);
 }
 await stop();throw Error('backoffice start niet:\n'+log.join(''));
}
function portFree(port){return new Promise(r=>{const c=connect(port,'127.0.0.1');c.once('connect',()=>{c.destroy();r(false)});c.once('error',()=>r(true))})}

test('Klantgesprekken: koppelen, synchroniseren, concepten en eenmalig verzenden (gesimuleerde Gmail)',{skip:!built&&'eerst npm run build'},async t=>{
 const mock=createGmailMock({mailbox:ME}),mockPort=await mock.listen();t.after(()=>mock.close());
 let aiCalls=0,whileGenerating=null;
 const aiReply={wishes:'Familiefeest 17 april 2027, 14–18 uur, 25 volwassenen en 12 kinderen (2–11), vegetarisch en rollator',solution:'Lunch en spelen',reason:'Verschillende leeftijden',missing:['Drankkeuze (bier/wijn)'],conflicts:[],exampleIds:[],comparisons:['Geen actuele regionale bronnen'],proposal:{items:[{description:'Fictieve lunch',quantity:12,unitCents:1250}],assumptions:['Fictief testbedrag'],vat:'Nog te beoordelen',included:['Lunch'],unknown:['Drinken']},review:['Uitvoering beoordelen'],nextAction:'Datum vragen',guestDraft:'Dag familie, wat leuk dat jullie samen willen komen! Lunch en spelen lijkt ons passend. Welke dranken zouden jullie erbij willen? Groet, Rianne'};
 const ai=createServer(async(req,res)=>{for await(const chunk of req){}aiCalls++;if(whileGenerating){const fn=whileGenerating;whileGenerating=null;await fn()}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({id:'msg_test',type:'message',role:'assistant',model:'test',content:[{type:'text',text:JSON.stringify(aiReply)}],stop_reason:'end_turn',usage:{input_tokens:10,output_tokens:10}}))});
 await new Promise(r=>ai.listen(0,'127.0.0.1',r));t.after(()=>{ai.closeAllConnections();return new Promise(r=>ai.close(r))});
 const groupEnv={ANTHROPIC_API_KEY:'test-only-not-a-real-key',ANTHROPIC_BASE_URL:'http://127.0.0.1:'+ai.address().port,GUEST_WRITING_STYLE:'Warm, direct en persoonlijk. Groet, Rianne.'};
 const fullMail='Kunnen we met 12 personen komen? We willen graag samen lunchen en daarna op het erf spelen. Alleen in de volledige mail: unieke toelichting over het familiefeest.';
 const s=mock.state,day=Date.parse('2026-11-01T09:00:00Z');
 // Mailbox: three conversations with the customer label (one automatic), one with only the general TODO label.
 mock.add({thread:'t1aaaaaaaaaaaaaa',from:'Anna <anna@example.nl>',subject:'Reservering zaterdag',text:fullMail,labels:['INBOX',LABEL,'UNREAD'],at:day,
  parts:[{partId:'0',mimeType:'text/plain',body:{data:mock.b64(fullMail)}},{partId:'1',mimeType:'application/pdf',filename:'groep.pdf',body:{attachmentId:'att-1',size:11}}]});
 const chatgpt=mock.addDraft('t1aaaaaaaaaaaaaa','Beste Anna, dat kan. Groet, Rianne');
 mock.add({thread:'t2bbbbbbbbbbbbbb',from:'Piet <piet@example.nl>',subject:'Groepsuitje',text:'Wat kost een groepsuitje?',labels:['INBOX',LABEL],at:day+1000});
 mock.add({thread:'t2bbbbbbbbbbbbbb',from:ME,to:'piet@example.nl',subject:'Re: Groepsuitje',text:'Dat hangt af van de groep.',labels:['SENT'],at:day+2000});
 mock.add({thread:'t3cccccccccccccc',from:'Reserveringen <noreply@platform.nl>',subject:'Boekingsbevestiging',text:'Uw boeking is bevestigd',labels:['INBOX',LABEL],at:day+3000});
 mock.add({thread:'t4dddddddddddddd',from:'Leverancier <info@lev.nl>',subject:'Factuur',text:'Factuur oktober',labels:['INBOX','Label_12'],at:day+4000});

 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-gmail-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const port=4400+Math.floor(Math.random()*400);
 pg=await startPostgres();
 let server=null;t.after(async()=>{await server?.stop();await pg.stop()}); // eerst de backoffice, dan Postgres; ook als het starten mislukt
 server=await startApp(dir,port,mockPort,groupEnv);
 const base='http://127.0.0.1:'+port;
 // connection: close: geen hergebruik van verbindingen over een herstart van de backoffice heen. (De ECONNRESET in GitHub
 // kwam uiteindelijk van de testdatabase; zie tests/test-postgres.mjs, 10 november 2026.)
 const api=async(p,{body,as=owner,method}={})=>{const r=await fetch(base+p,{method:method||(body?'POST':'GET'),redirect:'manual',headers:{cookie:auth(as),connection:'close',...(body?{'Content-Type':'application/json',Origin:base}:{})},body:body?JSON.stringify(body):undefined});const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}return {status:r.status,data,headers:r.headers}};
 const connect=async(as=owner)=>{const a=await api('/api/mail/oauth/start',{as});assert.equal(a.status,302);const g=await fetch(a.headers.get('location'),{redirect:'manual'});const cb=g.headers.get('location');assert.match(cb,/\/api\/mail\/oauth\/callback\?code=/);const c=await api(cb.replace(/^https?:\/\/[^/]+/,''),{as});assert.equal(c.status,302);return new URL(c.headers.get('location'))};
 const status=async()=>(await api('/api/mail?filter=alles')).data;
 async function synced(after,more=()=>true){for(let i=0;i<150;i++){const d=await status();if(d.status.lastSyncOk&&d.status.lastSyncOk>after&&!d.status.syncing&&more(d))return d;await sleep(200)}throw Error('synchronisatie niet klaar: '+JSON.stringify((await status()).status))}
 const sync=async()=>{const before=(await status()).status.lastSyncOk||'';assert.equal((await api('/api/mail',{body:{action:'sync'}})).status,200);return synced(before)};

 await t.test('zonder login geen toegang; zonder koppeling geen voorbeelddata',async()=>{
  assert.equal((await fetch(base+'/api/mail')).status,401);
  const d=await status();assert.equal(d.status.oauthConfigured,true);assert.equal(d.status.connected,false);assert.deepEqual(d.threads,[]);
 });
 await t.test('verkeerde mailbox wordt geweigerd en niet opgeslagen',async()=>{
  s.profileEmail='bartele@boerbart.nl';const back=await connect();s.profileEmail=ME;
  assert.equal(back.pathname,'/koppeling');assert.equal(back.searchParams.get('gmail'),'fout');assert.match(back.searchParams.get('melding'),/info@boerbart\.nl/);
  assert.equal((await status()).status.connected,false);
 });
 await t.test('koppelen via server-side OAuth; eerste synchronisatie haalt alle gelabelde gesprekken op (met paginering)',async()=>{
  const back=await connect();assert.equal(back.searchParams.get('gmail'),'gekoppeld');
  const d=await synced('',x=>x.threads.length===3);
  assert.deepEqual(d.threads.map(x=>x.threadId).sort(),['t1aaaaaaaaaaaaaa','t2bbbbbbbbbbbbbb','t3cccccccccccccc'],'alleen TODO Klanten, niet het algemene TODO-label');
  const t1=d.threads.find(x=>x.threadId==='t1aaaaaaaaaaaaaa'),t2=d.threads.find(x=>x.threadId==='t2bbbbbbbbbbbbbb'),t3=d.threads.find(x=>x.threadId==='t3cccccccccccccc');
  assert.equal(t1.waiting,'klant-wacht');assert.equal(t1.unread,true);assert.equal(t1.drafts,1);assert.equal(t1.attachmentCount,1);assert.equal(t1.customerName,'Anna');
  assert.equal(t2.waiting,'wij-wachten');assert.equal(t3.automated,true);
  assert.ok(s.calls.filter(c=>c.startsWith('GET /gmail/v1/users/me/threads')&&!c.includes('/threads/')).length>=2,'meer dan één pagina opgehaald');
  assert.ok(d.status.lastSyncOk);
 });
 await t.test('tokens staan versleuteld opgeslagen en komen niet in antwoorden of logs',async()=>{
  const [rt]=[...s.refresh];const db=await dump();
  assert.ok(!db.includes(Buffer.from(rt)),'refresh token niet leesbaar in de database');
  assert.ok(!JSON.stringify(await status()).includes(rt));assert.ok(!server.log.join('').includes(rt));
 });
 await t.test('een paginaverversing vraagt niets aan Gmail',async()=>{
  const before=s.calls.length;await status();await status();assert.equal(s.calls.length,before);
 });
 await t.test('gesprek openen: volledige tekst, bijlage, bestaand ChatGPT-concept; niets wordt als gelezen gemarkeerd',async()=>{
  const d=(await api('/api/mail/threads/t1aaaaaaaaaaaaaa')).data;
  assert.equal(d.messages.length,1);assert.equal(d.messages[0].text,fullMail);assert.equal(d.messages[0].unread,true);
  assert.deepEqual(d.messages[0].attachments.map(a=>a.filename),['groep.pdf']);
  assert.equal(d.drafts.length,1);assert.equal(d.drafts[0].draftId,chatgpt.draftId);assert.equal(d.drafts[0].source,'gmail');assert.equal(d.drafts[0].editable,true);
  assert.deepEqual(d.reply.to,['anna@example.nl']);
  const a=await fetch(base+'/api/mail/threads/t1aaaaaaaaaaaaaa/attachment?message='+d.messages[0].id+'&part=1',{headers:{cookie:auth(owner)}});
  assert.equal(a.status,200);assert.equal(await a.text(),'PDF-INHOUD!');assert.match(a.headers.get('content-disposition'),/attachment; filename="groep.pdf"/);
  assert.ok(s.messages.get(d.messages[0].id).labelIds.includes('UNREAD'),'nog ongelezen in Gmail');
  assert.ok(!s.calls.some(c=>/modify|trash|batchModify|DELETE/.test(c)),'geen wijzig-, archiveer- of verwijderacties');
 });
 await t.test('alleen gesprekken met het klantlabel zijn bereikbaar',async()=>{
  assert.equal((await api('/api/mail/threads/t4dddddddddddddd')).status,404);
  assert.equal((await api('/api/mail/threads/t4dddddddddddddd',{body:{action:'draft-create',body:'x',requestId:randomUUID()}})).status,404);
 });
 await t.test('concept maken in hetzelfde gesprek; herhaalde aanvraag maakt geen tweede; bestaand concept blijft intact',async()=>{
  const rid=randomUUID(),body={action:'draft-create',body:'Hallo Piet, een groepsuitje kost € 15 p.p.',requestId:rid};
  const a=await api('/api/mail/threads/t2bbbbbbbbbbbbbb',{body});assert.equal(a.status,200,JSON.stringify(a.data));
  const b=await api('/api/mail/threads/t2bbbbbbbbbbbbbb',{body});assert.equal(b.data.draftId,a.data.draftId);assert.equal(b.data.duplicate,true);
  const d=s.messages.get(s.drafts.get(a.data.draftId));assert.equal(d.threadId,'t2bbbbbbbbbbbbbb');
  const h=Object.fromEntries(d.payload.headers.map(x=>[x.name,x.value]));assert.equal(h.To,'piet@example.nl');assert.equal(h.Subject,'Re: Groepsuitje');assert.ok(h['In-Reply-To']);
  const drafts=s.drafts.size;
  const c=await api('/api/mail/threads/t1aaaaaaaaaaaaaa',{body:{action:'draft-create',body:'Tweede concept',requestId:randomUUID()}});
  assert.equal(c.status,409);assert.equal(s.drafts.size,drafts,'geen tweede concept naast het ChatGPT-concept');
  assert.equal(s.drafts.get(chatgpt.draftId),chatgpt.messageId,'ChatGPT-concept ongewijzigd');
 });
 await t.test('concept bewerken alleen als het elders niet is gewijzigd',async()=>{
  const stale=await api('/api/mail/threads/t1aaaaaaaaaaaaaa',{body:{action:'draft-update',draftId:chatgpt.draftId,baseMessageId:'oudeversie01',body:'x'}});
  assert.equal(stale.status,409);assert.equal(s.drafts.get(chatgpt.draftId),chatgpt.messageId);
  const ok=await api('/api/mail/threads/t1aaaaaaaaaaaaaa',{body:{action:'draft-update',draftId:chatgpt.draftId,baseMessageId:chatgpt.messageId,body:'Beste Anna, dat kan zeker! Groet, Rianne'}});
  assert.equal(ok.status,200,JSON.stringify(ok.data));assert.notEqual(ok.data.messageId,chatgpt.messageId);
  const d=(await api('/api/mail/threads/t1aaaaaaaaaaaaaa')).data;assert.equal(d.drafts[0].text,'Beste Anna, dat kan zeker! Groet, Rianne');assert.equal(d.drafts[0].draftId,chatgpt.draftId);
 });
 await t.test('verzenden staat standaard uit: er gaat niets de deur uit',async()=>{
  const d=(await api('/api/mail/threads/t1aaaaaaaaaaaaaa')).data;assert.equal(d.sendEnabled,false);
  const r=await api('/api/mail/threads/t1aaaaaaaaaaaaaa',{body:{action:'send',confirm:true,draftId:d.drafts[0].draftId,draftMessageId:d.drafts[0].messageId,lastMessageId:d.thread.lastMessageId,requestId:randomUUID()}});
  assert.equal(r.status,403);assert.equal(s.sends.length,0);
 });
 await t.test('met verzenden aan: controle vlak voor verzenden en precies één verzending',async()=>{
  await server.stop();server=await startApp(dir,port,mockPort,{...groupEnv,MAIL_SEND_ENABLED:'1',GUEST_ACCESS:JSON.stringify({bart:{mailboxes:['gmail'],send:true,calendar:true,manage:true},rianne:{mailboxes:['gmail'],send:false}})});
  // Rights per employee (GUEST_ACCESS): Rianne may read and draft here, sending is not granted to her in this test setup.
  {const d=(await api('/api/mail/threads/t1aaaaaaaaaaaaaa',{as:rianne})).data;assert.equal(d.sendEnabled,false);
   const r=await api('/api/mail/threads/t1aaaaaaaaaaaaaa',{as:rianne,body:{action:'send',confirm:true,draftId:d.drafts[0].draftId,draftMessageId:d.drafts[0].messageId,lastMessageId:d.thread.lastMessageId,requestId:randomUUID()}});assert.equal(r.status,403);assert.equal(s.sends.length,0)}
  let d=(await api('/api/mail/threads/t1aaaaaaaaaaaaaa')).data;const draft=d.drafts[0];
  assert.equal((await api('/api/mail/threads/t1aaaaaaaaaaaaaa',{body:{action:'send',draftId:draft.draftId,draftMessageId:draft.messageId,lastMessageId:d.thread.lastMessageId,requestId:randomUUID()}})).status,400,'zonder bevestiging niet');
  // A new customer message arrives just before sending: nothing is sent.
  mock.add({thread:'t1aaaaaaaaaaaaaa',from:'Anna <anna@example.nl>',subject:'Re: Reservering zaterdag',text:'Of toch 14 personen?',labels:['INBOX',LABEL,'UNREAD'],at:Date.now()});
  const late=await api('/api/mail/threads/t1aaaaaaaaaaaaaa',{body:{action:'send',confirm:true,draftId:draft.draftId,draftMessageId:draft.messageId,lastMessageId:d.thread.lastMessageId,requestId:randomUUID()}});
  assert.equal(late.status,409);assert.match(late.data.error,/nieuw bericht/);assert.equal(s.sends.length,0);
  d=(await api('/api/mail/threads/t1aaaaaaaaaaaaaa')).data;assert.equal(d.messages.length,2,'nieuw bericht zichtbaar');
  const rid=randomUUID(),body=(requestId)=>({action:'send',confirm:true,draftId:d.drafts[0].draftId,draftMessageId:d.drafts[0].messageId,lastMessageId:d.thread.lastMessageId,requestId});
  // Double click, reload and a second tab at the same time: one send.
  const results=await Promise.all([api('/api/mail/threads/t1aaaaaaaaaaaaaa',{body:body(rid)}),api('/api/mail/threads/t1aaaaaaaaaaaaaa',{body:body(rid)}),api('/api/mail/threads/t1aaaaaaaaaaaaaa',{body:body(randomUUID())})]);
  assert.equal(s.sends.length,1,'precies één keer verzonden: '+JSON.stringify(results.map(r=>[r.status,r.data])));
  assert.ok(results.some(r=>r.status===200&&r.data.status==='verzonden'));
  const again=await api('/api/mail/threads/t1aaaaaaaaaaaaaa',{body:body(rid)});assert.equal(s.sends.length,1);assert.ok(again.status===200&&again.data.duplicate||again.status===409);
  assert.equal(s.sends[0].threadId,'t1aaaaaaaaaaaaaa','binnen hetzelfde gesprek');
  d=(await api('/api/mail/threads/t1aaaaaaaaaaaaaa')).data;assert.equal(d.drafts.length,0);assert.equal(d.thread.waiting,'wij-wachten');assert.equal(d.sends.filter(x=>x.status==='verzonden').length,1);
 });
 await t.test('wijzigingen uit Gmail: direct verstuurd antwoord, nieuw gesprek, label verwijderd',async()=>{
  mock.add({thread:'t2bbbbbbbbbbbbbb',from:'Piet <piet@example.nl>',subject:'Re: Groepsuitje',text:'Prima, we komen!',labels:['INBOX',LABEL],at:Date.now()});
  mock.add({thread:'t5eeeeeeeeeeeeee',from:'Joke <joke@example.nl>',subject:'Kinderfeestje',text:'Is er plek op 8 november?',labels:['INBOX',LABEL],at:Date.now()});
  mock.removeLabel('t3cccccccccccccc',LABEL);
  mock.add({thread:'t1aaaaaaaaaaaaaa',from:ME,to:'anna@example.nl',subject:'Re: Reservering zaterdag',text:'Ook 14 kan (vanuit Gmail).',labels:['SENT'],at:Date.now()+1000});
  const d=await sync();const ids=d.threads.map(x=>x.threadId).sort();
  assert.deepEqual(ids,['t1aaaaaaaaaaaaaa','t2bbbbbbbbbbbbbb','t5eeeeeeeeeeeeee']);
  assert.equal(d.threads.find(x=>x.threadId==='t2bbbbbbbbbbbbbb').waiting,'klant-wacht');
  assert.equal(d.threads.find(x=>x.threadId==='t1aaaaaaaaaaaaaa').waiting,'wij-wachten');
 });
 await t.test('afgehandeld is een backofficestatus; Rianne en Bartele kunnen allebei werken',async()=>{
  const d=(await api('/api/mail/threads/t2bbbbbbbbbbbbbb',{as:rianne})).data;
  const r=await api('/api/mail/threads/t2bbbbbbbbbbbbbb',{as:rianne,body:{action:'work',status:'afgehandeld',assigned:'rianne',customerId:'',version:d.thread.statusVersion}});assert.equal(r.status,200,JSON.stringify(r.data));
  const again=(await api('/api/mail/threads/t2bbbbbbbbbbbbbb')).data;assert.equal(again.thread.status,'afgehandeld');assert.equal(again.thread.statusBy,'rianne');assert.equal(again.thread.assigned,'rianne');
  assert.ok(s.messages.get([...s.messages.values()].find(m=>m.threadId==='t2bbbbbbbbbbbbbb').id).labelIds.includes(LABEL),'label blijft');
  assert.equal((await api('/api/mail/threads/t2bbbbbbbbbbbbbb',{body:{action:'work',status:'open',assigned:'',customerId:'',version:0}})).status,409,'verouderde status geweigerd');
 });
 await t.test('één inbox: Gmail-gesprekken staan in het gastcontact (klantenkaarten, planning) zonder mailtekst te kopiëren',async()=>{
  const g=(await api('/api/gasten')).data;const mail=g.state.threads.filter(x=>x.channel==='gmail');
  assert.ok(mail.some(x=>x.id==='gmail:t2bbbbbbbbbbbbbb'&&x.assigned==='rianne'&&x.status==='afgehandeld'));
  assert.ok(mail.every(x=>Array.isArray(x.messages)&&x.messages.length===0),'geen mailteksten in het gastcontact');
  const db=await dump();assert.ok(!db.includes(Buffer.from(fullMail)),'volledige mailtekst niet in de database; de bestaande korte indexsnippet is toegestaan');
  // A request linked to the Gmail conversation, made in Planning (a mail never books by itself).
  const res=await api('/api/gasten',{body:{action:'reservation',requestId:randomUUID(),version:g.version,reservation:{id:'aanvraag-joke',name:'Joke',email:'joke@example.nl',phone:'',activity:'groep',date:'2027-11-06',from:'14:00',to:'16:00',people:12,sharing:false,status:'aanvraag',expires:'',notes:'Kinderfeestje',threadId:'gmail:t5eeeeeeeeeeeeee',tables:[]}}});
  assert.equal(res.status,200,JSON.stringify(res.data));
  const d=(await api('/api/mail/threads/t5eeeeeeeeeeeeee')).data;assert.deepEqual(d.reservations.map(r=>[r.id,r.status]),[['aanvraag-joke','aanvraag']]);
  const bad=await api('/api/gasten',{body:{action:'reservation',requestId:randomUUID(),version:(await api('/api/gasten')).data.version,reservation:{id:'x',name:'X',email:'',phone:'',activity:'groep',date:'2027-11-06',from:'14:00',to:'16:00',people:2,sharing:false,status:'aanvraag',expires:'',notes:'',threadId:'gmail:t4dddddddddddddd',tables:[]}}});
  assert.equal(bad.status,400,'gesprek zonder klantlabel kan niet gekoppeld worden');
 });
 await t.test("meerdere agenda's: kiezen uit de lijst, klanten krijgt concepten, evenementen de evenementen; bevestigd/geannuleerd wordt opgeruimd, niets dubbel",async()=>{
  const list=(await api('/api/mail/calendars')).data;assert.deepEqual(list.available.map(c=>c.name),['Rianne','Klanten','Evenementen']);
  assert.equal((await api('/api/mail/calendars',{body:{action:'link',calendarId:'onbekend@group.calendar.google.com',role:'klanten'}})).status,404);
  for(const [id,role] of [['klanten-cal@group.calendar.google.com','klanten'],['evenementen-cal@group.calendar.google.com','evenementen']])assert.equal((await api('/api/mail/calendars',{body:{action:'link',calendarId:id,role}})).status,200);
  const g=(await api('/api/gasten')).data;
  assert.equal((await api('/api/gasten',{body:{action:'event',requestId:randomUUID(),version:g.version,event:{id:randomUUID(),date:'2027-11-07',from:'13:00',to:'17:00',title:'Pompoenfeest',holiday:false}}})).status,200);
  const until=async(fn)=>{for(let i=0;i<150;i++){if(fn())return;await sleep(200)}throw Error('agenda niet bijgewerkt: '+JSON.stringify([...s.events.values()]))};
  const of=cal=>[...s.events.values()].filter(e=>e.calendar===cal);
  await until(()=>of('klanten-cal@group.calendar.google.com').length===1&&of('evenementen-cal@group.calendar.google.com').length===1);
  const concept=of('klanten-cal@group.calendar.google.com')[0];assert.match(concept.summary,/^CONCEPT · aanvraag · groep · Joke · 12 personen/);assert.equal(concept.status,'tentative');
  assert.equal(of('evenementen-cal@group.calendar.google.com')[0].summary,'Pompoenfeest');assert.equal(of('primary-cal').length,0,'niet gekoppelde agenda blijft onaangeroerd');
  // Repeated synchronisation: nothing new, no duplicates, no Google requests for unchanged items.
  const calls=s.eventCalls;assert.equal((await api('/api/mail/calendars',{body:{action:'sync'}})).status,200);await sleep(2500);
  assert.equal(s.events.size,2);assert.equal(s.eventCalls,calls,'ongewijzigde items: geen agenda-aanvragen');
  // The request is cancelled in Planning: the concept leaves the customer calendar (confirmed bookings are added by the daily task).
  const g2=(await api('/api/gasten')).data,r=g2.state.reservations.find(x=>x.id==='aanvraag-joke');
  assert.equal((await api('/api/gasten',{body:{action:'reservation',requestId:randomUUID(),version:g2.version,reservation:{...r,status:'geannuleerd'}}})).status,200);
  await until(()=>of('klanten-cal@group.calendar.google.com').length===0);
  assert.equal(of('evenementen-cal@group.calendar.google.com').length,1);
 });
 await t.test('aanmelden voor een betaald evenement: één bevestigingsmail via Gmail, kosten, betaald aanvinken',async()=>{
  const day=new Date(Date.now()+10*86400000).toISOString().slice(0,10),eid=randomUUID();
  const g=(await api('/api/gasten')).data;
  assert.equal((await api('/api/gasten',{body:{action:'event',requestId:randomUUID(),version:g.version,event:{id:eid,date:day,from:'14:00',to:'16:00',title:'Pompoenfeest',description:'Snijden en proeven',holiday:false,signup:true,capacity:10,priceCents:750,paymentInfo:'Je betaalt ter plekke contant of met pin.'}}})).status,200);
  const pub=await (await fetch(base+'/api/public/availability')).json();const ev=pub.events.find(e=>e.id===eid);
  assert.equal(ev.priceCents,750);assert.equal(ev.paymentInfo,'Je betaalt ter plekke contant of met pin.');assert.equal(pub.confirmationMail,true);
  const signup={requestId:randomUUID(),eventId:eid,name:'Joke Visser',email:'joke@example.nl',phone:'',people:2,note:'',consent:true};
  const post=()=>fetch(base+'/api/public/event-signups',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:3002'},body:JSON.stringify(signup)});
  assert.equal((await post()).status,201);
  let row;for(let i=0;i<100;i++){row=(await api('/api/gasten')).data.signups.find(x=>x.event_id===eid);if(row?.confirmation==='verzonden')break;await sleep(200)}
  assert.equal(row.confirmation,'verzonden',JSON.stringify(row));assert.equal(row.amount_cents,1500);assert.equal(row.payment_status,'open');
  const mails=s.direct.filter(m=>m.headers.To==='joke@example.nl');assert.equal(mails.length,1);
  assert.equal(mails[0].headers['Message-ID'],'<aanmelding-'+row.id+'@boerbart.nl>');assert.match(mails[0].body,/€ 15,00 \(2 × € 7,50\)/);assert.match(mails[0].body,/ter plekke contant of met pin/);
  assert.equal((await post()).status,200,'zelfde aanvraag nogmaals');await sleep(1500);assert.equal(s.direct.filter(m=>m.headers.To==='joke@example.nl').length,1,'geen tweede mail');
  assert.equal((await api('/api/gasten',{body:{action:'signup-confirm',id:row.id,requestId:randomUUID(),version:0}})).status,400,'al verzonden: niet opnieuw');
  assert.equal((await api('/api/gasten',{body:{action:'signup-paid',id:row.id,paid:true,requestId:randomUUID(),version:0}})).status,200);
  row=(await api('/api/gasten')).data.signups.find(x=>x.id===row.id);assert.equal(row.payment_status,'betaald');assert.equal(row.paid_by,'bart');
 });
 await t.test('koppelen aan een bestaande bestelling; onbekend wordt geweigerd',async()=>{
  assert.equal((await api('/api/mail/threads/t5eeeeeeeeeeeeee',{body:{action:'link-add',kind:'bestelling',ref:'999'}})).status,404);
  assert.equal((await api('/api/mail/threads/t5eeeeeeeeeeeeee',{body:{action:'link-add',kind:'groepsreservering',ref:'x'}})).status,400);
 });
 await t.test('tijdelijke Gmail-fouten worden opnieuw geprobeerd; verlopen history leidt tot volledige synchronisatie',async()=>{
  s.failNext=2;await sync();
  s.minHistory=s.historyId+1;mock.add({thread:'t6ffffffffffffff',from:'Kees <kees@example.nl>',subject:'Vraag',text:'Open op zondag?',labels:['INBOX',LABEL],at:Date.now()});
  const d=await sync();assert.ok(d.threads.some(x=>x.threadId==='t6ffffffffffffff'));assert.equal(d.status.lastError,null);
 });
 await t.test('verbinding valt weg tijdens verzenden: geen tweede poging tot de synchronisatie het heeft vastgesteld',async()=>{
  const c=await api('/api/mail/threads/t5eeeeeeeeeeeeee',{body:{action:'draft-create',body:'Hoi Joke, er is plek.',requestId:randomUUID()}});assert.equal(c.status,200);
  let d=(await api('/api/mail/threads/t5eeeeeeeeeeeeee')).data;const sends=s.sends.length;
  const req=()=>({action:'send',confirm:true,draftId:d.drafts[0].draftId,draftMessageId:d.drafts[0].messageId,lastMessageId:d.thread.lastMessageId,requestId:randomUUID()});
  s.failSend=true;const r=await api('/api/mail/threads/t5eeeeeeeeeeeeee',{body:req()});assert.equal(r.status,503);assert.match(r.data.error,/Onzeker/);
  assert.equal((await api('/api/mail/threads/t5eeeeeeeeeeeeee',{body:req()})).status,409,'zelfde concept geblokkeerd zolang onzeker');
  await sync();d=(await api('/api/mail/threads/t5eeeeeeeeeeeeee')).data;assert.equal(d.sends[0].status,'mislukt','concept staat nog in Gmail: niet verzonden');
  const ok=await api('/api/mail/threads/t5eeeeeeeeeeeeee',{body:req()});assert.equal(ok.status,200,JSON.stringify(ok.data));assert.equal(s.sends.length,sends+1);
 });
 await t.test('TEST – aanvraag familiefeest voorjaar 2027: advies, goedkeuring, nieuw bericht en herstart zonder verzending',async()=>{
  const thread='aabbccddeeff1122',url='/api/mail/threads/'+thread;
  mock.add({thread,from:'Familie <familie@example.nl>',subject:'TEST – aanvraag familiefeest voorjaar 2027',text:testFixture.incoming,labels:['INBOX',LABEL],at:Date.now()});await sync();
  const action=body=>api(url,{body}),sent=s.sends.length,direct=s.direct.length;
  const example={id:'H-TEST-001',source:'https://trello.com/c/test-example',informationDate:'2026-01-01',consultedAt:'2026-11-03T10:00:00Z',wishes:'Fictief familiefeest',solution:'Lunch en spelen',included:['Lunch'],unknown:['Drankjes','Btw'],evidence:'feit',status:'aangeboden',historicalPrices:['Fictief historisch voorbeeld, geen actuele prijslijst']};
  assert.equal((await api('/api/gasten',{body:{action:'knowledge-add',example}})).status,200);
  assert.equal((await api('/api/gasten',{body:{action:'knowledge-add',example}})).status,400,'oude bronversie niet overschrijven');
  assert.equal((await api('/api/gasten',{as:rianne,body:{action:'knowledge-add',example:{...example,id:'unauthorized'}}})).status,400);
  aiReply.exampleIds=[example.id];
  const prepare=await action({action:'advice-prepare'});assert.equal(prepare.status,200,JSON.stringify(prepare.data));let d=prepare.data.dossier,r=d.revisions.at(-1);assert.ok(r.sources.some(s=>s.label==='Dossier H-TEST-001'&&s.url===example.source));
  const originalMessageId=(await api(url)).data.thread.lastMessageId;
  const n=aiCalls;assert.equal((await action({action:'advice-prepare'})).data.cached,true);assert.equal(aiCalls,n,'geen dubbele AI-aanroep');
  assert.equal((await api(url)).data.drafts.length,0,'AI schrijft geen Gmail-concept');
  assert.doesNotMatch((await action({action:'advice-text'})).data.text,/150|Fictief|Onbekend/);
  assert.equal((await action({action:'advice-edit',version:d.revision,note:'',approveId:r.id,},)).status,200);
  assert.match((await action({action:'advice-text'})).data.text,/150,00/);
  // Meest recente geschiedenis: het goedgekeurde voorstel staat meteen als bronvoorbeeld (B-…) in de groepskennis, één keer.
  const learned=(await api('/api/gasten')).data.state.groupKnowledge.filter(k=>k.id.startsWith('B-'));
  assert.equal(learned.length,1);assert.match(learned[0].source,new RegExp('mail\\.google\\.com/.*#all/'+thread+'$'));assert.equal(learned[0].status,'aangeboden');
  assert.ok(learned[0].historicalPrices.some(p=>/Totaal €\s150,00/.test(p)),JSON.stringify(learned[0].historicalPrices));
  assert.equal((await action({action:'advice-edit',version:(await action({action:'advice-status'})).data.dossier.revision,note:'',approveId:r.id})).status,200,'nog eens goedkeuren');
  assert.equal((await api('/api/gasten')).data.state.groupKnowledge.filter(k=>k.id.startsWith('B-')).length,1,'niet dubbel');
  if(process.env.BB_GROUP_BROWSER==='1'){
   const {chromium}=createRequire(new URL('./browser/package.json',import.meta.url))('playwright');
   const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium'});
   try{const ctx=await browser.newContext();await ctx.addCookies([{name:'bb_sessie',value:sessionCookie(owner.user).slice('bb_sessie='.length),url:base}]);const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
    for(const width of [390,820,1440]){
     await page.setViewportSize({width,height:900});await page.goto(base+'/gesprekken?gesprek='+encodeURIComponent('gmail:'+thread));
     const panel=page.getByRole('region',{name:'Aan Rianne — intern advies'});await panel.getByRole('heading',{name:'Gastconcept — nog niet in Gmail',exact:true}).waitFor();
     // De AI-notitie is vervallen (11 november 2026); de goedkeuring staat in het blok Aan Rianne.
     await panel.getByText(/goedgekeurd door/i).first().waitFor();
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'geen horizontale overflow op '+width);
     await panel.getByRole('button',{name:/Gastconcept naar lege antwoordeditor/}).click();
     await page.waitForFunction(()=>document.querySelector('#mail-reply')?.value.includes('150,00'));
     await page.locator('#mail-reply').fill('Handmatige tekst blijft behouden');await panel.getByRole('button',{name:/Gastconcept naar lege antwoordeditor/}).click();
     await page.getByText('Er is al een concept of eigen tekst. Bewaar die eerst; niets is overschreven.',{exact:true}).waitFor();
     assert.equal(await page.locator('#mail-reply').inputValue(),'Handmatige tekst blijft behouden');
    }
    const beforeManualEdit=aiCalls,manual=mock.addDraft(thread,'Handmatig aangepast concept',{html:true});
    await page.goto(base+'/gesprekken?gesprek='+encodeURIComponent('gmail:'+thread));
    await page.getByRole('region',{name:'Aan Rianne — intern advies'}).getByRole('heading',{name:'Gastconcept — nog niet in Gmail',exact:true}).waitFor();
    await page.waitForFunction(()=>{const b=document.querySelector('.group-advice button');return b&&!b.disabled});
    assert.equal(aiCalls,beforeManualEdit,'handmatig concept zonder nieuw gastbericht start geen nieuwe AI-aanroep');
    s.messages.delete(manual.messageId);s.drafts.delete(manual.draftId);
    assert.deepEqual(errors,[]);
   }finally{await browser.close()}
  }
  const denied=await api(url,{as:rianne,body:{action:'advice-edit',version:0,note:'misbruik'}});assert.equal(denied.status,403);
  // A newer guest message invalidates the proposal and approval for transfer.
  mock.add({thread,from:'Familie <familie@example.nl>',subject:'Re: TEST',text:'Het worden 20 personen.',labels:['INBOX',LABEL],at:Date.now()+1000});
  assert.equal((await action({action:'draft-create',body:'Een verouderd antwoord',lastMessageId:originalMessageId,requestId:randomUUID()})).status,409,'nieuw bericht blokkeert ook bewaren van oude tekst');
  assert.equal((await action({action:'advice-text'})).status,409); // safe refusal, no text transferred
  const newer=await action({action:'advice-prepare'});assert.equal(newer.status,200,JSON.stringify(newer.data));assert.equal(newer.data.dossier.revisions.length,2);
  assert.doesNotMatch((await action({action:'advice-text'})).data.text,/150,00/,'oude prijsgoedkeuring geldt niet voor nieuwe aanvraag');
  // A hand-written draft that arrives during generation must survive; stale model output is discarded.
  mock.add({thread,from:'Familie <familie@example.nl>',subject:'Re: TEST',text:'Nog een vraag over de kinderen.',labels:['INBOX',LABEL],at:Date.now()+2000});
  whileGenerating=async()=>{mock.addDraft(thread,originalDraftText,{html:true})};
  assert.equal((await action({action:'advice-prepare'})).status,409);
  assert.equal((await api(url)).data.drafts[0].text,originalDraftText);
  const stored=(await action({action:'advice-status'})).data.dossier;assert.equal(stored.revisions.length,2);assert.equal(stored.approvals.length,1);
  assert.equal(s.sends.length,sent);assert.equal(s.direct.length,direct);assert.equal((await api('/api/gasten')).data.state.reservations.filter(x=>x.threadId==='gmail:'+thread).length,0);
  await server.stop();server=await startApp(dir,port,mockPort,{...groupEnv,MAIL_SEND_ENABLED:'1',GUEST_ACCESS:JSON.stringify({bart:{mailboxes:['gmail'],send:true,calendar:true,manage:true},rianne:{mailboxes:['gmail'],send:false}})});
  const restored=(await action({action:'advice-status'})).data.dossier;assert.equal(restored.revisions.length,2);assert.equal(restored.approvals.length,1);assert.equal((await api('/api/gasten')).data.state.groupKnowledge.some(k=>k.id===example.id),true);assert.equal((await api(url)).data.drafts[0].text,originalDraftText);
 });
 await t.test('advies met OpenAI in plaats van Claude: zelfde advies en controles, sleutel alleen in de kop',async()=>{
  // Owner's choice, 3 November 2026: guest advice can run on OpenAI (the mail assistant already runs in ChatGPT).
  const openaiKey='sk-test-'+randomBytes(12).toString('hex'),seen=[];
  const openai=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;seen.push({path:req.url,auth:req.headers.authorization,body:JSON.parse(body)});
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify({id:'chatcmpl-test',object:'chat.completion',choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify({...aiReply,exampleIds:[]})}}]}))});
  await new Promise(r=>openai.listen(0,'127.0.0.1',r));t.after(()=>{openai.closeAllConnections();return new Promise(r=>openai.close(r))});
  const openaiEnv={...groupEnv,MAIL_SEND_ENABLED:'1',GUEST_ACCESS:JSON.stringify({bart:{mailboxes:['gmail'],send:true,calendar:true,manage:true},rianne:{mailboxes:['gmail'],send:false}}),
   GUEST_AI_PROVIDER:'openai',OPENAI_API_KEY:openaiKey,OPENAI_BASE_URL:'http://127.0.0.1:'+openai.address().port+'/v1'};
  const thread='ccddeeff00112233',url='/api/mail/threads/'+thread;
  mock.add({thread,from:'Bedrijf <info@bedrijf.example>',subject:'Bedrijfsuitje 30 personen',text:'Wij willen in mei met 30 collega\'s komen. Wat is mogelijk?',labels:['INBOX',LABEL],at:Date.now()});
  // OpenAI chosen but no model yet: no red error, a clear setting to fill in, and no request to any AI.
  await server.stop();server=await startApp(dir,port,mockPort,openaiEnv);await sync();
  let st=(await api(url,{body:{action:'advice-status'}})).data;assert.equal(st.available,false);assert.equal(st.engine,'OpenAI');
  const claudeCalls=aiCalls,missing=await api(url,{body:{action:'advice-prepare'}});
  assert.match(JSON.stringify(missing.data),/OpenAI-model/);assert.equal(seen.length,0);assert.equal(aiCalls,claudeCalls);
  // With a model: one request to OpenAI, none to Claude; the advice passes the same checks and shows which AI made it.
  await server.stop();server=await startApp(dir,port,mockPort,{...openaiEnv,OPENAI_MODEL:'test-model'});
  st=(await api(url,{body:{action:'advice-status'}})).data;assert.equal(st.available,true);
  assert.equal(st.dossier.error,undefined,'de oude melding "nog niet ingesteld" van de eerste poging is weg');
  const prepared=await api(url,{body:{action:'advice-prepare'}});assert.equal(prepared.status,200,JSON.stringify(prepared.data));
  const r=prepared.data.dossier.revisions.at(-1);
  assert.equal(r.engine,'OpenAI · test-model');assert.equal(r.advice.solution,aiReply.solution);
  assert.equal(seen.length,1);assert.equal(seen[0].path,'/v1/chat/completions');assert.equal(seen[0].auth,'Bearer '+openaiKey);
  assert.equal(seen[0].body.model,'test-model');assert.equal(seen[0].body.response_format.type,'json_object');assert.match(seen[0].body.messages[0].content,/Schrijfstijl: Warm, direct en persoonlijk/);
  assert.equal(aiCalls,claudeCalls,'geen aanvraag naar Claude');
  assert.equal((await api(url,{body:{action:'advice-prepare'}})).data.cached,true);assert.equal(seen.length,1,'geen dubbele aanvraag');
  assert.ok(!JSON.stringify((await api(url,{body:{action:'advice-status'}})).data).includes(openaiKey),'sleutel niet in antwoorden');
  assert.ok(!server.log.join('').includes(openaiKey),'sleutel niet in logs');
  assert.equal((await api(url)).data.drafts.length,0,'AI schrijft geen Gmail-concept');
  await server.stop();server=await startApp(dir,port,mockPort,{...groupEnv,MAIL_SEND_ENABLED:'1',GUEST_ACCESS:openaiEnv.GUEST_ACCESS});
 });
 await t.test('tweede klik terwijl het advies nog wordt voorbereid: duidelijke melding, één AI-aanvraag',async()=>{
  const thread='dd00112233445566',url='/api/mail/threads/'+thread;
  mock.add({thread,from:'Vereniging <info@vereniging.example>',subject:'Uitje vereniging',text:'Wij willen met 40 leden komen in juni.',labels:['INBOX',LABEL],at:Date.now()});await sync();
  let second=null;const before=aiCalls;
  whileGenerating=async()=>{second=await api(url,{body:{action:'advice-prepare'}})};
  const first=await api(url,{body:{action:'advice-prepare'}});
  assert.equal(first.status,200,JSON.stringify(first.data));
  assert.equal(second.status,409);assert.match(second.data.error,/wordt al voorbereid/);
  assert.equal(aiCalls,before+1,'één AI-aanvraag');
 });
 await t.test('datum en tijd reserveren vanuit een gesprek: planningsregels, optie aan het gesprek gekoppeld, alternatieven',async()=>{
  // Wish owner, 3 November 2026: a button in the conversation reserves date and time in the agenda.
  const thread='t1aaaaaaaaaaaaaa',ref=(await api('/api/mail/threads/'+thread)).data.thread.ref;
  const sendsBefore=s.sends.length,draftsBefore=(await api('/api/mail/threads/'+thread)).data.drafts.length;
  let saturday=new Date();saturday.setDate(saturday.getDate()+14);while(saturday.getDay()!==6)saturday.setDate(saturday.getDate()+1);
  const date=saturday.toISOString().slice(0,10),expires=new Date(Date.now()+7*86400000).toISOString();
  const gasten=async body=>api('/api/gasten',{body:{version:(await api('/api/gasten')).data.version,requestId:randomUUID(),...body}});
  const reservation={id:randomUUID(),name:'Anna',email:'anna@example.nl',phone:'',activity:'groep',date,from:'13:00',to:'15:00',people:20,sharing:false,status:'optie',expires,notes:'Familiefeest, lunch en spelen',threadId:ref,tables:[]};
  // Handmatig inboeken kan altijd (besluit eigenaar 18 november 2026): ook zonder ingestelde capaciteit; de groep heeft de ruimte dan voor zich alleen.
  let r=await gasten({action:'reservation',reservation});assert.equal(r.status,200,JSON.stringify(r.data));
  assert.equal((await gasten({action:'reservation',reservation:{...reservation,id:randomUUID(),name:'Tegelijk'}})).status,400,'geen tweede groep tegelijk zonder capaciteit');
  assert.equal((await gasten({action:'capacity',capacity:{bezoek:40,groep:30}})).status,200);
  const linked=(await api('/api/mail/threads/'+thread)).data.reservations;
  assert.deepEqual(linked.map(x=>[x.id,x.date,x.from,x.to,x.people,x.status]),[[reservation.id,date,'13:00','15:00',20,'optie']],'gekoppeld aan het gesprek');
  // The option holds the place: a second group of 20 at the same time does not fit; alternatives are offered, nothing held.
  const second={...reservation,id:randomUUID(),name:'Tweede groep'};
  r=await gasten({action:'reservation',reservation:second});assert.equal(r.status,400);assert.match(r.data.error,/onvoldoende|vol/i);
  const alt=await gasten({action:'alternatives',reservation:{...second,status:'bevestigd',expires:''}});assert.equal(alt.status,200);
  assert.ok(alt.data.alternatives.length>=1&&alt.data.alternatives.every(a=>a.date>date));
  assert.equal((await api('/api/gasten')).data.state.reservations.filter(x=>x.threadId===ref).length,1);
  assert.equal(s.sends.length,sendsBefore,'er wordt niets verstuurd');assert.equal((await api('/api/mail/threads/'+thread)).data.drafts.length,draftsBefore,'geen nieuw Gmail-concept');
 });
 await t.test('gesprek verwijderen (wens eigenaar 8 november 2026): weg uit Gesprekken, Gmail onaangeroerd, terug bij een nieuw bericht',async()=>{
  const ref='t5eeeeeeeeeeeeee',d=(await api('/api/mail/threads/'+ref)).data;
  assert.equal((await api('/api/mail/threads/'+ref,{body:{action:'verwijderen',version:d.thread.statusVersion}})).status,400,'zonder bevestiging niet');
  assert.equal((await api('/api/mail/threads/'+ref,{body:{action:'verwijderen',confirm:true,version:d.thread.statusVersion+5}})).status,409,'verouderde versie geweigerd');
  const r=await api('/api/mail/threads/'+ref,{as:rianne,body:{action:'verwijderen',confirm:true,version:d.thread.statusVersion}});assert.equal(r.status,200,JSON.stringify(r.data));
  assert.ok(!(await api('/api/mail?filter=alles')).data.threads.some(x=>x.threadId===ref),'niet meer in de lijst');
  assert.ok(!(await api('/api/gasten')).data.state.threads.some(x=>x.id==='gmail:'+ref),'niet meer in het gastcontact');
  const before=[...s.messages.values()].filter(m=>m.threadId===ref);assert.ok(before.length&&before.some(m=>m.labelIds.includes(LABEL)),'Gmail en het label blijven gelijk');
  // De klant schrijft opnieuw: het gesprek staat weer open.
  mock.add({thread:ref,from:'Joke <joke@example.nl>',subject:'Re: Kinderfeestje',text:'Nog even een vraag.',labels:['INBOX',LABEL],at:Date.now()+5000});
  const back=(await sync()).threads.find(x=>x.threadId===ref);assert.ok(back,'terug na een nieuw bericht');assert.equal(back.waiting,'opnieuw-open');
  // Websitechat: verwijderen haalt het gesprek weg en dezelfde chat komt niet opnieuw binnen.
  const g=(await api('/api/gasten')).data,chat={id:'verwijder-proef',customer:'Websitegast',summary:'Vraag over openingstijden',transcript:'',messages:[{id:'m1',from:'Websitegast',text:'Zijn jullie zondag open?',at:new Date().toISOString()}]};
  assert.equal((await api('/api/gasten',{body:{action:'import-chat',requestId:randomUUID(),version:g.version,chat}})).status,200);
  const g2=(await api('/api/gasten')).data;assert.ok(g2.state.threads.some(x=>x.id==='chat:verwijder-proef'));
  assert.equal((await api('/api/gasten',{body:{action:'thread-delete',id:'chat:verwijder-proef',requestId:randomUUID(),version:g2.version}})).status,400,'zonder bevestiging niet');
  const del=await api('/api/gasten',{body:{action:'thread-delete',id:'chat:verwijder-proef',confirm:true,requestId:randomUUID(),version:(await api('/api/gasten')).data.version}});assert.equal(del.status,200,JSON.stringify(del.data));
  const g3=(await api('/api/gasten')).data;assert.ok(!g3.state.threads.some(x=>x.id==='chat:verwijder-proef'),'chat verwijderd');
  assert.notEqual((await api('/api/gasten',{body:{action:'import-chat',requestId:randomUUID(),version:g3.version,chat}})).status,200,'komt niet opnieuw binnen');
 });
 await t.test('ingetrokken toegang: zichtbaar als verlopen, geen stille fouten',async()=>{
  s.revoked=true;const before=(await status()).status.lastSyncAttempt||'';
  await api('/api/mail',{body:{action:'sync'}});
  let st;for(let i=0;i<100;i++){st=(await status()).status;if(st.status==='toegang-verlopen')break;await sleep(200)}
  assert.equal(st.status,'toegang-verlopen');assert.match(st.lastError,/opnieuw/i);assert.ok(st.lastSyncOk,'laatste geslaagde synchronisatie blijft zichtbaar');
  assert.equal((await api('/api/mail/threads/t5eeeeeeeeeeeeee')).status,409);
  s.revoked=false;
 });
});

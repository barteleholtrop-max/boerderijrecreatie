// WhatsApp, Messenger en Instagram in Gesprekken (akkoord eigenaar 9 november 2026): de regels zonder netwerk,
// en de opslag en het verzenden tegen een echte tijdelijke database met een nagebootste Meta.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHmac} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {parseWebhook,normalizePhone,showPhone,windowLeft,windowText,waitingFor,sendBlocker,usableTemplates,fillTemplate,outgoing,sentId,metaMediaUrl,describe} from '../lib/meta-core.ts';
import {validSignature} from '../lib/meta-signature.ts';
import {metaStaffMessage,parseStaffMessage} from '../lib/staff-push-core.ts';

const ts=s=>String(Math.floor(Date.parse(s)/1000));
const wa=(field,value)=>({object:'whatsapp_business_account',entry:[{id:'waba',changes:[{field,value:{messaging_product:'whatsapp',metadata:{phone_number_id:'111'},...value}}]}]});

test('handtekening van Meta: alleen met het juiste app-geheim',()=>{
 const raw='{"object":"page"}',sig='sha256='+createHmac('sha256','geheim').update(raw).digest('hex');
 assert.equal(validSignature(raw,sig,'geheim'),true);
 assert.equal(validSignature(raw+' ',sig,'geheim'),false);
 assert.equal(validSignature(raw,sig,'ander'),false);
 assert.equal(validSignature(raw,sig,''),false,'zonder geheim nooit geldig');
 assert.equal(validSignature(raw,null,'geheim'),false);
 assert.equal(validSignature(raw,'sha1=abc','geheim'),false);
});

test('WhatsApp: tekst, spraakbericht met naam, status en echo vanaf de telefoon',()=>{
 const ev=parseWebhook(wa('messages',{contacts:[{wa_id:'31612345678',profile:{name:'Sanne'}}],messages:[
  {from:'31612345678',id:'wamid.1',timestamp:ts('2026-11-09T10:40:00Z'),type:'text',text:{body:'Hoi! Kinderfeestje?'}},
  {from:'31612345678',id:'wamid.2',timestamp:ts('2026-11-09T10:42:00Z'),type:'audio',audio:{id:'media-9',mime_type:'audio/ogg'}},
  {from:'31612345678',id:'wamid.3',timestamp:ts('2026-11-09T10:43:00Z'),type:'location',location:{latitude:52.1,longitude:5.2,name:'Thuis'}}],
  statuses:[{id:'wamid.0',status:'read',timestamp:'1'}]}));
 assert.equal(ev.length,4);
 assert.deepEqual({...ev[0]},{kind:'message',channel:'whatsapp',contact:'31612345678',name:'Sanne',phone:'31612345678',id:'wamid.1',fromUs:false,at:'2026-11-09T10:40:00.000Z',type:'text',text:'Hoi! Kinderfeestje?',media:null,source:'webhook'});
 assert.deepEqual(ev[1].media,{id:'media-9',mime:'audio/ogg'});assert.equal(ev[1].type,'audio');
 assert.match(ev[2].text,/Thuis · 52\.1, 5\.2/);
 assert.deepEqual(ev[3],{kind:'status',id:'wamid.0',status:'read',error:''});
 const echo=parseWebhook(wa('smb_message_echoes',{message_echoes:[{from:'31621000000',to:'31612345678',id:'wamid.e',timestamp:ts('2026-11-09T11:00:00Z'),type:'text',text:{body:'Komt goed!'}}]}));
 assert.equal(echo[0].fromUs,true);assert.equal(echo[0].contact,'31612345678');assert.equal(echo[0].source,'echo');
});

test('oude gesprekken: alleen de afgesproken periode, en wie wat schreef',()=>{
 const since=Date.parse('2026-10-10T00:00:00Z');
 const ev=parseWebhook(wa('history',{history:[{metadata:{phase:0,chunk_order:1,progress:100},threads:[{id:'31612345678',messages:[
  {from:'31612345678',id:'h1',timestamp:ts('2026-10-20T09:00:00Z'),type:'text',text:{body:'Oud maar binnen de maand'}},
  {from:'31621000000',id:'h2',timestamp:ts('2026-10-20T09:05:00Z'),type:'text',text:{body:'Ons antwoord'}},
  {from:'31612345678',id:'h3',timestamp:ts('2026-08-01T09:00:00Z'),type:'text',text:{body:'Te oud'}}]}]}]}),{historySince:since});
 assert.deepEqual(ev.map(e=>[e.id,e.fromUs,e.source]),[['h1',false,'history'],['h2',true,'history']]);
});

test('Messenger en Instagram: privéberichten wel, reacties onder berichten niet',()=>{
 const page={object:'page',entry:[{id:'PAGE1',time:1,messaging:[
  {sender:{id:'777'},recipient:{id:'PAGE1'},timestamp:Date.parse('2026-11-09T12:00:00Z'),message:{mid:'m1',text:'Open op zondag?'}},
  {sender:{id:'PAGE1'},recipient:{id:'777'},timestamp:Date.parse('2026-11-09T12:05:00Z'),message:{mid:'m2',text:'Ja!',is_echo:true}},
  {sender:{id:'777'},recipient:{id:'PAGE1'},timestamp:1,read:{watermark:1}}],
  changes:[{field:'feed',value:{item:'comment',message:'Leuk!'}}]}]};
 const ev=parseWebhook(page);
 assert.deepEqual(ev.map(e=>[e.channel,e.contact,e.id,e.fromUs]),[['messenger','777','m1',false],['messenger','777','m2',true]]);
 const ig=parseWebhook({object:'instagram',entry:[{id:'IG1',messaging:[{sender:{id:'555'},recipient:{id:'IG1'},timestamp:Date.now(),message:{mid:'i1',attachments:[{type:'image',payload:{url:'https://scontent.cdninstagram.com/x.jpg'}}]}}],changes:[{field:'comments',value:{text:'mooi'}}]}]});
 assert.equal(ig.length,1);assert.equal(ig[0].channel,'instagram');assert.equal(ig[0].type,'image');assert.equal(ig[0].media.url,'https://scontent.cdninstagram.com/x.jpg');
 assert.deepEqual(parseWebhook({object:'page',entry:[{id:'PAGE1',changes:[{field:'feed',value:{}}]}]}),[]);
 assert.deepEqual(parseWebhook({object:'iets anders'}),[]);
 assert.deepEqual(parseWebhook(null),[]);
});

test('telefoonnummers, venster van 24 uur en wie op wie wacht',()=>{
 assert.equal(normalizePhone('06 21 36 82 55'),'31621368255');assert.equal(normalizePhone('+31 6-21368255'),'31621368255');assert.equal(normalizePhone('0031621368255'),'31621368255');assert.equal(normalizePhone('12'),'');
 assert.equal(showPhone('31621368255'),'+31 6 21368255');assert.equal(showPhone('4915112345678'),'+4915112345678');
 const now=Date.parse('2026-11-09T12:00:00Z');
 assert.equal(windowLeft('2026-11-09T10:00:00Z',now),22*3600_000);assert.equal(windowLeft('2026-11-08T10:00:00Z',now),0);assert.equal(windowLeft('',now),0);
 assert.equal(windowText(22*3600_000),'Nog 22 uur gratis antwoorden');assert.equal(windowText(20*60_000),'Nog 20 minuten gratis antwoorden');assert.match(windowText(0),/dicht/);
 assert.equal(waitingFor({status:'open',statusAt:'',lastFromUs:0,lastCustomerAt:'x'}),'klant-wacht');
 assert.equal(waitingFor({status:'open',statusAt:'',lastFromUs:1,lastCustomerAt:'x'}),'wij-wachten');
 assert.equal(waitingFor({status:'afgehandeld',statusAt:'2026-11-09T10:00:00Z',lastFromUs:0,lastCustomerAt:'2026-11-09T09:00:00Z'}),'afgehandeld');
 assert.equal(waitingFor({status:'afgehandeld',statusAt:'2026-11-09T10:00:00Z',lastFromUs:0,lastCustomerAt:'2026-11-09T11:00:00Z'}),'opnieuw-open');
 const t={lastMessageId:'m9',lastCustomerAt:'2026-11-09T10:00:00Z'};
 assert.equal(sendBlocker(t,'m9','tekst','whatsapp',now),'');
 assert.match(sendBlocker(t,'m8','tekst','whatsapp',now),/nieuw bericht/);
 assert.match(sendBlocker({...t,lastCustomerAt:'2026-11-07T10:00:00Z'},'m9','tekst','whatsapp',now),/sjabloon/);
 assert.equal(sendBlocker({...t,lastCustomerAt:'2026-11-07T10:00:00Z'},'m9','sjabloon','whatsapp',now),'');
 assert.match(sendBlocker(t,'m9','sjabloon','messenger',now),/alleen voor WhatsApp/);
 assert.equal(describe('audio',''),'Spraakbericht');assert.equal(describe('image','Kijk'),'Foto · Kijk');
});

test('sjablonen: alleen goedgekeurd en met variabelen in de tekst; berichten naar Meta',()=>{
 const list=usableTemplates({data:[
  {name:'antwoord_op_vraag',language:'nl',status:'APPROVED',category:'UTILITY',components:[{type:'BODY',text:'Hoi {{1}}, we hebben een antwoord op je vraag. Wil je het lezen?'}]},
  {name:'met_foto',language:'nl',status:'APPROVED',components:[{type:'HEADER',format:'IMAGE'},{type:'BODY',text:'x'}]},
  {name:'in_afwachting',language:'nl',status:'PENDING',components:[{type:'BODY',text:'x'}]},
  {name:'link_knop',language:'nl',status:'APPROVED',components:[{type:'BODY',text:'x'},{type:'BUTTONS',buttons:[{type:'URL',url:'https://example.nl/{{1}}'}]}]}]});
 assert.deepEqual(list.map(t=>[t.name,t.params]),[['antwoord_op_vraag',1]]);
 assert.equal(fillTemplate(list[0].body,['Kees']),'Hoi Kees, we hebben een antwoord op je vraag. Wil je het lezen?');
 assert.deepEqual(outgoing('whatsapp','316',{mode:'sjabloon',template:list[0],values:['Kees']}).template,{name:'antwoord_op_vraag',language:{code:'nl'},components:[{type:'body',parameters:[{type:'text',text:'Kees'}]}]});
 assert.deepEqual(outgoing('whatsapp','316',{mode:'tekst',text:'Hoi'}),{messaging_product:'whatsapp',recipient_type:'individual',to:'316',type:'text',text:{preview_url:false,body:'Hoi'}});
 assert.deepEqual(outgoing('instagram','555',{mode:'tekst',text:'Hoi'}),{recipient:{id:'555'},messaging_type:'RESPONSE',message:{text:'Hoi'}});
 assert.equal(sentId({messages:[{id:'wamid.x'}]}),'wamid.x');assert.equal(sentId({recipient_id:'1',message_id:'m.x'}),'m.x');
 assert.equal(metaMediaUrl('https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1'),true);
 assert.equal(metaMediaUrl('https://scontent-ams2-1.xx.fbcdn.net/v/t1.jpg'),true);
 for(const bad of ['http://lookaside.fbsbx.com/x','https://fbsbx.com.evil.nl/x','https://169.254.169.254/','https://user@lookaside.fbsbx.com/x','https://lookaside.fbsbx.com:8443/x'])assert.equal(metaMediaUrl(bad),false,bad);
});

test('melding op de telefoon opent het gesprek',()=>{
 const m=metaStaffMessage({id:'whatsapp:31612345678',channel:'whatsapp',name:'Sanne',phone:'31612345678'},'Spraakbericht');
 assert.equal(m.title,'Nieuw WhatsApp-bericht van Sanne');assert.equal(m.url,'/management/gesprekken?gesprek=meta%3Awhatsapp%3A31612345678');
 assert.deepEqual(parseStaffMessage(m),m,'gaat door de bestaande controle van meldingen');
});

test('opslaan, niets dubbel, afhandelen en verzenden tegen een nagebootste Meta (echte tijdelijke database)',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-meta-'));
 try{const code=`
 import './tests/helpers/ts-resolve.mjs';import assert from 'node:assert/strict';
 const calls=[];let reply=()=>({status:200,body:{messages:[{id:'wamid.sent'+calls.length}]}});
 globalThis.fetch=async(url,init={})=>{calls.push({url:String(url),method:init.method||'GET',body:init.body?JSON.parse(init.body):null,auth:(init.headers||{}).Authorization});const r=reply(String(url));if(r.throw)throw Error('time-out');return new Response(JSON.stringify(r.body),{status:r.status})};
 const {getDb}=await import('./db/index.ts');const {metaThreads,metaMessages,outboxJobs}=await import('./db/schema.ts');
 const S=await import('./lib/meta-store.ts');const {parseWebhook}=await import('./lib/meta-core.ts');
 const db=getDb(),now=Date.now(),sec=t=>String(Math.floor(t/1000));
 const hook=(id,at,body)=>({object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{contacts:[{wa_id:'31612345678',profile:{name:'Sanne'}}],messages:[{from:'31612345678',id,timestamp:sec(at),type:'text',text:{body}}]}}]}]});
 assert.equal(await S.ingestWebhook(hook('wamid.1',now-3600_000,'Kinderfeestje 21-11?')),1);
 assert.equal(await S.ingestWebhook(hook('wamid.1',now-3600_000,'Kinderfeestje 21-11?')),0,'zelfde webhook nog eens: niets dubbel');
 let list=await S.listMetaThreads();assert.equal(list.length,1);
 let t=list[0];assert.equal(t.id,'whatsapp:31612345678');assert.equal(t.name,'Sanne');assert.equal(t.unread,1);assert.equal(t.waiting,'klant-wacht');assert.ok(t.windowLeft>22*3600_000);
 const jobs=(await db.select().from(outboxJobs)).filter(j=>j.kind==='medewerker-melding');assert.equal(jobs.length,1,'één melding naar de telefoons');
 // Het advies van de assistent leest het gesprek zonder het als gelezen te markeren (11 november 2026).
 const forAdvice=await S.metaThreadForAdvice(t.id);assert.equal(forAdvice.messages[0].text,'Kinderfeestje 21-11?');assert.equal(forAdvice.messages[0].fromUs,false);assert.equal((await S.listMetaThreads())[0].unread,1,'nog ongelezen');
 // Openen zet alleen de eigen teller op gelezen.
 let d=await S.metaThread(t.id);assert.equal(d.messages.length,1);assert.equal((await S.listMetaThreads())[0].unread,0);
 // Echo vanaf de telefoon: als bericht van ons, geen melding.
 await S.ingestWebhook({object:'whatsapp_business_account',entry:[{changes:[{field:'smb_message_echoes',value:{message_echoes:[{from:'31621000000',to:'31612345678',id:'wamid.echo',timestamp:sec(now-1800_000),type:'text',text:{body:'Even kijken!'}}]}}]}]});
 t=(await S.listMetaThreads())[0];assert.equal(t.waiting,'wij-wachten');assert.equal(t.lastMessageId,'wamid.echo');
 assert.equal((await db.select().from(outboxJobs)).filter(j=>j.kind==='medewerker-melding').length,1);
 // Afhandelen met versie.
 await S.metaWork(t.id,{status:'open',assigned:'sanne',customerId:'kaart-1',version:t.version},'bart');
 await assert.rejects(()=>S.metaWork(t.id,{status:'afgehandeld',version:t.version},'bart'),e=>e.status===409);
 t=(await S.listMetaThreads())[0];assert.equal(t.assigned,'sanne');assert.equal(t.customerId,'kaart-1');
 assert.equal((await S.metaThreadsFor(['kaart-1'])).length,1,'blijft bij de klantenkaart');
 // Verzenden: uit, tenzij META_SEND_ENABLED=1.
 const req='0d6f9c1e-6a2b-4c4f-9f2e-1a2b3c4d5e6f';
 await assert.rejects(()=>S.metaSend(t.id,{confirm:true,requestId:req,lastMessageId:t.lastMessageId,mode:'tekst',text:'Hoi'},'bart'),/staat uit/);
 process.env.META_SEND_ENABLED='1';
 await assert.rejects(()=>S.metaSend(t.id,{confirm:false,requestId:req,lastMessageId:t.lastMessageId,mode:'tekst',text:'Hoi'},'bart'),/Bevestig/);
 await assert.rejects(()=>S.metaSend(t.id,{confirm:true,requestId:req,lastMessageId:'wamid.1',mode:'tekst',text:'Hoi'},'bart'),/nieuw bericht/);
 assert.equal(calls.length,0,'nog niets naar Meta');
 assert.deepEqual(await S.metaSend(t.id,{confirm:true,requestId:req,lastMessageId:t.lastMessageId,mode:'tekst',text:'Zaterdag kan!'},'bart'),{status:'verzonden'});
 assert.equal(calls.length,1);assert.match(calls[0].url,/\\/v23\\.0\\/PHONE1\\/messages$/);assert.equal(calls[0].auth,'Bearer wa-token');assert.equal(calls[0].body.to,'31612345678');assert.equal(calls[0].body.text.body,'Zaterdag kan!');
 assert.deepEqual(await S.metaSend(t.id,{confirm:true,requestId:req,lastMessageId:t.lastMessageId,mode:'tekst',text:'Zaterdag kan!'},'bart'),{status:'verzonden',already:true});
 assert.equal(calls.length,1,'zelfde aanvraag nog eens: niets extra verstuurd');
 d=await S.metaThread(t.id);assert.equal(d.messages.at(-1).text,'Zaterdag kan!');assert.equal(d.messages.at(-1).by,'bart');
 // Status van Meta: afgeleverd.
 await S.ingestWebhook({object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{statuses:[{id:'wamid.sent1',status:'delivered'}]}}]}]});
 d=await S.metaThread(t.id);assert.equal(d.messages.at(-1).status,'delivered');
 // Time-out: onzeker, gesprek op slot tot controle.
 t=(await S.listMetaThreads())[0];reply=()=>({throw:true});
 const req2='1d6f9c1e-6a2b-4c4f-9f2e-1a2b3c4d5e6f',req3='2d6f9c1e-6a2b-4c4f-9f2e-1a2b3c4d5e6f';
 await assert.rejects(()=>S.metaSend(t.id,{confirm:true,requestId:req2,lastMessageId:t.lastMessageId,mode:'tekst',text:'Nog iets'},'bart'),/Onzeker/);
 reply=()=>({status:200,body:{messages:[{id:'wamid.later'}]}});
 await assert.rejects(()=>S.metaSend(t.id,{confirm:true,requestId:req3,lastMessageId:t.lastMessageId,mode:'tekst',text:'Nog iets'},'bart'),/onzeker/);
 await S.metaRelease(t.id,req2,false,'bart');
 assert.deepEqual(await S.metaSend(t.id,{confirm:true,requestId:req3,lastMessageId:t.lastMessageId,mode:'tekst',text:'Nog iets'},'bart'),{status:'verzonden'});
 // Na 24 uur: geen tekst, wel een goedgekeurd sjabloon.
 await db.update(metaThreads).set({lastCustomerAt:new Date(now-30*3600_000).toISOString()});
 t=(await S.listMetaThreads())[0];
 await assert.rejects(()=>S.metaSend(t.id,{confirm:true,requestId:'3d6f9c1e-6a2b-4c4f-9f2e-1a2b3c4d5e6f',lastMessageId:t.lastMessageId,mode:'tekst',text:'Hoi'},'bart'),/sjabloon/);
 reply=url=>url.includes('message_templates')?{status:200,body:{data:[{name:'antwoord_op_vraag',language:'nl',status:'APPROVED',components:[{type:'BODY',text:'Hoi {{1}}, we hebben een antwoord.'}]}]}}:{status:200,body:{messages:[{id:'wamid.tpl'}]}};
 await S.metaSend(t.id,{confirm:true,requestId:'4d6f9c1e-6a2b-4c4f-9f2e-1a2b3c4d5e6f',lastMessageId:t.lastMessageId,mode:'sjabloon',template:'antwoord_op_vraag',language:'nl',values:['Sanne']},'bart');
 const last=calls.at(-1);assert.equal(last.body.type,'template');assert.equal(last.body.template.components[0].parameters[0].text,'Sanne');
 d=await S.metaThread(t.id);assert.equal(d.messages.at(-1).kind,'template');assert.equal(d.messages.at(-1).text,'Hoi Sanne, we hebben een antwoord.');
 // Klant schrijft na afhandeling: opnieuw open.
 t=(await S.listMetaThreads())[0];await S.metaWork(t.id,{status:'afgehandeld',version:t.version},'bart');
 await S.ingestWebhook(hook('wamid.9',Date.now()+1000,'Nog een vraag'));
 assert.equal((await S.listMetaThreads())[0].waiting,'opnieuw-open');
 // Messenger: naar me/messages met de paginasleutel.
 await S.ingestWebhook({object:'page',entry:[{id:'PAGE1',messaging:[{sender:{id:'777'},recipient:{id:'PAGE1'},timestamp:Date.now(),message:{mid:'m1',text:'Hoi'}}]}]});
 const m=(await S.listMetaThreads()).find(x=>x.channel==='messenger');reply=()=>({status:200,body:{recipient_id:'777',message_id:'m.out'}});
 await S.metaSend(m.id,{confirm:true,requestId:'5d6f9c1e-6a2b-4c4f-9f2e-1a2b3c4d5e6f',lastMessageId:m.lastMessageId,mode:'tekst',text:'Welkom!'},'bart');
 assert.match(calls.at(-1).url,/\\/me\\/messages$/);assert.equal(calls.at(-1).auth,'Bearer page-token');assert.equal(calls.at(-1).body.recipient.id,'777');
 // De webhook zelf: controle bij het instellen en alleen met een geldige handtekening.
 const R=await import('./app/api/public/meta/route.ts'),{createHmac}=await import('node:crypto');
 let res=await R.GET(new Request('https://bo.test/api/public/meta?hub.mode=subscribe&hub.verify_token=v&hub.challenge=12345'));assert.equal(res.status,200);assert.equal(await res.text(),'12345');
 res=await R.GET(new Request('https://bo.test/api/public/meta?hub.mode=subscribe&hub.verify_token=fout&hub.challenge=12345'));assert.equal(res.status,403);
 const raw=JSON.stringify(hook('wamid.route',Date.now()+2000,'Via de route'));
 res=await R.POST(new Request('https://bo.test/api/public/meta',{method:'POST',body:raw,headers:{'x-hub-signature-256':'sha256='+createHmac('sha256','fout').update(raw).digest('hex')}}));assert.equal(res.status,401);
 assert.equal((await db.select().from(metaMessages)).some(x=>x.id==='wamid.route'),false,'nagemaakt bericht wordt niet opgeslagen');
 res=await R.POST(new Request('https://bo.test/api/public/meta',{method:'POST',body:raw,headers:{'x-hub-signature-256':'sha256='+createHmac('sha256','s').update(raw).digest('hex')}}));assert.equal(res.status,200);
 assert.equal((await db.select().from(metaMessages)).some(x=>x.id==='wamid.route'),true);
 // Koppeling controleren en afronden bij Meta.
 process.env.META_SEND_ENABLED='';
 reply=url=>url.includes('/PHONE1?')?{status:200,body:{display_phone_number:'+31 6 21000000',verified_name:'Boerderijrecreatie',name_status:'APPROVED',platform_type:'NOT_APPLICABLE'}}
  :url.includes('/WABA1/subscribed_apps')||url.includes('/PAGE1/subscribed_apps')?{status:200,body:{data:[]}}
  :url.includes('/PAGE1?')?{status:400,body:{error:{message:'(#100) requires pages_read_engagement'}}}:{status:400,body:{error:{message:'onbekend'}}};
 const start=calls.length;let steps=await S.metaCheck(),st=Object.fromEntries(steps.map(x=>[x.id,x]));
 assert.equal(st.webhook.ok,true);assert.equal(st['whatsapp-nummer'].ok,false);assert.match(st['whatsapp-nummer'].detail,/nog niet aangemeld/);
 assert.equal(st['whatsapp-abonnement'].ok,false);assert.equal(st.messenger.ok,false);assert.equal(st.instagram.ok,null,'Instagram-ID niet ingevuld');assert.equal(st.verzenden.ok,false);
 const before=calls.length;assert.ok(calls.length>start&&calls.slice(start).every(x=>x.method==='GET'),'controleren verandert niets bij Meta');
 await assert.rejects(()=>S.metaConnect({pin:'12'}),/6 cijfers/);assert.equal(calls.length,before);
 let registered=false,subscribed=false,pageSub=false;
 reply=(url)=>{const c=calls.at(-1);
  if(c.method==='POST'&&url.endsWith('/WABA1/subscribed_apps')){subscribed=true;return {status:200,body:{success:true}}}
  if(c.method==='POST'&&url.endsWith('/PHONE1/register')){registered=c.body.pin==='246802'&&c.body.messaging_product==='whatsapp';return {status:200,body:{success:true}}}
  if(c.method==='POST'&&url.includes('/PAGE1/subscribed_apps?subscribed_fields=messages,message_echoes')){pageSub=true;return {status:200,body:{success:true}}}
  if(url.includes('/PHONE1?'))return {status:200,body:{display_phone_number:'+31 6 21000000',platform_type:registered?'CLOUD_API':'NOT_APPLICABLE'}};
  if(url.includes('/WABA1/subscribed_apps'))return {status:200,body:{data:subscribed?[{whatsapp_business_api_data:{id:'APP'}}]:[]}};
  if(url.includes('/PAGE1/subscribed_apps'))return {status:200,body:{data:pageSub?[{id:'APP',subscribed_fields:['messages','message_echoes']}]:[]}};
  if(url.includes('/PAGE1?'))return {status:400,body:{error:{message:'(#100) requires pages_read_engagement'}}};
  return {status:400,body:{error:{message:'onbekend'}}}};
 const r=await S.metaConnect({pin:'246802'});
 assert.deepEqual(r.errors,[]);assert.equal(r.done.length,3);assert.ok(registered&&subscribed&&pageSub);
 st=Object.fromEntries(r.steps.map(x=>[x.id,x]));assert.equal(st['whatsapp-nummer'].ok,true);assert.equal(st['whatsapp-abonnement'].ok,true);assert.equal(st.messenger.ok,true);
 assert.deepEqual(calls.filter(x=>JSON.stringify(x.body||'').includes('246802')).map(x=>x.url.split('/').pop()),['register'],'pincode gaat alleen naar de aanmelding bij Meta');
 // Geeft Meta geen antwoord op de abonnementscontrole, dan telt dat er WhatsApp-berichten binnenkomen.
 reply=url=>url.includes('/WABA1/subscribed_apps')?{throw:true}:{status:400,body:{error:{message:'x'}}};
 st=Object.fromEntries((await S.metaCheck()).map(x=>[x.id,x]));
 assert.equal(st['whatsapp-abonnement'].ok,true);assert.match(st['whatsapp-abonnement'].detail,/Berichten komen binnen.*niet bereikbaar/);
 // Een fout van Meta toont de code (en de uitleg), zodat die op te zoeken is.
 reply=()=>({status:403,body:{error:{message:'Geen toestemming',code:200,error_subcode:2494049,error_data:{details:'Betaalmethode van een partner'}}}});
 st=Object.fromEntries((await S.metaCheck()).map(x=>[x.id,x]));
 assert.equal(st['whatsapp-nummer'].detail,'Geen toestemming Betaalmethode van een partner (code 200/2494049)');
 console.log('Meta checks passed');
 `;const r=spawnSync(process.execPath,['--experimental-transform-types','--input-type=module','-e',code],{cwd:new URL('../',import.meta.url),env:{...process.env,APP_DATA_DIR:dir,META_SEND_ENABLED:'',GUEST_WHATSAPP_PHONE_ID:'PHONE1',GUEST_WHATSAPP_TOKEN:'wa-token',META_WHATSAPP_WABA_ID:'WABA1',META_PAGE_ID:'PAGE1',META_PAGE_TOKEN:'page-token',META_APP_SECRET:'s',META_VERIFY_TOKEN:'v',DATABASE_URL:''},encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stderr+'\n'+r.stdout);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

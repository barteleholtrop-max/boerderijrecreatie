// Gesprek voor een lid (wens eigenaar 10 november 2026): Rianne vinkt aan „dit gesprek is voor Pieter”; Pieter krijgt een bericht in
// zijn ledenapp, ziet alleen zijn eigen gesprekken en antwoordt zelf via de backoffice. Tegen een echte tijdelijke database.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('gesprek voor een lid: bericht in de ledenapp, alleen eigen gesprekken, zelf antwoorden, weer weghalen',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-gesprek-lid-'));
 try{const code=`
 import './tests/helpers/ts-resolve.mjs';import assert from 'node:assert/strict';
 const calls=[];globalThis.fetch=async(url,init={})=>{calls.push({url:String(url),body:init.body?JSON.parse(init.body):null});return new Response(JSON.stringify({messages:[{id:'wamid.out'+calls.length}]}),{status:200})};
 const {env}=await import('./lib/portable/env.ts');const {getDb}=await import('./db/index.ts');const {memberMessages,outboxJobs}=await import('./db/schema.ts');
 const S=await import('./lib/meta-store.ts');const L=await import('./lib/gesprek-lid.ts');
 const at=new Date().toISOString(),{seal}=await import('./lib/sheets.ts');
 for(const [id,name,active,cls='A'] of [['p1','Pieter de Vries',1],['p2','Anna Bakker',1,'L'],['p3','Oud Lid',0],['p4','Olga Obligatie',1,'']])await env.DB.prepare('INSERT INTO coop_participants(id,name,holder,email,member_class,units,iban_sealed,iban_last4,created,updated,active) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,name,name,'',cls,'[]',await seal('NL91ABNA0417164300'),'4300',at,at,active).run();
 const sec=t=>String(Math.floor(t/1000));
 await S.ingestWebhook({object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{contacts:[{wa_id:'31612345678',profile:{name:'Sanne'}}],messages:[{from:'31612345678',id:'wamid.1',timestamp:sec(Date.now()-3600_000),type:'text',text:{body:'Kunnen we bij jullie workshop aanschuiven?'}}]}}]}]});
 const ref='meta:whatsapp:31612345678';
 let c=await L.memberChoices();assert.deepEqual(c.members.map(m=>m.name),['Anna Bakker','Pieter de Vries'],'alleen actieve coöperatieleden, geen obligatiehouders');
 await assert.rejects(()=>L.assignToMember(ref,'p4','rianne'),e=>e.status===404,'obligatiehouder kan geen gesprek krijgen');
 await assert.rejects(()=>L.assignToMember(ref,'p3','rianne'),e=>e.status===404);
 await assert.rejects(()=>L.assignToMember('iets anders','p1','rianne'),e=>e.status===404);
 await L.assignToMember(ref,'p1','rianne');
 c=await L.memberChoices();assert.equal(c.assigned[ref],'p1');
 const msgs=(await getDb().select().from(memberMessages)).filter(m=>m.participantId==='p1');assert.equal(msgs.length,1);assert.match(msgs[0].title,/Gesprek voor jou: Sanne/);assert.match(msgs[0].body,/rianne/);
 await L.assignToMember(ref,'p1','rianne');assert.equal((await getDb().select().from(memberMessages)).length,1,'nog eens hetzelfde lid: geen tweede bericht');
 // Pieter ziet het, Anna niet.
 assert.equal((await L.memberConversations('p1')).length,1);assert.equal((await L.memberConversations('p2')).length,0);
 await assert.rejects(()=>L.memberConversation('p2',ref),e=>e.status===404);
 const d=await L.memberConversation('p1',ref);assert.equal(d.name,'Sanne');assert.equal(d.messages[0].text,'Kunnen we bij jullie workshop aanschuiven?');
 // Antwoorden: uit zolang verzenden uit staat; daarna precies één keer.
 const ids={requestId:'0d6f9c1e-6a2b-4c4f-9f2e-1a2b3c4d5e6f',sendRequestId:'1d6f9c1e-6a2b-4c4f-9f2e-1a2b3c4d5e6f'};
 await assert.rejects(()=>L.memberReply('p1','Pieter',{ref,text:'Ja hoor!',lastMessageId:d.lastMessageId,...ids}),/staat uit/);
 process.env.META_SEND_ENABLED='1';
 await assert.rejects(()=>L.memberReply('p2','Anna',{ref,text:'Ja hoor!',lastMessageId:d.lastMessageId,...ids}),e=>e.status===404,'niet van Anna');
 await L.memberReply('p1','Pieter',{ref,text:'Ja hoor, er is nog plek!',lastMessageId:d.lastMessageId,...ids});
 assert.equal(calls.length,1);assert.equal(calls[0].body.text.body,'Ja hoor, er is nog plek!');
 const after=await S.metaThread(ref.slice(5));assert.equal(after.messages.at(-1).by,'Pieter (lid)');
 assert.ok((await getDb().select().from(outboxJobs)).some(j=>j.kind==='medewerker-melding'&&/Pieter heeft geantwoord/.test(j.payload)),'Rianne krijgt een melding');
 // Weghalen: Pieter ziet het niet meer.
 await L.assignToMember(ref,null,'rianne');assert.equal((await L.memberConversations('p1')).length,0);
 console.log('gesprek-lid ok');
 `;const r=spawnSync(process.execPath,['--experimental-transform-types','--input-type=module','-e',code],{cwd:new URL('../',import.meta.url),env:{...process.env,APP_DATA_DIR:dir,DATABASE_URL:'',META_SEND_ENABLED:'',GUEST_WHATSAPP_PHONE_ID:'PHONE1',GUEST_WHATSAPP_TOKEN:'t',SHEETS_CONFIG_KEY:'cd'.repeat(32)},encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stderr+'\n'+r.stdout);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

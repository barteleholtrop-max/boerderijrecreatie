// WhatsApp-export importeren (wens eigenaar 13 november 2026): het lezen van de export (Android en iPhone, NL en EN) en
// het opslaan bij het gesprek, tegen een echte tijdelijke database met opslag op de schijf.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {parseWhatsappExport,amsterdamIso,mediaType,phoneFromAuthor} from '../lib/whatsapp-export.ts';

test('Android (Nederlands): berichten, meerdere regels, bijlage, weggelaten media en meldingen van WhatsApp',()=>{
 const p=parseWhatsappExport([
  '13-11-2026 10:58 - Berichten en gesprekken worden end-to-end versleuteld.',
  '13-11-2026 10:59 - Sanne de Vries: Hoi! Kinderfeestje?',
  'Voor 12 kinderen',
  '13-11-2026 11:02 - Boer Bart: IMG-20261113-WA0001.jpg (bestand bijgevoegd)',
  'Zo ziet de schuur eruit',
  '13-11-2026 11:03 - Sanne de Vries: <Media weggelaten>',
  '13-11-2026 11:04 - Sanne de Vries: PTT-20261113-WA0002.opus (bestand bijgevoegd)',
 ].join('\r\n'));
 assert.equal(p.messages.length,4,'de melding over versleuteling telt niet mee');
 assert.deepEqual(p.authors,['Sanne de Vries','Boer Bart']);
 assert.equal(p.messages[0].text,'Hoi! Kinderfeestje?\nVoor 12 kinderen');
 assert.equal(p.messages[0].at,'2026-11-13T09:59:00.000Z','wintertijd: UTC+1');
 assert.deepEqual([p.messages[1].attachment,p.messages[1].kind,p.messages[1].text],['IMG-20261113-WA0001.jpg','image','Zo ziet de schuur eruit']);
 assert.equal(p.messages[2].omitted,true);assert.equal(p.messages[2].text,'');
 assert.equal(p.messages[3].kind,'audio');
});

test('iPhone: [datum tijd], bijgevoegd met <…>, onzichtbare tekens en zomertijd',()=>{
 const p=parseWhatsappExport('‎[01-07-2026 14:05:09] +31 6 12345678: Zijn jullie open?\n[01-07-2026 14:06:10] Boer Bart: ‎<bijgevoegd: 00000003-PHOTO-2026-07-01-14-06-10.jpg>\n');
 assert.equal(p.messages.length,2);
 assert.equal(p.messages[0].at,'2026-07-01T12:05:09.000Z','zomertijd: UTC+2');
 assert.equal(p.messages[1].attachment,'00000003-PHOTO-2026-07-01-14-06-10.jpg');
 assert.equal(phoneFromAuthor(p.messages[0].author),'+31612345678');
 assert.equal(phoneFromAuthor('Sanne'),'');
});

test('Engels met maand eerst en AM/PM',()=>{
 const p=parseWhatsappExport('11/13/26, 9:59 AM - Sam: Hello\n11/13/26, 12:30 PM - Boer Bart: <Media omitted>\n');
 assert.equal(p.dayFirst,false);
 assert.deepEqual(p.messages.map(m=>m.at),['2026-11-13T08:59:00.000Z','2026-11-13T11:30:00.000Z']);
 assert.equal(p.messages[1].omitted,true);
});

test('tijdzone en soorten bijlagen',()=>{
 assert.equal(amsterdamIso(2026,3,29,3,30),'2026-03-29T01:30:00.000Z','na de omschakeling naar zomertijd');
 assert.equal(amsterdamIso(2026,1,1,0,0),'2025-12-31T23:00:00.000Z');
 assert.deepEqual(mediaType('a.PDF'),{kind:'document',mime:'application/pdf'});
 assert.deepEqual(mediaType('STK-20261113-WA0003.webp'),{kind:'sticker',mime:'image/webp'});
 assert.equal(mediaType('x.unknown').kind,'document');
});

test('importeren bij het gesprek: geen melding, afgehandeld, niets dubbel, bijlage in de eigen opslag (echte tijdelijke database)',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-wa-import-'));
 try{const code=`
 import './tests/helpers/ts-resolve.mjs';import assert from 'node:assert/strict';
 const {getDb}=await import('./db/index.ts');const {metaThreads,outboxJobs}=await import('./db/schema.ts');
 const S=await import('./lib/meta-store.ts');const {parseWhatsappExport}=await import('./lib/whatsapp-export.ts');
 const p=parseWhatsappExport('13-11-2025 10:59 - Sanne: Hoi\\n13-11-2025 11:00 - Boer Bart: IMG-1.jpg (bestand bijgevoegd)\\nKijk\\n13-11-2025 11:01 - Sanne: Hoi\\n13-11-2025 11:02 - Sanne: VID-2.mp4 (bestand bijgevoegd)');
 await assert.rejects(()=>S.importWhatsapp({phone:'',us:'Boer Bart',messages:p.messages},'bart'),/telefoonnummer/);
 await assert.rejects(()=>S.importWhatsapp({phone:'0612345678',us:'',messages:p.messages},'bart'),/Boer Bart/);
 const r=await S.importWhatsapp({phone:'06-12345678',name:'Sanne',us:'Boer Bart',messages:p.messages},'bart');
 assert.equal(r.thread,'meta:whatsapp:31612345678');assert.equal(r.added,4);assert.equal(r.skipped,0);
 assert.deepEqual(r.media.map(m=>m.filename),['IMG-1.jpg','VID-2.mp4']);
 const t=(await S.listMetaThreads())[0];
 assert.equal(t.waiting,'afgehandeld','een nieuw gesprek uit de export staat op afgehandeld');assert.equal(t.unread,0);assert.equal(t.name,'Sanne');
 assert.equal((await getDb().select().from(outboxJobs)).length,0,'geen meldingen naar de telefoons');
 // Nog eens: niets dubbel, de ontbrekende bijlagen komen opnieuw in de lijst.
 const again=await S.importWhatsapp({phone:'+31 6 12345678',us:'Boer Bart',messages:p.messages},'bart');
 assert.equal(again.added,0);assert.equal(again.skipped,4);assert.equal(again.media.length,2);
 // Bijlage: verkeerde naam geweigerd, goede opgeslagen, daarna te openen; tweede keer niets extra.
 await assert.rejects(()=>S.importWhatsappMedia(r.media[0].messageId,new File([new Uint8Array([1])],'ander.jpg')),/hoort niet/);
 await assert.rejects(()=>S.importWhatsappMedia('import:nep',new File([new Uint8Array([1])],'IMG-1.jpg')),e=>e.status===404);
 assert.deepEqual(await S.importWhatsappMedia(r.media[0].messageId,new File([new Uint8Array([255,216,255,1,2])],'IMG-1.jpg')),{ok:true});
 assert.deepEqual(await S.importWhatsappMedia(r.media[0].messageId,new File([new Uint8Array([9])],'IMG-1.jpg')),{already:true});
 const m=await S.metaMedia(r.media[0].messageId);assert.equal(m.mime,'image/jpeg');assert.deepEqual([...m.body],[255,216,255,1,2]);
 await assert.rejects(()=>S.metaMedia(r.media[1].messageId),/niet in de export/);
 const d=await S.metaThread(t.id);
 assert.equal(d.messages.length,4);assert.equal(d.messages[1].fromUs,true);assert.equal(d.messages[1].kind,'image');assert.equal(d.messages[1].text,'Kijk');
 assert.equal(d.messages[3].kind,'text','bijlage zonder bestand als tekst');assert.match(d.messages[3].text,/VID-2\\.mp4 \\(niet in de export\\)/);
 // Een bestaand gesprek blijft open; een later webhookbericht telt als nieuw.
 await S.ingestWebhook({object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{contacts:[{wa_id:'31612345678',profile:{name:'Sanne'}}],messages:[{from:'31612345678',id:'wamid.live',timestamp:String(Math.floor(Date.now()/1000)),type:'text',text:{body:'Nog een vraag'}}]}}]}]});
 const live=(await S.listMetaThreads())[0];assert.equal(live.waiting,'opnieuw-open');assert.equal(live.unread,1);
 console.log('WhatsApp-import checks passed');
 `;const r=spawnSync(process.execPath,['--experimental-transform-types','--input-type=module','-e',code],{cwd:new URL('../',import.meta.url),env:{...process.env,APP_DATA_DIR:dir,DATABASE_URL:'',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',META_SEND_ENABLED:''},encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stderr+'\n'+r.stdout);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('scherm: import bij Systeem & koppelingen, berichten en bijlagen los naar /api/meta/import',()=>{
 const ui=fs.readFileSync(new URL('../app/koppeling/whatsapp-import.tsx',import.meta.url),'utf8'),sync=fs.readFileSync(new URL('../app/koppeling/meta-sync.tsx',import.meta.url),'utf8');
 assert.match(sync,/<WhatsappImport\/>/);
 assert.match(fs.readFileSync(new URL('../lib/zip-browser.ts',import.meta.url),'utf8'),/DecompressionStream\('deflate-raw'\)/,'zip wordt in de browser uitgepakt');
 assert.match(ui,/zipEntries/);
 assert.match(ui,/form\.set\('messageId'/);
 const api=fs.readFileSync(new URL('../app/api/meta/import/route.ts',import.meta.url),'utf8');
 assert.match(api,/who\(req,true\)/,'alleen met schrijfrechten');
});

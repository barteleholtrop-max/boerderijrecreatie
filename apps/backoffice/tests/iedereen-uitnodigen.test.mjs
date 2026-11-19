// Iedereen in één keer uitnodigen (opdracht eigenaar 13 november 2026). Verzonnen gegevens; Supabase wordt nagespeeld.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import './helpers/ts-resolve.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('voorvertoning: wie wel en wie niet; klaarzetten rustig na elkaar en niet dubbel',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-uitnodigen-'));
 Object.assign(process.env,{APP_DATA_DIR:dir,DATABASE_URL:'',SUPABASE_URL:'https://supa.example',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',APP_ORIGIN:'https://bo.example',LEDEN_ORIGIN:'https://leden.example',MAIL_SEND_ENABLED:'1'});
 const realFetch=globalThis.fetch;
 globalThis.fetch=async(url)=>{const u=String(url);if(u.includes('/admin/users?page=1'))return Response.json({users:[{id:'u1',email:'actief@example.nl',app_metadata:{}},{id:'u2',email:'open@example.nl',app_metadata:{ledenlogin_kiezen:true}}]});return realFetch(url)};
 const {env,closeDatabase}=await import('../lib/portable/env.ts');
 t.after(async()=>{globalThis.fetch=realFetch;delete process.env.LEDEN_ORIGIN;delete process.env.MAIL_SEND_ENABLED;delete process.env.SUPABASE_SERVICE_ROLE_KEY;await closeDatabase();fs.rmSync(dir,{recursive:true,force:true})});
 const add=async(id,name,email,link=true,active=1)=>{await env.DB.prepare("INSERT INTO coop_participants(id,name,email,active,created,updated) VALUES(?,?,?,?,'nu','nu')").bind(id,name,email,active).run();if(link)await env.DB.prepare("INSERT INTO coop_portal_links(participant_id,token_hash,token_sealed,created) VALUES(?,?,?,'nu')").bind(id,'h'+id,'s'+id).run()};
 await add('a','Anna','nieuw@example.nl');await add('b','Bram','actief@example.nl');await add('c','Cor','open@example.nl');await add('d','Dirk','');await add('e','Eva','zonder@example.nl',false);await add('f','Fien','oud@example.nl',true,0);
 await env.DB.prepare("INSERT INTO access_accounts(email,name,role,active,created,updated) VALUES('kantoor@example.nl','K','eigenaar',1,'nu','nu')").run();await add('g','Gerrit','kantoor@example.nl');
 const M=await import('../lib/member-invite-all.ts');
 const v=await M.invitePreview();
 assert.deepEqual(v.ready.map(p=>p.name),['Anna','Cor'],'nieuw en „opnieuw kiezen” wel; actief, zonder mail, zonder link, oud-lid en backoffice niet');
 assert.deepEqual(v.skipped,{actief:1,backoffice:1,geenMail:1,geenLink:1,recent:0});assert.equal(v.linkBase,'https://leden.example');
 // Klaarzetten: Gmail-controle nagespeeld via de mail-store is lastig buiten Next; zet de taken zoals inviteAll dat doet.
 const now=Date.parse('2026-11-13T10:00:00Z');const {enqueue}=await import('../lib/outbox.ts');
 for(const [i,p] of v.ready.entries())await enqueue(`${M.INVITE_KIND}:${p.id}:2026-11-13`,M.INVITE_KIND,{participantId:p.id},new Date(now+(i+1)*M.INVITE_GAP_MS));
 const jobs=(await env.DB.prepare("SELECT key,run_after FROM outbox_jobs WHERE kind='lid-uitnodiging' ORDER BY run_after").all()).results;
 assert.equal(jobs.length,2);assert.equal(Date.parse(jobs[1].run_after)-Date.parse(jobs[0].run_after),M.INVITE_GAP_MS,'rustig na elkaar');
 const again=await M.invitePreview();assert.equal(again.ready.length,0,'niet dubbel binnen 7 dagen');assert.equal(again.skipped.recent,2);
 assert.deepEqual(await M.inviteProgress(),{wachtend:2,verstuurd:0,mislukt:0,laatst:null});
});

test('route, werkproces en scherm',()=>{
 const inv=read('lib/member-invite-all.ts');assert.match(inv,/await enqueue\(`\$\{INVITE_KIND\}:\$\{p\.id\}:\$\{day\}`/);assert.match(inv,/new Date\(now\+\(i\+1\)\*INVITE_GAP_MS\)/);
 assert.match(inv,/if\(state==='actief'\|\|state==='backoffice'\)return/,'bij versturen opnieuw kijken: inmiddels actief = geen mail');
 assert.match(inv,/e\.status<500\)\{console\.warn/,'ontbrekende gegevens: niet eindeloos opnieuw');
 assert.match(read('lib/assistant-jobs.ts'),/'lid-uitnodiging':async payload=>\{const \{withConnectionSettings\}/);
 const r=read('app/api/leden/uitnodigen/route.ts');assert.match(r,/authorizeSheet\(req\);/);assert.match(r,/authorizeSheet\(req,true\)/);assert.match(r,/action!=='versturen'/);
 assert.match(read('app/leden/page.tsx'),/<IedereenUitnodigen\/>/);assert.match(read('app/leden/iedereen-uitnodigen.tsx'),/confirm\(/);
});

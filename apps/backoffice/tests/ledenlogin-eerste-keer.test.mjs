// Ledenlogin zonder bevestigingsmail (wens eigenaar 12 november 2026): „In de backoffice een mailadres aanmaken bij een lid. Dat
// mailadres wordt gekoppeld. Hij/zij kan dan via dat mailadres inloggen en zelf een wachtwoord voorstellen.” Met een nagebootste
// Supabase (alleen de beheerdeuren die lib/member-account.ts gebruikt). Alle gegevens zijn verzonnen.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import './helpers/ts-resolve.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

function fakeSupabase(){
 const users=new Map(),calls=[];
 const server=http.createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);const body=chunks.length?JSON.parse(Buffer.concat(chunks)):null;
  const url=new URL(req.url,'http://x');calls.push({method:req.method,path:url.pathname,body});res.setHeader('content-type','application/json');
  if(req.headers.apikey!=='service-synthetic'){res.writeHead(401);return res.end('{}')}
  if(req.method==='GET'&&url.pathname==='/auth/v1/admin/users'){const f=(url.searchParams.get('filter')||'').toLowerCase();return res.end(JSON.stringify({users:[...users.values()].filter(u=>u.email.includes(f))}))}
  if(req.method==='POST'&&url.pathname==='/auth/v1/admin/users'){if([...users.values()].some(u=>u.email===body.email)){res.writeHead(422);return res.end(JSON.stringify({error_code:'email_exists'}))}
   const u={id:randomUUID(),email:body.email,email_confirmed_at:body.email_confirm?'2026-11-12T00:00:00Z':null,password:body.password,app_metadata:{provider:'email',...body.app_metadata}};users.set(u.id,u);return res.end(JSON.stringify(u))}
  const m=/^\/auth\/v1\/admin\/users\/([^/]+)$/.exec(url.pathname);
  if(req.method==='PUT'&&m&&users.has(m[1])){const u=users.get(m[1]);if(body.password)u.password=body.password;u.app_metadata={...u.app_metadata,...body.app_metadata};return res.end(JSON.stringify(u))}
  res.writeHead(404);res.end('{}');
 });
 return {users,calls,listen:()=>new Promise(r=>server.listen(0,'127.0.0.1',()=>r('http://127.0.0.1:'+server.address().port))),close:()=>new Promise(r=>server.close(r))};
}

test('eerste keer: zelf een wachtwoord kiezen via de eigen link, zonder mail; daarna niet nog eens zonder de eigenaar',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-eerste-keer-')),sb=fakeSupabase(),url=await sb.listen();
 Object.assign(process.env,{APP_DATA_DIR:dir,DATABASE_URL:'',SHEETS_CONFIG_KEY:'ad'.repeat(32),SUPABASE_URL:url,SUPABASE_ANON_KEY:'anon-synthetic',SUPABASE_SERVICE_ROLE_KEY:'service-synthetic'});
 const {env,closeDatabase}=await import('../lib/portable/env.ts'),{seal}=await import('../lib/sheets.ts'),M=await import('../lib/member-session-core.ts'),A=await import('../lib/member-account.ts');
 t.after(async()=>{await closeDatabase();await sb.close();fs.rmSync(dir,{recursive:true,force:true})});
 const at=new Date().toISOString(),T=n=>String(n).repeat(43).slice(0,43);
 async function card(name,email,login,token){const id=randomUUID();
  await env.DB.prepare('INSERT INTO coop_participants(id,name,email,member_login_email,active,created,updated) VALUES(?,?,?,?,1,?,?)').bind(id,name,email,login,at,at).run();
  await env.DB.prepare('INSERT INTO coop_portal_links(participant_id,token_hash,token_sealed,created,created_by) VALUES(?,?,?,?,?)').bind(id,M.linkHash(token),await seal(token),at,'test').run();return id}
 const lid=await card('Lid Voorbeeld','contact@example.invalid','lid@example.invalid',T(1)),ander=await card('Ander Voorbeeld','ander@example.invalid','',T(2));
 const PW='een lange zin als wachtwoord';

 assert.deepEqual(await A.accountState(lid),{email:'lid@example.invalid',state:'geen'},'nog geen account');
 await assert.rejects(A.choosePassword(T(1),'ander@example.invalid',PW),/geen-toegang/,'adres van een andere kaart');
 await assert.rejects(A.choosePassword(T(2),'lid@example.invalid',PW),/geen-toegang/,'andermans link');
 await assert.rejects(A.choosePassword(T(1),'lid@example.invalid','1234567890'),e=>e instanceof A.MemberAccountError,'zwak wachtwoord');

 const first=await A.choosePassword(T(1),' LID@example.invalid ',PW);
 assert.equal(first.card.participantId,lid);assert.equal(first.email,'lid@example.invalid');
 const made=sb.calls.find(c=>c.method==='POST');assert.equal(made.body.email_confirm,true,'al bevestigd: geen mail');assert.equal(made.body.password,PW);
 assert.ok(!sb.calls.some(c=>/signup|recover|invite/.test(c.path)),'er gaat geen mail uit');
 assert.equal((await A.accountState(lid)).state,'actief');

 // Wie de link later in handen krijgt, kan het wachtwoord niet overnemen.
 await assert.rejects(A.choosePassword(T(1),'lid@example.invalid','een ander lang wachtwoord'),/bestaat/);
 // Wachtwoord vergeten zonder mail: de eigenaar zet het account open, het lid kiest opnieuw, en daarna is het weer dicht.
 assert.equal(await A.reopenAccount(lid),'open');assert.equal((await A.accountState(lid)).state,'open');
 await A.choosePassword(T(1),'lid@example.invalid','een nieuw lang wachtwoord');
 assert.equal([...sb.users.values()][0].password,'een nieuw lang wachtwoord');assert.equal((await A.accountState(lid)).state,'actief');
 await assert.rejects(A.choosePassword(T(1),'lid@example.invalid','nog een lang wachtwoord'),/bestaat/);

 // Leeg inlogadres: het contactadres telt (zoals bij inloggen).
 assert.equal((await A.choosePassword(T(2),'ander@example.invalid',PW)).card.participantId,ander);

 // Nooit voor een backoffice-account (dat heeft een eigen wachtwoord en Authenticator).
 const boss=await card('Eigenaar Voorbeeld','baas@example.invalid','',T(3));
 await env.DB.prepare("INSERT INTO access_accounts(email,name,role,active,created,updated) VALUES(?,?,?,1,?,?)").bind('baas@example.invalid','Baas','eigenaar',at,at).run();
 await assert.rejects(A.choosePassword(T(3),'baas@example.invalid',PW),/backoffice/);
 await assert.rejects(A.reopenAccount(boss),/backoffice/);
 assert.equal((await A.accountState(boss)).state,'backoffice');

 // Op de ledenkaart zelf (12 november 2026): elk soort kaart, het contactadres vult zich als het leeg is, geen dubbel adres.
 const lev=await card('Leverancier Voorbeeld','','',T(4));const v=async id=>(await A.loginInfo(id)).version;
 await A.setCardLogin(lev,' Lev@Example.invalid ',await v(lev),'test');
 const info=await A.loginInfo(lev);assert.equal(info.loginEmail,'lev@example.invalid');assert.equal(info.contactEmail,'lev@example.invalid','leeg contactadres gevuld');assert.equal(info.state,'geen');
 await A.setCardLogin(lid,'nieuw@example.invalid',await v(lid),'test');
 assert.equal((await A.loginInfo(lid)).contactEmail,'contact@example.invalid','een bestaand contactadres blijft');
 await assert.rejects(A.setCardLogin(lev,'ander@example.invalid',await v(lev),'test'),/andere ledenkaart/,'adres van een andere kaart');
 await assert.rejects(A.setCardLogin(lev,'x@example.invalid',(await v(lev))-1,'test'),/net gewijzigd/,'oude versie');
 await assert.rejects(A.setCardLogin(lev,'geen-adres',await v(lev),'test'),/geldig/);
 assert.equal((await A.choosePassword(T(4),'lev@example.invalid',PW)).card.participantId,lev,'leverancier kiest ook zelf een wachtwoord');
 // Uitnodiging verzenden (12 november 2026): tekst met link, adres en stappen; zonder link, adres of mailbox een duidelijke melding.
 const link='https://bo.example/deelnemer/'+T(9),mail=A.inviteText('Bindert Voorbeeld','bindert@example.invalid',link,'geen');
 assert.equal(mail.subject,'Je ledenpagina van Boer Bart');
 for(const part of ['Hoi Bindert,',link,'Eerste keer? Kies je wachtwoord','bindert@example.invalid','Onthoud deze telefoon','alleen voor jou'])assert.ok(mail.body.includes(part),part);
 assert.ok(A.inviteText('Bindert','b@example.invalid',link,'actief').body.includes('wachtwoord dat je eerder koos'),'al een wachtwoord: gewoon inloggen');
 const bo=A.inviteText('Rianne Voorbeeld','rianne@example.invalid',link,'backoffice').body;assert.ok(bo.includes('hetzelfde account als de backoffice')&&bo.includes('geen Authenticator-code')&&bo.includes(link),'backoffice-account: inloggen met hetzelfde account');assert.ok(!bo.includes('Eerste keer? Kies je wachtwoord'),'geen nieuw wachtwoord kiezen');
 const zonder=await card('Zonder Link','','','');await env.DB.prepare('DELETE FROM coop_portal_links WHERE participant_id=?').bind(zonder).run();
 await assert.rejects(A.sendInvite(zonder),/inlogadres/,'zonder adres');
 await A.setCardLogin(zonder,'zonder@example.invalid',(await A.loginInfo(zonder)).version,'test');
 await assert.rejects(A.sendInvite(zonder),/persoonlijke link/,'zonder link');
 const oldOrigin=process.env.APP_ORIGIN,oldSend=process.env.MAIL_SEND_ENABLED;process.env.APP_ORIGIN='https://bo.example';process.env.MAIL_SEND_ENABLED='0';
 try{await assert.rejects(A.sendInvite(lev),/staat uit/,'verzenden uit: duidelijke melding, niets verstuurd');await assert.rejects(A.sendInvite(boss),/staat uit/,'backoffice-account: wel uitnodigen (wens eigenaar)')}
 finally{if(oldOrigin===undefined)delete process.env.APP_ORIGIN;else process.env.APP_ORIGIN=oldOrigin;if(oldSend===undefined)delete process.env.MAIL_SEND_ENABLED;else process.env.MAIL_SEND_ENABLED=oldSend}
});

test('routes en scherm: eerste keer alleen via de eigen link, onthoud deze telefoon, geen bevestigingsmail meer in het scherm',async()=>{
 const route=read('app/auth/lid/eerste-keer/route.ts');
 assert.match(route,/readJson\(req\)/,'zelfde herkomst');assert.match(route,/if\(!token\)return answer\(\{error:NO_LINK\},400\)/,'zonder persoonlijke link niet');
 assert.match(route,/startMemberSession\(req,card,email,user\.id,'wachtwoord',b\.onthouden!==false\)/);
 const form=read('app/lid/inloggen/form.tsx');
 assert.match(form,/\/auth\/lid\/eerste-keer/);assert.doesNotMatch(form,/\/auth\/lid\/aanmelden/,'geen account aanmaken met bevestigingsmail');
 assert.match(form,/Onthoud deze telefoon/);assert.match(form,/name="onthouden"/,'ook voor Google');assert.match(form,/autoComplete="username"/,'de telefoon kan het wachtwoord bewaren');
 const card=read('app/api/leden/ledenlogin/route.ts');assert.match(card,/authorizeSheet\(req\)/);assert.match(card,/authorizeSheet\(req,true\)/,'schrijven alleen eigenaar en eigen herkomst');
 assert.match(read('app/leden/page.tsx'),/<Ledenlogin id=\{m\.id\}/,'op de ledenkaart');
 assert.match(fs.readFileSync(new URL('../lib/member-routes.ts',import.meta.url),'utf8'),/'google','uit','wachtwoord','aanmelden','eerste-keer','vergeten','nieuw-wachtwoord'/);
 const M=await import('../lib/member-session-core.ts'),secret='s'.repeat(40),now=Date.now(),base={participantId:'p',email:'e',subject:'s',provider:'wachtwoord',tokenHash:'a'.repeat(64)};
 assert.ok(M.readMemberSessionWith(M.signMemberSessionWith({...base,exp:now+364*86400000},secret),secret,now),'een jaar onthouden');
 assert.equal(M.readMemberSessionWith(M.signMemberSessionWith({...base,exp:now+400*86400000},secret),secret,now),null,'niet langer dan een jaar');
});

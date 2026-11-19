// Inloggen via Supabase (besluiten eigenaar 4 en 6 november 2026), van begin tot eind tegen de gebouwde backoffice:
// Google of e-mail en wachtwoord, daarna altijd de Authenticator-code; account aanmaken, wachtwoord vergeten en de
// Authenticator resetten bij een kwijtgeraakte telefoon. Supabase Auth is nagebootst (zelfde adressen); Google en een
// echte Authenticator-app zijn niet nodig. Database: eigen Postgres (test-postgres.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {startPostgres} from './test-postgres.mjs';
import {sessionSecret,signSession} from '../tools/auth/sessie.mjs';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../apps/backoffice');
const built=fs.existsSync(path.join(app,'.next/standalone/server.js'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const CODE='246810'; // de code die de nagebootste Authenticator-app „toont”

function fakeAuth(){
 const users=new Map(),tokens=new Map(),codes=new Map(),refreshes=new Map(),sent={signup:[],recover:[]};
 const user=email=>{if(!users.has(email))users.set(email,{id:randomUUID(),email,password:null,confirmed:false,factors:[],aal2:new Set()});return users.get(email)};
 const issue=u=>{const t='tok-'+randomUUID();tokens.set(t,u.id);return t};
 const byToken=req=>{const t=(req.headers.authorization||'').replace(/^Bearer /,'');const id=tokens.get(t);return [...users.values()].find(u=>u.id===id)};
 const pub=u=>({id:u.id,email:u.email,email_confirmed_at:u.confirmed?'2026-11-06T00:00:00Z':null,factors:u.factors.map(f=>({id:f.id,factor_type:'totp',status:f.status}))});
 const server=http.createServer(async(req,res)=>{
  const chunks=[];for await(const c of req)chunks.push(c);
  const body=chunks.length?JSON.parse(Buffer.concat(chunks)):{},url=new URL(req.url,'http://x'),p=url.pathname;
  const send=(status,v)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(v))};
  const service=req.headers.apikey==='service-test';
  if(req.headers.apikey!=='anon-test'&&!service)return send(401,{});
  if(req.method==='POST'&&p==='/auth/v1/token'&&url.searchParams.get('grant_type')==='pkce'){
   const c=codes.get(body.auth_code);
   if(!c||createHash('sha256').update(body.code_verifier).digest('base64url')!==c.challenge)return send(400,{error_code:'invalid'});
   codes.delete(body.auth_code);const u=user(c.email);u.confirmed=true;return send(200,{access_token:issue(u),user:pub(u)});
  }
  if(req.method==='POST'&&p==='/auth/v1/token'&&url.searchParams.get('grant_type')==='password'){
   const u=users.get(body.email);
   if(!u||!u.password||u.password!==body.password)return send(400,{error_code:'invalid_credentials'});
   if(!u.confirmed)return send(400,{error_code:'email_not_confirmed'});
   return send(200,{access_token:issue(u),user:pub(u)});
  }
  if(req.method==='POST'&&p==='/auth/v1/token'&&url.searchParams.get('grant_type')==='refresh_token'){
   const id=refreshes.get(body.refresh_token);if(!id)return send(400,{error_code:'refresh_token_not_found'});refreshes.delete(body.refresh_token);
   const u=[...users.values()].find(x=>x.id===id),r='ref-'+randomUUID();refreshes.set(r,u.id);return send(200,{access_token:issue(u),refresh_token:r,user:pub(u)});
  }
  if(req.method==='POST'&&p==='/auth/v1/signup'){const u=user(body.email);u.password=body.password;sent.signup.push({email:body.email,redirect:url.searchParams.get('redirect_to')});return send(200,{})}
  if(req.method==='POST'&&p==='/auth/v1/recover'){sent.recover.push({email:body.email,redirect:url.searchParams.get('redirect_to')});return send(200,{})}
  if(p==='/auth/v1/user'){const u=byToken(req);if(!u)return send(401,{});
   if(req.method==='GET')return send(200,pub(u));
   if(req.method==='PUT'){if(u.factors.some(f=>f.status==='verified')&&!u.aal2.has(req.headers.authorization))return send(403,{error_code:'insufficient_aal'});u.password=body.password;return send(200,pub(u))}
  }
  if(req.method==='POST'&&p==='/auth/v1/factors'){const u=byToken(req);if(!u)return send(401,{});const f={id:randomUUID(),status:'unverified'};u.factors.push(f);
   return send(200,{id:f.id,totp:{qr_code:'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg"/>',secret:'JBSWY3DPEHPK3PXP',uri:'otpauth://totp/x'}})}
  const m=p.match(/^\/auth\/v1\/factors\/([^/]+)(\/challenge|\/verify)?$/);
  if(m){const u=byToken(req);if(!u)return send(401,{});const f=u.factors.find(x=>x.id===m[1]);if(!f)return send(404,{});
   if(req.method==='DELETE'){u.factors=u.factors.filter(x=>x!==f);return send(200,{})}
   if(m[2]==='/challenge')return send(200,{id:'ch-'+randomUUID()});
   if(m[2]==='/verify'){if(body.code!==CODE)return send(422,{error_code:'mfa_verification_failed'});f.status='verified';const t=issue(u),r='ref-'+randomUUID();refreshes.set(r,u.id);u.aal2.add('Bearer '+t);return send(200,{access_token:t,refresh_token:r,user:pub(u)})}
  }
  const a=p.match(/^\/auth\/v1\/admin\/users\/([^/]+)(?:\/factors\/([^/]+))?$/);
  if(a){if(!service)return send(403,{});const u=[...users.values()].find(x=>x.id===a[1]);if(!u)return send(404,{});
   if(req.method==='GET'&&!a[2])return send(200,pub(u));
   if(req.method==='DELETE'&&a[2]){u.factors=u.factors.filter(x=>x.id!==a[2]);return send(200,{})}
  }
  send(404,{});
 });
 return {users,sent,user,
  listen:()=>new Promise(r=>server.listen(0,'127.0.0.1',()=>r('http://127.0.0.1:'+server.address().port))),close:()=>server.close(),
  // Wat Google + Supabase doen na „Inloggen met Google”: een code uitgeven voor dit account.
  google(authorizeUrl,email){const u=new URL(authorizeUrl),code='code-'+Math.random().toString(36).slice(2);codes.set(code,{challenge:u.searchParams.get('code_challenge'),email});this.user(email);return u.searchParams.get('redirect_to')+'?code='+code},
  // Wat de link in de herstelmail van Supabase meegeeft (achter #): een herstelbewijs voor dit account.
  recoveryToken(email){return issue(this.user(email))}};
}

test('inloggen: Google of wachtwoord, altijd met Authenticator; aanmaken, vergeten en resetten',{skip:!built&&'eerst npm run build'},async t=>{
 const auth=fakeAuth(),authUrl=await auth.listen();t.after(()=>auth.close());
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-inloggen-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const port=6300+Math.floor(Math.random()*300),base='http://127.0.0.1:'+port,pg=await startPostgres();
 const env={...Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^(BASIC_AUTH|LOCAL_NO_LOGIN|TUNNEL_NO_LOGIN|SUPABASE_|AUTH_SECRET|SESSION_COOKIE|MAIL_)/.test(k))),
  BOER_BART_LOGIN:'aan',SUPABASE_URL:authUrl,SUPABASE_ANON_KEY:'anon-test',SUPABASE_SERVICE_ROLE_KEY:'service-test',
  APP_DATA_DIR:dir,PORT:String(port),APP_ORIGIN:base,SHEETS_CONFIG_KEY:'cd'.repeat(32),NEXT_TELEMETRY_DISABLED:'1',MAIL_SYNC:'0',...pg.env};
 const log=[];const child=spawn(process.execPath,['../../tools/start-app.mjs'],{cwd:app,env,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',d=>log.push(String(d)));child.stderr.on('data',d=>log.push(String(d)));
 t.after(async()=>{await new Promise(r=>{child.once('exit',r);child.kill()});await pg.stop()});
 // Tot 60 seconden om te starten (met een eigen Postgres): op een drukke GitHub-server duurde het soms langer dan 20 (9 november 2026).
 let up=false;for(let i=0;i<300&&!up;i++){try{up=(await fetch(base+'/api/health')).ok}catch{}if(!up)await sleep(200)}
 assert.ok(up,'backoffice start niet binnen 60 seconden:\n'+log.join(''));
 const get=(p,cookie='')=>fetch(base+p,{redirect:'manual',headers:cookie?{cookie}:{}});
 const post=async(p,body,cookie='')=>{const r=await fetch(base+p,{method:'POST',redirect:'manual',headers:{Origin:base,'Content-Type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});let d={};try{d=await r.clone().json()}catch{}return {r,d}};
 const cookieOf=(r,name)=>(r.headers.getSetCookie().find(c=>c.startsWith(name+'='))||'').split(';')[0];
 const live=c=>c&&!/^[^=]+=$/.test(c);
 /** Tweede stap: code-scherm opvragen en de code invullen. Geeft de sessiecookie. */
 async function secondStep(step,expect){
  const s=await get('/auth/code',step);assert.equal(s.status,200);const state=await s.json();assert.equal(state.stap,expect);
  if(expect==='koppelen'){assert.match(state.qr,/^data:image\/png;base64,/,'QR zelf gemaakt uit het otpauth-adres (6 november 2026)');assert.ok(state.geheim)}
  const stepNow=cookieOf(s,'bb_stap')||step;
  const wrong=await post('/auth/code',{code:'000000'},stepNow);assert.equal(wrong.r.status,400);assert.match(wrong.d.error,/klopt niet/);
  assert.equal(cookieOf(wrong.r,'bb_sessie'),'','geen sessie bij een foute code');
  const ok=await post('/auth/code',{code:CODE},stepNow);assert.equal(ok.r.status,200,JSON.stringify(ok.d));
  const session=cookieOf(ok.r,'bb_sessie');assert.ok(live(session),'sessie na de code');
  const reverify=cookieOf(ok.r,'bb_herbevestig');assert.ok(live(reverify),'om later opnieuw de code te vragen');
  assert.match(ok.r.headers.getSetCookie().find(c=>c.startsWith('bb_sessie=')),/HttpOnly/i);
  return {session,reverify,naar:ok.d.naar};
 }
 async function google(email){
  const start=await get('/auth/google?terug=%2Fplanning');assert.equal(start.status,302);
  const verifier=cookieOf(start,'bb_inlog');assert.ok(verifier,'verifier-cookie');
  const back=auth.google(start.headers.get('location'),email);assert.ok(back.startsWith(base+'/auth/terug?code='));
  return get(back.slice(base.length),verifier);
 }

 // Zonder sessie: pagina's naar het inlogscherm, API's 401. Een oud wachtwoord (Basic Auth) werkt nergens meer.
 const page=await get('/planning');assert.equal(page.status,302);assert.equal(new URL(page.headers.get('location'),base).pathname,'/inloggen');
 assert.equal((await get('/api/products')).status,401);
 assert.equal((await fetch(base+'/api/products',{headers:{Authorization:'Basic '+Buffer.from('bart:'+'n'.repeat(20)).toString('base64')}})).status,401);
 const screen=await get('/inloggen');assert.equal(screen.status,200);const html=await screen.text();
 assert.match(html,/Inloggen met Google/);assert.match(html,/e-mail en wachtwoord/);
 assert.equal((await get('/api/public/products')).status,200,'de website blijft openbaar');
 assert.equal((await get('/inloggen/code')).status,200,'het codescherm zelf is open; zonder tussenstap valt er niets te halen');
 assert.equal((await get('/auth/code')).status,401);

 // Niet op de lijst: geweigerd, geen tussenstap en geen sessie.
 const stranger=await google('vreemde@gmail.com');assert.match(stranger.headers.get('location'),/\/inloggen\?fout=geen-toegang/);
 assert.equal(cookieOf(stranger,'bb_stap'),'');assert.equal(cookieOf(stranger,'bb_sessie'),'');

 // administratie@boerbart.nl (eigenaar vanaf het begin): Google, dan de Authenticator koppelen met de QR-code.
 const g=await google('administratie@boerbart.nl');assert.equal(g.status,302);assert.equal(new URL(g.headers.get('location'),base).pathname,'/inloggen/code');
 const step=cookieOf(g,'bb_stap');assert.ok(step,'tussenstap');assert.equal(cookieOf(g,'bb_sessie'),'','nog geen sessie vóór de code');
 assert.equal((await get('/api/products',step)).status,401,'de tussenstap alleen geeft geen toegang');
 const admin=await secondStep(step,'koppelen');assert.equal(admin.naar,'/planning');
 assert.equal((await get('/api/products',admin.session)).status,200);
 // De volgende keer: alleen de code (de app is gekoppeld).
 const again=await secondStep(cookieOf(await google('administratie@boerbart.nl'),'bb_stap'),'code');

 // Rianne heeft geen Google-account: de eigenaar zet haar adres op de lijst, zij maakt zelf een account aan.
 const add=await post('/api/toegang',{action:'opslaan',email:'rianne@boerbart.nl',name:'Rianne',role:'medewerker',active:true,modules:['planning']},again.session);
 assert.equal(add.r.status,200,JSON.stringify(add.d));
 const weak=await post('/auth/aanmelden',{email:'rianne@boerbart.nl',password:'kort'});assert.equal(weak.r.status,400);
 const outsider=await post('/auth/aanmelden',{email:'onbekend@example.nl',password:'appel peer banaan'});
 const signup=await post('/auth/aanmelden',{email:'rianne@boerbart.nl',password:'appel peer banaan'});
 assert.equal(signup.r.status,200);assert.equal(outsider.r.status,200);assert.equal(outsider.d.bericht,signup.d.bericht,'zelfde antwoord: niet uit te proberen wie op de lijst staat');
 assert.deepEqual(auth.sent.signup.map(s=>s.email),['rianne@boerbart.nl'],'alleen een adres op de lijst krijgt een mail');
 assert.equal(auth.sent.signup[0].redirect,base+'/inloggen?bevestigd=1');
 const early=await post('/auth/wachtwoord',{email:'rianne@boerbart.nl',password:'appel peer banaan'});assert.equal(early.r.status,400);assert.match(early.d.error,/Bevestig eerst/);
 auth.user('rianne@boerbart.nl').confirmed=true; // Rianne klikt op de link in de mail
 const wrongPw=await post('/auth/wachtwoord',{email:'rianne@boerbart.nl',password:'verkeerd wachtwoord'});assert.equal(wrongPw.r.status,400);
 const pw=await post('/auth/wachtwoord',{email:'rianne@boerbart.nl',password:'appel peer banaan',terug:'/producten'});
 assert.equal(pw.r.status,200,JSON.stringify(pw.d));assert.equal(pw.d.naar,'/inloggen/code');assert.equal(cookieOf(pw.r,'bb_sessie'),'');
 const rianne=await secondStep(cookieOf(pw.r,'bb_stap'),'koppelen');assert.equal(rianne.naar,'/planning','Producten is geen onderdeel van Rianne: naar haar eerste onderdeel');
 // Rechten per onderdeel (stap 2): alleen Planning. De rest is dicht, ook als ze het adres intypt.
 assert.equal((await get('/planning',rianne.session)).status,200);
 const fin=await get('/financien',rianne.session);assert.equal(fin.status,302);assert.equal(new URL(fin.headers.get('location'),base).pathname,'/planning');
 for(const p of ['/api/bank','/api/rekeningen','/api/bloei','/api/sheets'])assert.equal((await get(p,rianne.session)).status,403,p);
 assert.equal((await post('/api/products',{action:'save'},rianne.session)).r.status,403,'producten wijzigen hoort niet bij Planning');
 assert.equal((await get('/api/products',rianne.session)).status,200);
 assert.equal((await get('/api/toegang',rianne.session)).status,403,'een medewerker beheert de lijst niet');

 // Gevoelige handeling met een code van langer dan 10 minuten geleden: eerst opnieuw de code (stap 2).
 const secret=sessionSecret({SHEETS_CONFIG_KEY:'cd'.repeat(32)}),old=Date.now()-11*60000;
 const stale='bb_sessie='+signSession({email:'administratie@boerbart.nl',name:'Administratie Boer Bart',role:'eigenaar',exp:Date.now()+3600000,mfa:old},secret);
 const blocked=await post('/api/toegang',{action:'opslaan',email:'kok@boerbart.nl',name:'Kok',role:'medewerker',active:true,modules:['verkoop']},stale);
 assert.equal(blocked.r.status,401);assert.equal(blocked.d.opnieuwCode,true);
 assert.equal((await get('/api/toegang',stale)).status,200,'alleen kijken mag zonder nieuwe code');
 const wrongAgain=await post('/auth/opnieuw',{code:'000000'},stale+'; '+again.reverify);assert.equal(wrongAgain.r.status,400);
 const reverified=await post('/auth/opnieuw',{code:CODE},stale+'; '+cookieOf(wrongAgain.r,'bb_herbevestig'));
 assert.equal(reverified.r.status,200,JSON.stringify(reverified.d));const fresh=cookieOf(reverified.r,'bb_sessie');assert.ok(live(fresh));
 const done=await post('/api/toegang',{action:'opslaan',email:'kok@boerbart.nl',name:'Kok',role:'medewerker',active:true,modules:['verkoop']},fresh);assert.equal(done.r.status,200,JSON.stringify(done.d));
 const listed=await (await get('/api/toegang',fresh)).json();
 assert.deepEqual(listed.accounts.find(a=>a.email==='kok@boerbart.nl').modules,['verkoop']);
 assert.ok(listed.vastlegging.some(v=>v.action==='toegang:opslaan'&&v.email==='administratie@boerbart.nl'&&v.detail.includes('kok@boerbart.nl')),'vastgelegd');
 // Bloei (besluit eigenaar 8 november 2026): één code per handeling. De eerste handeling met deze nieuwe code gaat door en
 // markeert de code als gebruikt; de volgende vraagt opnieuw een code, ook binnen 10 minuten.
 const first=await post('/api/bloei/markt',{action:'settings',settings:{mode:'off',providerConfirmed:false,termsUrl:'',termsVersion:''}},fresh);
 assert.notEqual(first.r.status,401,JSON.stringify(first.d));const used=cookieOf(first.r,'bb_sessie');assert.ok(live(used),'code als gebruikt gemarkeerd');
 const second=await post('/api/bloei/markt',{action:'settings',settings:{mode:'off',providerConfirmed:false,termsUrl:'',termsVersion:''}},used);
 assert.equal(second.r.status,401);assert.equal(second.d.opnieuwCode,true);
 assert.equal((await get('/api/bloei/markt',used)).status,200,'kijken mag zonder nieuwe code');
 const again2=await post('/auth/opnieuw',{code:CODE},used+'; '+cookieOf(reverified.r,'bb_herbevestig'));assert.equal(again2.r.status,200,JSON.stringify(again2.d));
 const third=await post('/api/bloei/markt',{action:'settings',settings:{mode:'off',providerConfirmed:false,termsUrl:'',termsVersion:''}},cookieOf(again2.r,'bb_sessie'));
 assert.notEqual(third.r.status,401,'met een nieuwe code weer één handeling');
 const audit=await (await get('/api/toegang',cookieOf(third.r,'bb_sessie')||cookieOf(again2.r,'bb_sessie'))).json();
 assert.ok(audit.vastlegging.some(v=>v.action==='bloeimarkt:settings'&&v.detail.includes('"stand":"off"')),'Bloei-handeling vastgelegd');
 assert.equal((await post('/auth/opnieuw',{code:CODE},'bb_sessie=nep.x')).r.status,401,'zonder geldige sessie niet');

 // Wachtwoord vergeten: alleen voor wie op de lijst staat; daarna een nieuw wachtwoord, met de code (app al gekoppeld).
 assert.equal((await post('/auth/vergeten',{email:'onbekend@example.nl'})).r.status,200);
 assert.equal((await post('/auth/vergeten',{email:'rianne@boerbart.nl'})).r.status,200);
 assert.deepEqual(auth.sent.recover,[{email:'rianne@boerbart.nl',redirect:base+'/inloggen/nieuw-wachtwoord'}]);
 const rec=auth.recoveryToken('rianne@boerbart.nl');
 const noCode=await post('/auth/nieuw-wachtwoord',{token:rec,password:'nieuw lang wachtwoord'});assert.equal(noCode.r.status,400);assert.equal(noCode.d.code,true,'een gestolen mailbox alleen is niet genoeg');
 const set=await post('/auth/nieuw-wachtwoord',{token:rec,password:'nieuw lang wachtwoord',code:CODE});assert.equal(set.r.status,200,JSON.stringify(set.d));
 assert.equal(auth.users.get('rianne@boerbart.nl').password,'nieuw lang wachtwoord');
 assert.equal((await post('/auth/nieuw-wachtwoord',{token:'tok-nep-'+'x'.repeat(20),password:'nieuw lang wachtwoord',code:CODE})).r.status,400);

 // Telefoon kwijt: een andere eigenaar reset Rianne's Authenticator; bij de volgende login koppelt zij een nieuwe.
 assert.equal((await post('/api/toegang',{action:'code-resetten',email:'rianne@boerbart.nl'},rianne.session)).r.status,403);
 assert.equal((await post('/api/toegang',{action:'code-resetten',email:'administratie@boerbart.nl'},again.session)).r.status,409,'niet je eigen');
 const reset=await post('/api/toegang',{action:'code-resetten',email:'rianne@boerbart.nl'},again.session);assert.equal(reset.r.status,200,JSON.stringify(reset.d));
 assert.equal(auth.users.get('rianne@boerbart.nl').factors.length,0);
 const pw2=await post('/auth/wachtwoord',{email:'rianne@boerbart.nl',password:'nieuw lang wachtwoord'});assert.equal(pw2.r.status,200);
 await secondStep(cookieOf(pw2.r,'bb_stap'),'koppelen');

 // Een nagemaakte cookie of een sessie zonder code komt er niet in.
 assert.equal((await get('/api/products','bb_sessie=nep.handtekening')).status,401);
 // Uitloggen.
 const out=await fetch(base+'/auth/uit',{method:'POST',redirect:'manual',headers:{cookie:admin.session,Origin:base}});assert.equal(out.status,303);
 assert.match(out.headers.getSetCookie().find(c=>c.startsWith('bb_sessie='))||'',/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
});

test('zonder Supabase-instellingen blijft de backoffice dicht, ook zonder of met de oude schakelaar (inloggen staat altijd aan)',{skip:!built&&'eerst npm run build'},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-dicht-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const port=6600+Math.floor(Math.random()*300),base='http://127.0.0.1:'+port;
 const env={...Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^(BOER_BART_LOGIN|LOCAL_NO_LOGIN|TUNNEL_NO_LOGIN|SUPABASE_|AUTH_SECRET)/.test(k))),
  BOER_BART_LOGIN:'uit',LOCAL_NO_LOGIN:'1',BASIC_AUTH_USER:'bart',BASIC_AUTH_PASSWORD:'n'.repeat(20),APP_DATA_DIR:dir,PORT:String(port),APP_ORIGIN:base,SHEETS_CONFIG_KEY:'cd'.repeat(32),NEXT_TELEMETRY_DISABLED:'1',MAIL_SYNC:'0'};
 const child=spawn(process.execPath,['../../tools/start-app.mjs'],{cwd:app,env,stdio:'ignore'});
 t.after(()=>new Promise(r=>{child.once('exit',r);child.kill()}));
 // Tot 60 seconden om te starten: op een drukke GitHub-server duurde het soms net langer dan 20 (8 november 2026).
 let up=false;for(let i=0;i<300&&!up;i++){try{up=(await fetch(base+'/api/health')).ok}catch{}if(!up)await sleep(200)}assert.ok(up,'de backoffice start niet binnen 60 seconden');
 assert.equal((await fetch(base+'/api/products',{headers:{Authorization:'Basic '+Buffer.from('bart:'+'n'.repeat(20)).toString('base64')}})).status,503);
 assert.equal((await fetch(base+'/planning',{redirect:'manual'})).status,503);
 assert.equal((await fetch(base+'/api/public/products')).status,200,'de website blijft openbaar');
});

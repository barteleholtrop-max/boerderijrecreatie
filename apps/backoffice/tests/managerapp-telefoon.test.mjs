// Managerapp altijd ingelogd op de eigen telefoon (wens eigenaar 10 november 2026: „Bij de telefoonberichten-app moet nieuw
// inloggen niet nodig zijn. Die app moet altijd bij die telefoon passen.”). Na één keer gewoon inloggen blijft de telefoon
// ingelogd in de managerapp, maar opent hij nooit de rest van de backoffice. Ontkoppelen of het vinkje kwijt: binnen een uur dicht.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {register} from 'node:module';
import './helpers/ts-resolve.mjs';
import {allPgSql} from './helpers/pg-sql.mjs';
const stub=new URL('./helpers/next-server-stub.mjs',import.meta.url).href;
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){return s==='next/server'?n(${JSON.stringify(stub)},c):n(s,c)}`));
const {proxy}=await import('../proxy.ts');
const T=await import('../lib/telefoon-pas-core.ts');
const W=await import('../lib/werkplek-pas-core.ts');
const L=await import('../lib/login-core.ts');
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

const SECRET='s'.repeat(40);
const CONFIG={SUPABASE_URL:'https://x.supabase.co',SUPABASE_ANON_KEY:'k',AUTH_SECRET:SECRET,APP_ORIGIN:'https://bo.example'};
function withEnv(env,fn){const keys=Object.keys(CONFIG),old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));Object.assign(process.env,env);
 try{return fn()}finally{for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k]}}}
function req(p,{method='GET',cookie='',headers={}}={}){const url=new URL(p,'https://bo.example');
 return {method,url:url.href,nextUrl:url,headers:new Headers({host:'bo.example',...headers}),
  cookies:{get:n=>{const hit=cookie.split('; ').map(x=>x.split('=')).find(([k])=>k===n);return hit?{value:hit.slice(1).join('=')}:undefined}}}}
const ID='5d1f0c3e-2b7a-4c8e-9f10-3a4b5c6d7e8f';
const pas=(over={})=>'bb_telefoon='+T.signTelefoon({id:ID,email:'sanne@example.nl',role:'eigenaar',exp:Date.now()+T.TELEFOON_MINUTES*60000,...over},SECRET);

test('de telefoonpas: echt, ondertekend, kort geldig, en geen sessie of werkplekpas',()=>{
 const now=Date.now(),t=T.signTelefoon({id:ID,email:'a@b.nl',role:'medewerker',exp:now+60000},SECRET);
 assert.deepEqual(T.readTelefoon(t,SECRET,now),{id:ID,email:'a@b.nl',role:'medewerker',exp:now+60000});
 assert.equal(T.readTelefoon(t,'z'.repeat(40),now),null,'andere sleutel');
 assert.equal(T.readTelefoon(T.signTelefoon({id:ID,email:'a@b.nl',role:'medewerker',exp:now-1},SECRET),SECRET,now),null,'verlopen');
 assert.equal(T.readTelefoon(T.signTelefoon({id:ID,email:'a@b.nl',role:'medewerker',exp:now+3*3600000},SECRET),SECRET,now),null,'te lang geldig');
 assert.equal(T.readTelefoon(T.signTelefoon({id:ID,email:'a@b.nl',role:'werkplek',exp:now+60000},SECRET),SECRET,now),null,'onbekende rol');
 // Een werkplekpas of backoffice-sessie is geen telefoonpas, en andersom (andere afgeleide sleutel).
 assert.equal(T.readTelefoon(W.signWerkplek({id:ID,name:'a@b.nl',exp:now+60000},SECRET),SECRET,now),null);
 assert.equal(W.readWerkplek(t,SECRET,now),null);assert.equal(L.readSession(t,SECRET,now),null);
});

test('een onthouden telefoon opent alleen de managerapp, ook voor een eigenaar',()=>{
 for(const [p,m] of [['/gesprekken/telefoon','GET'],['/assistent/telefoon','GET'],['/assistent/telefoon/boodschappen','GET'],['/planning/telefoon','GET'],
  ['/api/meta','GET'],['/api/mail/threads/x','POST'],['/api/gasten','POST'],['/api/assistent','POST'],['/api/meldingen','POST'],['/api/telefoon','POST'],
  ['/api/products','GET'],['/_next/static/chunks/a.js','GET'],['/favicon.svg','GET']])assert.ok(T.telefoonAllowed(p,m),m+' '+p);
 for(const [p,m] of [['/','GET'],['/gesprekken','GET'],['/toegang','GET'],['/api/toegang','GET'],['/api/toegang/telefoons','POST'],['/leden','GET'],['/api/leden','GET'],
  ['/bloei','GET'],['/api/bloei','GET'],['/financien','GET'],['/api/bank','POST'],['/koppeling','GET'],['/kassa','GET'],['/werkplek/kassa','GET'],['/api/products','POST'],
  ['/api/proefdata','POST'],['/deelnemer/demo','GET']])assert.ok(!T.telefoonAllowed(p,m),m+' '+p+' moet dicht zijn');
 assert.ok(T.mayUsePhone('eigenaar',[]));assert.ok(T.mayUsePhone('medewerker',['managerapp','gasten']));
 assert.ok(!T.mayUsePhone('medewerker',['gasten','planning']),'zonder vinkje Managerapp niet');assert.ok(!T.mayUsePhone('werkplek',['managerapp']));
});

test('proxy: telefoonpas geeft de persoon, zonder code en alleen het onderdeel managerapp; de backoffice blijft dicht',()=>withEnv(CONFIG,()=>{
 const r=proxy(req('/gesprekken/telefoon',{cookie:pas()}));assert.equal(r.kind,'next');
 assert.equal(r.forwarded.get('x-boer-bart-email'),'sanne@example.nl');assert.equal(r.forwarded.get('x-boer-bart-account'),'sanne');
 assert.equal(r.forwarded.get('x-boer-bart-role'),'eigenaar');assert.equal(r.forwarded.get('x-boer-bart-mfa'),'0');
 assert.equal(r.forwarded.get('x-boer-bart-onderdelen'),'managerapp');assert.equal(r.forwarded.get('x-boer-bart-telefoon'),ID);
 assert.equal(proxy(req('/api/meta',{cookie:pas()})).kind,'next');
 for(const p of ['/api/toegang','/api/toegang/telefoons','/api/leden','/api/bloei','/api/bank','/api/proefdata']){const x=proxy(req(p,{method:'POST',cookie:pas()}));assert.equal(x.status,403,p);assert.notEqual(x.kind,'next',p)}
 for(const p of ['/','/toegang','/leden','/financien','/bloei','/kassa','/gesprekken']){const x=proxy(req(p,{cookie:pas()}));assert.equal(x.kind,'redirect',p);
  const to=new URL(x.location);assert.equal(to.pathname,'/inloggen',p);assert.equal(to.searchParams.get('terug'),p)}
 // Vervalste koppen naast een telefoonpas worden overschreven; zonder pas worden ze weggehaald.
 const f=proxy(req('/gesprekken/telefoon',{cookie:pas({role:'medewerker'}),headers:{'x-boer-bart-role':'eigenaar','x-boer-bart-onderdelen':'*','x-boer-bart-mfa':String(Date.now())}}));
 assert.equal(f.forwarded.get('x-boer-bart-role'),'medewerker');assert.equal(f.forwarded.get('x-boer-bart-onderdelen'),'managerapp');assert.equal(f.forwarded.get('x-boer-bart-mfa'),'0');
 const s=L.signSession({email:'sanne@example.nl',name:'Sanne',role:'eigenaar',exp:Date.now()+3600000,mfa:Date.now()},SECRET);
 const g=proxy(req('/gesprekken/telefoon',{cookie:'bb_sessie='+s,headers:{'x-boer-bart-telefoon':ID}}));
 assert.equal(g.kind,'next');assert.equal(g.forwarded.get('x-boer-bart-telefoon'),null,'de kop telt alleen als de proxy hem zet');
}));

test('proxy: verlopen of nagemaakte pas komt niet binnen; een onthouden telefoon haalt eerst een nieuwe pas',()=>withEnv(CONFIG,()=>{
 for(const c of [pas({exp:Date.now()-1}),'bb_telefoon='+T.signTelefoon({id:ID,email:'a@b.nl',role:'eigenaar',exp:Date.now()+60000},'z'.repeat(40))]){
  const r=proxy(req('/gesprekken/telefoon',{cookie:c}));assert.equal(r.kind,'redirect');assert.match(r.location,/\/inloggen\?terug=/);
  assert.equal(proxy(req('/api/meta',{cookie:c})).status,401);
 }
 const dev='bb_telefoon_pas='+'a'.repeat(43);
 const r=proxy(req('/assistent/telefoon/boodschappen?x=1',{cookie:dev}));assert.equal(r.kind,'redirect');
 const to=new URL(r.location);assert.equal(to.pathname,'/auth/telefoon/vernieuw');assert.equal(to.searchParams.get('terug'),'/assistent/telefoon/boodschappen?x=1');
 assert.equal(new URL(proxy(req('/toegang',{cookie:dev})).location).pathname,'/inloggen','de backoffice: gewoon inloggen');
 assert.equal(proxy(req('/api/meta',{cookie:dev})).status,401,'API: gewoon 401, de app vernieuwt zelf');
 for(const m of ['GET','POST'])assert.equal(proxy(req('/auth/telefoon/vernieuw',{method:m})).kind,'next',m+' vernieuwen is open; de route controleert zelf');
}));

test('de app vraagt om ingelogd te blijven en vernieuwt zelf; een echte sessie gaat voor',()=>{
 assert.match(read('proxy.ts'),/const session=readSession[\s\S]*if\(!session\)\{[\s\S]*readTelefoon/);
 const app=read('app/telefoon-app.tsx');assert.match(app,/<TelefoonIngelogd\/>/);assert.match(app,/<CodeOpnieuw\/>/);
 const c=read('app/telefoon-ingelogd.tsx');assert.match(c,/\/auth\/telefoon\/vernieuw/);assert.match(c,/visibilitychange/);assert.match(c,/action:'onthouden'/);
 const api=read('app/api/telefoon/route.ts');assert.match(api,/requireFreshCode\(req\)/,'onthouden alleen met een recente code');assert.match(api,/httpOnly:true/);
 assert.match(read('app/api/toegang/telefoons/route.ts'),/isOwnerRequest\(req\)/);
 assert.match(read('app/toegang/page.tsx'),/<Telefoons\/>/);
 const renew=read('app/auth/telefoon/vernieuw/route.ts');assert.match(renew,/isSameOrigin\(req\)/);assert.match(renew,/\(gesprekken\|assistent\|planning\|taken\)\\\/telefoon\|apps/,'alleen terug naar de managerapp');
});

test('migratie: nieuwe tabel met beveiliging per rij, alleen de hash van het bewijs',()=>{
 const sql=allPgSql().split('--> statement-breakpoint').filter(x=>/"phone_devices"/.test(x)).join('\n'); // alleen de stukken over deze tabel(len)
 assert.match(sql,/CREATE TABLE "phone_devices"/);assert.match(sql,/ALTER TABLE "phone_devices" ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/CREATE UNIQUE INDEX "phone_devices_hash"/);assert.doesNotMatch(sql,/"secret"/);
});

test('onthouden, vernieuwen en ontkoppelen; vinkje kwijt of uit staan houdt de telefoon ook buiten',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-telefoon-'));process.env.APP_DATA_DIR=dir;process.env.DATABASE_URL='';
 const {env,closeDatabase}=await import('../lib/portable/env.ts'),S=await import('../lib/telefoon-pas.ts');
 t.after(async()=>{await closeDatabase();fs.rmSync(dir,{recursive:true,force:true})});
 const at=new Date().toISOString(),add=(email,role,modules)=>env.DB.prepare('INSERT INTO access_accounts (email,name,role,active,created,updated,modules) VALUES (?,?,?,1,?,?,?)').bind(email,email,role,at,at,JSON.stringify(modules)).run();
 await add('sanne@example.nl','eigenaar',[]);await add('pieter@example.nl','medewerker',['managerapp']);await add('kok@example.nl','medewerker',['verkoop']);
 await assert.rejects(S.rememberPhone('kok@example.nl','iPhone'),/geen toegang tot de managerapp/);
 await assert.rejects(S.rememberPhone('onbekend@example.nl','iPhone'),/geen toegang/);
 const p=await S.rememberPhone('Pieter@example.nl','Android-telefoon');assert.equal(p.email,'pieter@example.nl');assert.equal(p.role,'medewerker');assert.ok(T.validSecret(p.secret));
 const row=await env.DB.prepare('SELECT * FROM phone_devices').first();assert.equal(row.token_hash,T.hashSecret(p.secret));assert.notEqual(row.token_hash,p.secret,'alleen de hash');
 assert.deepEqual(await S.phoneBySecret(p.secret),{id:p.id,email:'pieter@example.nl',role:'medewerker',name:'Android-telefoon'});
 assert.equal(await S.phoneBySecret('b'.repeat(43)),null);assert.equal(await S.phoneBySecret('kort'),null);
 // Vinkje Managerapp kwijt: geen nieuwe pas meer. Terug: weer wel.
 await env.DB.prepare('UPDATE access_accounts SET modules=? WHERE email=?').bind('["gasten"]','pieter@example.nl').run();assert.equal(await S.phoneBySecret(p.secret),null);
 await env.DB.prepare('UPDATE access_accounts SET modules=? WHERE email=?').bind('["managerapp"]','pieter@example.nl').run();assert.ok(await S.phoneBySecret(p.secret));
 // Uit staan: ook niet.
 await env.DB.prepare('UPDATE access_accounts SET active=0 WHERE email=?').bind('pieter@example.nl').run();assert.equal(await S.phoneBySecret(p.secret),null);
 await env.DB.prepare('UPDATE access_accounts SET active=1 WHERE email=?').bind('pieter@example.nl').run();
 // Opnieuw onthouden op dezelfde telefoon: het oude bewijs vervalt.
 const q=await S.rememberPhone('pieter@example.nl','Android-telefoon',p.secret);assert.equal(await S.phoneBySecret(p.secret),null);assert.ok(await S.phoneBySecret(q.secret));
 // Eigenaar ontkoppelt.
 await S.revokePhone(q.id,'sanne');assert.equal(await S.phoneBySecret(q.secret),null,'ontkoppeld');
 await assert.rejects(S.revokePhone(q.id,'sanne'),/al ontkoppeld/);await assert.rejects(S.revokePhone('x','sanne'),/Onbekende/);
 // Zelf uitloggen op de telefoon.
 const e=await S.rememberPhone('sanne@example.nl','iPhone');assert.equal((await S.phoneBySecret(e.secret)).role,'eigenaar');
 await S.forgetPhone(e.secret,'sanne');assert.equal(await S.phoneBySecret(e.secret),null);
 const list=await S.listPhones();assert.equal(list.length,3);assert.ok(list.every(x=>!('tokenHash' in x)),'nooit het bewijs');
});

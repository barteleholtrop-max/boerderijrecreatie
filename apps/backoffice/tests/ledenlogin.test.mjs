// Ledenlogin (wens eigenaar 9 november 2026): „leden moeten met hun ledenlogin in kunnen loggen via Google of een wachtwoord.
// Daar hoeft geen tweetrapsverificatie bij. Maar op die manier is het ledengedeelte ook beveiligd.” De persoonlijke link
// alleen opent de ledenpagina niet meer: er is een ledensessie nodig die bij precies die link hoort.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {register} from 'node:module';
import './helpers/ts-resolve.mjs';
const stub=new URL('./helpers/next-server-stub.mjs',import.meta.url).href;
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){return s==='next/server'?n(${JSON.stringify(stub)},c):n(s,c)}`));
const {proxy}=await import('../proxy.ts');
const M=await import('../lib/member-session-core.ts');
const L=await import('../lib/login-core.ts');
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

const SECRET='s'.repeat(40);
const CONFIG={SUPABASE_URL:'https://x.supabase.co',SUPABASE_ANON_KEY:'k',AUTH_SECRET:SECRET,APP_ORIGIN:'https://bo.example'};
function withEnv(env,fn){const keys=Object.keys(CONFIG),old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));for(const k of keys)delete process.env[k];Object.assign(process.env,env);
 try{return fn()}finally{for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k]}}}
function req(p,{method='GET',cookie=''}={}){const url=new URL(p,'https://bo.example');
 return {method,url:url.href,nextUrl:url,headers:new Headers({host:'bo.example'}),
  cookies:{get:n=>{const hit=cookie.split('; ').map(x=>x.split('=')).find(([k])=>k===n);return hit?{value:hit.slice(1).join('=')}:undefined}}}}
const A='a'.repeat(43),B='b'.repeat(43);
const member=(token,over={})=>'bb_lid_sessie='+M.signMemberSessionWith({participantId:'p1',email:'lid@example.nl',subject:'u1',provider:'wachtwoord',tokenHash:M.linkHash(token),exp:Date.now()+86400000,...over},SECRET);
const MEMBER_PATHS=t=>['/deelnemer/'+t,'/deelnemer/'+t+'/afspraken','/api/deelnemer/'+t,'/api/deelnemer/'+t+'/financien','/api/deelnemer/'+t+'/lidafspraak','/api/deelnemer/'+t+'/inkomenslening',
 '/api/deelnemer/'+t+'/winkeldiensten','/api/deelnemer/'+t+'/rooster','/api/deelnemer/'+t+'/bb','/api/deelnemer/'+t+'/documenten','/api/deelnemer/'+t+'/bloei-documenten/'+randomUUID(),'/api/deelnemer/'+t+'/push','/api/deelnemer/'+t+'/gesprekken'];

test('zonder ledensessie: de persoonlijke link alleen opent niets meer',()=>withEnv(CONFIG,()=>{
 for(const p of MEMBER_PATHS(A))for(const method of ['GET','POST']){
  const r=proxy(req(p,{method}));
  if(p.startsWith('/api/')){assert.equal(r.status,401,method+' '+p);assert.equal(JSON.parse(r.body).inloggen,'/lid/inloggen?terug='+encodeURIComponent('/deelnemer/'+A))}
  else{assert.equal(r.kind,'redirect',p);const to=new URL(r.location);assert.equal(to.pathname,'/lid/inloggen');assert.equal(to.searchParams.get('terug'),p)}
 }
}));

test('met de eigen ledensessie: wel; met die van een ander lid of een nagemaakte: niet',()=>withEnv(CONFIG,()=>{
 for(const p of MEMBER_PATHS(A)){const r=proxy(req(p,{cookie:member(A)}));assert.equal(r.kind,'next',p);
  for(const h of ['x-boer-bart-verified-user','x-boer-bart-role'])assert.equal(r.forwarded.get(h),null,'een lid krijgt geen backoffice-identiteit')}
 for(const c of [member(B),member(A,{exp:Date.now()-1}),member(A,{exp:Date.now()+400*86400000}),member(A,{provider:'magie'}),
  'bb_lid_sessie='+M.signMemberSessionWith({participantId:'p1',email:'x',subject:'u',provider:'google',tokenHash:M.linkHash(A),exp:Date.now()+1e6},'z'.repeat(40))])
  assert.notEqual(proxy(req('/api/deelnemer/'+A+'/financien',{cookie:c})).kind,'next',c.slice(0,40));
}));

test('een ledensessie opent de backoffice niet',()=>withEnv(CONFIG,()=>{
 for(const p of ['/','/leden','/api/leden','/toegang','/api/toegang','/bloei','/werkplek/kassa','/api/orders']){const r=proxy(req(p,{cookie:member(A)}));
  assert.ok(r.kind!=='next'||r.forwarded?.get('x-boer-bart-verified-user')!=='owner',p)}
}));

test('namens een lid: de eigenaar mag inzien én wijzigen, met de balk; nagemaakte koppen helpen niet',()=>withEnv(CONFIG,()=>{
 const now=Date.now(),owner='bb_sessie='+L.signSession({email:'administratie@boerbart.nl',name:'a',role:'eigenaar',exp:now+1e6,mfa:now},SECRET);
 for(const [p,m] of [['/deelnemer/'+A,'GET'],['/deelnemer/'+A+'/afspraken','GET'],['/api/deelnemer/'+A,'POST'],['/api/deelnemer/'+A+'/rooster','POST'],['/api/deelnemer/'+A+'/lidafspraak','POST'],['/api/deelnemer/'+A+'/documenten','GET']]){
  const r=proxy(req(p,{method:m,cookie:owner}));assert.equal(r.kind,'next',m+' '+p);assert.equal(r.forwarded.get('x-boer-bart-namens'),'administratie@boerbart.nl',p);
  assert.equal(r.forwarded.get('x-boer-bart-verified-user'),null,'geen backoffice-identiteit op de ledenpagina');
 }
 const own=proxy(req('/deelnemer/'+A,{cookie:member(A)}));assert.equal(own.forwarded.get('x-boer-bart-namens'),null,'het lid zelf: geen balk');
 const fake=proxy({...req('/deelnemer/'+A,{cookie:member(A)}),headers:new Headers({host:'bo.example','x-boer-bart-namens':'iemand'})});assert.equal(fake.forwarded.get('x-boer-bart-namens'),null,'van buiten weggehaald');
 assert.match(read('app/deelnemer/[token]/layout.tsx'),/x-boer-bart-namens/);assert.match(read('app/leden/page.tsx'),/Openen namens lid/);
}));
test('een eigenaar mag meekijken; een medewerker niet',()=>withEnv(CONFIG,()=>{
 const now=Date.now(),owner='bb_sessie='+L.signSession({email:'administratie@boerbart.nl',name:'a',role:'eigenaar',exp:now+1e6,mfa:now},SECRET);
 const staff='bb_sessie='+L.signSession({email:'m@b.nl',name:'m',role:'medewerker',modules:['personeel'],exp:now+1e6,mfa:now},SECRET);
 assert.equal(proxy(req('/api/deelnemer/'+A+'/financien',{cookie:owner})).kind,'next');
 assert.equal(proxy(req('/api/deelnemer/'+A+'/financien',{cookie:staff})).status,401);
}));

test('open blijven: het inlogscherm voor leden, de inlogroutes, het manifest, de demo',()=>withEnv(CONFIG,()=>{
 for(const [p,m] of [['/lid/inloggen','GET'],['/lid/nieuw-wachtwoord','GET'],['/auth/lid/terug','GET'],['/auth/lid/google','POST'],['/auth/lid/wachtwoord','POST'],['/auth/lid/aanmelden','POST'],
  ['/auth/lid/vergeten','POST'],['/auth/lid/nieuw-wachtwoord','POST'],['/auth/lid/uit','POST'],['/api/deelnemer/'+A+'/manifest','GET'],['/proef/'+A,'GET']]){
  const r=proxy(req(p,{method:m}));assert.equal(r.kind,'next',m+' '+p);assert.equal(r.forwarded.get('x-boer-bart-verified-user'),null);
 }
 assert.notEqual(proxy(req('/auth/lid/wachtwoord',{method:'GET'})).kind,'next','wachtwoord alleen met POST');
}));

test('zonder AUTH_SECRET blijft de ledenomgeving dicht (503)',()=>withEnv({},()=>{assert.equal(proxy(req('/deelnemer/'+A)).status,503);assert.equal(proxy(req('/api/deelnemer/'+A+'/financien')).status,503)}));

test('terugweg alleen naar een eigen ledenpagina',()=>{
 assert.equal(M.memberNext('/deelnemer/'+A),'/deelnemer/'+A);assert.equal(M.memberNext('/deelnemer/'+A+'/afspraken'),'/deelnemer/'+A+'/afspraken');
 for(const v of ['https://evil.example/deelnemer/'+A,'//evil.example','/leden','/deelnemer/'+A+'/../../toegang','/deelnemer/kort',null,42])assert.equal(M.memberNext(v),'',String(v));
 assert.equal(M.memberArea('/api/deelnemer/'+A+'/manifest'),null,'manifest open');assert.equal(M.memberArea('/deelnemer/demo'),null,'demo');
});

test('e-mailadres → ledenkaart: inlogadres, anders contactadres; dubbel alleen via de eigen link',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-ledenlogin-'));process.env.APP_DATA_DIR=dir;process.env.DATABASE_URL='';process.env.SHEETS_CONFIG_KEY='ad'.repeat(32);
 const {env,closeDatabase}=await import('../lib/portable/env.ts'),Auth=await import('../lib/member-auth.ts'),{seal}=await import('../lib/sheets.ts');
 t.after(async()=>{await closeDatabase();fs.rmSync(dir,{recursive:true,force:true})});
 const at=new Date().toISOString();
 async function card(name,email,login,token,active=1){const id=randomUUID();
  await env.DB.prepare('INSERT INTO coop_participants(id,name,email,member_login_email,active,created,updated) VALUES(?,?,?,?,?,?,?)').bind(id,name,email,login,active,at,at).run();
  await env.DB.prepare('INSERT INTO coop_portal_links(participant_id,token_hash,token_sealed,created,created_by) VALUES(?,?,?,?,?)').bind(id,M.linkHash(token),await seal(token),at,'test').run();return id}
 const T=n=>String(n).repeat(43).slice(0,43);
 const lid=await card('Lid','contact@example.nl','lid@gmail.com',T(1));
 const lev=await card('Leverancier','Lev@Example.nl','',T(2));
 const x=await card('Partner 1','gedeeld@example.nl','',T(3)),y=await card('Partner 2','gedeeld@example.nl','',T(4));
 await card('Gestopt','oud@example.nl','',T(5),0);
 assert.deepEqual(await Auth.memberForEmail('LID@gmail.com'),{participantId:lid,token:T(1)},'inlogadres');
 await assert.rejects(Auth.memberForEmail('contact@example.nl'),/geen-toegang/,'contactadres telt niet als er een inlogadres is');
 assert.deepEqual(await Auth.memberForEmail('lev@example.nl'),{participantId:lev,token:T(2)},'leverancier: contactadres');
 await assert.rejects(Auth.memberForEmail('gedeeld@example.nl'),/dubbel/);
 assert.deepEqual(await Auth.memberForEmail('gedeeld@example.nl',T(4)),{participantId:y,token:T(4)},'via de eigen link wel');
 await assert.rejects(Auth.memberForEmail('lid@gmail.com',T(2)),/geen-toegang/,'andermans link');
 assert.equal((await Auth.memberForEmail('oud@example.nl')).token,T(5),'gestopt lid ziet zijn archief');
 await assert.rejects(Auth.memberForEmail('niemand@example.nl'),/geen-toegang/);
 assert.equal(await Auth.memberEmailKnown('lev@example.nl'),true);assert.equal(await Auth.memberEmailKnown('niemand@example.nl'),false);assert.ok(x);
 // Ondertekenen volgt dezelfde regel als inloggen (12 november 2026). Eerder telde daar alleen het inlogadres: een A-lid zonder
 // inlogadres op de kaart kwam binnen met het contactadres, maar moest bij ondertekenen steeds opnieuw inloggen.
 const Login=await import('../lib/member-login.ts');
 const a=await card('A-lid zonder inlogadres','A.Lid@Example.nl','',T(6));await env.DB.prepare("UPDATE coop_participants SET member_class='A' WHERE id=?").bind(a).run();
 assert.deepEqual(await Auth.memberForEmail('a.lid@example.nl'),{participantId:a,token:T(6)},'inloggen met het contactadres');
 assert.deepEqual(await Login.memberLoginIdentity(T(6),' A.LID@example.nl '),{participantId:a,email:'a.lid@example.nl'},'en dan ook ondertekenen');
 await env.DB.prepare("UPDATE coop_participants SET member_class='B' WHERE id=?").bind(lid).run();
 assert.equal((await Login.memberLoginIdentity(T(1),'lid@gmail.com')).participantId,lid,'inlogadres');
 await assert.rejects(Login.memberLoginIdentity(T(1),'contact@example.nl'),/inlogadres/,'contactadres niet als er een inlogadres is');
 await assert.rejects(Login.memberLoginIdentity(T(6),'lid@gmail.com'),/inlogadres/,'andermans adres');
 const v=await card('Vrijwilliger','vrij@example.nl','',T(7));await env.DB.prepare('UPDATE coop_participants SET volunteer=1 WHERE id=?').bind(v).run();
 assert.equal((await Login.memberLoginIdentity(T(7),'vrij@example.nl')).participantId,v,'vrijwilliger mag ook ondertekenen');
 await assert.rejects(Login.memberLoginIdentity(T(2),'lev@example.nl'),/inlogadres/,'leverancier (geen lid) tekent geen ledenafspraak');
 for(const id of [x,y])await env.DB.prepare("UPDATE coop_participants SET member_class='C' WHERE id=?").bind(id).run();
 await assert.rejects(Login.memberLoginIdentity(T(3),'gedeeld@example.nl'),/dubbele/,'gedeeld adres: eerst per kaart een eigen inlogadres');
});

test('routes: geen tweede stap, dezelfde antwoorden voor wel/geen lid, ondertekenen ook met wachtwoord',()=>{
 const pw=read('app/auth/lid/wachtwoord/route.ts');assert.match(pw,/passwordLogin/);assert.doesNotMatch(pw,/beginStep|verifyTotp/);assert.match(pw,/startMemberSession\(req,m,[^)]*'wachtwoord',b\.onthouden!==false\)/);
 for(const f of ['aanmelden','vergeten'])assert.match(read(`app/auth/lid/${f}/route.ts`),/if\(await memberEmailKnown\(email\)\)[\s\S]*return answer\(\{ok:true,bericht:DONE\}\)/);
 assert.match(read('app/auth/lid/terug/route.ts'),/providers\?\.includes\('google'\)/);
 assert.match(read('lib/member-contracts.ts'),/signer\.provider!=='google'&&signer\.provider!=='wachtwoord'/);
 assert.match(read('app/deelnemer/[token]/layout.tsx'),/<LidSessie beheerder=/);assert.match(read('app/shell.tsx'),/path==='\/lid'\|\|path\.startsWith\('\/lid\/'\)/);
});

test('demo-omgeving blijft bestaan, zonder inloggen (wens eigenaar 9 november 2026: „dat moet blijven bestaan”)',()=>withEnv(CONFIG,()=>{
 // Demolink voor buitenstaanders (/proef/<code>) en de demo in de backoffice (/deelnemer/demo): verzonnen lid, geen login.
 for(const p of ['/proef/'+A,'/deelnemer/demo'])assert.equal(M.memberArea(p),null,p+' vraagt geen ledenlogin');
 assert.equal(proxy(req('/proef/'+A)).kind,'next','demolink opent zonder login');
 // De demo vangt zijn eigen API-verzoeken in de browser af (app/deelnemer/[token]/demo.ts); die adressen vallen niet onder de ledenlogin.
 for(const p of ['/api/deelnemer/demo','/api/deelnemer/demo/rooster','/api/deelnemer/demo/financien'])assert.equal(M.memberArea(p),null,p);
 assert.match(read('app/deelnemer/[token]/demo.ts'),/const API='\/api\/deelnemer\/'\+DEMO_TOKEN/);
 // Proeflink (echte link in proefstand): het lid logt in en kijkt rond; de eigenaar kan meekijken met „Openen namens lid”.
 assert.match(read('app/leden/page.tsx'),/proeflink-maken/);
}));

test('formulieren op de eigen site: Origin null bij no-referrer telt alleen met Sec-Fetch-Site same-origin (12 november 2026)',async()=>{
 const {isSameOrigin}=await import('../lib/portable/origin.ts');
 await withEnv(CONFIG,()=>{
  const r=h=>new Request('https://bo.example/auth/lid/google',{method:'POST',headers:h});
  assert.equal(isSameOrigin(r({origin:'https://bo.example'})),true,'gewoon fetch-verzoek');
  assert.equal(isSameOrigin(r({origin:'null','sec-fetch-site':'same-origin'})),true,'formulier op eigen pagina (Inloggen met Google, uitloggen)');
  assert.equal(isSameOrigin(r({origin:'null','sec-fetch-site':'cross-site'})),false,'formulier van een andere site');
  assert.equal(isSameOrigin(r({origin:'null'})),false,'null zonder bevestiging van de browser');
  assert.equal(isSameOrigin(r({origin:'https://evil.example','sec-fetch-site':'same-origin'})),false,'ander adres');
  assert.equal(isSameOrigin(r({})),false,'geen herkomst');
 });
 assert.match(read('next.config.ts'),/Referrer-Policy',value:'no-referrer'/,'de reden van de uitzondering');
});

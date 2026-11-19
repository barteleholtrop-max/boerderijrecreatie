// Zonder code binnenkomen (wens eigenaar 13 november 2026: „Bij de back-office mag je de authentificatie eraf halen voor Sanne
// en administratie@example.nl. Maar niet bij de gevoelige bedrijfsinformatie.”). Instelling per account bij Toegang.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {register} from 'node:module';
import './helpers/ts-resolve.mjs';
import {allPgSql} from './helpers/pg-sql.mjs';
const stub=new URL('./helpers/next-server-stub.mjs',import.meta.url).href;
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){return s==='next/server'?n(${JSON.stringify(stub)},c):n(s,c)}`));
const {proxy}=await import('../proxy.ts');
const L=await import('../lib/login-core.ts'),G=await import('../lib/gevoelig.ts');
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const SECRET='s'.repeat(40),CONFIG={SUPABASE_URL:'https://x.supabase.co',SUPABASE_ANON_KEY:'k',AUTH_SECRET:SECRET,APP_ORIGIN:'https://bo.example'};
function withEnv(fn){const old=Object.fromEntries(Object.keys(CONFIG).map(k=>[k,process.env[k]]));Object.assign(process.env,CONFIG);try{return fn()}finally{for(const [k,v] of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v}}}
function req(p,{method='GET',cookie=''}={}){const url=new URL(p,'https://bo.example');return {method,url:url.href,nextUrl:url,headers:new Headers({host:'bo.example'}),cookies:{get:n=>{const hit=cookie.split('; ').map(x=>x.split('=')).find(([k])=>k===n);return hit?{value:hit.slice(1).join('=')}:undefined}}}}
const sess=over=>{const now=Date.now();return 'bb_sessie='+L.signSession({email:'eigenaar@example.nl',name:'E',role:'eigenaar',exp:now+3600000,mfa:now,...over},SECRET)};

test('sessie zonder code: geldig om binnen te komen, maar nooit „net bevestigd”',()=>withEnv(()=>{
 const now=Date.now(),s={email:'eigenaar@example.nl',name:'E',role:'eigenaar',exp:now+3600000,mfa:now,quick:true};
 assert.ok(L.readSession(L.signSession(s,SECRET),SECRET),'geldige sessie');
 assert.equal(L.readSession(L.signSession({...s,quick:'ja'},SECRET),SECRET),null,'alleen quick:true');
 assert.equal(G.codeAt(s),0);assert.equal(G.freshCode(G.codeAt(s)),false);assert.equal(G.unusedCode(s),false,'Bloei: altijd een code');
 assert.equal(G.freshCode(G.codeAt({...s,quick:undefined})),true,'met code: wel bevestigd');
}));

test('proxy: gewone schermen open, gevoelige handelingen vragen de code',()=>withEnv(()=>{
 const quick=sess({quick:true});
 const page=proxy(req('/planning',{cookie:quick}));assert.equal(page.kind,'next');
 for(const p of ['/api/toegang','/api/gasten/koppelingen']){
  const r=proxy(req(p,{method:'POST',cookie:quick}));assert.equal(r.status,401,p);assert.equal(JSON.parse(r.body).opnieuwCode,true,p)}
 assert.notEqual(proxy(req('/api/toegang',{method:'POST',cookie:sess()})).status,401,'met verse code wel');
}));

test('inloggen, code opnieuw en Toegang',()=>{
 const flow=read('lib/login-flow.ts');
 assert.match(flow,/if\(!step\.quick\|\|!t\.refresh_token\)return null/,'alleen als het account dat mag');
 assert.match(flow,/verifiedTotp\(user\)/,'alleen met een gekoppelde Authenticator (anders kan de code later niet)');
 assert.match(flow,/mfa:now,quick:true/);assert.match(flow,/writeReverify\(req,\{email:step\.email,authId:step\.authId,factor,refresh:t\.refresh_token/);
 assert.match(read('app/auth/wachtwoord/route.ts'),/await quickLogin\(req,t,step\)\|\|'\/inloggen\/code'/);
 assert.match(read('app/auth/terug/route.ts'),/quickLogin\(req,t,step\)/);
 assert.match(read('app/auth/opnieuw/route.ts'),/const \{quick:_,\.\.\.rest\}=session;await setSession\(req,signSession\(\{\.\.\.rest,mfa:Date\.now\(\)\}/,'na de code: gewoon bevestigd');
 assert.match(read('lib/access-store.ts'),/quick:row\.quickLogin===1/);assert.match(read('app/api/toegang/route.ts'),/quick:b\.quick/);
 assert.match(read('app/toegang/page.tsx'),/Zonder code binnen/);
 assert.match(allPgSql(),/"quick_login" bigint DEFAULT 0 NOT NULL/);
});

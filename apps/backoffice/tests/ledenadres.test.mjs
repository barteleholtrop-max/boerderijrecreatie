// Eigen adres van de ledenapp (opdracht eigenaar 13 november 2026, keuze 1a: „echt als aparte app, net zoals de zelfscankassa”).
// Met LEDEN_ORIGIN is de ledenapp een eigen website; zonder blijft alles zoals het was. Alle gegevens zijn verzonnen.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {register} from 'node:module';
import './helpers/ts-resolve.mjs';
const stub=new URL('./helpers/next-server-stub.mjs',import.meta.url).href;
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){return s==='next/server'?n(${JSON.stringify(stub)},c):n(s,c)}`));
const {proxy}=await import('../proxy.ts');
const M=await import('../lib/member-session-core.ts'),L=await import('../lib/login-core.ts'),O=await import('../lib/member-origin.ts'),{isSameOrigin}=await import('../lib/portable/origin.ts');
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const SECRET='s'.repeat(40),T='a'.repeat(43);
const BASE={SUPABASE_URL:'https://x.supabase.co',SUPABASE_ANON_KEY:'k',AUTH_SECRET:SECRET,APP_ORIGIN:'https://bo.example'};
const KEYS=[...Object.keys(BASE),'LEDEN_ORIGIN'];
function withEnv(env,fn){const old=Object.fromEntries(KEYS.map(k=>[k,process.env[k]]));for(const k of KEYS)delete process.env[k];Object.assign(process.env,env);
 try{return fn()}finally{for(const k of KEYS){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k]}}}
function req(p,{host='bo.example',method='GET',cookie=''}={}){const url=new URL(p,'https://'+host);
 return {method,url:url.href,nextUrl:url,headers:new Headers({host}),cookies:{get:n=>{const hit=cookie.split('; ').map(x=>x.split('=')).find(([k])=>k===n);return hit?{value:hit.slice(1).join('=')}:undefined}}}}
const member='bb_lid_sessie='+M.signMemberSessionWith({participantId:'p1',email:'lid@example.nl',subject:'u1',provider:'wachtwoord',tokenHash:M.linkHash(T),exp:Date.now()+86400000},SECRET);
const owner=()=>{const now=Date.now();return 'bb_sessie='+L.signSession({email:'eigenaar@example.nl',name:'a',role:'eigenaar',exp:now+1e6,mfa:now},SECRET)};
const LEDEN={...BASE,LEDEN_ORIGIN:'https://leden.example'};

test('zonder LEDEN_ORIGIN: niets verandert',()=>withEnv(BASE,()=>{
 assert.equal(O.ledenOrigin(),'');assert.equal(O.memberOrigin(),'https://bo.example');
 const r=proxy(req('/deelnemer/'+T,{cookie:member}));assert.equal(r.kind,'next');
 assert.equal(new URL(proxy(req('/deelnemer/'+T)).location).host,'bo.example','inloggen op het eigen adres');
}));

test('backoffice-adres: een lid gaat naar het ledenadres; de eigenaar blijft (namens een lid)',()=>withEnv(LEDEN,()=>{
 for(const p of ['/deelnemer/'+T,'/deelnemer/'+T+'/afspraken','/lid','/lid/inloggen?terug=/deelnemer/'+T]){
  const r=proxy(req(p,{cookie:member}));assert.equal(r.kind,'redirect',p);const to=new URL(r.location);assert.equal(to.origin,'https://leden.example');assert.equal(to.pathname+to.search,p)}
 assert.equal(proxy(req('/deelnemer/'+T,{cookie:owner()})).kind,'next','eigenaar kijkt mee in de backoffice');
 assert.notEqual(new URL(proxy(req('/leden')).location||'https://bo.example').host,'leden.example','backoffice blijft backoffice');
 assert.equal(proxy(req('/api/deelnemer/'+T+'/lid',{cookie:member})).kind,'next','API niet omleiden');
}));

test('ledenadres: alleen de ledenapp; de voordeur naar /lid; de rest naar de backoffice',()=>withEnv(LEDEN,()=>{
 const H={host:'leden.example'};
 assert.equal(new URL(proxy(req('/',H)).location).href,'https://leden.example/lid');
 assert.equal(proxy(req('/deelnemer/'+T,{...H,cookie:member})).kind,'next');
 assert.equal(proxy(req('/api/deelnemer/'+T+'/start',{...H,cookie:member})).kind,'next');
 assert.equal(proxy(req('/lid/inloggen',H)).kind,'next');assert.equal(proxy(req('/lid',H)).kind,'next');
 assert.equal(proxy(req('/auth/lid/wachtwoord',{...H,method:'POST'})).kind,'next');
 for(const p of ['/_next/static/x.js','/icons/leden-192.png','/deelnemer-sw.js','/api/deelnemer/'+T+'/manifest'])assert.equal(proxy(req(p,H)).kind,'next',p);
 const r=proxy(req('/leden?x=1',H));assert.equal(new URL(r.location).href,'https://bo.example/leden?x=1','backoffice-scherm: naar de backoffice');
 assert.equal(proxy(req('/api/leden',{...H,method:'POST'})).status,404,'geen backoffice-API op het ledenadres');
 assert.equal(new URL(proxy(req('/deelnemer/'+T,H)).location).origin,'https://leden.example','inloggen voor leden op het ledenadres');
}));

test('herkomst, links en sessie op het ledenadres',()=>withEnv(LEDEN,()=>{
 const post=origin=>new Request('https://leden.example/auth/lid/wachtwoord',{method:'POST',headers:{origin}});
 assert.equal(isSameOrigin(post('https://leden.example')),true);assert.equal(isSameOrigin(post('https://bo.example')),true);assert.equal(isSameOrigin(post('https://evil.example')),false);
 assert.equal(O.memberOrigin(),'https://leden.example');
 assert.match(read('lib/member-account.ts'),/process\.env\.LEDEN_ORIGIN\|\|process\.env\.APP_ORIGIN/,'uitnodiging met de link op het ledenadres');
 assert.match(read('lib/member-auth.ts'),/const origin=memberOrigin\(req\)/);
 for(const f of ['app/auth/lid/google/route.ts','app/auth/lid/terug/route.ts','app/auth/lid/uit/route.ts'])assert.match(read(f),/memberOrigin\(req\)/,f);
 assert.match(read('app/leden/page.tsx'),/const full=memberLink/);// Sinds 15 november 2026 staan de links alleen op de ledenkaart; de winkel kopieert geen links meer.
 assert.doesNotMatch(read('app/winkel/afrekening/portaal.tsx'),/clipboard|link-maken/);
 assert.match(read('app/layout.tsx'),/<meta name="leden-origin" content=\{ledenOrigin\(\)\}\/>/);
}));

// Eigen adressen achter de voordeur (opdracht eigenaar 13 november 2026): backoffice.boerbart.nl, management.boerbart.nl en
// werkstation.boerbart.nl. Zelfde server; het Google-adres blijft werken (tablets en kassa hoeven niet opnieuw gekoppeld).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {register} from 'node:module';
import './helpers/ts-resolve.mjs';
const stub=new URL('./helpers/next-server-stub.mjs',import.meta.url).href;
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){return s==='next/server'?n(${JSON.stringify(stub)},c):n(s,c)}`));
const {proxy}=await import('../proxy.ts');
const O=await import('../lib/member-origin.ts'),L=await import('../lib/login-core.ts'),{isSameOrigin}=await import('../lib/portable/origin.ts');
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const SECRET='s'.repeat(40);
const ENV={SUPABASE_URL:'https://x.supabase.co',SUPABASE_ANON_KEY:'k',AUTH_SECRET:SECRET,APP_ORIGIN:'https://run.example',OFFICE_ORIGIN:'https://backoffice.example',MANAGEMENT_ORIGIN:'https://management.example',WERKSTATION_ORIGIN:'https://werkstation.example',LEDEN_ORIGIN:'https://leden.example'};
function withEnv(fn){const old=Object.fromEntries(Object.keys(ENV).map(k=>[k,process.env[k]]));Object.assign(process.env,ENV);try{return fn()}finally{for(const [k,v] of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v}}}
function req(p,{host='run.example',method='GET',cookie=''}={}){const url=new URL(p,'https://'+host);return {method,url:url.href,nextUrl:url,headers:new Headers({host}),cookies:{get:n=>{const hit=cookie.split('; ').map(x=>x.split('=')).find(([k])=>k===n);return hit?{value:hit.slice(1).join('=')}:undefined}}}}
const owner=()=>{const now=Date.now();return 'bb_sessie='+L.signSession({email:'e@example.nl',name:'E',role:'eigenaar',exp:now+3600000,mfa:now},SECRET)};
const loc=r=>new URL(r.location).href;

test('eigen adressen: bekend, inloggen blijft op het adres waar je begon',()=>withEnv(()=>{
 assert.deepEqual(O.knownOrigins().sort(),['https://backoffice.example','https://leden.example','https://management.example','https://run.example','https://werkstation.example']);
 assert.equal(O.requestOrigin(new Request('https://x/',{headers:{host:'management.example'}})),'https://management.example');
 assert.equal(O.requestOrigin(new Request('https://x/',{headers:{host:'vreemd.example'}})),'https://run.example','onbekend adres: het Google-adres');
 for(const host of ['backoffice.example','management.example'])assert.equal(new URL(proxy(req('/management/gesprekken',{host})).location).origin,'https://'+host,'inloggen op '+host);
 const post=origin=>new Request('https://x/auth/wachtwoord',{method:'POST',headers:{origin}});
 for(const o of ['https://backoffice.example','https://management.example','https://werkstation.example','https://run.example'])assert.equal(isSameOrigin(post(o)),true,o);
 assert.equal(isSameOrigin(post('https://evil.example')),false);
}));

test('management.boerbart.nl: alleen de managementapp; de rest naar de backoffice',()=>withEnv(()=>{
 const H={host:'management.example',cookie:owner()};
 assert.equal(loc(proxy(req('/',H))),'https://management.example/management/gesprekken');
 assert.equal(proxy(req('/management/gesprekken',H)).kind,'next');assert.equal(proxy(req('/api/gesprekken',H)).kind,'next');
 for(const p of ['/inloggen','/gesprekken.webmanifest','/icons/gesprekken-192.png','/_next/static/x.js'])assert.notEqual(proxy(req(p,{host:'management.example'})).status,404,p);
 assert.equal(loc(proxy(req('/financien?x=1',H))),'https://backoffice.example/financien?x=1');
 assert.equal(proxy(req('/auth/lid/wachtwoord',{...H,method:'POST'})).status,404,'geen ledenlogin op het managementadres');
}));

test('werkstation.boerbart.nl: alleen wat een tablet mag, koppelen kan; de rest naar de backoffice',()=>withEnv(()=>{
 const H={host:'werkstation.example'};
 assert.equal(loc(proxy(req('/',H))),'https://werkstation.example/werkplek/kassa');
 assert.equal(proxy(req('/tablet/koppelen',H)).kind,'next');
 assert.notEqual(proxy(req('/werkplek/kassa',H)).status,404);
 assert.equal(loc(proxy(req('/leden',H))),'https://backoffice.example/leden');
 assert.equal(proxy(req('/api/toegang',{...H,method:'POST'})).status,404,'geen beheer op het werkstation-adres');
 assert.match(read('app/api/toegang/tablets/route.ts'),/werkstationOrigin\(\)\|\|process\.env\.APP_ORIGIN/,'nieuwe tablets koppelen op het werkstation-adres');
}));

test('Google-adres en backoffice-adres: zoals altijd',()=>withEnv(()=>{
 assert.equal(proxy(req('/leden',{cookie:owner()})).kind,'next','Google-adres');
 assert.equal(proxy(req('/leden',{host:'backoffice.example',cookie:owner()})).kind,'next','backoffice-adres');
 assert.equal(loc(proxy(req('/deelnemer/'+'a'.repeat(43),{host:'backoffice.example'}))).startsWith('https://leden.example/'),true,'leden naar het ledenadres');
 for(const f of ['app/auth/telefoon/vernieuw/route.ts','app/auth/werkplek/vernieuw/route.ts','app/auth/werkplek/koppelen/route.ts'])assert.match(read(f),/requestOrigin\(req\)/,f);
 assert.match(read('lib/login-flow.ts'),/export const appOrigin=\(req:Request\)=>requestOrigin\(req\)/);
}));

// „Er staat backoffice.boerbart.nl, moet zijn werkstation.boerbart.nl toch?” (13 november 2026)
test('tabletschermen wijzen naar het werkstation-adres; kassa wordt daar de tabletkassa',()=>{
 const s=read('app/werkplekken/screens.tsx');
 assert.match(s,/meta\[name="werkstation-origin"\]/);assert.match(s,/werkstation\?'\/werkplek\/kassa':'\/kassa'/);assert.match(s,/href=\{origin\+p\}/);
 assert.match(read('app/layout.tsx'),/<meta name="werkstation-origin" content=\{werkstationOrigin\(\)\}\/>/);
});

// „De werkstations hoeven geen inlog te hebben” (14 november 2026): een niet-gekoppelde tablet krijgt het koppelscherm.
test('werkstation-adres zonder koppeling: koppelscherm, geen backoffice-inlog',()=>withEnv(()=>{
 for(const p of ['/werkplek/kassa','/werkplek/kok','/opnemen']){const r=proxy(req(p,{host:'werkstation.example'}));assert.equal(r.kind,'redirect',p);assert.equal(new URL(r.location).href,'https://werkstation.example/tablet/koppelen',p)}
 assert.equal(proxy(req('/tablet/koppelen',{host:'werkstation.example'})).kind,'next');
 assert.equal(new URL(proxy(req('/leden')).location).pathname,'/inloggen','elders: gewoon inloggen');
}));

// Alle deuren van de ledenapp op één plek (opdracht eigenaar 13 november 2026: „Geen onnodige routes?”). De lijst in
// lib/member-routes.ts moet precies de echte mappen onder app/api/deelnemer/[token] volgen: geen gat (zoals /speelboerderij,
// waar leden „log opnieuw in” kregen) en geen deur naar niets.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './helpers/ts-resolve.mjs';
const {MEMBER_API,MEMBER_DOCUMENTS,memberRoute}=await import('../lib/member-routes.ts');
const {memberArea}=await import('../lib/member-session-core.ts');
const T='A'.repeat(43),ID='0b8f6c1e-1111-4222-8333-944455556666';
test('lijst = echte mappen onder app/api/deelnemer/[token]',()=>{
 const dirs=fs.readdirSync(new URL('../app/api/deelnemer/[token]/',import.meta.url),{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name).sort();
 assert.deepEqual([...MEMBER_API].sort(),dirs);
 for(const d of MEMBER_DOCUMENTS)assert.ok(fs.existsSync(new URL(`../app/api/deelnemer/[token]/${d}/[[...id]]/route.ts`,import.meta.url)));
});
test('ledenapp open zonder backoffice-login, al het andere niet',()=>{
 for(const name of MEMBER_API){assert.equal(memberRoute(`/api/deelnemer/${T}/${name}`,'GET'),true,name);assert.equal(memberRoute(`/api/deelnemer/${T}/${name}`,'POST'),true,name)}
 assert.equal(memberRoute(`/api/deelnemer/${T}/speelboerderij`,'GET'),true,'het gat van vóór 13 november');
 assert.equal(memberRoute(`/api/deelnemer/${T}`,'GET'),true);assert.equal(memberRoute(`/deelnemer/${T}`,'GET'),true);assert.equal(memberRoute(`/deelnemer/${T}/afspraken`,'GET'),true);
 assert.equal(memberRoute(`/deelnemer/${T}`,'POST'),false,'de pagina alleen lezen');
 assert.equal(memberRoute(`/api/deelnemer/${T}/documenten/${ID}`,'GET'),true);assert.equal(memberRoute(`/api/deelnemer/${T}/documenten/${ID}`,'POST'),false);
 assert.equal(memberRoute(`/api/deelnemer/${T}/lid/${ID}`,'GET'),false,'alleen documenten hebben een id erachter');
 assert.equal(memberRoute(`/api/deelnemer/${T}/bestaat-niet`,'GET'),false);assert.equal(memberRoute(`/api/deelnemer/kort/lid`,'GET'),false);
 assert.equal(memberRoute('/auth/lid/wachtwoord','POST'),true);assert.equal(memberRoute('/auth/lid/wachtwoord','GET'),false);
 assert.equal(memberRoute('/lid/inloggen','GET'),true);assert.equal(memberRoute('/auth/lid/terug','GET'),true);assert.equal(memberRoute('/deelnemer-sw.js','GET'),true);
 for(const p of ['/leden','/api/leden','/financien','/auth/wachtwoord','/','/management/gesprekken'])assert.equal(memberRoute(p,'GET'),false,p);
});
test('elke deur onder de persoonlijke link vraagt een ledensessie (behalve het manifest voor het startscherm)',()=>{
 for(const name of MEMBER_API){const a=memberArea(`/api/deelnemer/${T}/${name}`);if(name==='manifest')assert.equal(a,null);else assert.deepEqual(a,{token:T,api:true},name)}
 assert.deepEqual(memberArea(`/api/deelnemer/${T}/documenten/${ID}`),{token:T,api:true});assert.deepEqual(memberArea(`/deelnemer/${T}`),{token:T,api:false});
});
test('proxy.ts gebruikt de lijst en heeft geen losse ledenregels meer',()=>{
 const p=fs.readFileSync(new URL('../proxy.ts',import.meta.url),'utf8');
 assert.match(p,/if\(memberRoute\(request\.nextUrl\.pathname,request\.method\)\)/);
 assert.doesNotMatch(p,/\\\/api\\\/deelnemer/,'geen eigen patroon voor /api/deelnemer in proxy.ts');assert.doesNotMatch(p,/auth\\\/lid/);
});

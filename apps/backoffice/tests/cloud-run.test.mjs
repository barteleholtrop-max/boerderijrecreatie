// Backoffice op Cloud Run (besluit eigenaar 7 november 2026): Dockerfile en de deur voor het werkproces (Cloud Scheduler).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './helpers/ts-resolve.mjs';
const {workerKeyOk,workerConfigured}=await import('../lib/worker-key.ts');
const read=p=>fs.readFileSync(new URL('../../../'+p,import.meta.url),'utf8');

test('werkproces-sleutel: zonder instelling of met een te korte sleutel altijd dicht; alleen de juiste sleutel opent',()=>{
 const s='een-geheim-van-minstens-tweeendertig-tekens-lang';
 assert.equal(workerConfigured(undefined),false);assert.equal(workerConfigured('kort'),false);assert.equal(workerConfigured(s),true);
 assert.equal(workerKeyOk(s,s),true);assert.equal(workerKeyOk('fout',s),false);assert.equal(workerKeyOk(null,s),false);
 assert.equal(workerKeyOk('kort','kort'),false,'te korte sleutel telt niet');assert.equal(workerKeyOk(s,undefined),false);
});

test('de deur laat alleen POST zonder login door; de route zelf controleert de sleutel',()=>{
 const p=read('apps/backoffice/proxy.ts');assert.match(p,/pathname==='\/api\/werkproces\/ronde'&&request\.method==='POST'/);
 const r=read('apps/backoffice/app/api/werkproces/ronde/route.ts');assert.match(r,/workerKeyOk\(req\.headers\.get\('x-werkproces-sleutel'\)\)/);assert.doesNotMatch(r,/export async function GET/);
});

test('Dockerfile: zelfstandige server op poort 8080, niets blijvend op de schijf, geen geheimen in het beeld',()=>{
 const d=read('Dockerfile'),ig=read('.dockerignore');
 assert.match(d,/npm run build/);assert.match(d,/PORT=8080/);assert.match(d,/APP_DATA_DIR=\/tmp\/boerbart/);assert.match(d,/USER node/);assert.match(d,/CMD \["node","server\.js"\]/);
 for(const x of ['.git','**/node_modules','**/.env.local','var'])assert.ok(ig.split('\n').includes(x),x);
});

test('websites op Cloud Run: één image per website, alleen de openbare deur naar de backoffice, proefadressen niet in Google',()=>{
 const d=read('deploy/website/Dockerfile'),n=read('deploy/website/nginx.conf.template');
 assert.match(d,/ARG SITE=website/);assert.match(d,/FROM site-\$\{SITE\} AS site/);
 assert.match(n,/listen \$\{PORT\};/);
 assert.match(n,/add_header X-Robots-Tag \$robots_tag always;/);assert.match(n,/map \$host \$robots_tag \{\n\s+~\*\\\.run\\\.app\$ "noindex, nofollow";/);
 assert.match(n,/location ~ \^\/\(api\/public\/\|brand\\.css\$\)/);
 assert.match(n,/proxy_set_header Cookie "";/,'geen cookies van de website naar de backoffice');
 assert.doesNotMatch(n,/location \/api\/ /,'de rest van de backoffice blijft dicht');
});

// Demolink (wens eigenaar 9 november 2026): de ledendemo naar anderen sturen, zonder inloggen, maar vernieuwbaar en met een einddatum.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import './helpers/ts-resolve.mjs';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
test('nieuwe link werkt; vervangen, verlopen of intrekken maakt hem ongeldig; alleen de hash staat in de database',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-demolink-'));process.env.APP_DATA_DIR=dir;process.env.DATABASE_URL='';process.env.SHEETS_CONFIG_KEY='cd'.repeat(32);
 const {env,closeDatabase}=await import('../lib/portable/env.ts'),L=await import('../lib/demo-link.ts');
 t.after(async()=>{await closeDatabase();fs.rmSync(dir,{recursive:true,force:true})});
 assert.equal((await L.demoLinkStatus()).active,false);
 await assert.rejects(()=>L.newDemoLink(0,'Bartele'),/1 tot en met 30/);await assert.rejects(()=>L.newDemoLink(31,'Bartele'),/1 tot en met 30/);
 const now=new Date('2026-11-09T10:00:00Z'),a=await L.newDemoLink(7,'Bartele',now);
 assert.match(a.path,/^\/proef\/[A-Za-z0-9_-]{43}$/);assert.equal(a.expires,'2026-11-16T10:00:00.000Z');
 assert.equal(await L.demoLinkValid(a.token,now),true);assert.equal(await L.demoLinkValid('x'.repeat(43),now),false);assert.equal(await L.demoLinkValid('kort',now),false);
 const row=await env.DB.prepare("SELECT * FROM demo_links WHERE id='main'").first();assert.ok(!JSON.stringify(row).includes(a.token),'de code zelf wordt niet bewaard');
 assert.equal(await L.demoLinkValid(a.token,new Date('2026-11-16T10:00:01Z')),false,'na 7 dagen verlopen');
 const b=await L.newDemoLink(3,'Rianne',now);assert.equal(await L.demoLinkValid(a.token,now),false,'de vorige link werkt niet meer');assert.equal(await L.demoLinkValid(b.token,now),true);
 await L.revokeDemoLink(now);assert.equal(await L.demoLinkValid(b.token,now),false);assert.equal((await L.demoLinkStatus(now)).active,false);
});
test('toegang: /proef/<code> alleen GET zonder inloggen; beheren alleen in de backoffice; demo onderschept ook /proef',()=>{
 const proxy=read('proxy.ts');assert.match(proxy,/\/\^\\\/proef\\\/\[A-Za-z0-9_-\]\{43\}\$\/\.test\(request\.nextUrl\.pathname\)&&request\.method==='GET'/);
 const api=read('app/api/demolink/route.ts');assert.match(api,/authorizeSheet\(req\)/);assert.match(api,/authorizeSheet\(req,true\)/);
 const page=read('app/proef/[token]/page.tsx');assert.match(page,/demoLinkValid\(token\)/);assert.match(page,/werkt niet \(meer\)/);
 const demo=read('app/deelnemer/[token]/demo.ts');assert.match(demo,/deelnemer\\\/demo\|proef\\\/\[A-Za-z0-9_-\]\{43\}/);
 for(const k of ["case 'omwisselen'","sub==='vraag'","case 'potbeheer':return [200,potbeheer()]","case 'tegoed':return [200,tegoed()]","sub==='product'"])assert.ok(demo.includes(k),'demo heeft '+k);
});
test('demo: de coöperatie houdt 15% in, de leverancier krijgt 85% (wens eigenaar 9 november 2026)',()=>{
 const src=fs.readFileSync(new URL('../app/deelnemer/[token]/demo.ts',import.meta.url),'utf8');
 assert.match(src,/share:\{percentBp:1500,vatInclusive:false\}/);
});

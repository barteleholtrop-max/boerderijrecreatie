// Website & uitstraling → Websites bekijken en testen (wens eigenaar 6 november 2026).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './helpers/ts-resolve.mjs';
const {sites,WEBSITE_PAGES,FAB_PAGES,FAB_URL}=await import('../lib/website-links.ts');
const root=new URL('../../../',import.meta.url);

test('adressen: nieuwe website op Cloud Run (boerbart-website-fab), huidige website uit PUBLIC_ORDER_ORIGINS; op deze computer de lokale poorten',()=>{
 let [fab,site]=sites(['https://boerbart-website-fab-206627521194.europe-west3.run.app','https://boerbart-website-206627521194.europe-west3.run.app'],{});
 assert.equal(fab.url,FAB_URL);assert.equal(site.url,'https://boerbart-website-206627521194.europe-west3.run.app');
 [fab,site]=sites(['https://boerbart-website-fab-206627521194.europe-west3.run.app'],{});assert.equal(site.url,null,'nog niet online');
 [fab,site]=sites(['http://localhost:3002','http://127.0.0.1:3002','http://localhost:3003','http://localhost:3004'],{});
 assert.equal(fab.url,'http://localhost:3004');assert.equal(site.url,'http://localhost:3002');
 [fab,site]=sites([],{WEBSITE_URL:'https://www.boerbart.nl/pad',WEBSITE_FAB_URL:'https://nieuw.boerbart.nl'});
 assert.equal(fab.url,'https://nieuw.boerbart.nl');assert.equal(site.url,'https://www.boerbart.nl');
 assert.equal(sites([],{WEBSITE_URL:'javascript:alert(1)'})[1].url,null,'alleen http(s)-adressen');
});

test('de paginalijsten kloppen met de echte websites (geen verouderde of ontbrekende pagina)',()=>{
 const html=fs.readdirSync(new URL('apps/website/',root)).filter(f=>f.endsWith('.html')).map(f=>f==='index.html'?'/':'/'+f).sort();
 assert.deepEqual(WEBSITE_PAGES.map(p=>p.path).sort(),html);
 const routes=fs.readFileSync(new URL('apps/website-fab/src/routes.ts',root),'utf8');
 const paths=[...routes.slice(routes.indexOf('export const paths'),routes.indexOf('};',routes.indexOf('export const paths'))).matchAll(/:\s*"(\/[^"]*)"/g)].map(m=>m[1]);
 assert.deepEqual(FAB_PAGES.map(p=>p.path).filter(p=>p!=='/bestellen/').sort(),[...paths].sort());
});

test('op de pagina Website & uitstraling, in een nieuw tabblad',()=>{
 assert.match(fs.readFileSync(new URL('../app/website/page.tsx',import.meta.url),'utf8'),/<WebsiteLinks\/>/);
 assert.match(fs.readFileSync(new URL('../app/website/links.tsx',import.meta.url),'utf8'),/target="_blank" rel="noopener"/);
});

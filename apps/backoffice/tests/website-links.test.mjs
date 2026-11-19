// Website & uitstraling → Websites bekijken en testen.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './helpers/ts-resolve.mjs';
const {sites,WEBSITE_PAGES}=await import('../lib/website-links.ts');
const root=new URL('../../../',import.meta.url);

test('adres: WEBSITE_URL, anders het websiteadres uit PUBLIC_ORDER_ORIGINS; alleen http(s)',()=>{
 assert.equal(sites(['https://website.example.run.app'],{})[0].url,'https://website.example.run.app');
 assert.equal(sites([],{})[0].url,null,'nog niet online');
 assert.equal(sites(['http://localhost:3002','http://127.0.0.1:3002'],{})[0].url,'http://localhost:3002');
 assert.equal(sites([],{WEBSITE_URL:'https://www.example.nl/pad'})[0].url,'https://www.example.nl');
 assert.equal(sites([],{WEBSITE_URL:'javascript:alert(1)'})[0].url,null,'alleen http(s)-adressen');
});

test('de paginalijst klopt met de echte website (geen verouderde of ontbrekende pagina)',()=>{
 const html=fs.readdirSync(new URL('apps/website/',root)).filter(f=>f.endsWith('.html')).map(f=>f==='index.html'?'/':'/'+f).sort();
 assert.deepEqual(WEBSITE_PAGES.map(p=>p.path).sort(),html);
});

test('op de pagina Website & uitstraling, in een nieuw tabblad',()=>{
 assert.match(fs.readFileSync(new URL('../app/website/page.tsx',import.meta.url),'utf8'),/<WebsiteLinks\/>/);
 assert.match(fs.readFileSync(new URL('../app/website/links.tsx',import.meta.url),'utf8'),/target="_blank" rel="noopener"/);
});

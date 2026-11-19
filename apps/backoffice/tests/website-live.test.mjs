// De nieuwe site live zetten en Wix op pauze (opdracht eigenaar 15 november 2026, docs/OVERSTAP-WIX.md).
// Bewaakt: tarieven komen uit Bedrijfsgegevens (geen vaste prijzen in de site, leeg = geen prijs), oude Wix-adressen sturen
// door naar pagina's die echt bestaan, Google alleen op boerbart.nl, en de schakelaar „live” staat bewust aan of uit.
import './helpers/ts-resolve.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const {contactSchema,PRICE_KEYS}=await import('../lib/guest-core.ts');
const {publicPrices}=await import('../lib/guest-public.ts');
const {euroText,applyAvailability}=await import('../../website-fab/src/content/live.ts');
const {prices}=await import('../../website-fab/src/content/site.ts');
const read=p=>fs.readFileSync(new URL('../../../'+p,import.meta.url),'utf8');

test('tarieven: bedrag in euro, leeg mag, onzin niet; naar de website in centen',()=>{
 const base={phone:'',email:'',whatsapp:''};
 const c=contactSchema.parse({...base,priceEntreeKind:'9',priceIte:'62,50',priceKinderfeest:'14.00',priceJaarlid:'110'});
 assert.equal(c.priceJaarlid,undefined,'lidmaatschap coöperatie vervallen (besluit eigenaar 15 november 2026)');
 assert.equal(c.priceEntreeKind,'9');assert.equal(c.priceSchoolreisje,'');
 for(const bad of ['€9','9 euro','-3','12345','1,234'])assert.throws(()=>contactSchema.parse({...base,priceEntreeKind:bad}),/bedrag in euro/,bad);
 assert.deepEqual(publicPrices({contact:c}),{entreeKind:900,kinderfeest:1400,schoolreisje:null,ite:6250});
 assert.deepEqual(publicPrices({}),{entreeKind:null,kinderfeest:null,schoolreisje:null,ite:null});
 assert.equal(PRICE_KEYS.length,4);
});

test('website: prijzen alleen uit de backoffice; niet ingevuld = geen prijs',()=>{
 assert.equal(euroText(900),'€ 9');assert.equal(euroText(6250),'€ 62,50');assert.equal(euroText(null),'');assert.equal(euroText(-1),'');assert.equal(euroText(9.5),'');
 assert.deepEqual(Object.values(prices),['','','',''],'geen vaste prijzen in de site');
 applyAvailability({prices:{entreeKind:900,kinderfeest:1400,schoolreisje:null,ite:6250}});
 assert.deepEqual({...prices},{entreeKind:'€ 9',kinderfeest:'€ 14',schoolreisje:'',yte:'€ 62,50'});
 applyAvailability({});assert.deepEqual(Object.values(prices),['','','',''],'niet te laden: geen oude prijs laten staan');
 // Geen lidmaatschap meer voor gasten op de site (besluit eigenaar 15 november 2026).
 for(const f of ['src/pages/Home.tsx','src/pages/Contact.tsx','scripts/prerender.mjs'])assert.doesNotMatch(read('apps/website-fab/'+f),/proeflid|jaarlid|Word lid|onderwerp=lid|price: "\d/i,f);
 // Geen euro-bedrag meer vast in de bronbestanden van de site.
 for(const f of fs.readdirSync(new URL('../../website-fab/src/pages/',import.meta.url)))assert.doesNotMatch(read('apps/website-fab/src/pages/'+f),/€ ?\d/,f);
 assert.doesNotMatch(read('apps/website-fab/src/content/site.ts'),/€ ?\d/);
});

test('oude Wix-adressen sturen door naar pagina\'s die bestaan; Google alleen op boerbart.nl',()=>{
 const conf=read('deploy/website/nginx.conf.template');
 const routes=read('apps/website-fab/src/routes.ts');
 const map=conf.slice(conf.indexOf('map $uri $oud_wix {'),conf.indexOf('}',conf.indexOf('map $uri $oud_wix {')));
 const targets=[...map.matchAll(/^\s+\S+ (\/[^\s;#]*)(#[^;]*)?;$/gm)].map(m=>m[1]);
 assert.ok(targets.length>40,'alle oude pagina\'s staan erin');
 for(const t of new Set(targets))assert.ok(t==='/bestellen/'||routes.includes(`"${t}"`),'doel bestaat niet op de nieuwe site: '+t);
 // De coöperatie staat niet meer op de site (besluit eigenaar 15 november 2026): pagina en menu weg, het adres stuurt door.
 assert.ok(!routes.includes('cooperatie'),'geen coöperatiepagina meer');assert.match(map,/^\s+\/cooperatie\/ \/over-ons\/;$/m);
 assert.doesNotMatch(read('apps/website-fab/src/content/site.ts'),/"cooperatie"/,'niet meer in het menu');
 for(const oud of ['/blog','/overons','/kinderfeest','/schoolreisje','/menu','/contact','/vragen','/privacybeleid','/speelboerderij','/winkel','/boerbartcooperatie','/jerseys'])
  assert.match(map,new RegExp('^\\s+'+oud.replace('/','\\/')+' ','m'),oud);
 assert.match(map,/~\^\/post\/\(\[\^\/\]\+\)\$ \/nieuws\/#\$1;/,'oude blogs naar het nieuwsbericht');
 assert.match(map,/~\^\/rondleiding\(\/\|\$\) \/speelboerderij\/;/,'rondleiding tijdelijk naar de speelboerderij (besluit eigenaar)');
 assert.match(conf,/map \$host \$robots_tag \{\n\s+~\*\^\(www\\\.\)\?boerbart\\\.nl\$ "all";\n(\s+~\*\^cooperatie\\\.boerbart\\\.nl\$ "all";\n)?\s+default "noindex, nofollow";/);
 assert.match(conf,/add_header X-Robots-Tag \$robots_tag always;/);
 assert.match(conf,/if \(\$host ~\* "\^boerbart\\\.nl\$"\) \{ return 301 https:\/\/www\.boerbart\.nl\$request_uri; \}/);
 assert.match(conf,/if \(!-f \$document_root\/nieuws\/index\.html\) \{ set \$doorsturen ""; \}/,'de huidige eigen site stuurt niet door');
});

test('de schakelaar live staat bewust aan of uit',()=>{
 const live=JSON.parse(read('apps/website-fab/live.json'));
 assert.equal(typeof live.live,'boolean');
 assert.match(read('apps/website-fab/vite.config.ts'),/live\.json/);
});

test('Bloei op cooperatie.boerbart.nl: alleen Bloei daar, de hoofdsite stuurt Bloei door (wens eigenaar 16 november 2026)',()=>{
 const conf=read('deploy/website/nginx.conf.template');
 assert.match(conf,/~\*\^cooperatie\\\.boerbart\\\.nl\$ "all";/,'Google mag het coöperatie-adres vinden');
 const niet=conf.slice(conf.indexOf('map $uri $niet_bloei {'),conf.indexOf('}',conf.indexOf('map $uri $niet_bloei {')));
 assert.match(niet,/default 1;/);assert.match(niet,/^\s+\/ 0;$/m,'het hoofdadres zelf blijft (naar de Bloeimarkt)');
 assert.match(niet,/\(mijn-bloei\|bloeimarkt\)/);assert.match(niet,/\^\/api\/public\/ 0;/,'de Bloeimarkt praat met de backoffice');
 assert.match(niet,/bloei-proef/,'Mijn Bloei laadt het ledenonderdeel');
 assert.match(conf,/if \(\$naar_hoofdsite\) \{ return 301 https:\/\/www\.boerbart\.nl\$request_uri; \}/);
 assert.match(conf,/if \(\$naar_cooperatie\) \{ return 301 https:\/\/cooperatie\.boerbart\.nl\$request_uri; \}/);
 assert.match(conf,/~\*\^\(www\\\.\)\?boerbart\\\.nl\\\|\/\(mijn-bloei\|bloeimarkt\)\(\/\|\$\) 1;/);
 assert.match(conf,/if \(\$host ~\* "\^cooperatie\\\."\) \{ return 302 \/bloeimarkt\/; \}/,'voorlopig de Bloeimarkt als startpagina (tijdelijk)');
 // Site: geen Bloeimarkt meer in het hoofdmenu; op het coöperatie-adres alleen het Bloei-menu.
 assert.doesNotMatch(read('apps/website-fab/src/content/site.ts'),/"markt"/);
 const layout=read('apps/website-fab/src/components/Layout.tsx');
 assert.match(layout,/if \(coop\) return ledenMenu;/);assert.match(layout,/bloeiHref\(paths\.bloei, hoofdsite\)/);
 assert.match(read('apps/website-fab/scripts/prerender.mjs'),/r\.page !== "bloei" && r\.page !== "markt"/,'niet in de sitemap van www');
});

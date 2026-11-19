// Websites ↔ online backoffice via de doorsturing van nginx op Cloud Run (besluit eigenaar 7 november 2026, docs/CLOUD-RUN.md).
// Netlify is weg (besluit eigenaar 8 november 2026); deze test vervangt de oude Netlify-test en bewaakt dezelfde grens.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../../../'+p,import.meta.url),'utf8');

test('beide websites sturen alleen de openbare deur en de gedeelde Bloei-bestanden door naar de backoffice',()=>{
 const conf=read('deploy/website/nginx.conf.template');
 const proxied=[...conf.matchAll(/location ([^{]+)\{[^}]*proxy_pass/g)].map(m=>m[1].trim());
 assert.deepEqual(proxied,['~ ^/(api/public/|brand\\.css$|bloei-proef\\.css$|bloei-proef\\.js$|bloei-xlsx\\.js$)']);
 assert.equal((conf.match(/proxy_pass/g)||[]).length,1,'nooit de hele backoffice doorsturen');
 assert.match(conf,/proxy_set_header Cookie "";/,'geen inlogcookies naar de backoffice');
 for(const f of ['brand.css','bloei-proef.css','bloei-proef.js','bloei-xlsx.js'])assert.ok(fs.existsSync(new URL('../public/'+f,import.meta.url)),f);
});
test('geen Netlify meer in de repo',()=>{
 for(const f of ['netlify.toml','apps/website/_redirects','apps/website-fab/public/_redirects','apps/website-fab/public/__forms.html'])assert.ok(!fs.existsSync(new URL('../../../'+f,import.meta.url)),f);
});
test('de bestelpagina heeft geen vast backoffice-adres nodig',()=>{
 assert.match(read('apps/website/bestellen.html'),/<meta name="boerbart-backoffice" content="">/);
});
test('de gedeelde Bloei-bestanden zijn zonder login te lezen (alleen GET), de Bloei-gegevens niet',()=>{
 const p=fs.readFileSync(new URL('../proxy.ts',import.meta.url),'utf8');
 assert.match(p,/'\/bloei-proef\.js','\/bloei-proef\.css','\/bloei-xlsx\.js'\];/);
 assert.doesNotMatch(p.match(/const publicPaths=\[[^\]]*\]/)[0],/\/api\/public\/bloei'/);
});

// Eigen adressen (13 november 2026, docs/VOORDEUR.md): zelfscankassa.boerbart.nl opent meteen de zelfscan, de rest blijft gelijk.
test('voorpagina per adres: zelfscan en zelfkassa direct, anders de gewone voorpagina',()=>{
 const conf=fs.readFileSync(new URL('../../../deploy/website/nginx.conf.template',import.meta.url),'utf8');
 assert.match(conf,/location = \/ \{\n    if \(\$host ~\* "\^zelfscan\(kassa\)\?\\\."\) \{ return 302 \/zelfscan\.html; \}/);
 assert.match(conf,/if \(\$host ~\* "\^zelfkassa\\\."\) \{ return 302 \/zelfkassa\.html; \}/);
 assert.match(conf,/try_files \/index\.html =404;/);
});

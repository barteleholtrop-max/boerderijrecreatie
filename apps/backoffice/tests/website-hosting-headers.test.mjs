// Beveiligingskoppen van de websites (hoofdsite en gast-apps). Eerst stonden ze in hosting/firebase.json, dat niet
// meer gebruikt werd; bij het opruimen (15 november 2026, docs/SITES.md) zijn ze verhuisd naar de nginx-instelling
// die echt online draait (deploy/website/nginx.conf.template). De bestel- en betaalpagina mag niet in een frame van
// een andere site (klikkapen), bestanden worden niet geraden als ander type, en ?rekening= / ?deel= / ?bestelling=
// reizen niet mee als Referer.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const conf=fs.readFileSync(new URL('../../../deploy/website/nginx.conf.template',import.meta.url),'utf8');
const serverBlock=conf.slice(conf.indexOf('server {'));

test('alle bestanden: geen frames van buiten, nosniff, camera alleen voor de eigen pagina',()=>{
 assert.match(serverBlock,/add_header X-Content-Type-Options nosniff always;/);
 assert.match(serverBlock,/add_header X-Frame-Options DENY always;/);
 assert.match(serverBlock,/add_header Content-Security-Policy "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" always;/);
 // Camera alleen voor de eigen website (besluit eigenaar 5 november 2026): QR-code van de rekeninghouder scannen op de bestelpagina.
 assert.match(serverBlock,/add_header Permissions-Policy "camera=\(self\), microphone=\(\), geolocation=\(\), payment=\(\)" always;/);
});

test('bestel- en oogstpagina: geen Referer (beheerlink en betaalverzoek staan in de URL), ook /bestellen/ op de hoofdsite',()=>{
 assert.match(serverBlock,/add_header Referrer-Policy \$referrer_beleid always;/);
 const map=conf.slice(conf.indexOf('map $uri $referrer_beleid'),conf.indexOf('}',conf.indexOf('map $uri $referrer_beleid')));
 assert.match(map,/~\^\/\(bestellen\\\.html\|bestellen\/\|abonnementen\\\.html\) no-referrer;/);
 assert.match(map,/default strict-origin-when-cross-origin;/);
});

test('HTML zonder cache, de oogstpagina helemaal niet bewaren',()=>{
 assert.match(serverBlock,/add_header Cache-Control \$cache_beleid always;/);
 const map=conf.slice(conf.indexOf('map $uri $cache_beleid'),conf.indexOf('}',conf.indexOf('map $uri $cache_beleid')));
 assert.match(map,/\/abonnementen\.html no-store;/);
 assert.match(map,/~\\\.html\$ no-cache;/);
});

test('geen add_header binnen een location: dan zouden de koppen hierboven daar wegvallen',()=>{
 const locations=[...serverBlock.matchAll(/location[^{]*\{([\s\S]*?)\n  \}/g)].map(m=>m[1]);
 for(const body of locations) assert.doesNotMatch(body,/add_header/);
});

test('de oude Firebase-instelling is weg; nginx is de enige bron',()=>{
 assert.equal(fs.existsSync(new URL('../../../hosting/firebase.json',import.meta.url)),false);
});

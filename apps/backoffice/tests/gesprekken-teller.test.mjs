// Bolletje in de app Management (wens eigenaar 18 november 2026): hoeveel gesprekken op ons wachten.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './helpers/ts-resolve.mjs';
const {isWaiting,chatWaits}=await import('../lib/gesprekken-teller-core.ts');
const {allowed}=await import('../lib/onderdelen.ts');
const {telefoonAllowed}=await import('../lib/telefoon-pas-core.ts');
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');

test('telling: zelfde als het filter Wacht op ons',()=>{
 assert.deepEqual(['klant-wacht','opnieuw-open','wij-wachten','afgehandeld'].map(isWaiting),[true,true,false,false]);
 assert.deepEqual(['nieuw','in behandeling','wacht op gast','afgehandeld'].map(chatWaits),[true,true,false,false]);
});

test('toegang: managerapp (ook met de telefoonpas) en Gasten mogen het getal lezen, anderen niet',()=>{
 assert.equal(telefoonAllowed('/api/gesprekken/teller','GET'),true);
 assert.equal(allowed('medewerker',['gasten'],'/api/gesprekken/teller','GET'),true);
 assert.equal(allowed('medewerker',['planning'],'/api/gesprekken/teller','GET'),false);
});

test('scherm: bolletje op Gesprekken, elke minuut bijgewerkt, ook op het app-icoon',()=>{
 const ui=read('app/telefoon-app.tsx');
 assert.match(ui,/\/api\/gesprekken\/teller/);
 assert.match(ui,/className="tapp-badge"/);
 assert.match(ui,/,60000\)/);
 assert.match(ui,/setAppBadge/);
 assert.match(read('app/api/gesprekken/teller/route.ts'),/who\(req\)/,'zelfde rechten als Gesprekken');
});

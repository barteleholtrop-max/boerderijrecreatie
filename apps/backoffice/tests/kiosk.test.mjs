import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './helpers/ts-resolve.mjs';
const K=await import('../lib/kiosk-core.ts');
test('vriendelijke teksten per werkplek, rustig wisselend',()=>{
 for(const s of ['kok','barista','winkel']){assert.ok(K.cheer(s,new Date('2026-11-03T10:00:00Z')).length>5);assert.equal(K.cheer(s,new Date('2026-11-03T10:01:00Z')),K.cheer(s,new Date('2026-11-03T10:14:00Z')))}
 assert.equal(K.cheer('kok',new Date(0)),'Hey talent, lekker bezig!');
 assert.equal(K.greeting(new Date('2026-11-03T08:00:00Z')),'Goedemorgen');assert.equal(K.greeting(new Date('2026-11-03T13:00:00Z')),'Goedemiddag');assert.equal(K.greeting(new Date('2026-11-03T19:00:00Z')),'Goedenavond');
 assert.equal(K.doneText(0,'kok'),'');assert.match(K.doneText(1,'barista'),/1 drankje/);assert.match(K.doneText(5,'kok'),/5 gerechten klaar/);
 assert.equal(K.isStation('kok'),true);assert.equal(K.isStation('toString'),false);
});
test('wachttijd en kleur',()=>{
 const t=Date.parse('2026-11-03T10:00:00Z');
 assert.deepEqual(K.waiting('2026-11-03T10:00:00Z',t+20000),{min:0,text:'net binnen',level:'ok'});
 assert.deepEqual(K.waiting('2026-11-03T10:00:00Z',t+16*60000),{min:16,text:'16 min',level:'let-op'});
 assert.deepEqual(K.waiting('2026-11-03T10:00:00Z',t+65*60000),{min:65,text:'1 uur 5 min',level:'laat'});
});
test('tafels: namen verplicht, uniek, maximaal 100',()=>{
 assert.deepEqual(K.cleanTables([{name:' Terras  2 ',active:true},{name:'Serre',active:false}]),[{name:'Terras 2',active:true},{name:'Serre',active:false}]);
 assert.throws(()=>K.cleanTables([{name:'Tafel 1',active:true},{name:'tafel 1',active:true}]),/twee keer/);
 assert.throws(()=>K.cleanTables([{name:'',active:true}]));assert.throws(()=>K.cleanTables('x'));
 assert.throws(()=>K.cleanTables(Array.from({length:101},(_,i)=>({name:'T'+i,active:true}))));
 assert.equal(K.defaultTables().length,12);
});

test('werkplekteksten: complimenten en verrassingen, nooit zwaar (wens eigenaar 3 november 2026)',()=>{
 const all=K.ALL_TEXTS();
 assert.ok(all.length>=30);
 for(const t of all)assert.doesNotMatch(t,/rustig aan|ademhal|zwaar|druk|moe\b|pauze|komt goed|stress|haast/i,t);
 assert.ok(all.some(t=>/Jij gaat lekker/.test(t)),'de wens van de eigenaar staat erin');
 for(const s of ['kok','barista','winkel']){const a=K.emptyText(s,new Date('2026-11-03T10:00:00Z'));assert.ok(a.length>5);assert.equal(a,K.emptyText(s,new Date('2026-11-03T10:05:00Z')),'wisselt per kwartier, niet bij elke verversing')}
});

test('vegen tussen tabletschermen: naar links = volgende, naar rechts = vorige, aan het eind stopt het',()=>{
 assert.deepEqual(K.KIOSK_SCREENS.map(s=>s.id),['kok','barista','winkel','opnemen','kassa','voorraad','team','dagplanning']);
 // De kassa is een eigen werkplekscherm, geen snelkoppeling naar de backoffice (besluit eigenaar 4 november 2026).
 assert.ok(K.KIOSK_SCREENS.every(s=>s.href==='/opnemen'||s.href.startsWith('/werkplek/')),'alle werkplekschermen buiten de backoffice');
 assert.equal(K.swipeTarget('barista',-120),'/werkplek/winkel');
 assert.equal(K.swipeTarget('barista',120),'/werkplek/kok');
 assert.equal(K.swipeTarget('winkel',-120),'/opnemen');
 assert.equal(K.swipeTarget('kassa',-120),'/werkplek/voorraad');assert.equal(K.swipeTarget('voorraad',-120),'/werkplek/team');assert.equal(K.swipeTarget('team',-120),'/werkplek/dagplanning');assert.equal(K.swipeTarget('dagplanning',-120),null);assert.equal(K.swipeTarget('kok',120),null);
});
test('wisselen tussen werkplekschermen laadt de pagina helemaal opnieuw (wens eigenaar 15 november 2026: knoppen bleven deels groen)',()=>{
 const nav=fs.readFileSync(new URL('../app/werkplek/nav.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(nav,/next\/link|router\.push/,'geen wissel binnen de pagina');
 assert.match(nav,/<a key=\{s\.id\} href=\{s\.href\}/);assert.match(nav,/window\.location\.assign\(to\)/);
});

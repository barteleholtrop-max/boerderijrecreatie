// Assistenten in WhatsApp-stijl (wens eigenaar 9 november 2026): **vet** en lijstjes netjes, zonder HTML uit het bericht.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './helpers/ts-resolve.mjs';
const F=await import('../lib/chat-format.ts');
test('vet, lijstjes en alinea\'s uit het antwoord van de assistent',()=>{
 const b=F.blocks('Je kunt kijken bij:\n- **Overzicht → Managementdashboard**\n- **Gasten → Planning en reserveringen**, bij de agenda\n\nStaat hij daar niet?\n1. eerst dit\n2. dan dat');
 assert.deepEqual(b.map(x=>x.kind),['p','ul','p','ol']);
 assert.deepEqual(b[1].lines[0],[{text:'Overzicht → Managementdashboard',bold:true}]);
 assert.deepEqual(b[1].lines[1],[{text:'Gasten → Planning en reserveringen',bold:true},{text:', bij de agenda',bold:false}]);
 assert.equal(b[3].lines.length,2);
});
test('een losse ** blijft staan; HTML blijft gewone tekst',()=>{
 assert.deepEqual(F.pieces('5 ** 3'),[{text:'5 ** 3',bold:false}]);
 assert.deepEqual(F.blocks('<img src=x onerror=alert(1)>')[0].lines[0],[{text:'<img src=x onerror=alert(1)>',bold:false}]);
 assert.deepEqual(F.blocks(''),[]);
});
test('beide assistenten gebruiken de opmaak; geen dangerouslySetInnerHTML',()=>{
 for(const f of ['app/hulp-balk.tsx','app/assistent/weekchat.tsx']){const s=fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');assert.match(s,/<ChatText text=/,f)}
 assert.doesNotMatch(fs.readFileSync(new URL('../app/chat-text.tsx',import.meta.url),'utf8'),/dangerouslySetInnerHTML/);
 assert.match(fs.readFileSync(new URL('../app/globals.css',import.meta.url),'utf8'),/\.bubble\.assistant\{background:#fff/);
});

// Opkikkers (wens eigenaar 8 november 2026): alleen opbeurend; nooit iets dat lijkt op veroveren, winnen of afpakken van een ander.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('opkikkers zijn opbeurend en nooit competitief',()=>{
 const s=fs.readFileSync(new URL('../app/deelnemer/[token]/lid-pagina.tsx',import.meta.url),'utf8'),list=s.slice(s.indexOf('const OPKIKKERS=['),s.indexOf('];\nfunction Opkikker('));
 const texts=[...list.matchAll(/'([^']+)'/g)].map(m=>m[1]);assert.ok(texts.length>=25);
 for(const t of texts)assert.doesNotMatch(t.toLowerCase(),/verover|winnen|win |versla|afpak|pakken|strijd|vechten|concurren|beter dan|kassa|omzet|verdien/,t);
 assert.ok(texts.includes('Ach, natuurlijk kun je dit. Je kunt meer dan je denkt.'));
});

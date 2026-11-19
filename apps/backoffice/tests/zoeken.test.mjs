// Deelnemer zoeken door te typen (wens eigenaar 9 november 2026).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './helpers/ts-resolve.mjs';
const {matchesSearch}=await import('../lib/search-text.ts');
test('zoeken op naam, rekeninghouder of e-mail; hoofdletters en accenten maken niet uit; elk woord moet passen',()=>{
 const p=['A.J. Schilder Holding BV','A.J. Schilder','aj@schilder.example'];
 for(const q of ['schilder','SCHILDER holding','aj@','  ']) assert.equal(matchesSearch(p,q),true,q);
 for(const q of ['volbeda','schilder volbeda']) assert.equal(matchesSearch(p,q),false,q);
 assert.equal(matchesSearch(['Bindert Rösler',null,''],'rosler'),true,'accenten');
 assert.equal(matchesSearch(['Zoë'],'zoe'),true);
});
test('het zoekveld staat boven de lijst met deelnemers en filtert die lijst',()=>{
 const s=fs.readFileSync(new URL('../app/winkel/afrekening/deelnemers.tsx',import.meta.url),'utf8');
 assert.match(s,/<label htmlFor="deelnemer-zoeken">Zoeken<\/label><input id="deelnemer-zoeken" type="search"/);
 assert.match(s,/people\.filter\(p=>matchesSearch\(\[p\.name,p\.holder,p\.email\],search\)\)\.map\(p=><tr/);
});

// Oudere telefoons (melding eigenaar 14 november 2026: lid Bindert kon niet inloggen, „er gebeurt niets” bij de knoppen). Next.js 16
// levert JavaScript met „static {…}”-blokken (pas vanaf Safari 16.4). Na de build zetten we die om voor iOS 15.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
test('build zet oude-telefoonstap tussen next build en de uitvoermap',()=>{
 const pkg=JSON.parse(read('../package.json'));assert.match(pkg.scripts.build,/next build --webpack && node \.\.\/\.\.\/tools\/oudere-telefoons\.mjs && node \.\.\/\.\.\/tools\/stage-standalone\.mjs/);
 const tool=read('../../../tools/oudere-telefoons.mjs');assert.match(tool,/TARGETS=\{safari:'15',ios:'15'\}/);assert.match(tool,/externalHelpers:false/);assert.match(tool,/throw Error\('Nog een static-blok/);
});
test('SWC zet een static-blok om zonder hulpcode, de rest blijft gelijk',async()=>{
 const swc=createRequire(new URL('../package.json',import.meta.url))('next/dist/build/swc');await swc.loadBindings();
 const code='class H extends A{static{this.displayName="Fout"}#p=1;m(){return this.#p??a?.b}}';
 const out=(await swc.transform(code,{isModule:false,sourceMaps:false,minify:true,env:{targets:{safari:'15',ios:'15'}},jsc:{parser:{syntax:'ecmascript'},externalHelpers:false,minify:{compress:false,mangle:false}}})).code;
 assert.doesNotMatch(out,/static\s*\{/);assert.match(out,/static #_ *= *this\.displayName *= *"Fout"/);assert.match(out,/#p/);assert.doesNotMatch(out,/_class_private_field|_define_property/);
});

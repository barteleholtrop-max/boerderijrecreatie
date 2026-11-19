// Oudere telefoons (melding eigenaar 14 november 2026: een lid kon niet inloggen, „er gebeurt niets” bij de knoppen).
// Next.js 16 levert zijn eigen JavaScript in een vorm die pas Safari 16.4 (maart 2023) begrijpt: „static {…}”-blokken in klassen.
// Op een iPhone met iOS 15 of een oudere 16 laadt de pagina dan wel, maar start de JavaScript niet; knoppen doen niets.
// Na „next build” zetten we daarom elk bestand in .next/static/chunks met zo'n blok om naar een vorm die iOS 15 ook leest, met
// de SWC-vertaler die Next.js zelf meelevert. Alleen die bestanden en alleen die omzetting: een static-blok wordt een statisch
// privéveld (Safari 15 kan dat). Geen hulpcode, geen andere wijzigingen. Draait vanuit de app-map (zoals stage-standalone.mjs).
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const app=process.cwd(),dir=path.join(app,'.next/static/chunks');
const require=createRequire(path.join(app,'package.json'));
export const TARGETS={safari:'15',ios:'15'};
export const STATIC_BLOCK=/\bstatic\s*\{/;
const files=[];
const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(e.name.endsWith('.js'))files.push(p)}};
if(fs.existsSync(dir))walk(dir);
const swc=require('next/dist/build/swc');await swc.loadBindings();
let changed=0;
for(const f of files){
 const code=fs.readFileSync(f,'utf8');if(!STATIC_BLOCK.test(code))continue;
 const out=await swc.transform(code,{filename:path.basename(f),isModule:false,sourceMaps:false,minify:true,env:{targets:TARGETS},
  jsc:{parser:{syntax:'ecmascript'},externalHelpers:false,minify:{compress:false,mangle:false,format:{comments:false}}}});
 if(/\bstatic\s*\{/.test(out.code))throw Error('Nog een static-blok in '+f);
 if(/\b(_class_private_field|_define_property|_check_private)/.test(out.code)&&!/\b(_class_private_field|_define_property|_check_private)/.test(code))throw Error('Onverwachte hulpcode in '+f);
 fs.writeFileSync(f,out.code);changed++;
}
console.log(`Oudere telefoons: ${changed} van ${files.length} JavaScript-bestanden omgezet voor iOS 15.`);

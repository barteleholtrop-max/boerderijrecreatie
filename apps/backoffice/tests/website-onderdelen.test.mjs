// Onderdelen van de hoofdsite (wens eigenaar 15 november 2026): per onderdeel open of in ontwikkeling, gekozen bij
// Website & uitstraling, gelezen door de hoofdsite via /api/public/availability (veld website). Zonder keuze of bij een
// storing: alles in ontwikkeling.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import './helpers/ts-resolve.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-onderdelen-'));process.env.APP_DATA_DIR=dir;
const O=await import('../lib/website-onderdelen.ts');
const U=await import('../lib/uitstraling.ts');
const {closeDatabase}=await import('../lib/portable/env.ts');
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const alles=(stand)=>Object.fromEntries(O.ONDERDELEN.map(o=>[o.id,stand]));

test('normaliseren: onbekend en kapot valt weg, ontbrekend is in ontwikkeling',()=>{
 assert.deepEqual(O.normalize('{}'),O.STANDAARD);
 assert.deepEqual(O.normalize('kapot'),O.STANDAARD);
 assert.deepEqual(O.normalize(null),O.STANDAARD);
 const n=O.normalize('{"agenda":"open","speelboerderij":"ja","onbekend":"open"}');
 assert.equal(n.agenda,'open');assert.equal(n.speelboerderij,'ontwikkeling');assert.equal('onbekend' in n,false);
 assert.deepEqual(O.publicView(O.STANDAARD).inOntwikkeling,O.ONDERDELEN.map(o=>o.id));
 assert.deepEqual(O.publicView({...O.STANDAARD,agenda:'open'}).inOntwikkeling.includes('agenda'),false);
});

test('opslaan: standaard alles in ontwikkeling, met versie, gedeeld met de uitstraling; ongeldig geweigerd',async t=>{
 t.after(async()=>{await closeDatabase();fs.rmSync(dir,{recursive:true,force:true})});
 const begin=await O.getOnderdelen();
 assert.deepEqual(begin.onderdelen,O.STANDAARD);assert.equal(begin.version,0);
 assert.deepEqual((await O.publicOnderdelen()).inOntwikkeling.length,O.ONDERDELEN.length);
 await assert.rejects(()=>O.saveOnderdelen({agenda:'open'},0,'eigenaar'),/Kies open of in ontwikkeling/,'alle onderdelen moeten mee');
 await assert.rejects(()=>O.saveOnderdelen({...alles('ontwikkeling'),kassa:'open'},0,'eigenaar'),/Onbekend onderdeel/);
 await assert.rejects(()=>O.saveOnderdelen([],0,'eigenaar'),/Ongeldige aanvraag/);
 assert.equal(await O.saveOnderdelen({...alles('ontwikkeling'),agenda:'open'},0,'eigenaar'),1);
 await assert.rejects(()=>O.saveOnderdelen(alles('open'),0,'ander'),/net gewijzigd/,'tweede eerste keer wint niet');
 assert.deepEqual((await O.publicOnderdelen()).inOntwikkeling.includes('agenda'),false);
 // De uitstraling deelt de rij en de versie: geen van beide overschrijft de ander stil.
 assert.equal(await U.saveUitstraling('e',1,'eigenaar'),2);
 await assert.rejects(()=>O.saveOnderdelen(alles('open'),1,'ander'),/net gewijzigd/,'verouderde versie');
 const nu=await O.getOnderdelen();assert.equal(nu.onderdelen.agenda,'open');assert.equal(nu.onderdelen.start,'ontwikkeling');
 assert.equal((await U.getUitstraling()).uitstraling,'e','uitstraling blijft staan');
 assert.equal(await O.saveOnderdelen(alles('open'),2,'eigenaar'),3);
 assert.deepEqual((await O.publicOnderdelen()).inOntwikkeling,[]);
 assert.equal((await U.getUitstraling()).uitstraling,'e','onderdelen opslaan raakt de uitstraling niet');
});

test('openbare poort geeft de onderdelen mee; schema met migratie; scherm bovenaan Website & uitstraling',()=>{
 const pub=read('../app/api/public/availability/route.ts');
 assert.match(pub,/website:await publicOnderdelen\(\)/);assert.match(pub,/website:cache\.website/);
 assert.match(read('../db/schema.ts'),/onderdelen:text\('onderdelen'\)\.notNull\(\)\.default\('\{\}'\)/);
 assert.match(read('../drizzle-pg/0069_website_onderdelen.sql'),/ALTER TABLE "website_settings" ADD COLUMN "onderdelen" text DEFAULT '\{\}' NOT NULL;/);
 const api=read('../app/api/website-onderdelen/route.ts');
 assert.match(api,/authorizeSheet\(req\);/);assert.match(api,/authorizeSheet\(req,true\);/,'opslaan alleen met schrijfrecht');
 assert.match(read('../app/website/page.tsx'),/<Onderdelen\/><WebsiteEditor\/>/);
});

test('de hoofdsite gebruikt dezelfde vaste sleutels',()=>{
 const live=read('../../website-fab/src/content/live.ts');
 const type=(live.match(/export type Onderdeel = ([^;]+);/)||[])[1]||'';
 const site=[...type.matchAll(/"([a-z]+)"/g)].map(m=>m[1]).sort();
 assert.deepEqual(site,O.ONDERDELEN.map(o=>o.id).sort());
 assert.match(live,/website\?: \{ inOntwikkeling\?: string\[\] \}/);
});

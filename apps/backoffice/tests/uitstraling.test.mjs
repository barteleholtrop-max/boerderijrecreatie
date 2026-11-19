// Uitstraling van de bestelapp (wens eigenaar 9 november 2026): de eigenaar kiest bij Website & uitstraling, gasten lezen het
// via /api/public/order-options. Zonder keuze of bij een storing: klassiek.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import './helpers/ts-resolve.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-uitstraling-'));process.env.APP_DATA_DIR=dir;
const U=await import('../lib/uitstraling.ts');
const {closeDatabase}=await import('../lib/portable/env.ts');
const root=new URL('../../website/',import.meta.url);

test('uitstraling: standaard klassiek, opslaan met versie, ongeldige keuze en dubbel opslaan geweigerd',async t=>{
 t.after(async()=>{await closeDatabase();fs.rmSync(dir,{recursive:true,force:true})});
 assert.deepEqual(await U.getUitstraling(),{uitstraling:'klassiek',version:0,updated:'',updatedBy:''});
 assert.equal(await U.publicUitstraling(),'klassiek');
 await assert.rejects(()=>U.saveUitstraling('paars',0,'eigenaar'),/bestaande uitstraling/);
 assert.equal(await U.saveUitstraling('e',0,'eigenaar'),1);
 await assert.rejects(()=>U.saveUitstraling('klassiek',0,'ander'),/net gewijzigd/,'tweede eerste keer wint niet');
 assert.equal(await U.publicUitstraling(),'e');
 assert.equal(await U.saveUitstraling('klassiek',1,'eigenaar'),2);
 await assert.rejects(()=>U.saveUitstraling('e',1,'ander'),/net gewijzigd/,'verouderde versie');
 const now=await U.getUitstraling();assert.equal(now.uitstraling,'klassiek');assert.equal(now.version,2);assert.equal(now.updatedBy,'eigenaar');
});

test('elke uitstraling heeft een themabestand in de bestelapp, behalve klassiek (de basis)',()=>{
 const html=fs.readFileSync(new URL('bestellen.html',root),'utf8'),js=fs.readFileSync(new URL('bestellen.js',root),'utf8');
 for(const u of U.UITSTRALINGEN){
  if(u.id==='klassiek')continue;
  assert.ok(fs.existsSync(new URL(`bestellen-${u.id}.css`,root)),`bestellen-${u.id}.css ontbreekt`);
 }
 assert.match(js,/uitstraling/);assert.doesNotMatch(html,/fonts\.googleapis|fonts\.gstatic/,'geen lettertypen van Google bij gasten (AVG)');
});

test('openbare deur geeft de uitstraling mee, ook bij een groepscode',()=>{
 const src=fs.readFileSync(new URL('../app/api/public/order-options/route.ts',import.meta.url),'utf8');
 assert.equal((src.match(/reply\(\{ownAmount,pickup,uitstraling,/g)||[]).length,3);
});

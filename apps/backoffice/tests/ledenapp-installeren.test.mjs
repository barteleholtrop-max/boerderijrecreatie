// Ledenpagina als eigen app (melding eigenaar 12 november 2026: „slaat niet op als een eigen app”).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
test('service worker met verzoekafhandeling, op de ledenpagina altijd aangemeld',()=>{
 const sw=read('public/deelnemer-sw.js');assert.match(sw,/addEventListener\('fetch'/);assert.match(sw,/mode!=='navigate'/);assert.doesNotMatch(sw,/caches\./,'geen cache van persoonlijke gegevens');
 const page=read('app/deelnemer/[token]/lid-pagina.tsx');assert.match(page,/serviceWorker\.register\('\/deelnemer-sw\.js',\{scope:location\.pathname\}\)/);assert.match(page,/<StartschermVraag naam="Ledenpagina" altijd\/>/);
});
test('offline: een eigen melding in plaats van de foutpagina',async()=>{
 const handlers={};const self={addEventListener:(n,f)=>{handlers[n]=f},skipWaiting(){},clients:{claim(){}},registration:{}};
 vm.runInNewContext(read('public/deelnemer-sw.js'),{self,Response,fetch:()=>Promise.reject(Error('offline'))});
 let answer;handlers.fetch({request:{mode:'navigate'},respondWith:p=>{answer=p}});const r=await answer;assert.equal(r.status,503);assert.match(await r.text(),/Geen verbinding/);
 let other=false;handlers.fetch({request:{mode:'cors'},respondWith:()=>{other=true}});assert.equal(other,false,'gegevens gaan gewoon langs');
});
test('inlogscherm voor leden draagt het manifest van de eigen ledenpagina, niet dat van de backoffice',()=>{
 const p=read('app/lid/inloggen/page.tsx');assert.match(p,/manifest:`\/api\/deelnemer\/\$\{token\}\/manifest`/);assert.match(p,/title:'Ledenpagina'/);assert.match(p,/leden-192\.png/);
 assert.match(read('instrumentation.ts'),/cachedSealed\('bloei_administration'\)/,'warm opstarten');
});
// „Het is vol scherm, hoe maak ik er dan een app van” (12 november 2026) en „hij blijft dit vragen, maar staat wel geïnstalleerd”
// (13 november 2026): de melding „staat in een andere app” verscheen ook in de echte ledenapp. Sinds de ledenapp een eigen adres
// heeft (leden.boerbart.nl) kan geen andere app hem opvangen; de melding is weg.
test('ledenapp start met ?app=leden; geen melding „andere app” meer',()=>{
 assert.match(read('app/api/deelnemer/[token]/manifest/route.ts'),/start_url:portalPath\(token\)\+'\?app=leden'/);
 assert.match(read('public/deelnemer-sw.js'),/scope\+'\?app=leden'/,'een melding opent de ledenapp');
 assert.equal(fs.existsSync(new URL('../app/deelnemer/[token]/andere-app.tsx',import.meta.url)),false);
 assert.doesNotMatch(read('app/deelnemer/[token]/lid-pagina.tsx'),/AndereApp/);assert.doesNotMatch(read('app/lid/inloggen/form.tsx'),/LEDENAPP_KEY/);
});

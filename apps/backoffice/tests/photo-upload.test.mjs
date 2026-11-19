// Foto's uploaden vanaf de telefoon (wens eigenaar 9 november 2026): verkleinen naar hooguit 1600 px en het kleinste goede bestand kiezen.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const {fitSize,pickUpload,MAX_SIDE}=await import('../lib/photo-upload.ts');

test('verkleinen: lange kant hooguit 1600 px, verhouding blijft, klein blijft klein',()=>{
 assert.equal(MAX_SIDE,1600);
 assert.deepEqual(fitSize(4000,3000),{width:1600,height:1200});
 assert.deepEqual(fitSize(3024,4032),{width:1200,height:1600},'staande foto van een telefoon');
 assert.deepEqual(fitSize(800,600),{width:800,height:600},'nooit groter maken');
 assert.deepEqual(fitSize(5000,1),{width:1600,height:1});
 assert.throws(()=>fitSize(0,10));assert.throws(()=>fitSize(NaN,10));
});

test('kiezen: verkleind als het moest, anders het kleinste goede bestand',()=>{
 assert.equal(pickUpload({size:5e6,type:'image/jpeg'},{size:3e5},true),'resized');
 assert.equal(pickUpload({size:2e5,type:'image/jpeg'},{size:3e5},false),'original','klein origineel blijft');
 assert.equal(pickUpload({size:2e5,type:'image/heic'},{size:3e5},false),'resized','HEIC kan de backoffice niet bewaren');
 assert.equal(pickUpload({size:2e5,type:'image/png'},null,false),'original','verkleinen lukte niet');
});

test('scherm Foto\'s: uploaden naar de beeldbank en koppelen met set-photo, te vinden vanaf Gerechten & prijzen',()=>{
 const page=fs.readFileSync(new URL('../app/producten/fotos-lijst.tsx',import.meta.url),'utf8');
 assert.match(page,/fetch\('\/api\/media',\{method:'POST'/);assert.match(page,/action:'set-photo'/);
 assert.match(page,/accept="image\/\*"/,'telefoon biedt camera of fotobibliotheek');
 assert.match(fs.readFileSync(new URL('../app/producten/page.tsx',import.meta.url),'utf8'),/href="\/producten\/beelden#fotos"/);
});

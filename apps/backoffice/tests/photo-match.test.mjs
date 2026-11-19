import {test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/ts-resolve.mjs';
const M=await import('../lib/photo-match.ts');
const media=[{id:'a',name:'moj gember citrus fles'},{id:'b',name:'fles moj gember citrus'},{id:'c',name:'moj kruisbessen vlierbloesem fles'},{id:'d',name:'logo boer bart'},{id:'e',name:'affligem belgisch wit 0 0 fles'},{id:'f',name:'tekening appeltaart'},{id:'g',name:'appeltaart foto'}];
test('woorden en score: fles, accenten en 0.0 maken niet uit',()=>{
 assert.deepEqual(M.tokens('MOJ Gember-Citrus (fles 33cl)'),['moj','gember','citrus','33cl']);
 assert.deepEqual(M.tokens('Affligem Belgisch Wit 0.0'),['affligem','belgisch','wit','00']);
 assert.equal(M.score('MOJ Gember Citrus','moj gember citrus fles'),1);
 assert.equal(M.score('MOJ Kruisbes Vlierbloesem','moj kruisbessen vlierbloesem fles'),1,'kruisbes ≈ kruisbessen');
 assert.equal(M.score('Cappuccino','logo boer bart'),0);
 assert.equal(M.score('Appeltaart','fles appel aardbei sap'),0,'appel is niet appeltaart');assert.ok(M.score('Appels per 4','schulp appels aardbeien')>0);
 assert.ok(M.score('Affligem Belgisch Wit 0.0','affligem belgisch wit 0 0 fles')>=0.7);
});
test('voorstellen: twee even goede kandidaten is niet zeker; logo nooit',()=>{
 const s=M.suggest({id:'p',name:'MOJ Gember Citrus',department:'Restaurant'},media);
 assert.deepEqual(s.map(x=>x.mediaId).sort(),['a','b']);assert.equal(M.sure(s),false,'twee bijna gelijke beelden: laten kiezen');
 const k=M.suggest({id:'p',name:'MOJ Kruisbes Vlierbloesem',department:'Winkel'},media);assert.equal(k[0].mediaId,'c');assert.equal(M.sure(k),true);
 assert.deepEqual(M.suggest({id:'p',name:'Soep van de dag',department:'Restaurant'},media),[]);
});
test('tekening gaat voor bij het restaurant, foto bij de winkel',()=>{
 assert.equal(M.suggest({id:'p',name:'Appeltaart',department:'Restaurant'},media)[0].mediaId,'f');
 assert.equal(M.suggest({id:'p',name:'Appeltaart',department:'Winkel'},media)[0].mediaId,'g');
 assert.match(M.drawingPrompt('Appeltaart'),/inkt en waterverf/);assert.match(M.drawingPrompt('Appeltaart'),/Geen tekst/);
 assert.equal(M.driveFileName('Appeltaart met slagroom',true),'tekening appeltaart slagroom');
});

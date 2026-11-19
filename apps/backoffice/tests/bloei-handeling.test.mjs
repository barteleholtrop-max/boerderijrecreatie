// Bloei: één code per handeling en een logische indeling (besluit eigenaar 8 november 2026).
// Zie lib/gevoelig.ts (unusedCode), lib/handeling-code.ts, app/bloei/tabs.ts en public/bloei-proef.js.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './helpers/ts-resolve.mjs';
const G=await import('../lib/gevoelig.ts');
const L=await import('../lib/login-core.ts');
const H=await import('../lib/handeling-code.ts');
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('een code geldt voor één Bloei-handeling en hooguit 2 minuten',()=>{
 const now=Date.now();
 assert.equal(G.unusedCode({mfa:now-30000},now),true,'nieuwe code');
 assert.equal(G.unusedCode({mfa:now-30000,mfaUsed:now-30000},now),false,'al gebruikt voor een handeling');
 assert.equal(G.unusedCode({mfa:now-30000,mfaUsed:now-600000},now),true,'een eerdere code was gebruikt, deze nog niet');
 assert.equal(G.unusedCode({mfa:now-3*60000},now),false,'ouder dan 2 minuten');
 assert.equal(G.unusedCode({mfa:NaN},now),false);
 // Het venster van 10 minuten voor andere gevoelige handelingen blijft gelijk.
 assert.equal(G.freshCode(now-5*60000,now),true);
});

test('de sessie bewaart „code gebruikt” ondertekend en weigert een rare waarde',()=>{
 const secret='x'.repeat(40),now=Date.now(),s={email:'rianne@gmail.com',name:'Rianne',role:'eigenaar',exp:now+60000,mfa:now};
 assert.deepEqual(L.readSession(L.signSession({...s,mfaUsed:now},secret),secret),{...s,mfaUsed:now});
 assert.equal(L.readSession(L.signSession({...s,mfaUsed:'ja'},secret),secret),null);
});

test('zonder login (ontwikkelen) vraagt een Bloei-handeling geen code',async()=>{
 assert.equal(await H.actionCode(new Request('http://127.0.0.1/api/bloei/markt',{method:'POST'})),null);
});

test('elke Bloei-route die echte gegevens wijzigt, vraagt eerst een nieuwe code en legt vast',()=>{
 for(const p of ['app/api/bloei/markt/route.ts','app/api/bloei/documenten/route.ts','app/api/bloei/import/route.ts','app/api/bloei/inkomensleningen/route.ts','app/api/bloei/documenten/koppelen/route.ts']){
  const s=read(p),post=s.slice(s.indexOf('export async function POST'));
  assert.match(post,/const stop=await actionCode\(req\);if\(stop\)return stop;/,p+' vraagt een code');
  assert.match(post,/noteSensitive\(req,/,p+' legt vast');
 }
 // De broncontrole van de import leest alleen; pas het overnemen vraagt de code.
 const imp=read('app/api/bloei/import/route.ts');
 assert.ok(imp.indexOf("body.action==='review'")<imp.indexOf('actionCode(req)'));
});

test('het codevenster toont wat je bevestigt; de Bloeimarkt stuurt dat bij elke handeling mee',()=>{
 assert.match(read('app/code-opnieuw.tsx'),/x-handeling/);
 const markt=read('app/bloei/markt/page.tsx');
 assert.match(markt,/'x-handeling':encodeURIComponent\(what\)/);
 for(const a of ['offer','publish','withdraw','complete','settings'])assert.match(markt,new RegExp(`act\\(\\{action:'${a}'[^)]*\\},'[^']*','`),a+' heeft een omschrijving');
});

test('Bloei heeft één rij tabbladen; de backoffice opent met alle houders, niet met het scherm van het lid',()=>{
 const tabs=read('app/bloei/tabs.ts');
 for(const p of ['/bloei','/bloei/markt','/bloei/documenten','/bloei/import'])assert.ok(tabs.includes(`'${p}'`),p);
 assert.ok(!tabs.includes('/bloei/inkomensleningen'),'inkomensleningen horen bij Leden & winstdeling');
 assert.match(read('app/leden/tabs.ts'),/'\/bloei\/inkomensleningen','Inkomensleningen'/);
 for(const p of ['app/bloei/page.tsx','app/bloei/markt/page.tsx','app/bloei/documenten/page.tsx','app/bloei/import/page.tsx'])assert.match(read(p),/<SubTabs current="\/bloei[a-z/]*" items=\{BLOEI_TABS\}\/>/,p);
 const js=read('public/bloei-proef.js');
 assert.match(js,/this\.tab=this\.hasAttribute\('beheer'\)\?'beheer':'overzicht'/);
 assert.match(js,/const tabs=admin\?\[\['beheer','Alle houders'\],\['overzicht','Houderkaart'\],\['bezit','Bezit'\],\['documenten','Afspraken'\]\]/);
 assert.match(js,/if\(!admin&&this\.tab==='beheer'\)this\.tab='overzicht'/,'zonder beheerrechten nooit een leeg scherm');
});

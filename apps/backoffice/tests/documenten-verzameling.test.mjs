// Eén verzameling officiële documenten (wens eigenaar 16 november 2026, nieuwe indeling stap 6).
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Bedrijfsgegevens: vinkje Op de Bloeimarkt, pas na bevestiging; AFM-informatie als soort',()=>{
 const lib=read('lib/coop-documents.ts');
 assert.match(lib,/\['afm','AFM-informatie'\]/);assert.match(lib,/if\(on&&confirm!==true\)throw new DocumentError/);
 assert.match(lib,/who==='markt'&&!d\.forMarket/,'openbaar downloaden alleen wat op de markt staat');
 assert.match(read('app/api/coop-documenten/route.ts'),/action==='markt'\)\{if\(b\.on===true\)\{const stop=await actionCode\(req\);if\(stop\)return stop\}await setForMarket\(b\.id,b\.on,b\.confirm\)\}/,'openbaar zetten vraagt een verse code');
 assert.match(read('app/bedrijfsgegevens/documenten.tsx'),/action:'markt',id:d\.id,on,confirm:on/);
 assert.match(read('drizzle-pg/0071_documenten_een_verzameling.sql'),/ADD COLUMN "for_market" bigint DEFAULT 0 NOT NULL/);
});
test('Bloeimarkt en ledenpagina halen de algemene documenten uit de ene verzameling; Bloei houdt de persoonlijke overeenkomsten',()=>{
 const m=read('lib/bloei-market-store.ts');
 assert.match(m,/view\.documents=\[\.\.\.view\.documents,\.\.\.\(await coopMarket\(\)\)/);
 assert.match(m,/downloadDocument\(id,access\.owner\?'eigenaar':'markt'\)/);
 assert.match(m,/b\.action==='document-verhuizen'/);assert.match(m,/Een persoonlijke overeenkomst blijft in Bloei/);
 const p=read('app/bloei/documenten/page.tsx');assert.match(p,/category:'overeenkomst',documentVersion:'',visibility:'member'/);assert.match(p,/Verhuizen naar de verzameling/);
});

// Obligatiehouders en C-leden (wens eigenaar 8 november 2026): rentesaldo in euro's tot 1 mei, opbouw uit obligaties, dividend volgt.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('ledenpagina: één oogopslag, rentesaldo in euro zonder extra waarde, dividend volgt; alleen lezen',()=>{
 const ui=read('app/deelnemer/[token]/inleg.tsx'),lib=read('lib/member-inleg.ts'),route=read('app/api/deelnemer/[token]/inleg/route.ts'),page=read('app/deelnemer/[token]/lid-pagina.tsx');
 assert.match(ui,/Bij Boer Bart in één oogopslag/);assert.match(ui,/<span>Rentesaldo<\/span><b>\{eur\(/);assert.match(ui,/<span>BB-saldo<\/span><b>\{bbSign\(/);
 assert.match(ui,/1 = € 1, zonder extra waarde\. Het vervalt op 1 mei/);assert.match(ui,/de A-leden keuren het eerst goed/);
 assert.match(lib,/dividendBalance\(/,'zelfde berekening als de bestelpagina');assert.match(lib,/expectedCents:null/);
 assert.doesNotMatch(route,/export async function POST/,'alleen lezen');
 assert.match(page,/'Obligatiehouder'/);assert.match(page,/\{team&&<Verdiensten /,'geen potdeel voor wie niet in een pot werkt');
 assert.match(fs.readFileSync(new URL('../lib/member-routes.ts',import.meta.url),'utf8'),/'inleg'/);
});

test('één blok bovenaan: rentesaldo en dividend als tegels in Mijn BB-saldo, geen tweede overzichtsblok (9 november 2026)',()=>{
 const page=read('app/deelnemer/[token]/lid-pagina.tsx'),bb=read('app/deelnemer/[token]/bb.tsx'),ui=read('app/deelnemer/[token]/inleg.tsx');
 assert.match(page,/<BbTegoed api=\{api\} stats=\{<InlegStats v=\{inleg\}\/>\} afterHero=\{<Inleg api=\{api\} v=\{inleg\} overview=\{false\}\/>\} fallback=\{<Inleg api=\{api\} v=\{inleg\}\/>\}>/);
 assert.doesNotMatch(page,/current==='beloning'&&<><Inleg /,'het losse overzichtsblok staat niet meer boven het BB-saldo');
 assert.match(bb,/\{stats\}\n  <\/section>\n  \{afterHero\}/,'tegels in het BB-blok, kaarten daaronder');
 assert.match(bb,/if\(!bb\.getsBb&&!bb\.entries\.length\)return <>\{fallback\}\{children\}<\/>/,'zonder BB blijft het oude overzicht staan');
 assert.match(ui,/\{overview&&<section className="m-card m-hero m-overzicht"/);assert.match(ui,/export function InlegStats/);
});

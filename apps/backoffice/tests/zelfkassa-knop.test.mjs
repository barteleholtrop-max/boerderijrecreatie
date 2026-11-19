// Zelfkassa-knop (8 november 2026): terug uit de winkel stond de knop vast op „Even geduld…”.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('de zelfkassa-knop staat weer klaar als je terugkomt (pageshow)',()=>{
 const s=fs.readFileSync(new URL('../app/deelnemer/[token]/lid-pagina.tsx',import.meta.url),'utf8'),z=s.slice(s.indexOf('function Zelfkassa('),s.indexOf('function Zelfkassa(')+1500);
 assert.match(z,/addEventListener\('pageshow',back\)/);assert.match(z,/const back=\(\)=>setBusy\(false\)/);
});

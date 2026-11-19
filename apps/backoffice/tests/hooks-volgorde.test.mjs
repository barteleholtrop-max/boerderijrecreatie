// React-hooks altijd vóór een vroege return (melding eigenaar 12 november 2026: een Instagram- of Messenger-gesprek in de
// managementapp gaf „This page couldn't load”). In app/gesprekken/meta.tsx stond useRef ná „Gesprek laden…”: zodra het gesprek
// binnen was, telde React een hook extra en stopte de pagina. Deze controle zoekt in elk scherm naar een hook na een
// `if(…)return` in hetzelfde component.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=new URL('../app/',import.meta.url).pathname;
const files=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(d,e.name)):e.name.endsWith('.tsx')?[path.join(d,e.name)]:[]);
test('geen hook na een vroege return in een component',()=>{
 const wrong=[];
 for(const f of files(root)){
  let ret=0;
  fs.readFileSync(f,'utf8').split('\n').forEach((l,i)=>{
   if(/^(export )?(default )?(async )?function [A-Z]/.test(l))ret=0;
   if(/^ if\(.*\)\{?return/.test(l))ret=ret||i+1;
   if(ret&&/\buse(State|Ref|Effect|Memo|Callback|Context|Reducer)\(/.test(l)&&!l.trim().startsWith('//'))wrong.push(path.relative(root,f)+':'+(i+1)+' (return op regel '+ret+')');
  });
 }
 assert.deepEqual(wrong,[]);
});

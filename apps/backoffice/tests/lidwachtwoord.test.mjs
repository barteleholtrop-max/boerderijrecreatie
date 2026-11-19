// Wachtwoord voor de backoffice: minstens 10 tekens, niet alleen cijfers.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './helpers/ts-resolve.mjs';
const {passwordProblem}=await import('../lib/login-core.ts');
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('backoffice 10 tekens; niet alleen cijfers',()=>{
 assert.match(passwordProblem('boer12'),/minstens 10/,'backoffice blijft 10');
 assert.match(passwordProblem('1234567890'),/voorspelbaar/);
 for(const f of ['app/inloggen/form.tsx','app/inloggen/nieuw-wachtwoord/page.tsx'])assert.match(read(f),/minLength=\{10\}/,'backoffice: '+f);
});

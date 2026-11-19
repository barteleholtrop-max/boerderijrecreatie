// Wachtwoord voor leden minstens 6 tekens (wens eigenaar 13 november 2026: „minimaal 10 tekens is vervelend”). De backoffice houdt 10.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './helpers/ts-resolve.mjs';
const {passwordProblem,MEMBER_PASSWORD_MIN}=await import('../lib/login-core.ts');
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('leden 6 tekens, backoffice 10; niet alleen cijfers',()=>{
 assert.equal(MEMBER_PASSWORD_MIN,6);
 assert.equal(passwordProblem('boer12',6),'');assert.match(passwordProblem('boer1',6),/minstens 6/);assert.match(passwordProblem('123456',6),/voorspelbaar/);
 assert.match(passwordProblem('boer12'),/minstens 10/,'backoffice blijft 10');
 for(const f of ['app/auth/lid/nieuw-wachtwoord/route.ts','app/auth/lid/aanmelden/route.ts'])assert.match(read(f),/passwordProblem\(b\.password,MEMBER_PASSWORD_MIN\)/,f);
 assert.match(read('lib/member-account.ts'),/passwordProblem\(password,MEMBER_PASSWORD_MIN\)/);
 assert.match(read('app/lid/inloggen/form.tsx'),/minLength=\{mode==='eerste'\?6:1\}/);assert.doesNotMatch(read('app/lid/inloggen/form.tsx'),/minLength=\{10\}/);
 assert.doesNotMatch(read('app/lid/nieuw-wachtwoord/page.tsx'),/minLength=\{10\}/);
 for(const f of ['app/inloggen/form.tsx','app/inloggen/nieuw-wachtwoord/page.tsx'])assert.match(read(f),/minLength=\{10\}/,'backoffice: '+f);
});

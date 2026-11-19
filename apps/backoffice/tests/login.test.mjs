// Inloggen via Supabase (4 en 6 november 2026): sessie met Authenticator-code, tussenstap, PKCE, wachtwoordregel en de toegangslijst.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import './helpers/ts-resolve.mjs';
const L=await import('../lib/login-core.ts');
const secret='x'.repeat(40);

test('sessie: ondertekend, verloopt, en is niet na te maken of aan te passen',()=>{
 const s={email:'sanne@gmail.com',name:'Sanne',role:'eigenaar',exp:Date.now()+60000,mfa:Date.now()},t=L.signSession(s,secret);
 assert.deepEqual(L.readSession(t,secret),s);
 assert.equal(L.readSession(t,'y'.repeat(40)),null,'andere sleutel');
 const [body,sig]=t.split('.');const forged=Buffer.from(JSON.stringify({...s,role:'eigenaar',email:'indringer@gmail.com'})).toString('base64url');
 assert.equal(L.readSession(forged+'.'+sig,secret),null,'aangepaste inhoud');
 assert.equal(L.readSession(L.signSession({...s,exp:Date.now()-1},secret),secret),null,'verlopen');
 assert.equal(L.readSession('',secret),null);assert.equal(L.readSession(t,''),null);assert.throws(()=>L.signSession(s,''));
});
test('sleutel: AUTH_SECRET, anders afgeleid van SHEETS_CONFIG_KEY; te kort telt niet',()=>{
 assert.equal(L.sessionSecret({AUTH_SECRET:'a'.repeat(32)}),'a'.repeat(32));
 assert.equal(L.sessionSecret({SHEETS_CONFIG_KEY:'b'.repeat(64)}).length,64);assert.notEqual(L.sessionSecret({SHEETS_CONFIG_KEY:'b'.repeat(64)}),'b'.repeat(64));
 assert.equal(L.sessionSecret({AUTH_SECRET:'kort'}),'');
});
test('PKCE en het adres naar Supabase; alleen terug naar een eigen pagina',()=>{
 const {verifier,challenge}=L.pkce();assert.equal(challenge,createHash('sha256').update(verifier).digest('base64url'));
 const u=new URL(L.authorizeUrl('https://abc.supabase.co/','https://backoffice.example.nl/auth/terug',challenge));
 assert.equal(u.origin+u.pathname,'https://abc.supabase.co/auth/v1/authorize');assert.equal(u.searchParams.get('provider'),'google');
 assert.equal(u.searchParams.get('code_challenge'),challenge);assert.equal(u.searchParams.get('redirect_to'),'https://backoffice.example.nl/auth/terug');
 assert.equal(L.safeNext('/planning?dag=1'),'/planning?dag=1');
 for(const bad of ['//evil.example','https://evil.example','/auth/google',null,'planning'])assert.equal(L.safeNext(bad),'/');
 assert.equal(L.shortName('Sanne.Jansen@Gmail.com'.toLowerCase()),'sanne.jansen');
 assert.equal(L.authConfig({SUPABASE_URL:'https://abc.supabase.co'}),null,'zonder sleutel uit');
});
test('zonder Authenticator-code geen sessie: ook een oude sessie (zonder mfa) of een te oude code telt niet',()=>{
 const now=Date.now(),base={email:'administratie@example.nl',name:'A',role:'eigenaar',exp:now+60000};
 assert.equal(L.readSession(L.signSession(base,secret),secret),null,'sessie van vóór 6 november, zonder code');
 assert.equal(L.readSession(L.signSession({...base,mfa:now-9*3600000},secret),secret),null,'code van langer dan 8 uur geleden');
 assert.equal(L.readSession(L.signSession({...base,mfa:now+3600000},secret),secret),null,'code in de toekomst');
 assert.equal(L.readSession(L.signSession({...base,mfa:now},secret),secret).mfa,now);
});
test('tussenstap: versleuteld, verloopt na 10 minuten en is niet te lezen of aan te passen',()=>{
 const step={email:'administratie@example.nl',name:'A',role:'eigenaar',authId:'u1',token:'geheim-toegangsbewijs',next:'/planning',exp:Date.now()+60000};
 const t=L.sealStep(step,secret);
 assert.doesNotMatch(Buffer.from(t,'base64url').toString('latin1'),/geheim-toegangsbewijs|administratie/,'niet leesbaar');
 assert.deepEqual(L.readStep(t,secret),step);
 assert.equal(L.readStep(t,'y'.repeat(40)),null,'andere sleutel');
 const raw=Buffer.from(t,'base64url');raw[raw.length-1]^=1;assert.equal(L.readStep(raw.toString('base64url'),secret),null,'aangepast');
 assert.equal(L.readStep(L.sealStep({...step,exp:Date.now()-1},secret),secret),null,'verlopen');
});
test('wachtwoordregel, code van 6 cijfers en maximaal 5 foute codes per 10 minuten',()=>{
 assert.match(L.passwordProblem('kort'),/10 tekens/);assert.match(L.passwordProblem('1234567890'),/voorspelbaar/);assert.match(L.passwordProblem('aaaaaaaaaaaa'),/voorspelbaar/);
 assert.equal(L.passwordProblem('appel peer banaan'),'');
 assert.ok(L.validCode('123456'));for(const bad of ['12345','1234567','12a456',123456,null])assert.equal(L.validCode(bad),false);
 const who='poging-'+Math.random(),t0=Date.now();
 for(let i=0;i<5;i++){assert.equal(L.codeAttempt(who,null,t0),true);L.codeAttempt(who,false,t0)}
 assert.equal(L.codeAttempt(who,null,t0+1000),false,'geblokkeerd');assert.equal(L.codeAttempt(who,null,t0+601000),true,'na 10 minuten weer');
});
test('terug naar het planbord alleen op precies PLANBORD_ORIGIN; gedeeld cookiedomein; Secure op https of Cloud Run',()=>{
 const env={PLANBORD_ORIGIN:'https://planbord.example.nl'};
 assert.equal(L.safeNext('https://planbord.example.nl/onderwerpen',env),'https://planbord.example.nl/onderwerpen');
 for(const bad of ['https://planbord.example.nl.evil.example/','https://evil.example/','https://x:y@planbord.example.nl/','/inloggen/code'])assert.equal(L.safeNext(bad,env),'/');
 assert.equal(L.safeNext('https://planbord.example.nl/',{}),'/','zonder PLANBORD_ORIGIN niet');
 assert.equal(L.cookieDomain({SESSION_COOKIE_DOMAIN:'.Example.nl'}),'example.nl');assert.equal(L.cookieDomain({SESSION_COOKIE_DOMAIN:'nl'}),undefined);assert.equal(L.cookieDomain({}),undefined);
 // Overgenomen uit PR #158 (issue #146).
 assert.equal(L.cookieSecure({},'http://localhost:3001'),false);assert.equal(L.cookieSecure({},'https://backoffice.example.nl'),true);
 assert.equal(L.cookieSecure({K_SERVICE:'x'},'http://localhost:3001'),true);assert.equal(L.cookieSecure({X_FORWARDED_PROTO:'https'},'http://127.0.0.1:3001'),true);
});
test('toegangslijst: EERSTE_EIGENAAR is de eerste eigenaar; altijd minstens één eigenaar',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-toegang-'));process.env.APP_DATA_DIR=dir;process.env.EERSTE_EIGENAAR=' Eigenaar@Example.nl ';t.after(()=>{delete process.env.EERSTE_EIGENAAR});
 const {closeDatabase}=await import('../lib/portable/env.ts');t.after(async()=>{process.env.APP_DATA_DIR=dir;await closeDatabase();fs.rmSync(dir,{recursive:true,force:true})});
 const A=await import('../lib/access-store.ts');
 assert.deepEqual(await A.activeAccount('eigenaar@example.nl'),{email:'eigenaar@example.nl',name:'Eigenaar',role:'eigenaar',modules:[],quick:false}); // quick: zonder code binnen staat standaard uit (13 november 2026)
 assert.equal(await A.activeAccount('vreemde@gmail.com'),null);
 await A.saveAccount({email:' Sanne@Gmail.com ',name:'Sanne',role:'medewerker',active:true},'administratie');
 assert.equal((await A.activeAccount('sanne@gmail.com')).role,'medewerker');
 assert.deepEqual((await A.activeAccount('sanne@gmail.com')).modules,[],'een nieuwe medewerker heeft nog geen onderdelen');
 await A.saveAccount({email:'sanne@gmail.com',name:'Sanne',role:'medewerker',active:true,modules:['planning','onzin']},'administratie');
 assert.deepEqual((await A.activeAccount('sanne@gmail.com')).modules,['planning'],'alleen bestaande onderdelen');
 await A.saveAccount({email:'sanne@gmail.com',name:'Sanne',role:'medewerker',active:true},'administratie');
 assert.deepEqual((await A.activeAccount('sanne@gmail.com')).modules,['planning'],'zonder onderdelen in de aanvraag blijven ze staan');
 await assert.rejects(A.saveAccount({email:'sanne@gmail.com',name:'Sanne',role:'medewerker',active:true,modules:'planning'},'x'),/Ongeldige onderdelen/);
 await A.saveAccount({email:'sanne@gmail.com',name:'Sanne',role:'medewerker',active:false},'administratie');
 assert.equal(await A.activeAccount('sanne@gmail.com'),null,'uitgezet: geen toegang');
 await assert.rejects(A.removeAccount('eigenaar@example.nl'),/minstens één eigenaar/);
 await assert.rejects(A.saveAccount({email:'eigenaar@example.nl',name:'',role:'medewerker',active:true},'x'),/minstens één eigenaar/);
 await assert.rejects(A.saveAccount({email:'geen-mail',name:'',role:'medewerker',active:true},'x'),/geldig e-mailadres/);
 await assert.rejects(A.saveAccount({email:'a@b.nl',name:'',role:'baas',active:true},'x'),/eigenaar of medewerker/);
 await A.saveAccount({email:'sanne@gmail.com',name:'Sanne',role:'eigenaar',active:true},'administratie');
 await A.removeAccount('eigenaar@example.nl');assert.equal(await A.activeAccount('eigenaar@example.nl'),null,'kan weg als er een andere eigenaar is');
});

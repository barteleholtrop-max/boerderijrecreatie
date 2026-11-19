// „Onthoud deze telefoon” in de backoffice (wens eigenaar 13 november 2026: „30 dagen is goed”). Een onthouden sessie blijft 30
// dagen; wie van de lijst gaat of wordt uitgezet, is meteen uitgelogd, en rol en onderdelen komen van de lijst van nu.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {register} from 'node:module';
import './helpers/ts-resolve.mjs';
const stub=new URL('./helpers/next-server-stub.mjs',import.meta.url).href;
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){return s==='next/server'?n(${JSON.stringify(stub)},c):n(s,c)}`));
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const SECRET='s'.repeat(40),DAY=86400000;
Object.assign(process.env,{SUPABASE_URL:'https://x.supabase.co',SUPABASE_ANON_KEY:'k',AUTH_SECRET:SECRET,APP_ORIGIN:'https://bo.example',DATABASE_URL:''});
const L=await import('../lib/login-core.ts');
function req(p,{method='GET',cookie=''}={}){const url=new URL(p,'https://bo.example');return {method,url:url.href,nextUrl:url,headers:new Headers({host:'bo.example'}),cookies:{get:n=>{const hit=cookie.split('; ').map(x=>x.split('=')).find(([k])=>k===n);return hit?{value:hit.slice(1).join('=')}:undefined}}}}
const cookie=(email,over={})=>{const now=Date.now();return 'bb_sessie='+L.signSession({email,name:'X',role:'eigenaar',exp:now+30*DAY,mfa:now,lang:true,...over},SECRET)};

test('sessielengte: 30 dagen alleen met lang, anders 8 uur',()=>{
 const now=Date.now(),base={email:'a@example.nl',name:'A',role:'eigenaar',mfa:now};
 assert.ok(L.readSession(L.signSession({...base,exp:now+30*DAY,lang:true},SECRET),SECRET),'30 dagen met lang');
 assert.equal(L.readSession(L.signSession({...base,exp:now+30*DAY},SECRET),SECRET),null,'zonder lang geen 30 dagen');
 assert.equal(L.readSession(L.signSession({...base,exp:now+31*DAY,lang:true},SECRET),SECRET),null,'niet langer dan 30 dagen');
 assert.equal(L.sessionLength(true),30*DAY);assert.equal(L.sessionLength(false),8*3600000);
});

test('proxy: onthouden sessie volgt de toegangslijst van nu',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-onthoud-'));process.env.APP_DATA_DIR=dir;
 const {closeDatabase}=await import('../lib/portable/env.ts'),A=await import('../lib/access-store.ts'),{proxy}=await import('../proxy.ts');
 t.after(async()=>{await closeDatabase();fs.rmSync(dir,{recursive:true,force:true})});
 await A.saveAccount({email:'eigenaar@example.nl',name:'E',role:'eigenaar',active:true},'test');
 await A.saveAccount({email:'mw@example.nl',name:'M',role:'medewerker',active:true,modules:['planning']},'test');
 await A.saveAccount({email:'uit@example.nl',name:'U',role:'medewerker',active:false},'test');
 assert.equal((await proxy(req('/leden',{cookie:cookie('eigenaar@example.nl')}))).kind,'next','actief: binnen');
 const mw=await proxy(req('/leden',{cookie:cookie('mw@example.nl')}));assert.equal(mw.kind,'redirect','rol en onderdelen van de lijst, niet uit de cookie');
 const gone=await proxy(req('/leden',{cookie:cookie('uit@example.nl')}));assert.equal(gone.kind,'redirect');assert.match(gone.location,/fout=geen-toegang/);
 assert.match(String(gone.headers?.get?.('set-cookie')??''),/bb_sessie=; Path=\/; Max-Age=0/,'uitgelogd');
 const api=await proxy(req('/api/leden',{cookie:cookie('weg@example.nl')}));assert.equal(api.status,401,'niet op de lijst: API dicht');
 const plain=proxy(req('/leden',{cookie:cookie('weg@example.nl',{lang:undefined,exp:Date.now()+3600000})}));assert.equal(plain.kind,'next','gewone sessie van 8 uur: zoals voorheen, zonder databasevraag');
});

test('inlogscherm en routes geven „onthoud” door',()=>{
 assert.match(read('app/inloggen/form.tsx'),/Onthoud deze telefoon/);assert.match(read('app/inloggen/form.tsx'),/send\(path,\{email,password,terug,onthouden\}\)/);assert.match(read('app/inloggen/form.tsx'),/&onthouden=1/);
 assert.match(read('app/auth/wachtwoord/route.ts'),/beginStep\(req,t,safeNext\(b\.terug\),b\.onthouden===true\)/);
 assert.match(read('app/auth/google/route.ts'),/JSON\.stringify\(\{verifier,next,remember\}\)/);assert.match(read('app/auth/terug/route.ts'),/saved\.remember===true/);
 assert.match(read('app/auth/code/route.ts'),/len=sessionLength\(step\.remember\)/);assert.match(read('lib/login-flow.ts'),/len=sessionLength\(step\.remember\)/);
});

// Privacy voor alle sites (wens eigenaar 15 november 2026): één privacybeleid in de backoffice, alle sites halen het op via de
// vaste poort /api/public/v1/privacy. Bewaakt: invoer, bedrijfsgegevens uit Bedrijfsgegevens (niet in de tekst), dat het antwoord
// van de poort (versie 1) niet stilletjes verandert, dat de poort openbaar en alleen lezen is, en opslaan tegen een echte database.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {register} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import './helpers/ts-resolve.mjs';
const P=await import('../lib/privacy-core.ts');
const {allowed}=await import('../lib/onderdelen.ts');

const C={name:'Boer Bart',street:'Erfweg 1',postalCode:'1234 AB',city:'Ergens',kvk:'12345678',email:'info@example.nl'};

test('beginwaarde is geldig en noemt de bedrijfsgegevens alleen via invulwoorden',()=>{
 assert.deepEqual(P.normalizePolicy(P.DEFAULT_POLICY),P.DEFAULT_POLICY);
 const all=JSON.stringify(P.DEFAULT_POLICY);
 assert.ok(!/Schoterweg|Rotstergaast|87761084|@boerbart\.nl/.test(all),'geen vaste bedrijfsgegevens in de tekst');
 for(const k of ['{bedrijfsnaam}','{adres}','{kvk}','{email}'])assert.ok(all.includes(k),k);
});

test('invoer controleren: titel, datum, onderdelen, lengte, geen stuurtekens',()=>{
 const ok={title:'Privacy',intro:'',effectiveFrom:'2026-11-15',sections:[{heading:'Kop',text:'Tekst'}]};
 assert.deepEqual(P.normalizePolicy({...ok,title:'  Privacy  '}),ok);
 assert.throws(()=>P.normalizePolicy({...ok,title:' '}),/titel/);
 assert.throws(()=>P.normalizePolicy({...ok,effectiveFrom:'2026-02-30'}),/datum/);
 assert.throws(()=>P.normalizePolicy({...ok,effectiveFrom:''}),/datum/);
 assert.throws(()=>P.normalizePolicy({...ok,sections:[]}),/minstens één/);
 assert.throws(()=>P.normalizePolicy({...ok,sections:[{heading:'',text:'x'}]}),/kop van onderdeel 1/);
 assert.throws(()=>P.normalizePolicy({...ok,sections:[{heading:'x',text:'y'.repeat(P.LIMITS.text+1)}]}),/te lang/);
 assert.throws(()=>P.normalizePolicy({...ok,sections:Array.from({length:P.LIMITS.sections+1},()=>({heading:'k',text:'t'}))}),/Hooguit/);
 assert.equal(P.normalizePolicy({...ok,intro:'a\u0000b\r\nc'}).intro,'ab\nc');
 assert.deepEqual(P.parsePolicy('kapot'),P.DEFAULT_POLICY,'onleesbaar: de beginwaarde, nooit een fout naar de gast');
});

test('poort v1: vaste velden, bedrijfsgegevens ingevuld, tekst als blokken zonder HTML, niets intern',()=>{
 const p={title:'Privacy bij {bedrijfsnaam}',intro:'{bedrijfsnaam}, {adres} (KvK {kvk}). {onbekend}',effectiveFrom:'2026-11-15',
  sections:[{heading:'Contact',text:'Mail {email}.\n\n## Tussenkop\n<b>geen html</b>'}]};
 const out=P.publicPolicy(p,C,'2026-11-16T09:00:00.000Z');
 assert.deepEqual(Object.keys(out),['versie','title','intro','effectiveFrom','updated','controller','sections']);
 assert.equal(out.versie,1);assert.equal(out.title,'Privacy bij Boer Bart');assert.equal(out.updated,'2026-11-16');
 assert.deepEqual(out.intro,[{type:'alinea',text:'Boer Bart, Erfweg 1, 1234 AB Ergens (KvK 12345678). {onbekend}'}]);
 assert.deepEqual(out.sections,[{heading:'Contact',blocks:[{type:'alinea',text:'Mail info@example.nl.'},{type:'kop',text:'Tussenkop'},{type:'alinea',text:'<b>geen html</b>'}]}]);
 assert.deepEqual(Object.keys(out.controller),['name','street','postalCode','city','kvk','email']);
 assert.equal(P.publicPolicy(p,C,'').updated,'2026-11-15','nooit opgeslagen: de ingangsdatum');
 // Ontbrekende gegevens: geen „undefined” op de site.
 assert.equal(P.fill('{adres}|{kvk}',{...C,street:'',postalCode:'',city:'',kvk:''}),'|');
});

test('de poort is openbaar en alleen lezen; beheer blijft achter de login',async()=>{
 const stub=new URL('./helpers/next-server-stub.mjs',import.meta.url).href;
 register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){return s==='next/server'?n(${JSON.stringify(stub)},c):n(s,c)}`));
 const {proxy}=await import('../proxy.ts');
 const env={SUPABASE_URL:'https://x.supabase.co',SUPABASE_ANON_KEY:'k',AUTH_SECRET:'s'.repeat(40),APP_ORIGIN:'https://bo.example'};
 const old={...process.env};Object.assign(process.env,env);
 try{
  const req=(p,method='GET')=>{const url=new URL(p,'https://bo.example');return {method,url:url.href,nextUrl:url,headers:new Headers({host:'bo.example','x-boer-bart-verified-user':'owner'}),cookies:{get:()=>undefined}}};
  const open=proxy(req('/api/public/v1/privacy'));
  assert.equal(open.kind,'next');assert.equal(open.forwarded?.get('x-boer-bart-verified-user'),null,'geen vervalste eigenaar via de poort');
  for(const [p,m] of [['/api/public/v1/privacy','POST'],['/api/privacy','GET'],['/api/privacy','POST'],['/privacy','GET']]){
   const r=proxy(req(p,m));assert.ok(!(r.kind==='next'&&r.forwarded?.get('x-boer-bart-verified-user')==='owner'),`${m} ${p} kwam binnen`);
  }
 }finally{for(const k of Object.keys(env))if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k]}
 // Rechten: Marketing & website mag het privacybeleid beheren, zonder dat vinkje niet.
 assert.equal(allowed('medewerker',['marketing'],'/privacy','GET'),true);
 assert.equal(allowed('medewerker',['marketing'],'/api/privacy','POST'),true);
 assert.equal(allowed('medewerker',['planning'],'/api/privacy','POST'),false);
 assert.equal(allowed('medewerker',['planning'],'/privacy','GET'),false);
});

test('de nieuwe website heeft geen eigen kopie en leest de poort',()=>{
 const page=fs.readFileSync(new URL('../../website-fab/src/pages/Privacy.tsx',import.meta.url),'utf8');
 const loader=fs.readFileSync(new URL('../../website-fab/src/content/privacy.ts',import.meta.url),'utf8');
 assert.match(loader,/\/api\/public\/v1\/privacy/);assert.match(page,/loadPrivacy/);
 assert.ok(!/Welke gegevens|tracking- of advertentiecookies/.test(page),'geen vaste privacytekst op de site');
});

test('opslaan tegen een echte database: beginwaarde, opslaan, gelijktijdig wijzigen, bedrijfsgegevens',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-privacy-'));
 try{const code=`
 import './tests/helpers/ts-resolve.mjs';import assert from 'node:assert/strict';
 const S=await import('./lib/privacy.ts');const P=await import('./lib/privacy-core.ts');
 const {env}=await import('./lib/portable/env.ts');
 const first=await S.getPrivacy();assert.equal(first.version,0);assert.deepEqual(first.policy,P.DEFAULT_POLICY);
 const pub0=await S.publicPrivacy();assert.equal(pub0.versie,1);assert.equal(pub0.sections.length,P.DEFAULT_POLICY.sections.length);
 const mine={...P.DEFAULT_POLICY,sections:[{heading:'Kort',text:'Mail {email}.'}]};
 const a=await S.savePrivacy(mine,0,'bartele');assert.equal(a.version,1);
 await assert.rejects(()=>S.savePrivacy(mine,0,'rianne'),e=>e.status===409,'tweede scherm met versie 0');
 const b=await S.savePrivacy({...mine,title:'Privacy'},1,'rianne');assert.equal(b.version,2);
 await assert.rejects(()=>S.savePrivacy(mine,1,'bartele'),e=>e.status===409&&/net gewijzigd/.test(e.message));
 await assert.rejects(()=>S.savePrivacy({...mine,sections:[]},2,'bartele'),e=>e.status===400);
 const now=await S.getPrivacy();assert.equal(now.version,2);assert.equal(now.updatedBy,'rianne');assert.equal(now.policy.title,'Privacy');
 // Bedrijfsgegevens komen uit het opgeslagen contact (Bedrijfsgegevens), alleen de openbare velden.
 const contact={tradeName:'Boer Bart',street:'Erfweg 1',postalCode:'1234 AB',city:'Ergens',kvk:'12345678',email:'info@example.nl',iban:'NL91ABNA0417164300',phone:'0612345678'};
 const row=await env.DB.prepare('SELECT data FROM guest_settings WHERE id=1').first();
 if(row)await env.DB.prepare('UPDATE guest_settings SET data=? WHERE id=1').bind(JSON.stringify({...JSON.parse(row.data||'{}'),contact})).run();
 else await env.DB.prepare('INSERT INTO guest_settings (id,rev,res_rev,seq,data) VALUES (1,0,0,0,?)').bind(JSON.stringify({contact})).run();
 const pub=await S.publicPrivacy();
 assert.deepEqual(pub.controller,{name:'Boer Bart',street:'Erfweg 1',postalCode:'1234 AB',city:'Ergens',kvk:'12345678',email:'info@example.nl'});
 assert.equal(pub.sections[0].blocks[0].text,'Mail info@example.nl.');assert.ok(!JSON.stringify(pub).includes('NL91'),'geen IBAN naar buiten');
 console.log('privacy ok');
 `;const r=spawnSync(process.execPath,['--experimental-transform-types','--input-type=module','-e',code],{cwd:new URL('../',import.meta.url),env:{...process.env,APP_DATA_DIR:dir,DATABASE_URL:''},encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stderr+'\n'+r.stdout);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

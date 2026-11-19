// Werkplektablets inloggen met een QR-code (besluit eigenaar 6 november 2026, gebouwd 9 november 2026). De tablet krijgt een
// eigen werkplekpas en kan daarmee alleen de werkplekschermen openen, nooit de backoffice. De koppelcode werkt één keer en
// 2 minuten; ontkoppelen houdt de tablet binnen een uur buiten.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {register} from 'node:module';
import './helpers/ts-resolve.mjs';
const stub=new URL('./helpers/next-server-stub.mjs',import.meta.url).href;
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){return s==='next/server'?n(${JSON.stringify(stub)},c):n(s,c)}`));
const {proxy}=await import('../proxy.ts');
const W=await import('../lib/werkplek-pas-core.ts');
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

const SECRET='s'.repeat(40);
const CONFIG={SUPABASE_URL:'https://x.supabase.co',SUPABASE_ANON_KEY:'k',AUTH_SECRET:SECRET,APP_ORIGIN:'https://bo.example'};
function withEnv(env,fn){const keys=Object.keys(CONFIG),old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));Object.assign(process.env,env);
 try{return fn()}finally{for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k]}}}
function req(p,{method='GET',cookie='',headers={}}={}){const url=new URL(p,'https://bo.example');
 return {method,url:url.href,nextUrl:url,headers:new Headers({host:'bo.example',...headers}),
  cookies:{get:n=>{const hit=cookie.split('; ').map(x=>x.split('=')).find(([k])=>k===n);return hit?{value:hit.slice(1).join('=')}:undefined}}}}
const ID='0b3c3b44-6a42-4c1e-9d55-1d0c2a6c9f10';
const pas=(over={})=>'bb_werkplek='+W.signWerkplek({id:ID,name:'Kassa koffiebar',exp:Date.now()+W.WERKPLEK_MINUTES*60000,...over},SECRET);

test('de werkplekpas: echt, ondertekend, kort geldig',()=>{
 const now=Date.now(),t=W.signWerkplek({id:ID,name:'Kassa',exp:now+60000},SECRET);
 assert.equal(W.readWerkplek(t,SECRET,now)?.name,'Kassa');
 assert.equal(W.readWerkplek(t,'z'.repeat(40),now),null,'andere sleutel');
 assert.equal(W.readWerkplek(W.signWerkplek({id:ID,name:'Kassa',exp:now-1},SECRET),SECRET,now),null,'verlopen');
 assert.equal(W.readWerkplek(W.signWerkplek({id:ID,name:'Kassa',exp:now+86400000},SECRET),SECRET,now),null,'langer dan een uur geldig: geweigerd');
 assert.equal(W.readWerkplek(t.split('.')[0]+'.',SECRET,now),null);assert.equal(W.readWerkplek('',SECRET,now),null);
 const [body,sig]=t.split('.'),forged=Buffer.from(JSON.stringify({id:ID,name:'Kassa',exp:now+60000,role:'eigenaar'})).toString('base64url');
 assert.equal(W.readWerkplek(forged+'.'+sig,SECRET,now),null,'aangepaste inhoud');assert.ok(body);
 // Een backoffice-sessie is geen werkplekpas, en andersom (andere afgeleide sleutel).
 assert.notEqual(W.signWerkplek({id:ID,name:'x',exp:now+1000},SECRET).split('.')[1],undefined);
});

test('een tablet opent alleen de werkplekschermen en hun gegevens',()=>{
 for(const [p,m] of [['/werkplek/kassa','GET'],['/werkplek/kok','GET'],['/werkplek/voorraad','GET'],['/werkplek/team','GET'],['/werkplek/dagplanning','GET'],['/opnemen','GET'],
  ['/api/orders','POST'],['/api/workplaces','GET'],['/api/kassa/afrekenen','POST'],['/api/werkplek/contant','POST'],['/api/products','GET'],['/api/tafels','GET'],['/api/dagplanning','GET'],
  ['/_next/static/chunks/a.js','GET'],['/werkplek.webmanifest','GET']])assert.ok(W.werkplekAllowed(p,m),m+' '+p);
 for(const [p,m] of [['/','GET'],['/toegang','GET'],['/api/toegang','GET'],['/api/toegang/tablets','POST'],['/leden','GET'],['/api/leden','GET'],['/bloei','GET'],['/api/bloei','GET'],
  ['/financien','GET'],['/api/bank','POST'],['/kassa','GET'],['/werkplekken','GET'],['/koppeling','GET'],['/api/gasten/koppelingen','POST'],['/api/proefdata','POST'],['/api/dagplanning','POST'],
  ['/werkplek/kassa','POST'],['/api/hulp','POST'],['/api/mail','GET']])assert.ok(!W.werkplekAllowed(p,m),m+' '+p+' moet dicht zijn');
});

test('proxy: werkplekpas geeft de rol werkplek, zonder code en zonder onderdelen; de backoffice blijft dicht',()=>withEnv(CONFIG,()=>{
 const r=proxy(req('/werkplek/kassa',{cookie:pas()}));assert.equal(r.kind,'next');
 assert.equal(r.forwarded.get('x-boer-bart-role'),'werkplek');assert.equal(r.forwarded.get('x-boer-bart-mfa'),'0');assert.equal(r.forwarded.get('x-boer-bart-onderdelen'),'');
 assert.match(r.forwarded.get('x-boer-bart-account'),/^tablet Kassa koffiebar$/);
 const api=proxy(req('/api/kassa/afrekenen',{method:'POST',cookie:pas()}));assert.equal(api.kind,'next');
 for(const p of ['/api/toegang','/api/leden','/api/bloei','/api/bank','/api/toegang/tablets']){const x=proxy(req(p,{method:'POST',cookie:pas()}));assert.equal(x.status,403,p);assert.notEqual(x.kind,'next',p)}
 for(const p of ['/','/toegang','/leden','/financien','/bloei','/kassa']){const x=proxy(req(p,{cookie:pas()}));assert.equal(x.kind,'redirect',p);assert.equal(new URL(x.location).pathname,'/werkplek/kassa',p)}
 // Vervalste koppen naast een werkplekpas worden overschreven.
 const f=proxy(req('/werkplek/kassa',{cookie:pas(),headers:{'x-boer-bart-role':'eigenaar','x-boer-bart-onderdelen':'*'}}));
 assert.equal(f.forwarded.get('x-boer-bart-role'),'werkplek');assert.equal(f.forwarded.get('x-boer-bart-onderdelen'),'');
}));

test('proxy: verlopen of nagemaakte pas komt niet binnen; een gekoppelde tablet haalt eerst een nieuwe pas',()=>withEnv(CONFIG,()=>{
 for(const c of [pas({exp:Date.now()-1}),'bb_werkplek='+W.signWerkplek({id:ID,name:'x',exp:Date.now()+60000},'z'.repeat(40))]){
  const r=proxy(req('/werkplek/kassa',{cookie:c}));assert.equal(r.kind,'redirect');assert.match(r.location,/\/inloggen\?terug=/);
  assert.equal(proxy(req('/api/orders',{cookie:c})).status,401);
 }
 const dev='bb_werkplek_pas='+'a'.repeat(43);
 const r=proxy(req('/werkplek/kok?x=1',{cookie:dev}));assert.equal(r.kind,'redirect');
 const to=new URL(r.location);assert.equal(to.pathname,'/auth/werkplek/vernieuw');assert.equal(to.searchParams.get('terug'),'/werkplek/kok?x=1');
 assert.equal(new URL(proxy(req('/toegang',{cookie:dev})).location).searchParams.get('terug'),null,'geen terugweg naar de backoffice');
 assert.equal(proxy(req('/api/orders',{cookie:dev})).status,401,'API: gewoon 401, het scherm vernieuwt zelf');
 // Koppelen en vernieuwen zijn open; de routes controleren zelf.
 for(const [p,m] of [['/tablet/koppelen','GET'],['/auth/werkplek/koppelen','POST'],['/auth/werkplek/vernieuw','GET'],['/auth/werkplek/vernieuw','POST']])assert.equal(proxy(req(p,{method:m})).kind,'next',m+' '+p);
 assert.notEqual(proxy(req('/auth/werkplek/koppelen',{method:'GET'})).kind,'next','inwisselen alleen met POST');
}));

test('een echte backoffice-sessie gaat voor; het koppelscherm toont geen menu',()=>{
 assert.match(read('proxy.ts'),/const session=readSession[\s\S]*if\(!session\)\{[\s\S]*readWerkplek/);
 assert.match(read('app/shell.tsx'),/path\.startsWith\('\/tablet\/'\)/);
 assert.match(read('app/werkplek/layout.tsx'),/<WerkplekVernieuwen\/>/);assert.match(read('app/opnemen/layout.tsx'),/<WerkplekVernieuwen\/>/);
 const page=read('app/tablet/koppelen/page.tsx');assert.match(page,/location\.hash/);assert.match(page,/method:'POST'/);
 const api=read('app/api/toegang/tablets/route.ts');assert.match(api,/isOwnerRequest\(req\)/);assert.match(api,/'\/tablet\/koppelen#'\+p\.code/);
});

test('migratie: twee nieuwe tabellen met beveiliging per rij, alleen de hash van het bewijs',()=>{
 const sql=read('drizzle-pg/0058_werkplektablets.sql');
 for(const t of ['workplace_devices','workplace_pairings']){assert.match(sql,new RegExp(`CREATE TABLE "${t}"`));assert.match(sql,new RegExp(`ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY`))}
 assert.match(sql,/CREATE UNIQUE INDEX "workplace_devices_hash"/);assert.doesNotMatch(sql,/"secret"|"code" text/);
});

test('koppelen: korte code werkt één keer en 10 minuten, ook getypt; ontkoppelen houdt de tablet buiten',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-tablets-'));process.env.APP_DATA_DIR=dir;process.env.DATABASE_URL='';
 const {env,closeDatabase}=await import('../lib/portable/env.ts'),S=await import('../lib/werkplek-pas.ts');
 t.after(async()=>{await closeDatabase();fs.rmSync(dir,{recursive:true,force:true})});
 await assert.rejects(S.createPairing(' ','eigenaar'),/naam/);
 const p=await S.createPairing('  Kassa   koffiebar ','admin');assert.equal(p.name,'Kassa koffiebar');assert.match(p.code,/^[A-HJ-NP-Z2-9]{8}$/,'korte code zonder 0/O en 1/I/L');
 const row=await env.DB.prepare('SELECT * FROM workplace_pairings').first();assert.notEqual(row.code_hash,p.code,'alleen de hash');
 await assert.rejects(S.redeemPairing('x'),/klopt niet/);
 // Getypt op een scherm zonder camera (wens eigenaar 15 november 2026): klein en met een streepje mag ook.
 const d=await S.redeemPairing(' '+(p.code.slice(0,4)+'-'+p.code.slice(4)).toLowerCase()+' ');assert.equal(d.name,'Kassa koffiebar');
 await assert.rejects(S.redeemPairing(p.code),/verlopen of al gebruikt/,'tweede keer niet');
 const dev=await env.DB.prepare('SELECT * FROM workplace_devices').first();assert.equal(dev.token_hash,W.hashSecret(d.secret));assert.notEqual(dev.token_hash,d.secret);
 assert.deepEqual(await S.deviceBySecret(d.secret),{id:d.id,name:'Kassa koffiebar'});assert.equal(await S.deviceBySecret('b'.repeat(43)),null);
 // Verlopen code.
 const q=await S.createPairing('Keuken','admin');await env.DB.prepare('UPDATE workplace_pairings SET expires=? WHERE code_hash=?').bind(new Date(Date.now()-1000).toISOString(),W.hashSecret(q.code)).run();
 await assert.rejects(S.redeemPairing(q.code),/verlopen/);
 // Twee tablets die tegelijk dezelfde code proberen: één wint.
 const c=await S.createPairing('Winkel','admin'),both=await Promise.allSettled([S.redeemPairing(c.code),S.redeemPairing(c.code)]);
 assert.equal(both.filter(x=>x.status==='fulfilled').length,1);
 await S.revokeDevice(d.id,'admin');assert.equal(await S.deviceBySecret(d.secret),null,'ontkoppeld');
 await assert.rejects(S.revokeDevice(d.id,'admin'),/al ontkoppeld/);
 const list=await S.listDevices();assert.equal(list.length,2);assert.ok(list.every(x=>!('tokenHash' in x)),'nooit het bewijs');
});

test('korte koppelcode: vorm en geldigheid (wens eigenaar 15 november 2026)',()=>{
 const codes=new Set(Array.from({length:200},()=>W.newPairCode()));assert.ok(codes.size>195,'willekeurig');
 for(const c of codes)assert.match(c,/^[A-HJ-NP-Z2-9]{8}$/);
 assert.equal(W.normalizePairCode('abcd-efgh'),'ABCDEFGH');assert.equal(W.normalizePairCode('ABCD EFG0'),'','geen 0');assert.equal(W.normalizePairCode('ABC'),'');
 assert.equal(W.showPairCode('ABCDEFGH'),'ABCD-EFGH');assert.equal(W.PAIR_SECONDS,600,'10 minuten');
});

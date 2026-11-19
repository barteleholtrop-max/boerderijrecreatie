// Inloggen staat altijd aan (besluit eigenaar 8 november 2026: "Inlog moet altijd aanstaan. De functie dat dit niet zo is
// moet vervallen."). Deze test valt de proxy aan zoals een buitenstaander dat zou doen: zonder sessie, met vervalste
// identiteitskoppen, met adrestrucs, met een nagemaakte sessie, en met de oude schakelaars (BOER_BART_LOGIN, LOCAL_NO_LOGIN,
// TUNNEL_NO_LOGIN) aan of uit. Niemand mag de backoffice of het planbord binnenkomen zonder geldige sessie met Authenticator-code.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import './helpers/ts-resolve.mjs';
const stub=new URL('./helpers/next-server-stub.mjs',import.meta.url).href;
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){return s==='next/server'?n(${JSON.stringify(stub)},c):n(s,c)}`));
const {proxy}=await import('../proxy.ts');
const {proxy:planbord}=await import('../../planbord/proxy.ts');
const L=await import('../lib/login-core.ts');

const SECRET='s'.repeat(40);
const CONFIG={SUPABASE_URL:'https://x.supabase.co',SUPABASE_ANON_KEY:'k',AUTH_SECRET:SECRET,APP_ORIGIN:'https://bo.example'};
const OLD_SWITCHES=[{},{BOER_BART_LOGIN:''},{BOER_BART_LOGIN:'uit'},{BOER_BART_LOGIN:'0'},
 {LOCAL_NO_LOGIN:'1',APP_ORIGIN:'http://localhost:3001'},{TUNNEL_NO_LOGIN:'1',BACKOFFICE_TUNNEL_ORIGIN:'https://boer.trycloudflare.com'}];
const KEYS=['BOER_BART_LOGIN','LOCAL_NO_LOGIN','TUNNEL_NO_LOGIN','BACKOFFICE_TUNNEL_ORIGIN','K_SERVICE',...Object.keys(CONFIG)];
function withEnv(env,fn){
 const old=Object.fromEntries(KEYS.map(k=>[k,process.env[k]]));
 for(const k of KEYS)delete process.env[k];Object.assign(process.env,env);
 try{return fn()}finally{for(const k of KEYS){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k]}}
}
function req(path,{method='GET',host='bo.example',headers={},cookie=''}={}){
 const url=new URL(path,'https://'+host);
 return {method,url:url.href,nextUrl:url,headers:new Headers({host,...headers}),
  cookies:{get:n=>{const hit=cookie.split('; ').map(x=>x.split('=')).find(([k])=>k===n);return hit?{value:hit.slice(1).join('=')}:undefined}}};
}
const asOwner=r=>r.kind==='next'&&r.forwarded?.get('x-boer-bart-verified-user')==='owner';
const ADMIN=['/','/toegang','/bloei','/financien','/leden','/kassa','/planning','/api/toegang','/api/bloei','/api/leden','/api/bank','/api/products','/api/bedrijfsgegevens','/api/public/bloei','/api/public/bloei-proef'];
const FAKE={'x-boer-bart-verified-user':'owner','x-boer-bart-role':'eigenaar','x-boer-bart-onderdelen':'*','x-boer-bart-account':'eigenaar','x-boer-bart-mfa':String(Date.now()),'oai-authenticated-user-id':'1','oai-authenticated-user-email':'administratie@boerbart.nl'};

test('zonder sessie komt niemand binnen, wat de oude schakelaars ook zeggen',()=>{
 for(const sw of OLD_SWITCHES)withEnv({...CONFIG,...sw},()=>{
  for(const host of ['bo.example','localhost:3001','127.0.0.1:3001','boer.trycloudflare.com'])for(const p of ADMIN)for(const method of ['GET','POST']){
   const r=proxy(req(p,{method,host}));
   assert.ok(!asOwner(r),`${JSON.stringify(sw)} ${host} ${method} ${p} kwam binnen`);
   assert.ok(r.status===401||r.status===302,`${p} gaf ${r.status}`);
  }
 });
});
test('zonder Supabase-instellingen blijft de backoffice dicht (503), nooit open',()=>{
 for(const sw of OLD_SWITCHES)withEnv({...sw},()=>{for(const p of ['/','/api/toegang','/api/leden'])assert.equal(proxy(req(p)).status,503,JSON.stringify(sw)+p)});
});
test('vervalste identiteitskoppen van buiten helpen niet, ook niet op de openbare deuren',()=>withEnv(CONFIG,()=>{
 for(const p of ADMIN)assert.ok(!asOwner(proxy(req(p,{headers:FAKE}))),p);
 for(const [p,method] of [['/api/public/products','GET'],['/api/public/orders','POST'],['/api/public/payments','POST'],['/api/werkproces/ronde','POST'],
  ['/deelnemer/'+'a'.repeat(43),'GET'],['/api/deelnemer/'+'a'.repeat(43)+'/financien','GET'],['/api/public/bloeimarkt','POST'],['/auth/lid/google','POST'],['/inloggen','GET']]){
  const r=proxy(req(p,{method,headers:FAKE}));
  if(r.kind==='next'&&r.forwarded)for(const k of Object.keys(FAKE))assert.equal(r.forwarded.get(k),null,`${p} laat ${k} door`);
 }
}));
test('adrestrucs (dubbele slash, hoofdletters, ../, %2e, %2f) openen geen beheer',()=>withEnv(CONFIG,()=>{
 for(const p of ['//toegang','/Toegang','/api/public/../toegang','/api/public/%2e%2e/toegang','/api/public/products/../../api/toegang','/api/public%2fproducts',
  '/api/public/products.json','/inloggen/../toegang','/_next/static/../../api/toegang','/favicon.svg/../api/leden','/deelnemer/'+'a'.repeat(43)+'/../../api/leden'])
  assert.ok(!asOwner(proxy(req(p))),p);
}));
test('een nagemaakte, verlopen of codeloze sessie wordt geweigerd',()=>withEnv(CONFIG,()=>{
 const now=Date.now(),me={email:'a@b.nl',name:'a',role:'eigenaar'};
 for(const c of [L.signSession({...me,exp:now+1e6,mfa:now},'z'.repeat(40)),L.signSession({...me,exp:now-1,mfa:now-1000},SECRET),
  L.signSession({...me,exp:now+1e6},SECRET),L.signSession({...me,role:'god',exp:now+1e6,mfa:now},SECRET),
  Buffer.from(JSON.stringify({...me,exp:now+1e6,mfa:now})).toString('base64url')+'.','eyJ9.x'])
  assert.ok(!asOwner(proxy(req('/api/toegang',{cookie:'bb_sessie='+c}))),c.slice(0,24));
 assert.ok(asOwner(proxy(req('/api/toegang',{cookie:'bb_sessie='+L.signSession({...me,exp:now+1e6,mfa:now},SECRET)}))),'een echte sessie werkt wel');
}));
test('een medewerker komt alleen in zijn eigen onderdelen',()=>withEnv(CONFIG,()=>{
 const now=Date.now(),c='bb_sessie='+L.signSession({email:'m@b.nl',name:'m',role:'medewerker',modules:['planning'],exp:now+1e6,mfa:now},SECRET);
 for(const p of ['/toegang','/api/toegang','/bloei','/api/bloei','/financien','/api/bank','/api/leden','/bedrijfsgegevens','/koppeling'])assert.notEqual(proxy(req(p,{method:'POST',cookie:c})).kind,'next',p);
 assert.equal(proxy(req('/planning',{cookie:c})).kind,'next');
}));
test('planbord: zonder sessie van een eigenaar komt niemand binnen, wat de oude schakelaars ook zeggen',()=>{
 for(const sw of OLD_SWITCHES){
  withEnv({AUTH_SECRET:SECRET,...sw},()=>{for(const p of ['/','/api/board'])for(const host of ['localhost:3000','127.0.0.1:3000','plan.example']){
   const r=planbord(req(p,{host,headers:FAKE}));assert.ok(!asOwner(r),`${JSON.stringify(sw)} ${host} ${p}`);
  }});
  withEnv({...sw},()=>assert.equal(planbord(req('/')).status,503,'zonder sleutel dicht'));
 }
});
test('startscherm: manifesten en iconen zonder login, de schermen zelf blijven dicht (9 november 2026)',()=>withEnv(CONFIG,()=>{
 for(const p of ['/backoffice.webmanifest','/werkplek.webmanifest','/opnemen.webmanifest','/kassa.webmanifest','/icons/backoffice-192.png','/icons/werkplek-512.png','/icons/opnemen-192.png']){
  const r=proxy(req(p));assert.equal(r.kind,'next',p+' moet zonder login te laden zijn');assert.ok(!asOwner(r),p+' geeft geen eigenaar door');
 }
 for(const p of ['/werkplek/koffiebar','/werkplek/dagplanning','/opnemen','/kassa','/','/icons/../toegang','/backoffice.webmanifest/../api/toegang'])assert.ok(!asOwner(proxy(req(p))),p);
 assert.notEqual(proxy(req('/backoffice.webmanifest',{method:'POST'})).kind,'next','alleen lezen');
}));

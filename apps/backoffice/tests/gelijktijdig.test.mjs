// Systeemtest 5 november 2026: wat de belastingtest liet zien, vastgelegd tegen een echte, tijdelijke database.
// 1) Kassa: 40 tablets tegelijk verkochten 40 van 10 taarten. 2) Afboeken na betalen: 10 betalingen tegelijk boekten er 6 af.
// 3) Ite-aanvragen: van 20 tegelijk kwamen er 5 door, de rest kreeg „probeer het opnieuw”.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const run=(name,code)=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-'+name+'-'));
 try{const r=spawnSync(process.execPath,['--experimental-transform-types','--input-type=module','-e',"import './tests/helpers/ts-resolve.mjs';import assert from 'node:assert/strict';"+code],{cwd:new URL('../',import.meta.url),env:{...process.env,APP_DATA_DIR:dir,APP_ORIGIN:'http://127.0.0.1:3001',PUBLIC_ORDER_ORIGINS:''},encoding:'utf8',timeout:90000});
  assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/ok/)}finally{fs.rmSync(dir,{recursive:true,force:true})}};
const SETUP=`
 const {getDb}=await import('./db/index.ts');const {products}=await import('./db/schema.ts');
 const {setProductCount}=await import('./lib/product-count.ts');const {loadOps}=await import('./lib/operations-store.ts');
 const db=getDb(),p={name:'Taart',department:'Winkel',priceCents:450,vat:'9',station:'winkel',available:true,photo:'',check:'',note:'',sourceId:''};
 await db.insert(products).values({id:'t1',draft:JSON.stringify(p),published:JSON.stringify(p),version:1});
 const version=await setProductCount('t1',1,N,crypto.randomUUID());
 const stock=async()=>(await loadOps('none')).state.ingredients.filter(i=>i.name.startsWith('Taart')).reduce((s,i)=>s+i.stock,0);
`;
test('kassa: tablets tegelijk verkopen nooit meer dan er ligt, en de voorraad klopt daarna',()=>run('kassa',`const N=3;${SETUP}
 const {POST}=await import('./app/api/orders/route.ts');
 const sell=()=>POST(new Request('http://127.0.0.1:3001/api/orders',{method:'POST',headers:{'content-type':'application/json',origin:'http://127.0.0.1:3001'},
  body:JSON.stringify({requestId:crypto.randomUUID(),mode:'winkel',reference:'',lines:[{productId:'t1',version,quantity:1,selections:{},note:''}]})}));
 const codes=(await Promise.all(Array.from({length:8},sell))).map(r=>r.status).sort();
 assert.deepEqual(codes,[200,200,200,409,409,409,409,409]);
 assert.equal(await stock(),0,'precies 3 afgeboekt');
 console.log('ok');`));
test('afboeken: gelijktijdige verkopen (zoals betalingen die tegelijk binnenkomen) gaan allemaal van de voorraad af',()=>run('afboeken',`const N=6;${SETUP}
 const {recordSale}=await import('./lib/stock-sales.ts');
 await Promise.all(Array.from({length:6},(_,k)=>recordSale('P0000'+(k+1),[{productId:'t1',quantity:1}])));
 assert.equal(await stock(),0,'alle zes afgeboekt');
 await recordSale('P00001',[{productId:'t1',quantity:1}]);assert.equal(await stock(),0,'nog eens hetzelfde bestelnummer verandert niets');
 console.log('ok');`));
test('planning: gelijktijdige aanpassingen (zoals Ite-aanvragen) wachten op elkaar en gaan niet verloren',()=>run('planning',`
 const {editGuest,loadGuest}=await import('./lib/guest-store.ts');
 const r=k=>({id:'web-yte:'+k,name:'Gast '+k,email:'',phone:'',activity:'yte',date:'2027-03-04',from:'19:00',to:'22:00',people:2,sharing:false,status:'aanvraag',expires:'',notes:'',threadId:'',tables:[]});
 await Promise.all(Array.from({length:10},(_,k)=>editGuest(s=>{s.reservations.push(r(k))})));
 assert.equal((await loadGuest()).state.reservations.filter(x=>x.id.startsWith('web-yte:')).length,10);
 await assert.rejects(editGuest(()=>{throw Error('Dit moment is niet (meer) te reserveren.')}),/niet \\(meer\\) te reserveren/,'een regel-fout gaat meteen terug');
 console.log('ok');`));

// Issue #141: het laatste stuk kan online maar één keer besteld worden, ook als twee gasten tegelijk bestellen
// en ook zolang de eerste nog niet betaald heeft. Tegen een echte, tijdelijke database.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('websitebestelling: laatste stuk één keer; wachtende bestelling houdt het vast; daarna vrij',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-stock-reserve-'));
 try{const code=`
 import './tests/helpers/ts-resolve.mjs';import assert from 'node:assert/strict';
 const {getDb}=await import('./db/index.ts');const {products}=await import('./db/schema.ts');
 const {setProductCount}=await import('./lib/product-count.ts');
 const {availableForWebsite,RESERVE_MINUTES}=await import('./lib/stock-sales.ts');
 const {POST}=await import('./app/api/public/orders/route.ts');
 const db=getDb(),p={name:'Honing',department:'Winkel',priceCents:650,vat:'9',station:'winkel',available:true,photo:'',check:'',note:'',sourceId:''};
 await db.insert(products).values({id:'p1',draft:JSON.stringify(p),published:JSON.stringify(p),version:1});
 assert.equal(await setProductCount('p1',1,1,crypto.randomUUID()),2);
 let ip=0;
 const order=()=>POST(new Request('http://127.0.0.1:3001/api/public/orders',{method:'POST',headers:{'content-type':'application/json',origin:'http://localhost:3002','x-forwarded-for':'203.0.113.'+(++ip)},
  body:JSON.stringify({requestId:crypto.randomUUID(),route:'winkel',lines:[{productId:'p1',version:2,quantity:1}]})}));
 const both=await Promise.all([order(),order()]);
 const codes=both.map(r=>r.status).sort();
 assert.deepEqual(codes,[201,409],'precies één gast krijgt het laatste stuk: '+JSON.stringify(await Promise.all(both.map(r=>r.clone().json()))));
 // De eerste heeft nog niet betaald: toch is het stuk niet meer te bestellen.
 const third=await order();assert.equal(third.status,409);assert.match((await third.json()).error,/uitverkocht/);
 const rows=await db.select().from(products);
 assert.equal((await availableForWebsite(rows)).get('p1'),0,'vastgehouden door de wachtende bestelling');
 assert.equal((await availableForWebsite(rows,Date.now()+(RESERVE_MINUTES+1)*60_000)).get('p1'),1,'verlaten bestelling geeft het stuk vanzelf vrij');
 console.log('ok');
 `;const r=spawnSync(process.execPath,['--experimental-transform-types','--input-type=module','-e',code],{cwd:new URL('../',import.meta.url),env:{...process.env,APP_DATA_DIR:dir,PUBLIC_ORDER_ORIGINS:''},encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stderr+'\n'+r.stdout);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

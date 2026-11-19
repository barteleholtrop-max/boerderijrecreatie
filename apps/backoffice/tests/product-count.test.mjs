// Voorraad als getal in de productentabel (3 november 2026): tegen een echte, tijdelijke SQLite-database.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('aantal invullen: product zonder recept wordt doorverkoop en geteld; herhaalbaar; samengesteld recept niet hier',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-product-count-'));
 try{const code=`
 import './tests/helpers/ts-resolve.mjs';import assert from 'node:assert/strict';
 const {getDb}=await import('./db/index.ts');const {products}=await import('./db/schema.ts');const {eq}=await import('drizzle-orm');
 const {setProductCount,CountError}=await import('./lib/product-count.ts');const {loadOps}=await import('./lib/operations-store.ts');
 const {productStock}=await import('./lib/shop-stock.ts');
 const db=getDb(),p={name:'Honing Boer Bart',department:'Winkel',priceCents:650,vat:'9',station:'winkel',available:true,photo:'',check:'',note:'',sourceId:''};
 await db.insert(products).values({id:'p1',draft:JSON.stringify(p),published:JSON.stringify(p),version:1});
 const req='0d6f9c1e-6a2b-4c4f-9f2e-1a2b3c4d5e6f';
 assert.equal(await setProductCount('p1',1,12,req),2);
 let row=(await db.select().from(products).where(eq(products.id,'p1')))[0];
 assert.equal(JSON.parse(row.draft).stockMode,'geteld');assert.equal(JSON.parse(row.published).stockMode,'geteld','geldt meteen voor gasten');
 let s=(await loadOps('none')).state;
 assert.equal(s.recipes.filter(r=>r.productId==='p1').length,1);const ing=s.ingredients.find(i=>i.name==='Honing Boer Bart');
 assert.equal(ing.unit,'st');assert.equal(ing.stock,12);assert.equal(ing.known,true);
 assert.equal(productStock({ingredients:s.ingredients,recipes:s.recipes},{id:'p1',stockMode:'geteld'}).stock,12);
 // Zelfde aanvraag nog eens: niets dubbel.
 assert.equal(await setProductCount('p1',2,12,req),2);
 // Nieuwe telling: zelfde ingrediënt, geen tweede recept.
 await setProductCount('p1',2,5,'1d6f9c1e-6a2b-4c4f-9f2e-1a2b3c4d5e6f');
 s=(await loadOps('none')).state;assert.equal(s.ingredients.filter(i=>i.name==='Honing Boer Bart').length,1);assert.equal(s.ingredients.find(i=>i.name==='Honing Boer Bart').stock,5);
 // Verkeerde versie, negatief aantal.
 await assert.rejects(()=>setProductCount('p1',1,3,'2d6f9c1e-6a2b-4c4f-9f2e-1a2b3c4d5e6f'),e=>e instanceof CountError&&e.status===409);
 await assert.rejects(()=>setProductCount('p1',2,-1,'3d6f9c1e-6a2b-4c4f-9f2e-1a2b3c4d5e6f'),e=>e instanceof CountError&&e.status===400);
 // Samengesteld recept: tellen via de ingrediënten.
 const ops=await loadOps('none'),{saveOps}=await import('./lib/operations-store.ts'),n=structuredClone(ops.state);
 n.ingredients.push({id:'i-a',name:'Meel',unit:'kg',supplier:'',article:'',stock:0,known:false,countedAt:'',pack:1,min:0,leadDays:1,shelfDays:0,allergens:[],checked:false,notes:'',origin:'inkoop',ownCents:null},{id:'i-b',name:'Ei',unit:'st',supplier:'',article:'',stock:0,known:false,countedAt:'',pack:1,min:0,leadDays:1,shelfDays:0,allergens:[],checked:false,notes:'',origin:'inkoop',ownCents:null});
 n.recipes.push({productId:'p2',name:'Pannenkoek',yield:4,lines:[{ingredientId:'i-a',quantity:0.2},{ingredientId:'i-b',quantity:2}],method:'',lossPct:0,packagingCents:0,version:1,reviewed:false});
 assert.equal(await saveOps(ops,n,'4d6f9c1e-6a2b-4c4f-9f2e-1a2b3c4d5e6f','test'),'saved');
 await db.insert(products).values({id:'p2',draft:JSON.stringify({...p,name:'Pannenkoek'}),published:null,version:1});
 await assert.rejects(()=>setProductCount('p2',1,3,'5d6f9c1e-6a2b-4c4f-9f2e-1a2b3c4d5e6f'),e=>e instanceof CountError&&/recept/.test(e.message));
 console.log('Product count checks passed');
 `;const r=spawnSync(process.execPath,['--experimental-transform-types','--input-type=module','-e',code],{cwd:new URL('../',import.meta.url),env:{...process.env,APP_DATA_DIR:dir},encoding:'utf8',timeout:45000});assert.equal(r.status,0,r.stderr+'\n'+r.stdout);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

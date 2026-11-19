// Biologisch geteeld en SKAL-gecertificeerd (wens eigenaar 8 november 2026), en „geleverd door” in de kassa.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './helpers/ts-resolve.mjs';
const {parseNewProduct,parseProductEdit,newProductData}=await import('../lib/coop-portal-core.ts');
const base={name:'Scharreleieren',priceCents:350,vat:'9'};
test('biologisch en SKAL: SKAL is altijd ook biologisch; standaard geen van beide',()=>{
 assert.deepEqual((({organic,skal})=>({organic,skal}))(parseNewProduct(base)),{organic:false,skal:false});
 assert.deepEqual((({organic,skal})=>({organic,skal}))(parseNewProduct({...base,organic:true})),{organic:true,skal:false});
 assert.deepEqual((({organic,skal})=>({organic,skal}))(parseNewProduct({...base,skal:true})),{organic:true,skal:true});
 assert.equal(parseProductEdit({...base,skal:true}).skal,true);
 const d=newProductData(parseNewProduct({...base,organic:true}),'', 'Ingeborg','2026-11-08');assert.equal(d.organic,true);assert.equal(d.skal,false);
});
test('kassa toont van wie het product is en of het biologisch is; de API accepteert de vinkjes',()=>{
 const r=fs.readFileSync(new URL('../app/kassa/register.tsx',import.meta.url),'utf8'),api=fs.readFileSync(new URL('../app/api/products/route.ts',import.meta.url),'utf8');
 assert.match(r,/'Geleverd door '\+p\.supplier/);assert.match(r,/Biologisch \(SKAL\)/);
 assert.match(api,/supplier:by\.get\(r\.id\)\|\|null/);assert.match(api,/x\.skal===undefined\|\|typeof x\.skal==='boolean'/);
});

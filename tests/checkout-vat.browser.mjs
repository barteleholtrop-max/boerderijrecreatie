import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../apps/backoffice/tests/helpers/ts-resolve.mjs';
const {valuation}=await import('../apps/backoffice/lib/order-options.ts');
const source=fs.readFileSync(new URL('../apps/website/bestellen.js',import.meta.url),'utf8');
const start=source.indexOf('  function paidVat('),end=source.indexOf('  const checkoutLines',start);
const paidVat=vm.runInNewContext(source.slice(start,end)+'\npaidVat');
const rows=[{totalCents:850,vat:'9'},{totalCents:340,vat:'21'}];
test('btw bij afrekenen volgt serververdeling, gemengde tarieven en afronding per regel',()=>{
 for(const lines of [rows,[{totalCents:1,vat:'9'},{totalCents:1,vat:'21'}],[{totalCents:650,vat:'9'}]]){
  for(const amount of [0,1,2,3,5,99,500,1190,3570]){
   const result=valuation(lines,amount),actual=Object.fromEntries(paidVat(lines,amount));
   for(const rate of Object.keys(actual))assert.equal(actual[rate],result[rate==='9'?'vat9Cents':'vat21Cents'],`${rate}% bij ${amount}`);
  }
 }
 assert.deepEqual(Object.fromEntries(paidVat(rows,1190)),{'9':70,'21':59});
 assert.deepEqual(Object.fromEntries(paidVat(rows,500)),{'9':29,'21':25});
 assert.deepEqual(Object.fromEntries(paidVat([{totalCents:0,vat:'9'}],0)),{'9':0});
});

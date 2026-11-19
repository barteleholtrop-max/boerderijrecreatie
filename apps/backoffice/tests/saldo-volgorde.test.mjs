// Welk saldo eerst (wens eigenaar 8 november 2026): het lid kiest rentesaldo of BB-saldo eerst; standaard rentesaldo.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './helpers/ts-resolve.mjs';
const {splitDividendPayment}=await import('../lib/bb-core.ts');
test('splitsen: standaard eerst rentesaldo, op verzoek eerst BB; tekort = geen betaling',()=>{
 assert.deepEqual(splitDividendPayment(1000,600,800),{fromBond:600,fromBb:400});
 assert.deepEqual(splitDividendPayment(1000,600,800,'bb'),{fromBond:200,fromBb:800});
 assert.deepEqual(splitDividendPayment(500,600,800,'bb'),{fromBond:0,fromBb:500});
 assert.equal(splitDividendPayment(2000,600,800,'bb'),null);assert.equal(splitDividendPayment(2000,600,800),null);
});
test('bestelling neemt de keuze mee; bestelpagina laat kiezen als er beide saldi zijn',async()=>{
 const {parseGuestOrder}=await import('../lib/public-orders.ts').catch(()=>({}));
 const src=fs.readFileSync(new URL('../lib/public-orders.ts',import.meta.url),'utf8');assert.match(src,/body\.saldoEerst==='bb'\?'bb' as const/);
 assert.match(fs.readFileSync(new URL('../app/api/public/orders/route.ts',import.meta.url),'utf8'),/order\.saldoEerst\|\|'rente'/);
 const b=fs.readFileSync(new URL('../../website/bestellen.js',import.meta.url),'utf8');
 assert.match(b,/Wat wil je eerst gebruiken\?/);assert.match(b,/'Eerst rentesaldo'/);assert.match(b,/'Eerst BB-saldo'/);assert.match(b,/saldoEerst: 'bb'/);assert.doesNotMatch(b,/Het lid kiest niet/);
});

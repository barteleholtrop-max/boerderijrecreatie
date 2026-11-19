import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {fromRows} from '../lib/operations-rows.ts';
import {sample} from './operations-fixture.mjs';
const dir=new URL('../drizzle/',import.meta.url),files=fs.readdirSync(dir).filter(n=>n.endsWith('.sql')).sort();
const apply=(db,names)=>{for(const n of names)db.exec(fs.readFileSync(new URL(n,dir),'utf8'))};
const line=(o)=>({productId:'p',name:'Koffie',quantity:1,unitCents:350,totalCents:350,vat:'9',vatCents:29,station:'barista',choices:[],note:'',...o});
test('bestaande bestellingen krijgen kolommen en regels zonder dat de vastgelegde JSON verandert',()=>{
 const db=new DatabaseSync(':memory:'),before=files.filter(n=>n<'0006');apply(db,before);
 const data=JSON.stringify({mode:'yte',reference:'Tafel 4',lines:[line(),line({productId:'b',name:'Brood',vat:'21',vatCents:84,totalCents:484,unitCents:484,station:'winkel'})],totalCents:834,test:true});
 db.prepare('INSERT INTO orders(request_id,request,data,created) VALUES(?,?,?,?)').run('r1','{}',data,'2026-10-30T10:00:00.000Z');
 apply(db,files.filter(n=>n>='0006'));
 const o=db.prepare('SELECT * FROM orders').get();
 assert.equal(o.data,data);assert.equal(o.mode,'yte');assert.equal(o.reference,'Tafel 4');assert.equal(o.total_cents,834);assert.equal(o.vat9_cents,29);assert.equal(o.vat21_cents,84);assert.equal(o.test,1);assert.equal(o.status,'vastgelegd');assert.equal(o.payment_status,'niet-gekoppeld');
 assert.deepEqual(db.prepare('SELECT position,station,total_cents FROM order_lines ORDER BY position').all().map(r=>({...r})),[{position:0,station:'barista',total_cents:350},{position:1,station:'winkel',total_cents:484}]);
});
test('een betaalkenmerk van dezelfde aanbieder kan maar één keer voorkomen',()=>{
 const db=new DatabaseSync(':memory:');apply(db,files);
 db.prepare("INSERT INTO orders(request_id,request,data,created) VALUES('r1','{}','{}','2026-10-30')").run();
 const add=db.prepare("INSERT INTO payments(id,request_id,order_id,method,amount_cents,provider,external_ref,created,updated) VALUES(?,?,1,'bank',100,'bank',?,'x','x')");
 add.run('a','ra','BANK-1');add.run('b','rb',null);add.run('c','rc',null);
 assert.throws(()=>add.run('d','rd','BANK-1'),/UNIQUE/);assert.throws(()=>add.run('e','ra','BANK-9'),/UNIQUE/);
});

test('voorraad, facturen en recepten komen volledig uit het JSON-document in eigen tabellen',()=>{
 const db=new DatabaseSync(':memory:');apply(db,files.filter(n=>n<'0007'));
 const s=sample();s.requests=['r-oud-1','r-oud-2'];s.recipeHistory=[{recipe:{...s.recipes[0],version:1},date:'2026-10-01',portionCents:55}];
 db.prepare('INSERT INTO operations_state(id,data,version,updated) VALUES(1,?,7,?)').run(JSON.stringify(s),'2026-10-30T10:00:00Z');
 apply(db,files.filter(n=>n>='0007'));
 const all=(q)=>db.prepare(q).all().map(r=>({...r}));
 const rows={ingredients:all('SELECT id,name,unit,supplier,article,stock,known,counted_at countedAt,pack,min,lead_days leadDays,shelf_days shelfDays,allergens,checked,notes,origin,own_cents ownCents,position FROM ingredients'),
  invoices:all('SELECT * FROM invoices'),invoiceLines:all('SELECT invoice_id invoiceId,id,position,article,description,quantity,unit,net_cents netCents,ingredient_id ingredientId,kind,received,order_id orderId FROM invoice_lines'),
  recipes:all('SELECT product_id productId,name,yield,method,loss_pct lossPct,packaging_cents packagingCents,version,reviewed,position FROM recipes'),recipeLines:all('SELECT product_id productId,ingredient_id ingredientId,position,quantity FROM recipe_lines'),
  incoming:all('SELECT id,ingredient_id ingredientId,quantity,remaining,due,status,supplier,position FROM incoming_orders')};
 const moves=all('SELECT id,seq,ingredient_id ingredientId,quantity,date,reason,reference FROM stock_moves');
 assert.deepEqual(fromRows(rows,moves),{...s,requests:[],recipeHistory:[]});
 assert.deepEqual(all('SELECT request_id,version FROM operation_requests ORDER BY request_id'),[{request_id:'migratie-0007',version:7},{request_id:'r-oud-1',version:null},{request_id:'r-oud-2',version:null}]);
 assert.deepEqual(all('SELECT product_id,portion_cents FROM recipe_history'),[{product_id:'p1',portion_cents:55}]);
 assert.equal(db.prepare('SELECT data FROM operations_state').get().data,JSON.stringify(s),'het oude document blijft als back-up ongewijzigd');
});
test('lege installatie: geen voorraadgegevens en versie 0',()=>{
 const db=new DatabaseSync(':memory:');apply(db,files);
 assert.equal(db.prepare('SELECT count(*) n FROM ingredients').get().n,0);assert.equal(db.prepare('SELECT max(version) v FROM operation_requests').get().v,null);
});

test('0014: bestaande ingrediënten krijgen herkomst inkoop en geen eigen prijs; eigen prijs is optioneel',()=>{
 const db=new DatabaseSync(':memory:');apply(db,files.filter(n=>n<'0014'));
 db.prepare("INSERT INTO ingredients(id,name,unit,pack) VALUES('melk','Melk','l',1)").run();
 apply(db,files.filter(n=>n>='0014'));
 assert.deepEqual({...db.prepare('SELECT origin,own_cents FROM ingredients').get()},{origin:'inkoop',own_cents:null});
 db.prepare("INSERT INTO ingredients(id,name,unit,pack,origin,own_cents) VALUES('eigen-melk','Melk eigen boerderij','l',1,'eigen',65.5)").run();
 assert.equal(db.prepare("SELECT own_cents FROM ingredients WHERE id='eigen-melk'").get().own_cents,65.5);
});

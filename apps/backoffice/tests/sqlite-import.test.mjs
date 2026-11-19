// Verhuizing SQLite → Postgres (overstap naar Supabase, 4 november 2026): de proefomgeving van vóór de overstap gaat bij
// de eerste start volledig mee; het SQLite-bestand blijft onaangeroerd.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import './helpers/ts-resolve.mjs';
const migrations=new URL('../drizzle/',import.meta.url);
const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');

test('bestaande SQLite-proefomgeving gaat bij de eerste start volledig over naar Postgres',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-verhuizing-test-')),file=path.join(dir,'database.sqlite');
 // Een oudere database: migraties tot en met 0023 (de nieuwste ontbreken nog), zoals op de Chromebook na een tijd niet bijwerken.
 const old=new DatabaseSync(file);
 old.exec('CREATE TABLE _portable_migrations(name TEXT PRIMARY KEY, hash TEXT NOT NULL); CREATE TABLE _portable_imports(id TEXT PRIMARY KEY);');
 for(const n of fs.readdirSync(migrations).filter(n=>n.endsWith('.sql')&&n<'0024').sort()){const sql=fs.readFileSync(new URL(n,migrations),'utf8');old.exec(sql);old.prepare('INSERT INTO _portable_migrations VALUES(?,?)').run(n,createHash('sha256').update(sql).digest('hex'))}
 old.prepare("INSERT INTO products(id,draft,published,version) VALUES('p1','{\"name\":\"Jam\"}','{\"name\":\"Jam\"}',3)").run();
 old.prepare("INSERT INTO orders(id,request_id,request,data,created,total_cents) VALUES(41,'r41','{}','{}','2026-11-01',450)").run();
 old.prepare("INSERT INTO order_lines(order_id,position,product_id,name,station,quantity,unit_cents,total_cents,vat,vat_cents) VALUES(41,0,'p1','Jam','winkel',1,450,450,'9',37)").run();
 old.prepare("INSERT INTO coop_participants(id,name,created,updated) VALUES('d1','Ingeborg','x','x')").run();
 old.prepare("UPDATE availability_settings SET data='{\"eigen\":true}',version=5 WHERE id=1").run();
 old.prepare("UPDATE guest_settings SET rev=9,data='{\"capacity\":{\"bezoek\":30}}' WHERE id=1").run();
 old.prepare("INSERT INTO guest_reservations(id,rev,pos,day,data) VALUES('res1',2,0,'2026-11-20','{\"name\":\"Familie\"}')").run();
 old.prepare("INSERT INTO ingredients(id,name,unit,stock,known,pack) VALUES('i1','Aardbeien','kg',2.5,1,1)").run();
 old.prepare("INSERT INTO _portable_imports VALUES('export-snapshot-v1')").run();
 old.close();
 const before=hash(file);
 process.env.APP_DATA_DIR=dir;
 const {runQuery,closeDatabase}=await import('../lib/portable/env.ts');
 t.after(async()=>{process.env.APP_DATA_DIR=dir;await closeDatabase();fs.rmSync(dir,{recursive:true,force:true})});
 const q=async(sql,p=[])=>(await runQuery(sql,p,false)).rows;
 assert.deepEqual(await q('SELECT id,version FROM products'),[{id:'p1',version:3}],'alleen de eigen producten, geen beginvulling uit snapshot/');
 assert.deepEqual(await q('SELECT id,total_cents FROM orders'),[{id:41,total_cents:450}]);
 assert.equal((await q('SELECT name FROM order_lines'))[0].name,'Jam');
 assert.equal((await q('SELECT owner_id FROM order_lines'))[0].owner_id,null,'kolom uit een nieuwere migratie: leeg');
 assert.equal((await q('SELECT name FROM coop_participants'))[0].name,'Ingeborg');
 assert.deepEqual(await q('SELECT data,version FROM availability_settings'),[{data:'{"eigen":true}',version:5}],'echte instellingen vervangen de beginwaarden');
 assert.deepEqual(await q('SELECT rev,data FROM guest_settings'),[{rev:9,data:'{"capacity":{"bezoek":30}}'}]);
 assert.equal((await q('SELECT day FROM guest_reservations'))[0].day,'2026-11-20');
 assert.equal((await q('SELECT stock FROM ingredients'))[0].stock,2.5);
 // Nieuwe bestellingen krijgen een nummer na het hoogste overgenomen nummer.
 assert.equal((await q("INSERT INTO orders(request_id,request,data,created) VALUES('r42','{}','{}','x') RETURNING id"))[0].id,42);
 assert.equal(hash(file),before,'het SQLite-bestand blijft onaangeroerd als reservekopie');
 assert.deepEqual((await q("SELECT id FROM _portable_imports ORDER BY id")).map(r=>r.id),['export-snapshot-v1','sqlite-v1']);
});

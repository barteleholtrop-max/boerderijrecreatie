// Verhuizing ingebouwde Postgres (var/pgdata) → Supabase: sinds PR 98 staan de nieuwste gegevens in pgdata. Bij de eerste
// start met DATABASE_URL gaan ze volledig mee; de map blijft onaangeroerd.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import './helpers/ts-resolve.mjs';

test('pgdata gaat volledig en met de juiste soorten over naar een lege database',async t=>{
 const src=fs.mkdtempSync(path.join(os.tmpdir(),'bb-pgdata-src-')),dst=fs.mkdtempSync(path.join(os.tmpdir(),'bb-pgdata-dst-'));
 t.after(()=>{for(const d of [src,dst])fs.rmSync(d,{recursive:true,force:true})});
 // Bron: een gewone proefomgeving op de ingebouwde Postgres, met eigen gegevens.
 // Zonder voorbeeldgegevens: de testverbinding hieronder (pglite-socket 0.0.20) loopt vast op berichten boven ongeveer 64 KB,
 // en de voorbeeldproducten zijn samen groter. Supabase heeft die grens niet.
 process.env.APP_DATA_DIR=src;delete process.env.DATABASE_URL;process.env.SNAPSHOT_IMPORT='0';
 const {runQuery,closeDatabase}=await import('../lib/portable/env.ts');
 await runQuery("INSERT INTO orders(id,request_id,request,data,created,total_cents) VALUES(41,'r41','{}','{}','2026-11-01',450)",[],false);
 await runQuery("INSERT INTO order_lines(order_id,position,product_id,name,station,quantity,unit_cents,total_cents,vat,vat_cents) VALUES(41,0,'p1','Jam','winkel',1,450,450,'9',37)",[],false);
 await runQuery("UPDATE availability_settings SET data='{\"eigen\":true}',version=5 WHERE id=1",[],false);
 await runQuery("INSERT INTO ingredients(id,name,unit,stock,known,pack) VALUES('i1','Aardbeien','kg',2.5,1,1)",[],false);
 const products=Number((await runQuery('SELECT COUNT(*) AS n FROM products',[],false)).rows[0].n);
 await closeDatabase();delete process.env.SNAPSHOT_IMPORT;
 const before=fs.readdirSync(path.join(src,'pgdata')).sort();
 // Doel: een lege database met dezelfde opbouw (zoals Supabase na de migraties).
 process.env.APP_DATA_DIR=dst;process.env.SNAPSHOT_IMPORT='0';
 await runQuery('SELECT 1',[],false);await closeDatabase();delete process.env.SNAPSHOT_IMPORT;
 const target=new PGlite(path.join(dst,'pgdata'));
 // Zoals op de Chromebook naar Supabase: via postgres.js (prepare:false) over een echte Postgres-verbinding, niet rechtstreeks
 // in PGlite. Alleen zo komt een verschil in het doorgeven van parameters aan het licht (json dubbel gecodeerd, 6 november 2026).
 const {PGLiteSocketServer}=await import('@electric-sql/pglite-socket');const postgres=(await import('postgres')).default;
 const port=40000+Math.floor(Math.random()*20000),server=new PGLiteSocketServer({db:target,port});await server.start();
 const sql=postgres(`postgres://postgres@127.0.0.1:${port}/postgres`,{prepare:false,max:1,onnotice:()=>{},types:{bigint:{to:20,from:[20],serialize:x=>String(x),parse:x=>Number(x)},numeric:{to:1700,from:[1700],serialize:x=>String(x),parse:x=>Number(x)}}});
 t.after(async()=>{await sql.end();await server.stop()});
 const run=async(text,params)=>({rows:[...await sql.unsafe(text,params)]});
 const {importPgdata}=await import('../lib/portable/pgdata-import.ts');
 const report=await importPgdata(run,path.join(src,'pgdata'));
 // Controleren over dezelfde verbinding: de socketserver houdt PGlite vast zolang hij een verbinding heeft.
 const q=async text=>[...await sql.unsafe(text)];
 assert.deepEqual(await q('SELECT id,total_cents FROM orders'),[{id:41,total_cents:450}]);
 assert.equal((await q('SELECT name FROM order_lines'))[0].name,'Jam');
 assert.deepEqual((await q('SELECT data,version FROM availability_settings')).map(r=>[r.data,r.version]),[['{"eigen":true}',5]],'echte instellingen vervangen de beginwaarden');
 assert.equal(Number((await q('SELECT stock FROM ingredients'))[0].stock),2.5);
 assert.equal(Number((await q('SELECT COUNT(*) AS n FROM products'))[0].n),products);
 assert.ok(report.find(r=>r.table==='orders').rows===1);
 assert.deepEqual(fs.readdirSync(path.join(src,'pgdata')).sort(),before,'de bronmap blijft staan als reservekopie');
});

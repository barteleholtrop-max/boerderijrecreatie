// De Postgres-opbouw (drizzle-pg/): beginwaarden, standaardwaarden, sleutels en beveiliging per rij.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {pgDb} from './helpers/pg-db.mjs';
const dir=new URL('../drizzle/',import.meta.url);
function sqliteColumns(){
 const db=new DatabaseSync(':memory:');for(const n of fs.readdirSync(dir).filter(n=>n.endsWith('.sql')).sort())db.exec(fs.readFileSync(new URL(n,dir),'utf8'));
 const out={};for(const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all())out[name]=db.prepare(`PRAGMA table_info("${name}")`).all().map(c=>c.name).sort();
 db.close();return out;
}
test('beginwaarden, standaardwaarden en automatische nummering',async t=>{
 const db=await pgDb();t.after(()=>db.close());
 const a=await db.get('SELECT * FROM availability_settings');assert.equal(a.version,1);assert.deepEqual(JSON.parse(a.data).openingHours,[null,null,null,null,null,null,null]);
 assert.deepEqual(await db.get('SELECT id,rev,res_rev,seq,data FROM guest_settings'),{id:1,rev:0,res_rev:0,seq:0,data:'{}'});
 await db.run("INSERT INTO integration_settings(id,secret,updated) VALUES('claude','x','2026-11-02')");
 assert.deepEqual(await db.get('SELECT hint,note,updated_by FROM integration_settings'),{hint:'',note:'',updated_by:''});
 await db.run("INSERT INTO gbp_link (id) VALUES ('main')");
 assert.deepEqual(await db.get('SELECT sync_hours,sync_events,lock_until,refresh_sealed FROM gbp_link'),{sync_hours:1,sync_events:1,lock_until:0,refresh_sealed:null});
 await db.run("INSERT INTO payments(id,request_id,order_id,method,amount_cents,provider,external_ref,created,updated) SELECT 'x','rx',1,'bank',1,'bank',NULL,'x','x' WHERE false");
 // Tijdstempels in milliseconden passen (bigint), en komen terug als gewoon getal.
 await db.run("INSERT INTO mail_oauth_states(state,account,expires) VALUES('s','eigenaar',?)",Date.now()+600000);
 assert.equal(typeof (await db.get('SELECT expires FROM mail_oauth_states')).expires,'number');
 // Automatische nummering bij bestellingen.
 await db.run("INSERT INTO orders(request_id,request,data,created) VALUES('r1','{}','{}','x'),('r2','{}','{}','x')");
 assert.deepEqual((await db.all('SELECT id FROM orders ORDER BY id')).map(r=>r.id),[1,2]);
});
test('afscherming voor Supabase: beveiliging per rij staat aan op elke tabel',async t=>{
 const db=await pgDb();t.after(()=>db.close());
 const open=await db.all("SELECT tablename FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity");
 assert.deepEqual(open,[],'tabellen zonder Row Level Security zijn via de Data API van Supabase bereikbaar');
});

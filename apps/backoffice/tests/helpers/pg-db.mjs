// Een verse Postgres-database (PGlite, in het geheugen) met de echte opbouw uit drizzle-pg/, voor tests die SQL van de
// backoffice rechtstreeks controleren. Sinds de overstap naar Supabase (4 november 2026) in plaats van SQLite in het geheugen.
// SQL mag ?-plaatsen gebruiken, zoals de backoffice zelf (env.DB).
import fs from 'node:fs';
import './ts-resolve.mjs';
import {PGlite} from '@electric-sql/pglite';
const {numberParams}=await import('../../lib/portable/env.ts');
const dir=new URL('../../drizzle-pg/',import.meta.url);
const param=v=>typeof v==='boolean'?Number(v):v===undefined?null:v;
function wrap(q){
 const go=(sql,p)=>q.query(numberParams(sql),p.map(param));
 return {
  exec:sql=>q.exec(sql),
  run:async(sql,...p)=>({changes:(await go(sql,p)).affectedRows??0}),
  all:async(sql,...p)=>(await go(sql,p)).rows,
  get:async(sql,...p)=>(await go(sql,p)).rows[0],
 };
}
export async function pgDb(){
 const db=await PGlite.create({parsers:{20:Number,1700:Number}});
 for(const n of fs.readdirSync(dir).filter(n=>n.endsWith('.sql')).sort())
  for(const s of fs.readFileSync(new URL(n,dir),'utf8').split('--> statement-breakpoint'))if(s.trim())await db.exec(s);
 return {...wrap(db),
  /** Alles of niets, zoals een batch in de backoffice: een fout draait alles in fn terug. */
  tx:fn=>db.transaction(tx=>fn(wrap(tx))),
  close:()=>db.close()};
}

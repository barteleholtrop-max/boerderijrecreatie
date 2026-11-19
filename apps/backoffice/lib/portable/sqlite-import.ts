// Verhuizing van SQLite naar Postgres (overstap naar Supabase, besluit eigenaar 4 november 2026; docs/SUPABASE-OVERSTAP.md).
// Draait één keer, bij de eerste start met een nieuwe, lege Postgres-database, als er in APP_DATA_DIR nog een
// database.sqlite staat (de proefomgeving van vóór de overstap):
// 1. het SQLite-bestand wordt eerst gekopieerd (het origineel blijft onaangeroerd als reservekopie);
// 2. de kopie krijgt de SQLite-migraties die nog ontbraken, zodat alle kolommen er zijn;
// 3. elke tabel gaat over naar Postgres, in de volgorde van de verwijzingen tussen tabellen;
// 4. per tabel wordt nageteld; klopt één aantal niet, dan wordt er niets overgenomen en start de backoffice niet.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

type Run=(sql:string,params:unknown[])=>Promise<{rows:unknown[]}>;
export type ImportReport={table:string;rows:number}[];

/** Een bijgewerkte kopie van het SQLite-bestand (het origineel wordt alleen gelezen). */
function updatedCopy(file:string,migrations:string){
 const copy=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'bb-verhuizing-')),'kopie.sqlite');
 const source=new DatabaseSync(file,{readOnly:true});
 try{source.exec(`VACUUM INTO '${copy.replace(/'/g,"''")}'`)}finally{source.close()}
 const db=new DatabaseSync(copy);
 db.exec('CREATE TABLE IF NOT EXISTS _portable_migrations(name TEXT PRIMARY KEY, hash TEXT NOT NULL)');
 for(const name of fs.readdirSync(migrations).filter(n=>n.endsWith('.sql')).sort()){
  if(db.prepare('SELECT 1 FROM _portable_migrations WHERE name=?').get(name))continue;
  const sql=fs.readFileSync(path.join(migrations,name),'utf8');
  db.exec(sql);db.prepare('INSERT INTO _portable_migrations(name,hash) VALUES(?,?)').run(name,createHash('sha256').update(sql).digest('hex'));
 }
 return {db,done:()=>{db.close();fs.rmSync(path.dirname(copy),{recursive:true,force:true})}};
}

/** Tabellen in een volgorde waarin elke verwezen tabel eerder komt. */
export async function tablesInOrder(run:Run){
 const tables=((await run(`SELECT table_name AS t FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name NOT LIKE '\\_portable\\_%'`,[])).rows as {t:string}[]).map(r=>r.t);
 const refs=(await run(`SELECT tc.table_name AS child, ccu.table_name AS parent FROM information_schema.table_constraints tc
  JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name AND ccu.table_schema=tc.table_schema
  WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'`,[])).rows as {child:string;parent:string}[];
 const order:string[]=[],seen=new Set<string>();
 const visit=(t:string,path:Set<string>)=>{if(seen.has(t)||path.has(t))return;path.add(t);for(const r of refs)if(r.child===t&&r.parent!==t)visit(r.parent,path);seen.add(t);order.push(t)};
 for(const t of tables.sort())visit(t,new Set());
 return order;
}

export async function importSqlite(run:Run,file:string,migrations:string):Promise<ImportReport>{
 const {db,done}=updatedCopy(file,migrations);
 try{
  const report:ImportReport=[];
  const columnsOf=async(t:string)=>((await run(`SELECT column_name AS c FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,[t])).rows as {c:string}[]).map(r=>r.c);
  for(const table of await tablesInOrder(run)){
   if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))continue;
   const pgCols=new Set(await columnsOf(table));
   const cols=(db.prepare(`PRAGMA table_info("${table}")`).all() as {name:string}[]).map(c=>c.name).filter(c=>pgCols.has(c));
   const rows=db.prepare(`SELECT ${cols.map(c=>'"'+c+'"').join(',')} FROM "${table}"`).all() as Record<string,unknown>[];
   // Beginwaarden van de nieuwe database (bijvoorbeeld de openingstijden) maken plaats voor de echte gegevens.
   if(rows.length)await run(`DELETE FROM "${table}"`,[]);
   for(let i=0;i<rows.length;i+=200){
    const chunk=rows.slice(i,i+200),values:unknown[]=[];
    const tuples=chunk.map(row=>'('+cols.map(c=>{values.push(row[c] ?? null);return '$'+values.length}).join(',')+')');
    await run(`INSERT INTO "${table}" (${cols.map(c=>'"'+c+'"').join(',')}) VALUES ${tuples.join(',')}`,values);
   }
   const counted=Number(((await run(`SELECT COUNT(*) AS n FROM "${table}"`,[])).rows[0] as {n:number}).n);
   if(rows.length&&counted!==rows.length)throw Error(`Verhuizing gestopt: ${table} heeft ${counted} rijen in Postgres, ${rows.length} in SQLite.`);
   report.push({table,rows:rows.length});
  }
  return report;
 }finally{done()}
}

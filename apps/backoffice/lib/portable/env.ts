// Database en bestanden van de backoffice. Postgres sinds de overstap naar Supabase (besluit eigenaar 4 november 2026,
// docs/SUPABASE-OVERSTAP.md):
// - met DATABASE_URL: de Postgres-database van Supabase (online);
// - zonder DATABASE_URL: PGlite, een echte Postgres die in de backoffice zelf draait, met de gegevens in APP_DATA_DIR/pgdata
//   (proefomgeving op de eigen computer en tests). Zelfde database-taal, dus wat hier werkt, werkt ook bij Supabase.
// De rest van de code praat via env.DB (losse SQL met ?-plaatsen) of via Drizzle (db/index.ts); beide komen hier uit.
// Transacties („alles of niets”, bijvoorbeeld afrekenen) lopen via inTransaction: elke opdracht binnen die functie gaat
// over dezelfde verbinding.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
import {storageConfig,diskBucket,supabaseBucket,migrateDisk,type Bucket} from './storage';
import {queryLimitMs,withDeadline,freshPool,staleMs,slots} from './deadline';
import {assertDurableStorage} from './durable';

const folder=()=>path.resolve(process.env.APP_DATA_DIR||path.join(process.cwd(),'var'));
export type QueryResult={rows:unknown[];columns:string[];changes:number};
type Runner={query(sql:string,params:unknown[],array:boolean):Promise<QueryResult>;exec(sql:string):Promise<void>};
type Backend={base:Runner;transaction<T>(fn:(r:Runner)=>Promise<T>):Promise<T>;close():Promise<void>};

/** Zet ?-plaatsen om naar $1, $2 … en slaat tekst tussen aanhalingstekens en commentaar over. */
export function numberParams(sql:string){
 let out='',n=0;
 for(let i=0;i<sql.length;i++){
  const c=sql[i];
  if(c==="'"||c==='"'){const end=sql.indexOf(c,i+1);const j=end<0?sql.length-1:end;out+=sql.slice(i,j+1);i=j;continue}
  if(c==='-'&&sql[i+1]==='-'){const end=sql.indexOf('\n',i);const j=end<0?sql.length-1:end;out+=sql.slice(i,j+1);i=j;continue}
  // ?1, ?2 … (genummerd) blijft hetzelfde nummer; een losse ? krijgt het volgende nummer.
  if(c==='?'){const m=/^\d+/.exec(sql.slice(i+1));if(m){out+='$'+m[0];i+=m[0].length}else out+='$'+(++n);continue}
  out+=c;
 }
 return out;
}
const toParam=(v:unknown)=>typeof v==='boolean'?Number(v):v===undefined?null:v;

async function pglite(dir:string):Promise<Backend>{
 const {PGlite}=await import('@electric-sql/pglite');
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 // int8 (bigint) en numeric (uitkomst van SUM) als gewoon getal: alle bedragen, tellers en tijdstempels in milliseconden passen ruim.
 const db=new PGlite(path.join(dir,'pgdata'),{parsers:{20:(v:string)=>Number(v),1700:(v:string)=>Number(v)}});
 const runner=(q:{query:typeof db.query;exec:typeof db.exec}):Runner=>({
  async query(sql,params,array){const r=await q.query<Record<string,unknown>>(sql,params.map(toParam),array?{rowMode:'array'}:{});return {rows:r.rows,columns:r.fields.map(f=>f.name),changes:r.affectedRows??0}},
  async exec(sql){await q.exec(sql)},
 });
 return {base:runner(db),transaction:fn=>db.transaction(tx=>fn(runner(tx as never))),close:()=>db.close()};
}
async function postgresJs(url:string,broken:()=>void):Promise<Backend>{
 const postgres=(await import('postgres')).default;
 // prepare:false: nodig voor de verbindingspool van Supabase (transactiemodus). connect_timeout en max_lifetime: geen eindeloos
 // wachten op een verbinding en geen oude verbindingen (Cloud Run legt de processor stil tussen verzoeken; zie deadline.ts).
 const max=Math.max(1,Number(process.env.DATABASE_POOL||5));
 const make=()=>postgres(url,{prepare:false,onnotice:()=>{},max,idle_timeout:Number(process.env.DATABASE_IDLE_SECONDS||30),
  connect_timeout:10,max_lifetime:5*60,
  types:{bigint:{to:20,from:[20],serialize:(x:unknown)=>String(x),parse:(x:string)=>Number(x)},numeric:{to:1700,from:[1700],serialize:(x:unknown)=>String(x),parse:(x:string)=>Number(x)}}});
 type Sql=ReturnType<typeof make>;
 // Na stilte eerst verse verbindingen (zie freshPool in deadline.ts).
 const pool=freshPool(make,staleMs());
 // Nooit meer vragen tegelijk dan verbindingen (zie slots in deadline.ts): anders stuurt postgres.js een vraag mee over een bezette
 // verbinding en raakt de verbindingspool van Supabase die soms kwijt (ledenpagina 20 tot 60 seconden, 12 november 2026).
 const turn=slots(Math.max(1,max-1));
 // Waakhond: hangt een vraag langer dan de grens, dan worden alle verbindingen van deze server vernieuwd (zie deadline.ts).
 let gone=false;const reset=()=>{if(gone)return;gone=true;console.error('[database] geen antwoord binnen de grens; verbindingen worden vernieuwd');broken();pool.end().catch(()=>{})};
 const limit=queryLimitMs(),guard=<T,>(p:Promise<T>,ms=limit)=>withDeadline(p,ms,reset);
 const runner=(tx?:Sql):Runner=>({
  async query(text,params,array){const r=tx?await ask(tx,text,params,array):await turn(()=>pool.use(q=>ask(q,text,params,array)));
   return {rows:[...r] as unknown[],columns:(r.columns||[]).map(c=>c.name),changes:r.count??0}},
  async exec(text){if(tx)await guard(Promise.resolve(tx.unsafe(text)),limit*3);else await turn(()=>pool.use(q=>guard(Promise.resolve(q.unsafe(text)),limit*3)))},
 });
 const ask=(q:Sql,text:string,params:unknown[],array:boolean)=>guard(Promise.resolve(params.length||!array?(array?q.unsafe(text,params.map(toParam) as never[]).values():q.unsafe(text,params.map(toParam) as never[])):q.unsafe(text).values()));
 return {base:runner(),transaction:fn=>turn(()=>pool.use(q=>q.begin(tx=>fn(runner(tx as unknown as Sql))))) as never,close:async()=>{await pool.end(5)}};
}

const shared=globalThis as typeof globalThis & {__boerBartDatabases?:Map<string,Promise<Backend>>};
const inTx=new AsyncLocalStorage<Runner>();
function backend():Promise<Backend>{
 assertDurableStorage();
 const url=process.env.DATABASE_URL||'',key=url||folder();shared.__boerBartDatabases??=new Map();
 let ready=shared.__boerBartDatabases.get(key);
 if(!ready){const forget=()=>{if(shared.__boerBartDatabases?.get(key)===ready)shared.__boerBartDatabases?.delete(key)};ready=(url?postgresJs(url,forget):pglite(folder())).then(async b=>{await prepare(b);return b});ready.catch(()=>shared.__boerBartDatabases?.delete(key));shared.__boerBartDatabases.set(key,ready)}
 return ready;
}
async function runner(){return inTx.getStore()??(await backend()).base}

/** Losse SQL met $1-plaatsen (Drizzle) of ?-plaatsen (env.DB). Binnen inTransaction over dezelfde verbinding. */
export async function runQuery(sql:string,params:unknown[],array:boolean){return (await runner()).query(sql,params,array)}
/** Alles of niets: elke databaseopdracht binnen fn hoort bij één transactie. Genest = dezelfde transactie. */
export async function inTransaction<T>(fn:()=>Promise<T>):Promise<T>{
 if(inTx.getStore())return fn();
 return (await backend()).transaction(r=>inTx.run(r,fn));
}
/** Voor tests: de database van deze map sluiten, zodat een volgende test schoon begint. */
export async function closeDatabase(){const key=process.env.DATABASE_URL||folder(),b=shared.__boerBartDatabases?.get(key);if(!b)return;shared.__boerBartDatabases!.delete(key);await (await b).close()}

// ---- Opbouw: migraties (drizzle-pg) en de eenmalige beginvulling uit snapshot/ ------------------------------------
const SERIALS:[string,string][]=[['orders','id'],['order_lines','id'],['recipe_history','id'],['outbox_jobs','id'],['connection_setting_audit','id'],['guest_audit','seq']];
async function prepare(b:Backend){
 await b.transaction(async r=>{
  // Eén backoffice tegelijk bouwt de database op (meerdere servers starten veilig).
  await r.query('SELECT pg_advisory_xact_lock(424242)',[],false);
  await r.exec('CREATE TABLE IF NOT EXISTS _portable_migrations(name TEXT PRIMARY KEY, hash TEXT NOT NULL); CREATE TABLE IF NOT EXISTS _portable_imports(id TEXT PRIMARY KEY);');
  const migrations=path.join(process.cwd(),'drizzle-pg');
  // Sneller opstarten (12 november 2026): één vraag voor alle uitgevoerde migraties in plaats van één per migratie (ruim 60).
  const done=new Map(((await r.query('SELECT name,hash FROM _portable_migrations',[],false)).rows as {name:string;hash:string}[]).map(x=>[x.name,x.hash]));
  for(const name of fs.readdirSync(migrations).filter(n=>n.endsWith('.sql')).sort()){
   const sql=fs.readFileSync(path.join(migrations,name),'utf8'),hash=createHash('sha256').update(sql).digest('hex');
   const old=done.has(name)?{hash:done.get(name)!}:undefined;
   if(old){if(old.hash!==hash)throw Error('A previously applied migration changed: '+name);continue}
   for(const statement of sql.split('--> statement-breakpoint'))if(statement.trim())await r.exec(statement);
   await r.query('INSERT INTO _portable_migrations(name,hash) VALUES($1,$2)',[name,hash],false);
  }
  const fresh=!(await r.query("SELECT id FROM _portable_imports WHERE id IN ('export-snapshot-v1','sqlite-v1','pgdata-v1')",[],false)).rows.length;
  const sqliteFile=path.join(folder(),'database.sqlite'),pgdataDir=path.join(folder(),'pgdata');
  if(fresh&&process.env.DATABASE_URL&&process.env.PGDATA_IMPORT!=='0'&&fs.existsSync(path.join(pgdataDir,'PG_VERSION'))){
   // Verhuizing: de ingebouwde Postgres (sinds PR 98 de nieuwste gegevens; nieuwer dan database.sqlite) gaat één keer
   // volledig over naar Supabase. Zie lib/portable/pgdata-import.ts.
   const {importPgdata}=await import('./pgdata-import');
   const report=await importPgdata((sql,params)=>r.query(sql,params,false),pgdataDir);
   console.log('[verhuizing] pgdata → Supabase: '+report.filter(x=>x.rows).map(x=>x.table+' '+x.rows).join(', '));
   await r.query("INSERT INTO _portable_imports(id) VALUES('pgdata-v1'),('sqlite-v1'),('export-snapshot-v1') ON CONFLICT DO NOTHING",[],false);
  }else if(fresh&&process.env.SQLITE_IMPORT!=='0'&&fs.existsSync(sqliteFile)){
   // Verhuizing: de proefomgeving van vóór de overstap (database.sqlite) gaat één keer volledig over naar Postgres.
   const {importSqlite}=await import('./sqlite-import');
   const report=await importSqlite((sql,params)=>r.query(sql,params,false),sqliteFile,path.join(process.cwd(),'drizzle'));
   console.log('[verhuizing] SQLite → Postgres: '+report.filter(x=>x.rows).map(x=>x.table+' '+x.rows).join(', '));
   await r.query("INSERT INTO _portable_imports(id) VALUES('sqlite-v1'),('export-snapshot-v1')",[],false);
  }
  // SNAPSHOT_IMPORT=0 (online, op Cloud Run): geen voorbeeldgegevens in een lege database, zodat de eerste echte
  // verhuizing (pgdata of SQLite vanaf de Chromebook) daarna nog kan.
  if(fresh&&process.env.SNAPSHOT_IMPORT!=='0'&&!(await r.query('SELECT id FROM _portable_imports WHERE id=$1',['export-snapshot-v1'],false)).rows.length){
   const snap=path.join(process.cwd(),'snapshot'),tables=path.join(snap,'tables.json');
   if(fs.existsSync(tables)){
    const data=JSON.parse(fs.readFileSync(tables,'utf8')) as Record<string,Record<string,unknown>[]>;
    const allowed=['products','media','operations_state','orders','work_status','sheet_links'];
    for(const table of allowed)for(const row of data[table]||[]){
     const cols=Object.keys(row);if(cols.some(c=>!/^[a-z_]+$/.test(c)))throw Error('Invalid snapshot column');
     await r.query('INSERT INTO "'+table+'" ('+cols.map(c=>'"'+c+'"').join(',')+') VALUES ('+cols.map((_,i)=>'$'+(i+1)).join(',')+') ON CONFLICT DO NOTHING',cols.map(c=>row[c]),false);
    }
    const manifest=path.join(snap,'media-manifest.json');
    if(fs.existsSync(manifest)){
     const mediaDir=path.join(folder(),'media');fs.mkdirSync(mediaDir,{recursive:true});
     for(const m of JSON.parse(fs.readFileSync(manifest,'utf8'))){
      if(!/^[a-f0-9-]{36}$/.test(m.id))throw Error('Invalid media key');
      const source=fs.existsSync(path.join(snap,'media',m.id))?path.join(snap,'media',m.id):path.resolve(process.cwd(),'../../data/backoffice/media',m.id);fs.copyFileSync(source,path.join(mediaDir,m.id));
      fs.writeFileSync(path.join(mediaDir,m.id+'.json'),JSON.stringify({contentType:m.mime}),{mode:0o600});
     }
    }
   }
   await r.query('INSERT INTO _portable_imports(id) VALUES($1)',['export-snapshot-v1'],false);
  }
  // Na het overnemen van rijen met een eigen nummer telt de automatische nummering verder vanaf het hoogste nummer.
  for(const [table,column] of SERIALS)await r.query(`SELECT setval(pg_get_serial_sequence('${table}','${column}'),COALESCE((SELECT MAX("${column}") FROM "${table}"),0)+1,false)`,[],false);
 });
}

// ---- env.DB: losse SQL in de vorm die de code al gebruikte (prepare/bind/first/all/run/raw/batch) -------------------
class Prepared{
 // Plain fields instead of constructor parameter properties, so Node's type stripping can load this file in tests.
 private sql:string;private values:unknown[];
 constructor(sql:string,values:unknown[]=[]){this.sql=sql;this.values=values}
 bind(...values:unknown[]){return new Prepared(this.sql,values)}
 private go(array=false){return runQuery(numberParams(this.sql),this.values,array)}
 async first(column?:string){const row=(await this.go()).rows[0] as Record<string,unknown>|undefined;return row?(column?row[column]??null:row):null}
 async all(){const r=await this.go();return {success:true,results:r.rows as Record<string,unknown>[],meta:{changes:r.changes,duration:0}}}
 async run(){const r=await this.go();return {success:true,results:[],meta:{changes:r.changes,duration:0}}}
 // Rijen als lijsten, zodat twee kolommen met dezelfde naam in een join (orders.id en order_lines.id) uit elkaar blijven.
 async raw(options?:{columnNames?:boolean}){const r=await this.go(true);return options?.columnNames?[r.columns,...r.rows as unknown[][]]:r.rows as unknown[][]}
 isGuard(){return this.sql==="SELECT 'besluit-conflict' AS guard"}
 async executeForBatch(){return /\bselect\b|\breturning\b/i.test(this.sql)?this.all():this.run()}
}
const DB={
 prepare(sql:string){return new Prepared(sql)},
 async batch(statements:Prepared[]){return inTransaction(async()=>{const result:{meta:{changes:number}}[]=[];for(const stmt of statements){
  // Bewaking (GUARD_SQL in lib/assistant-core.ts): de vorige opdracht moet precies één rij hebben gewijzigd.
  if(stmt.isGuard()){if(result.at(-1)?.meta.changes!==1)throw Error('besluit-conflict');result.push({meta:{changes:0}});continue}
  result.push(await stmt.executeForBatch())}return result})},
 async exec(sql:string){await (await runner()).exec(sql);return {count:1,duration:0}},
};

// ---- Bestanden (foto's, beeldbank, spraak): Supabase Storage als dat is ingesteld, anders de schijf (var/media). --------
// Bij de eerste keer met Supabase Storage gaan de bestaande bestanden uit var/media één keer mee (teruggelezen ter
// controle); de bestanden op de schijf blijven staan als reservekopie. Zie lib/portable/storage.ts.
const shared2=globalThis as typeof globalThis & {__boerBartMedia?:Promise<Bucket>};
function bucket():Promise<Bucket>{
 assertDurableStorage();
 return shared2.__boerBartMedia??=(async()=>{
  const b=await backend(),cfg=storageConfig();if(!cfg)return diskBucket(()=>path.join(folder(),'media'));
  const target=supabaseBucket(cfg);
  if(!(await b.base.query("SELECT id FROM _portable_imports WHERE id='media-storage-v1'",[],false)).rows.length){
   const n=await migrateDisk(path.join(folder(),'media'),target);
   console.log(`[verhuizing] foto's en bestanden → Supabase Storage: ${n}`);
   await b.base.query("INSERT INTO _portable_imports(id) VALUES('media-storage-v1') ON CONFLICT DO NOTHING",[],false);
  }
  return target;
 })().catch(e=>{shared2.__boerBartMedia=undefined;throw e});
}
const BUCKET:Bucket={
 async has(key){return (await bucket()).has(key)},
 async get(key){return (await bucket()).get(key)},
 async put(key,data,options){return (await bucket()).put(key,data,options)},
 async delete(key){return (await bucket()).delete(key)},
};
export const env={DB,BUCKET,get SHEETS_CONFIG_KEY(){return process.env.SHEETS_CONFIG_KEY||''}};

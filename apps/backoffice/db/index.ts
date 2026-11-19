// Drizzle op Postgres (Supabase of PGlite, zie lib/portable/env.ts). getDb().batch([...]) voert opdrachten als één
// transactie uit: alles of niets, zoals voorheen bij SQLite.
import {drizzle} from 'drizzle-orm/pg-proxy';
import {runQuery,inTransaction} from '@/lib/portable/env';
import * as schema from './schema';

function create(){
 const db=drizzle(async(sql,params,method)=>{const r=await runQuery(sql,params,method==='all');return {rows:r.rows}},{schema});
 const batch=<T extends readonly unknown[]>(statements:T)=>inTransaction(async()=>{const out:unknown[]=[];for(const s of statements)out.push(await s);return out});
 return Object.assign(db,{batch});
}
const shared=globalThis as typeof globalThis & {__boerBartDrizzle?:ReturnType<typeof create>};
export function getDb(){return shared.__boerBartDrizzle??=create()}

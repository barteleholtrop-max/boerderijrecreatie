import {getDb} from '@/db';
import {serviceTables} from '@/db/schema';
import {asc} from 'drizzle-orm';
import {authorizeSheet} from '@/lib/sheet-access';
import {SheetError} from '@/lib/sheets';
import {cleanTables,defaultTables} from '@/lib/kiosk-core';
export const dynamic='force-dynamic';
// Tafels voor het opnamescherm: de lijst lezen en in één keer opslaan (volgorde zoals opgegeven).
// Nog niets ingesteld: Tafel 1 t/m 12 als begin.
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(req:Request){try{
 authorizeSheet(req);
 const rows=await getDb().select().from(serviceTables).orderBy(asc(serviceTables.position));
 return json({tables:rows.length?rows.map(r=>({id:r.id,name:r.name,active:!!r.active})):defaultTables().map(name=>({name,active:true})),saved:rows.length>0});
}catch(e){return e instanceof SheetError?json({error:e.message},e.status):json({error:'Laden mislukt.'},500)}}
export async function POST(req:Request){try{
 authorizeSheet(req,true);
 const b=await req.json().catch(()=>null) as {tables?:unknown}|null;
 let tables;try{tables=cleanTables(b?.tables)}catch(e){return json({error:(e as Error).message},400)}
 const db=getDb(),now=new Date().toISOString();
 await db.batch([db.delete(serviceTables),...tables.map((t,i)=>db.insert(serviceTables).values({id:t.id||crypto.randomUUID(),name:t.name,position:i,active:t.active?1:0,updated:now}))] as never);
 return json({ok:true});
}catch(e){return e instanceof SheetError?json({error:e.message},e.status):json({error:'Opslaan mislukt.'},500)}}

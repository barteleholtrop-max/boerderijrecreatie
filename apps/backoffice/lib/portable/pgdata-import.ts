// Verhuizing van de ingebouwde Postgres (PGlite, APP_DATA_DIR/pgdata) naar Supabase (overstap, docs/SUPABASE-OVERSTAP.md).
// Sinds PR 98 (4 november 2026) staan de nieuwste gegevens van de proefomgeving in var/pgdata, niet meer in database.sqlite.
// Draait één keer, bij de eerste start met DATABASE_URL op een nieuwe, lege database, als APP_DATA_DIR/pgdata bestaat:
// 1. de map wordt eerst gekopieerd (het origineel blijft onaangeroerd als reservekopie);
// 2. elke tabel gaat over, in de volgorde van de verwijzingen tussen tabellen; Postgres zet zelf de soorten om
//    (json_populate_recordset), dus datums, json en bedragen komen precies zo over;
// 3. per tabel wordt nageteld; klopt één aantal niet, dan wordt er niets overgenomen en start de backoffice niet.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {tablesInOrder,type ImportReport} from './sqlite-import';

type Run=(sql:string,params:unknown[])=>Promise<{rows:unknown[]}>;

export async function importPgdata(run:Run,pgdataDir:string):Promise<ImportReport>{
 const copy=fs.mkdtempSync(path.join(os.tmpdir(),'bb-pgdata-'));
 fs.cpSync(pgdataDir,path.join(copy,'pgdata'),{recursive:true});
 const {PGlite}=await import('@electric-sql/pglite');
 const source=new PGlite(path.join(copy,'pgdata'));
 try{
  const sourceTables=new Set((await source.query<{t:string}>(`SELECT table_name AS t FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`)).rows.map(r=>r.t));
  const report:ImportReport=[];
  for(const table of await tablesInOrder(run)){
   if(!sourceTables.has(table))continue;
   const rows=(await source.query<{r:string}>(`SELECT row_to_json(t)::text AS r FROM "${table}" t`)).rows.map(x=>x.r);
   // Beginwaarden van de nieuwe database (bijvoorbeeld de openingstijden) maken plaats voor de echte gegevens.
   if(rows.length)await run(`DELETE FROM "${table}"`,[]);
   for(let i=0;i<rows.length;i+=200){
    const chunk='['+rows.slice(i,i+200).join(',')+']';
    // $1::text::json, niet $1::json: postgres.js (Supabase) ziet bij $1::json een json-parameter en codeert de tekst dan
    // nog een keer (JSON.stringify), waarna Postgres één tekstwaarde krijgt in plaats van een lijst
    // („cannot call json_populate_recordset on a scalar”, Chromebook 6 november 2026). Als tekst gaat hij ongewijzigd mee.
    await run(`INSERT INTO "${table}" SELECT * FROM json_populate_recordset(NULL::"${table}",$1::text::json)`,[chunk]);
   }
   const counted=Number(((await run(`SELECT COUNT(*) AS n FROM "${table}"`,[])).rows[0] as {n:number}).n);
   if(rows.length&&counted!==rows.length)throw Error(`Verhuizing gestopt: ${table} heeft ${counted} rijen in Supabase, ${rows.length} in pgdata.`);
   report.push({table,rows:rows.length});
  }
  return report;
 }finally{await source.close();fs.rmSync(copy,{recursive:true,force:true})}
}

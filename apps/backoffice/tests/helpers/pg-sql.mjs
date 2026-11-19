// Alle Postgres-migraties (drizzle-pg/) samen als één tekst, op volgorde. Voor tests die controleren dat een tabel of
// kolom bestaat en beveiliging per rij heeft, ongeacht in welke migratie dat staat.
import fs from 'node:fs';
export function allPgSql(){
 const dir=new URL('../../drizzle-pg/',import.meta.url);
 return fs.readdirSync(dir).filter(n=>n.endsWith('.sql')).sort().map(n=>fs.readFileSync(new URL(n,dir),'utf8')).join('\n');
}

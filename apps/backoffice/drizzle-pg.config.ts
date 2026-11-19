// Postgres-opbouw (Supabase) uit db/schema.ts. Genereren: npx drizzle-kit generate --config drizzle-pg.config.ts
// De SQLite-migraties in drizzle/ blijven bewaard als naslag (en voor de verhuizing van bestaande gegevens).
import {defineConfig} from 'drizzle-kit';
export default defineConfig({dialect:'postgresql',schema:'./db/schema.ts',out:'./drizzle-pg'});

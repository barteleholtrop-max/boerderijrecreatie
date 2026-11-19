import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';
const app=process.cwd(),dotenv=path.join(app,'.env.local');
if(fs.existsSync(dotenv))process.loadEnvFile(dotenv);
const port=process.env.PORT||(path.basename(app)==='planbord'?'3000':'3001');
const env={...process.env,PORT:port,HOSTNAME:process.env.HOSTNAME_BIND||'127.0.0.1',APP_DATA_DIR:path.resolve(app,process.env.APP_DATA_DIR||'var'),NEXT_TELEMETRY_DISABLED:'1'};
// Inloggen staat altijd aan (besluit eigenaar 8 november 2026). Zonder Supabase-instellingen blijft de backoffice dicht.
if(path.basename(app)!=='planbord'&&(!process.env.SUPABASE_URL||!process.env.SUPABASE_ANON_KEY||!process.env.AUTH_SECRET))console.warn('Let op: inloggen is nog niet ingesteld (SUPABASE_URL, SUPABASE_ANON_KEY en AUTH_SECRET). De backoffice blijft dicht tot dat in .env.local staat; zie docs/INLOGGEN-BIJ-LIVEGANG.md.');
const child=spawn(process.execPath,[path.join(app,'.next/standalone/server.js')],{cwd:app,env,stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code??1));

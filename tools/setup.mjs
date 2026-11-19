import fs from 'node:fs';import path from 'node:path';import {randomBytes} from 'node:crypto';
// Maakt alleen ontbrekende lokale .env.local-bestanden. Geen wachtwoorden meer (besluit eigenaar 6 november 2026: inloggen via
// Supabase); wel een AUTH_SECRET en een nieuwe encryptiesleutel voor de backoffice.
const secret=randomBytes(32).toString('hex');
for(const [name,port] of [['backoffice',3001]]){
 const app=path.resolve('apps',name),file=path.join(app,'.env.local');
 if(fs.existsSync(file)){console.log(name+': bestaande configuratie behouden');continue;}
 let text=fs.readFileSync(path.join(app,'.env.example'),'utf8');
 text=text.replace(/^AUTH_SECRET=.*$/m,'AUTH_SECRET='+secret).replace(/^APP_ORIGIN=.*$/m,'APP_ORIGIN=http://localhost:'+port);
 if(name==='backoffice')text=text.replace(/^SHEETS_CONFIG_KEY=.*$/m,'SHEETS_CONFIG_KEY='+randomBytes(32).toString('hex'));
 fs.writeFileSync(file,text,{mode:0o600});console.log(name+': configuratie gemaakt in '+file);
}

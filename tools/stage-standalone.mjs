import fs from 'node:fs';import path from 'node:path';
const app=process.cwd(),out=path.join(app,'.next/standalone');
for(const name of ['public','snapshot','drizzle','drizzle-pg'])if(fs.existsSync(path.join(app,name)))fs.cpSync(path.join(app,name),path.join(out,name),{recursive:true});
fs.cpSync(path.join(app,'.next/static'),path.join(out,'.next/static'),{recursive:true});
if(path.basename(app)==='backoffice'){
 const assets=path.join(out,'proposal-assets');fs.mkdirSync(assets,{recursive:true});
 for(const name of ['client.js','selector.js','collection-client.js','development-client.js','version-client.js','client.css'])fs.copyFileSync(path.resolve(app,'../../tools/website-dev',name),path.join(assets,name));
}
console.log('Zelfstandige uitvoermap voorbereid.');

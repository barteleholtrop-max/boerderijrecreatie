// Postgres voor de integratietests (overstap naar Supabase, 4 november 2026). De test start een eigen PGlite-database en
// stelt die via het netwerk beschikbaar; de backoffice maakt er verbinding mee via DATABASE_URL, net als straks met Supabase.
// Zo test elke integratietest ook de echte Postgres-verbinding, en kan de test zelf in dezelfde database kijken.
import net from 'node:net';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const modules=path.resolve(import.meta.dirname,'../apps/backoffice/node_modules/@electric-sql');
const freePort=()=>new Promise((ok,fail)=>{const s=net.createServer();s.once('error',fail);s.listen(0,'127.0.0.1',()=>{const {port}=s.address();s.close(()=>ok(port))})});
export async function startPostgres(){
 const {PGlite}=await import(pathToFileURL(path.join(modules,'pglite/dist/index.js')).href);
 const postgres=(await import(pathToFileURL(path.join(modules,'../postgres/src/index.js')).href)).default;
 const {PGLiteSocketServer}=await import(pathToFileURL(path.join(modules,'pglite-socket/dist/index.js')).href);
 const db=await PGlite.create({parsers:{20:Number,1700:Number}});
 // De socketserver vraagt per verbinding een exclusief slot (db.runExclusive) en vangt de afloop niet op. Wordt een
 // backoffice hard gestopt (herstart midden in een test), dan wijst de server dat slot af met de socketfout en werd dat een
 // onopgevangen „read ECONNRESET” die de lopende test liet falen (gmail.integration, 9 en 10 november 2026). De belofte
 // blijft voor wie hem zelf afwacht precies hetzelfde; alleen het onopgevangen afwijzen verdwijnt.
 {const run=db.runExclusive.bind(db);db.runExclusive=fn=>{const p=run(fn);p.catch(()=>{});return p}}
 const port=await freePort(),server=new PGLiteSocketServer({db,port,host:'127.0.0.1'});await server.start();
 // Stopt de backoffice aan het eind van een test, dan kan zijn databaseverbinding hard worden verbroken (ECONNRESET).
 // PGLiteSocketServer haalt bij het loskoppelen alle 'error'-luisteraars van de socket weg; een fout die daarna nog
 // binnenkomt, liet het hele testproces vallen terwijl alle tests al geslaagd waren. Een stille luisteraar die blijft staan.
 server.server?.on('connection',socket=>{const quiet=()=>{};socket.on('error',quiet);const remove=socket.removeAllListeners.bind(socket);
  socket.removeAllListeners=(event,...rest)=>{const r=remove(event,...rest);if(event===undefined||event==='error')socket.on('error',quiet);return r}});
 const url=`postgres://postgres:postgres@127.0.0.1:${port}/postgres`;
 return {db,url,
  // PGlite neemt één verbinding tegelijk aan: de backoffice gebruikt er één en laat die na een seconde stilte los, zodat
  // de test er tussendoor zelf in kan kijken (ook via het netwerk, met een eigen korte verbinding).
  env:{DATABASE_URL:url,DATABASE_POOL:'1',DATABASE_IDLE_SECONDS:'1'},
  query:async(sql,params=[])=>{const c=postgres(url,{max:1,onnotice:()=>{},types:{bigint:{to:20,from:[20],serialize:String,parse:Number},numeric:{to:1700,from:[1700],serialize:String,parse:Number}}});try{return [...await c.unsafe(sql,params)]}finally{await c.end()}},
  stop:async()=>{await server.stop().catch(()=>{});await db.close().catch(()=>{})}};
}

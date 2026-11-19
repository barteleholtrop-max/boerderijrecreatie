import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createWebsiteServer} from '../tools/website-dev/server.mjs';
test('Bloei website forwards only the demo route, checks origin and never forwards identity headers',async t=>{
 const calls=[];
 const backend=http.createServer(async(req,res)=>{let body='';for await(const c of req)body+=c;calls.push({path:req.url,headers:req.headers,body});res.setHeader('Content-Type','application/json');res.end(JSON.stringify({mode:'fictief',revision:1}));});backend.listen(0,'127.0.0.1');await once(backend,'listening');
 const base='http://127.0.0.1:'+backend.address().port;
 const server=createWebsiteServer({root:path.resolve('apps/website'),dataDir:fs.mkdtempSync(path.join(os.tmpdir(),'bloei-web-')),devMode:false,origin:'http://127.0.0.1:0',backofficeOrigin:base});server.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
 t.after(()=>{server.closeAllConnections();server.close();backend.closeAllConnections();backend.close()});
 const get=await fetch(origin+'/api/public/bloei-proef?lid=proef-anna',{headers:{cookie:'owner=secret',authorization:'Basic fake','x-boer-bart-verified-user':'owner'}});assert.equal(get.status,200);assert.match(get.headers.get('cache-control'),/no-store/);assert.equal(calls[0].headers.cookie,undefined);assert.equal(calls[0].headers.authorization,undefined);assert.equal(calls[0].headers['x-boer-bart-verified-user'],undefined);
 const rejected=await fetch(origin+'/api/public/bloei-proef',{method:'POST',headers:{origin:'https://evil.example','Content-Type':'application/json'},body:'{}'});assert.equal(rejected.status,403);assert.equal(calls.length,1);
 const valid=await fetch(origin+'/api/public/bloei-proef',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({action:'iban',choice:'test-b'})});assert.equal(valid.status,200);assert.equal(calls[1].headers.origin,base);
 const oversized=await fetch(origin+'/api/public/bloei-proef',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({text:'x'.repeat(6000)})});assert.equal(oversized.status,413);assert.equal(calls.length,2);
 assert.equal((await fetch(origin+'/api/bloei-proef')).status,404);assert.equal((await fetch(origin+'/api/bloei')).status,404);
 // Nieuw adres (4 november 2026) en oud adres gaan allebei naar /api/public/bloei in de backoffice.
 const neu=await fetch(origin+'/api/public/bloei?lid=proef-anna');assert.equal(neu.status,200);assert.match(calls.at(-1).path,/^\/api\/public\/bloei\?lid=proef-anna$/);assert.match(calls[0].path,/^\/api\/public\/bloei\?lid=proef-anna$/);
 for(const asset of ['/bloei-proef.js','/bloei-proef.css','/brand.css'])assert.equal((await fetch(origin+asset)).status,200);
});

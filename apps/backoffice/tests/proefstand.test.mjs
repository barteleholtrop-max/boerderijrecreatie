// Proefstand (wens eigenaar 9 november 2026): een lid ziet met een proeflink de eigen omgeving, maar kan nog niets wijzigen of
// ondertekenen. „Proef beëindigen” maakt dezelfde link een gewone link.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import './helpers/ts-resolve.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const params=token=>({params:Promise.resolve({token})});

test('proeflink: eigen omgeving bekijken, wijzigen geweigerd; proef beëindigen houdt dezelfde link',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-proef-'));process.env.APP_DATA_DIR=dir;process.env.DATABASE_URL='';process.env.SHEETS_CONFIG_KEY='ab'.repeat(32);
 const {env,closeDatabase}=await import('../lib/portable/env.ts'),c=await import('../lib/coop-portal.ts');
 t.after(async()=>{await closeDatabase();fs.rmSync(dir,{recursive:true,force:true})});
 const at=new Date().toISOString(),pieter=randomUUID(),gewoon=randomUUID();
 for(const [id,n] of [[pieter,'Pieter Dijkstra'],[gewoon,'Ingeborg']])await env.DB.prepare('INSERT INTO coop_participants(id,name,email,created,updated) VALUES(?,?,?,?,?)').bind(id,n,'',at,at).run();
 const proefPath=await c.createLink(pieter,'test',true),normaalPath=await c.createLink(gewoon,'test');
 const proefToken=proefPath.split('/').pop(),normaalToken=normaalPath.split('/').pop();
 // Bekijken werkt: het lid wordt gevonden, met de vlag proef.
 const p=await c.participantByToken(proefToken);assert.equal(p.name,'Pieter Dijkstra');assert.equal(p.proef,true);
 assert.equal((await c.participantByToken(normaalToken)).proef,false);
 assert.equal(await c.isProefLink(proefToken),true);assert.equal(await c.isProefLink(normaalToken),false);assert.equal(await c.isProefLink('kort'),false);
 // Wijzigen geweigerd, met een vriendelijke uitleg.
 const blocked=await c.proefBlock(Promise.resolve({token:proefToken}));assert.equal(blocked.status,403);
 const body=await blocked.json();assert.equal(body.proef,true);assert.match(body.error,/alles bekijken, maar nog niets wijzigen of ondertekenen/);
 assert.equal(await c.proefBlock(Promise.resolve({token:normaalToken})),null,'een gewone link mag wel wijzigen');
 // Echte routes: proef geweigerd vóórdat er iets gebeurt.
 for(const r of ['lid','rooster','lidafspraak','bb','product','overleg']){
  const {POST}=await import('../app/api/deelnemer/[token]/'+r+'/route.ts');
  const res=await POST(new Request('http://localhost:3001/api/deelnemer/'+proefToken+'/'+r,{method:'POST',headers:{Origin:'http://localhost:3001','Content-Type':'application/json'},body:'{}'}),params(proefToken));
  assert.equal(res.status,403,r);assert.equal((await res.json()).proef,true,r);
 }
 // Backoffice ziet de proefstand.
 assert.equal((await c.links()).find(l=>l.participantId===pieter).proef,true);
 // Proef beëindigen: dezelfde link wordt gewoon.
 await c.endProef(pieter);
 assert.equal(await c.isProefLink(proefToken),false);assert.equal((await c.participantByToken(proefToken)).proef,false);assert.equal(await c.proefBlock(Promise.resolve({token:proefToken})),null);
 await assert.rejects(()=>c.endProef(randomUUID()),/nog geen link/);
});

test('elke route op de ledenpagina die iets opslaat, controleert de proefstand; vragen stellen en berichten lezen mag',()=>{
 const base=new URL('../app/api/deelnemer/[token]/',import.meta.url);
 const dirs=fs.readdirSync(base,{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name);
 for(const name of ['',...dirs]){
  const f=new URL((name?name+'/':'')+'route.ts',base);if(!fs.existsSync(f))continue;
  const s=fs.readFileSync(f,'utf8');if(!/export async function (POST|PUT|PATCH|DELETE)/.test(s))continue;
  if(['vraag','berichten'].includes(name)){assert.doesNotMatch(s,/proefBlock/,name);continue}
  assert.match(s,/export async function POST\(req:Request,\{params\}:\{params:Promise<\{token:string\}>\}\)\{\n \/\/ Proefstand[^\n]*\n \{const proef=await proefBlock\(params\);if\(proef\)return proef\}/,(name||'hoofdroute')+' controleert de proefstand als eerste');
 }
 const page=read('app/leden/page.tsx');assert.match(page,/action:'proeflink-maken'/);assert.match(page,/action:'proef-beeindigen'/);
 const api=read('app/api/cooperatie/route.ts');assert.match(api,/'proeflink-maken','proef-beeindigen'/,'opnieuw de code en vastgelegd, net als link maken');
 assert.match(read('app/deelnemer/[token]/lid-pagina.tsx'),/\{view\.proef&&<p className="m-demo" role="note"><b>Proef<\/b>/);
 assert.match(read('drizzle-pg/0045_proefstand.sql'),/ALTER TABLE "coop_portal_links" ADD COLUMN "proef" bigint DEFAULT 0 NOT NULL/);
});

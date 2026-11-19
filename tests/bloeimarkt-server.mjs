// Isolated app and provider for HTTP/browser tests. Only synthetic capital, never a live account.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {randomBytes,createCipheriv,createHash} from 'node:crypto';
import {startPostgres} from './test-postgres.mjs';
import {createMollieMock} from './mollie-mock.mjs';
import {marketFixture} from './bloei-market-fixture.mjs';
import {loginEnv,sessionCookie} from './sessie.mjs';
const repo=path.resolve(import.meta.dirname,'..');
const freePort=()=>new Promise((ok,fail)=>{const s=net.createServer();s.on('error',fail);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>ok(p))})});
export const marketBuilt=fs.existsSync(path.join(repo,'apps/backoffice/.next/standalone/server.js'));
export async function startMarketTest(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-market-http-')),pg=await startPostgres(),key='test_'+randomBytes(15).toString('hex'),mock=createMollieMock({key}),mockPort=await mock.listen(),port=await freePort(),base='http://127.0.0.1:'+port;
 const auth=sessionCookie('market-owner'),configKey='ac'.repeat(32);
 const env={...process.env,...pg.env,...loginEnv,LOCAL_NO_LOGIN:'0',TUNNEL_NO_LOGIN:'0',SHEETS_CONFIG_KEY:configKey,APP_DATA_DIR:dir,APP_ORIGIN:base,PORT:String(port),MOLLIE_API_KEY:key,MOLLIE_API_BASE:'http://127.0.0.1:'+mockPort,MOLLIE_LIVE_ENABLED:'0',BLOEI_MARKET_LIVE_ENABLED:'0',BLOEI:'aan',NEXT_TELEMETRY_DISABLED:'1',SUPABASE_SERVICE_ROLE_KEY:'',PUBLIC_ORDER_ORIGINS:'http://localhost:3004,http://127.0.0.1:3004'};
 const logs=[],child=spawn(process.execPath,['../../tools/start-app.mjs'],{cwd:path.join(repo,'apps/backoffice'),env,stdio:['ignore','pipe','pipe']});child.stdout.on('data',d=>logs.push(String(d)));child.stderr.on('data',d=>logs.push(String(d)));
 t.after(async()=>{await new Promise(r=>{if(child.exitCode!==null)return r();child.once('exit',r);child.kill()});await mock.close();await pg.stop();fs.rmSync(dir,{recursive:true,force:true})});
 let up=false;for(let n=0;n<100;n++){try{if((await fetch(base+'/api/health')).ok){up=true;break}}catch{}await new Promise(r=>setTimeout(r,200))}if(!up)throw Error('Testapp start niet: '+logs.join(''));
 async function call(route,{method='GET',body,owner=false,headers={},form}={}){const response=await fetch(base+route,{method,headers:{...(owner?{cookie:sessionCookie('market-owner'),Origin:base}:{}),...(body?{'Content-Type':'application/json',Origin:base}:{}),...headers},body:form|| (body?JSON.stringify(body):undefined),redirect:'manual'});const text=await response.text();let data;try{data=JSON.parse(text)}catch{data=text}return {status:response.status,headers:response.headers,data}}
 const initial=await call('/api/bloei/markt',{owner:true});if(initial.status!==200)throw Error(JSON.stringify(initial));
 const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',Buffer.from(configKey,'hex'),iv),encrypted=Buffer.concat([c.update(JSON.stringify(marketFixture())),c.final()]);const sealed=JSON.stringify({version:1,iv:iv.toString('base64'),tag:c.getAuthTag().toString('base64'),data:encrypted.toString('base64')});
 await pg.query("INSERT INTO bloei_administration(id,digest,data_sealed,sources_sealed,imported_at,imported_by) VALUES('main',$1,$2,$3,$4,$5)",['a'.repeat(64),sealed,'synthetic-original','2026-11-06T10:00:00.000Z','synthetic']);
 const memberToken=randomBytes(32).toString('base64url'),otherToken=randomBytes(32).toString('base64url');
 for(const [id,token] of [['buyer',memberToken],['other',otherToken]]){
  await pg.query('INSERT INTO coop_participants(id,name,email,bloei_member_id,created,updated) VALUES($1,$2,$3,$4,$5,$5)',[id,id+' Voorbeeld',id+'@example.invalid',id,new Date().toISOString()]);
  await pg.query('INSERT INTO coop_portal_links(participant_id,token_hash,token_sealed,created,created_by) VALUES($1,$2,$3,$4,$5)',[id,createHash('sha256').update(token).digest('hex'),'synthetic-not-used',new Date().toISOString(),'synthetic']);
 }
 const admin=async body=>{const version=(await call('/api/bloei/markt',{owner:true})).data.version;return call('/api/bloei/markt',{method:'POST',owner:true,body:{version,...body}})};
 return {base,auth,call,admin,mock,memberToken,otherToken,pg,dir};
}
export async function prepareMarket(s){
 const d=(await s.call('/api/bloei/markt',{owner:true})).data;
 const offer={groupKey:d.groups.find(g=>g.scheme==='grocery6').key,quantity:2,title:'6% boodschappen · voorbeeldaanbod',description:'Dit is uitsluitend fictief testaanbod.',sellerLabel:'Een Bloei-deelnemer',sellerOrg:'org_exampleSeller',consentRef:'test-instemming',sellerConsent:true};
 let r=await s.admin({action:'offer',offer});if(r.status!==200)throw Error(JSON.stringify(r));const id=r.data.offers[0].id;
 r=await s.admin({action:'publish',id});if(r.status!==200)throw Error(JSON.stringify(r));return id;
}

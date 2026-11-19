// Google Drive als beeldbank tegen de gebouwde backoffice en een nagebootste Google (geen echt account, niets naar Google).
// Eerst `npm run build`, dan: npm run test:drive
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {randomUUID,randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loginEnv,sessionCookie} from './sessie.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),app=path.join(repo,'apps/backoffice');
const built=fs.existsSync(path.join(app,'.next/standalone/server.js'));
const ME='administratie@boerbart.nl',ROOT='1Yw9R70qERX_cWZg-TB_qw_bxW9M2kc-g',SUB='1SubFolderAAAAAAAAAAAA',OLD='1OldImportBBBBBBBBBBBB';
const GMAIL='https://www.googleapis.com/auth/gmail.readonly',DRIVE='https://www.googleapis.com/auth/drive.readonly';
const owner={user:'bart',pass:randomBytes(16).toString('hex')},auth=sessionCookie(owner.user);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const jpg=Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xe0]),randomBytes(200)]),png=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,13,10,26,10]),randomBytes(200)]);
const webp=Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(4),Buffer.from('WEBPVP8 '),randomBytes(100)]);

function googleMock(){
 const s={scope:GMAIL+' '+DRIVE,codes:new Set(),refresh:new Set(),access:new Set(),calls:[],authScopes:null,
  files:new Map([
   [ROOT,{id:ROOT,name:'Beeldbank',mimeType:'application/vnd.google-apps.folder',parent:null}],
   ['1JpgPompoensoepCCCCCC',{id:'1JpgPompoensoepCCCCCC',name:'Pompoensoep.jpg',mimeType:'image/jpeg',parent:ROOT,data:jpg}],
   ['1PngErfDDDDDDDDDDDDDD',{id:'1PngErfDDDDDDDDDDDDDD',name:'Erf.png',mimeType:'image/png',parent:ROOT,data:png}],
   [OLD,{id:OLD,name:'Oud.jpg',mimeType:'image/jpeg',parent:ROOT,data:jpg}],
   [SUB,{id:SUB,name:'Zomer',mimeType:'application/vnd.google-apps.folder',parent:ROOT}],
   ['1WebpZomerEEEEEEEEEEE',{id:'1WebpZomerEEEEEEEEEEE',name:'Zomer.webp',mimeType:'image/webp',parent:SUB,data:webp}],
   ['1HeicIphoneFFFFFFFFFF',{id:'1HeicIphoneFFFFFFFFFF',name:'IMG_0001.HEIC',mimeType:'image/heic',parent:SUB,data:randomBytes(50)}],
   ['1NepJpgGGGGGGGGGGGGGG',{id:'1NepJpgGGGGGGGGGGGGGG',name:'nep.jpg',mimeType:'image/jpeg',parent:SUB,data:Buffer.from('<svg/>')}],
  ])};
 const send=(res,status,body,type='application/json')=>{res.writeHead(status,{'Content-Type':type});res.end(type==='application/json'?JSON.stringify(body):body)};
 const server=http.createServer((req,res)=>{const chunks=[];req.on('data',c=>chunks.push(c));req.on('end',()=>{
  const u=new URL(req.url,'http://x'),raw=Buffer.concat(chunks).toString();s.calls.push({method:req.method,path:u.pathname,query:u.search});
  if(u.pathname==='/o/oauth2/v2/auth'){s.authScopes=u.searchParams.get('scope');const code='code-'+randomUUID();s.codes.add(code);res.writeHead(302,{Location:u.searchParams.get('redirect_uri')+'?code='+code+'&state='+u.searchParams.get('state')});return res.end()}
  if(u.pathname==='/token'){const p=new URLSearchParams(raw);
   if(p.get('grant_type')==='authorization_code'){if(!s.codes.delete(p.get('code')))return send(res,400,{error:'invalid_grant'});const rt='r-'+randomUUID(),at='a-'+randomUUID();s.refresh.add(rt);s.access.add(at);return send(res,200,{access_token:at,refresh_token:rt,expires_in:3600,scope:s.scope})}
   if(!s.refresh.has(p.get('refresh_token')))return send(res,400,{error:'invalid_grant'});const at='a-'+randomUUID();s.access.add(at);return send(res,200,{access_token:at,expires_in:3600})}
  if(u.pathname==='/revoke'){s.refresh.delete(u.searchParams.get('token'));return send(res,200,{})}
  if(!s.access.has((req.headers.authorization||'').replace(/^Bearer /,'')))return send(res,401,{error:{message:'Invalid Credentials'}});
  if(u.pathname==='/gmail/v1/users/me/profile')return send(res,200,{emailAddress:ME,historyId:'1'});
  if(u.pathname==='/gmail/v1/users/me/labels')return send(res,200,{labels:[{id:'Label_1',name:'Inkoop'}]});
  if(u.pathname.startsWith('/gmail/'))return send(res,200,{});
  if(req.method!=='GET')return send(res,405,{error:{message:'alleen lezen'}});
  if(u.pathname==='/drive/v3/files'){const m=(u.searchParams.get('q')||'').match(/^'([A-Za-z0-9_-]+)' in parents/);if(!m)return send(res,400,{error:{message:'bad q'}});
   return send(res,200,{files:[...s.files.values()].filter(f=>f.parent===m[1]).map(({id,name,mimeType,data})=>({id,name,mimeType,...(data?{size:String(data.length)}:{})}))})}
  const f=s.files.get(decodeURIComponent(u.pathname.replace('/drive/v3/files/','')));if(!f)return send(res,404,{error:{message:'File not found'}});
  if(u.searchParams.get('alt')==='media')return send(res,200,f.data,'application/octet-stream');
  return send(res,200,{id:f.id,name:f.name,mimeType:f.mimeType,trashed:false});
 })});
 return {s,server};
}

test('Drive-beeldbank: koppelen met alleen lezen, foto\'s uit map en submap overnemen, niets dubbel, niets in Drive veranderd',{skip:!built&&'eerst npm run build'},async t=>{
 const {s,server}=googleMock();server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
 const mock='http://127.0.0.1:'+server.address().port;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-drive-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const port=5600+Math.floor(Math.random()*300),base='http://127.0.0.1:'+port;
 const env={...Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^(BASIC_AUTH|GOOGLE_|GMAIL_|MAIL_|LOCAL_NO_LOGIN|TUNNEL_NO_LOGIN|GUEST_)/.test(k))),
  BOER_BART_LOGIN:'aan',...loginEnv,APP_DATA_DIR:dir,PORT:String(port),APP_ORIGIN:base,SHEETS_CONFIG_KEY:'ef'.repeat(32),NEXT_TELEMETRY_DISABLED:'1',
  GUEST_GOOGLE_CLIENT_ID:'test-client',GUEST_GOOGLE_CLIENT_SECRET:'test-secret',GOOGLE_OAUTH_BASE:mock,GMAIL_API_BASE:mock,GOOGLE_DRIVE_API_BASE:mock,
  GUEST_DRIVE_FOLDER_ID:'https://drive.google.com/drive/u/0/folders/'+ROOT};
 const log=[];const child=spawn(process.execPath,['../../tools/start-app.mjs'],{cwd:app,env,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',d=>log.push(String(d)));child.stderr.on('data',d=>log.push(String(d)));
 t.after(()=>new Promise(r=>{child.once('exit',r);child.kill()}));
 let up=false;for(let i=0;i<100&&!up;i++){try{up=(await fetch(base+'/api/health')).ok}catch{}if(!up)await sleep(200)}
 assert.ok(up,'backoffice start niet:\n'+log.join(''));
 const call=async(p,{method='GET',body,redirect='follow'}={})=>{const r=await fetch(base+p,{method,redirect,headers:{cookie:auth,Origin:base,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return r};
 const overview=async()=>(await call('/api/drive')).json();
 // De achtergrondtaak kan direct na de eerste ronde nog een ronde doen: wacht tot de verwachte totalen er zijn.
 const waitSynced=async(imported)=>{for(let i=0;i<100;i++){const d=await overview();if(d.lastOk&&!d.syncing&&d.totals.imported>=imported)return d;await sleep(200)}throw Error('ophalen uit Drive kwam niet klaar: '+JSON.stringify(await overview())+'\n'+log.join('').slice(-2000))};
 // Een foto die eerder al uit Drive is overgenomen (zoals de eerste 24): die mag niet nog een keer binnenkomen.
 const fd=new FormData();fd.append('file',new Blob([jpg],{type:'image/jpeg'}),'Oud.jpg');fd.append('sourceId',OLD);fd.append('name','Oud');
 assert.equal((await fetch(base+'/api/media',{method:'POST',headers:{cookie:auth,Origin:base},body:fd})).status,200);
 const startCount=(await (await call('/api/media')).json()).length; // de vaste beelden uit de repository + de oude foto

 await t.test('zonder koppeling: niets ophalen, wel uitleg',async()=>{
  const d=await overview();assert.equal(d.connected,false);assert.equal(d.folderValid,true,'de hele link van de map wordt geaccepteerd');
  assert.equal((await call('/api/drive',{method:'POST',body:{action:'sync'}})).status,409);
 });
 await t.test('koppelen vraagt Gmail en Drive alleen lezen voor administratie@ en haalt daarna de foto\'s op',async()=>{
  const start=await call('/api/drive/koppelen',{redirect:'manual'});assert.equal(start.status,302);
  const g=await fetch(start.headers.get('location'),{redirect:'manual'});assert.deepEqual(s.authScopes.split(' ').sort(),[DRIVE,GMAIL].sort());
  const cb=await fetch(g.headers.get('location'),{redirect:'manual',headers:{cookie:auth}});
  const back=new URL(cb.headers.get('location'));assert.equal(back.pathname,'/koppeling');assert.equal(back.searchParams.get('drive'),'gekoppeld',back.search);
  const d=await waitSynced(4);
  assert.equal(d.connected,true);assert.equal(d.driveAllowed,true);assert.equal(d.lastError,null);
  assert.deepEqual(d.totals,{imported:4,skipped:2},'3 nieuw + de eerder overgenomen foto; HEIC en een nepbestand overgeslagen');
  assert.equal(d.summary.found,6);assert.equal(d.summary.folders,2);assert.equal(d.summary.waiting,0);
  const lib=await (await call('/api/media')).json();
  const fromDrive=Object.fromEntries(lib.map(m=>[m.sourceId,m]));
  assert.equal(fromDrive['1JpgPompoensoepCCCCCC'].name,'Pompoensoep');assert.equal(fromDrive['1JpgPompoensoepCCCCCC'].mime,'image/jpeg');
  assert.equal(fromDrive['1JpgPompoensoepCCCCCC'].source,'https://drive.google.com/file/d/1JpgPompoensoepCCCCCC/view');
  assert.equal(fromDrive['1WebpZomerEEEEEEEEEEE'].mime,'image/webp','ook uit de submap');assert.equal(fromDrive['1PngErfDDDDDDDDDDDDDD'].mime,'image/png');
  assert.equal(lib.filter(m=>m.sourceId===OLD).length,1,'eerder overgenomen foto niet dubbel');
  assert.equal(lib.length,startCount+3);
  const img=await call(fromDrive['1JpgPompoensoepCCCCCC'].url);assert.deepEqual(Buffer.from(await img.arrayBuffer()),jpg);
  assert.deepEqual(d.skipped.map(x=>x.name).sort(),['IMG_0001.HEIC','nep.jpg']);
  assert.match(d.skipped.find(x=>x.name==='IMG_0001.HEIC').reason,/HEIC/);
  assert.equal(s.calls.filter(c=>c.query.includes('alt=media')).some(c=>c.path.endsWith('1HeicIphoneFFFFFFFFFF')),false,'HEIC wordt niet eens gedownload');
 });
 await t.test('nog een keer ophalen: alleen de nieuwe foto, niets opnieuw downloaden',async()=>{
  s.files.set('1NieuwHHHHHHHHHHHHHHHH',{id:'1NieuwHHHHHHHHHHHHHHHH',name:'Nieuw.jpg',mimeType:'image/jpeg',parent:SUB,data:jpg});
  const before=s.calls.filter(c=>c.query.includes('alt=media')).length;
  assert.equal((await call('/api/drive',{method:'POST',body:{action:'sync'}})).status,200);
  const d=await waitSynced(5);
  assert.deepEqual(d.totals,{imported:5,skipped:2});assert.equal(d.summary.found,7);
  assert.equal(s.calls.filter(c=>c.query.includes('alt=media')).length-before,1);
  assert.equal((await (await call('/api/media')).json()).length,startCount+4);
 });
 await t.test('in Drive wordt nooit iets veranderd',async()=>{
  assert.deepEqual([...new Set(s.calls.filter(c=>c.path.startsWith('/drive/')).map(c=>c.method))],['GET']);
 });
 await t.test('Drive niet toegestaan bij Google: duidelijke melding, geen koppeling met Drive',async()=>{
  s.scope=GMAIL;
  const start=await call('/api/drive/koppelen',{redirect:'manual'});const g=await fetch(start.headers.get('location'),{redirect:'manual'});
  const back=new URL((await fetch(g.headers.get('location'),{redirect:'manual',headers:{cookie:auth}})).headers.get('location'));
  assert.equal(back.searchParams.get('drive'),'fout');assert.match(back.searchParams.get('melding'),/Google Drive/);
  assert.equal((await overview()).driveAllowed,true,'de eerdere koppeling blijft gewoon werken');
 });
});

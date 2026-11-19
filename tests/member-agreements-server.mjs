// Every record here is synthetic. Never connect these tests to an existing administration.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {startPostgres} from './test-postgres.mjs';
import {AUTH_SECRET,sessionCookie,memberCookie} from './sessie.mjs';
const repo=path.resolve(import.meta.dirname,'..');
const freePort=()=>new Promise((ok,fail)=>{const s=net.createServer();s.on('error',fail);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>ok(p))})});
export const agreementsBuilt=fs.existsSync(path.join(repo,'apps/backoffice/.next/standalone/server.js'));
const cookieOf=(r,name)=>{const value=(r.headers.getSetCookie().find(c=>c.startsWith(name+'='))||'').split(';')[0];return value.endsWith('=')?'':value};
function fakeMemberAuth(){
 const codes=new Map(),server=http.createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);let b;try{b=JSON.parse(Buffer.concat(chunks))}catch{b={}}const code=codes.get(b.auth_code);
  if(req.url!=='/auth/v1/token?grant_type=pkce'||req.headers.apikey!=='anon-synthetic'||!code||createHash('sha256').update(b.code_verifier||'').digest('base64url')!==code.challenge){res.writeHead(400);return res.end('{}')}
  codes.delete(b.auth_code);res.setHeader('content-type','application/json');res.end(JSON.stringify({user:{id:'synthetic-'+createHash('sha256').update(code.email).digest('hex').slice(0,24),email:code.email,email_confirmed_at:'2026-01-01T00:00:00Z',app_metadata:{provider:'google'}}}));
 });
 return {listen:()=>new Promise(r=>server.listen(0,'127.0.0.1',()=>r('http://127.0.0.1:'+server.address().port))),close:()=>new Promise(r=>server.close(r)),issue(url,email){const u=new URL(url),code=randomBytes(16).toString('hex');codes.set(code,{email,challenge:u.searchParams.get('code_challenge')});return u.searchParams.get('redirect_to')+'?code='+code}};
}
export async function startAgreementTest(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-membership-http-')),pg=await startPostgres();
 t.after(async()=>{await pg.stop();fs.rmSync(dir,{recursive:true,force:true})});
 const provider=fakeMemberAuth(),providerUrl=await provider.listen();t.after(()=>provider.close());
 const port=await freePort(),base='http://127.0.0.1:'+port,auth='';
 const env={...process.env,...pg.env,BOER_BART_LOGIN:'aan',LOCAL_NO_LOGIN:'0',TUNNEL_NO_LOGIN:'0',AUTH_SECRET,GUEST_ACCESS:JSON.stringify({administratie:{manage:true,send:false,calendar:false,mailboxes:[]}}),SHEETS_CONFIG_KEY:'ad'.repeat(32),APP_DATA_DIR:dir,APP_ORIGIN:base,PORT:String(port),NEXT_TELEMETRY_DISABLED:'1',SUPABASE_URL:providerUrl,SUPABASE_ANON_KEY:'anon-synthetic',BLOEI:'aan',MOLLIE_API_KEY:'',MOLLIE_LIVE_ENABLED:'0',BLOEI_MARKET_LIVE_ENABLED:'0'};
 const logs=[],child=spawn(process.execPath,['../../tools/start-app.mjs'],{cwd:path.join(repo,'apps/backoffice'),env,stdio:['ignore','pipe','pipe']});child.stdout.on('data',d=>logs.push(String(d)));child.stderr.on('data',d=>logs.push(String(d)));
 t.after(async()=>{if(child.exitCode===null)await new Promise(r=>{child.once('exit',r);child.kill()})});
 let up=false;for(let i=0;i<150;i++){try{if((await fetch(base+'/api/health',{signal:AbortSignal.timeout(1000)})).ok){up=true;break}}catch{}await new Promise(r=>setTimeout(r,200))}if(!up)throw Error('Testapp start niet: '+logs.join(''));
 let ownerSession='';
 // Ledenlogin (9 november 2026): de ledenpagina opent alleen met een ledensessie voor die link. Zonder eigen cookie krijgt een
 // verzoek naar de link van een synthetisch lid een sessie die alleen de pagina opent (adres buiten de ledenkaart), zodat
 // ondertekenen nog steeds de echte ledenlogin (loginMember) vraagt.
 const pageSession=route=>{const token=/^\/(?:api\/)?deelnemer\/([A-Za-z0-9_-]{43})/.exec(route)?.[1],p=token&&Object.values(people).find(x=>x.token===token);return p?{Cookie:memberCookie(token,{participantId:p.id,email:'pagina@example.invalid'})}:{}};
 async function call(route,{method='GET',body,owner=false,headers={},form}={}){
  const response=await fetch(base+route,{method,headers:{...(owner?{Cookie:sessionCookie('administratie')}:pageSession(route)),...(body?{'Content-Type':'application/json',Origin:base}:{}),...(form?{'Content-Type':'application/x-www-form-urlencoded',Origin:base}:{}),...headers},body:form|| (body?JSON.stringify(body):undefined),redirect:'manual',signal:AbortSignal.timeout(15000)});
  const text=await response.text();let data;try{data=JSON.parse(text)}catch{data=text}return {status:response.status,headers:response.headers,data};
 }
 // Eigenaar: een ondertekende sessie zoals na Google én de Authenticator-code (besluit eigenaar 6 november 2026);
 // de Google-stap zelf staat in tests/inloggen.integration.mjs.
 ownerSession=sessionCookie('administratie');
 const ready=await call('/api/leden/afspraken',{owner:true});if(ready.status!==200)throw Error(JSON.stringify(ready)+' '+logs.join(''));
 const now=new Date().toISOString(),today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date()),people={};
 for(const [key,name,units,roles] of [['chef','Chris Voorbeeld',['restaurant'],{restaurant:['chef-kok']}],['head','Hanne Voorbeeld',['restaurant'],{restaurant:['hoofdbediening']}],['supplier','Sam Voorbeeld',['levert'],{}],['supplier2','Robin Voorbeeld',['levert'],{}],['other','Kim Voorbeeld',['boerderij'],{}]]){
  const id=randomUUID(),token=randomBytes(32).toString('base64url');people[key]={id,name,token,api:'/api/deelnemer/'+token,units,roles};
  await pg.query('INSERT INTO coop_participants(id,name,email,created,updated) VALUES($1,$2,$3,$4,$4)',[id,name,key+'@example.invalid',now]);
  await pg.query('INSERT INTO coop_portal_links(participant_id,token_hash,token_sealed,created,created_by) VALUES($1,$2,$3,$4,$5)',[id,createHash('sha256').update(token).digest('hex'),'synthetic-not-used',now,'test']);
 }
 const potRoles=[{id:'chef-kok',name:'Chef-kok',points:4},{id:'hoofdbediening',name:'Hoofdbediening',points:3},{id:'afwas',name:'Afwas',points:2}];
 await pg.query("INSERT INTO pot_agreements(id,pot,valid_from,percent_bp,roles,tip_rule,note,required,status,proposed_by,proposed_at,decided_at) VALUES($1,'restaurant','2020-01-01',3000,$2,'gelijk','',$3,'geldig','test',$4,$4)",[randomUUID(),JSON.stringify(potRoles),JSON.stringify([people.chef.id,people.head.id]),now]);
 async function setMember(key,change={}){const p=people[key],row=(await pg.query('SELECT version FROM coop_participants WHERE id=$1',[p.id]))[0];return call('/api/leden',{owner:true,method:'POST',body:{action:'lid',id:p.id,version:row.version,member:{memberClass:'B',memberSince:today,voting:'auto',phone:'',address:'',units:p.units,potRoles:p.roles,bloeiMemberId:'',...change}}})}
 for(const key of Object.keys(people)){const r=await setMember(key);if(r.status!==200)throw Error(JSON.stringify(r))}
 async function changeGuest(body){const initial=await call('/api/gasten',{owner:true});if(initial.status!==200)throw Error(JSON.stringify(initial));return call('/api/gasten',{owner:true,method:'POST',body:{requestId:randomUUID(),version:initial.data.version,...body}})}
 for(const body of [{action:'services',services:{speelboerderij:true,winkel:true,yte:true}},{action:'hours',hours:Array.from({length:7},()=>({open:true,from:'10:00',to:'18:00'}))}]){const r=await changeGuest(body);if(r.status!==200)throw Error(JSON.stringify(r))}
 async function loginMember(key,email=key+'@example.invalid'){
  const start=await call('/auth/lid/google',{method:'POST',form:new URLSearchParams({terug:'/deelnemer/'+people[key].token+'/afspraken'}).toString()});if(start.status!==303)throw Error(JSON.stringify(start));const back=provider.issue(start.headers.get('location'),email),finish=await call(back.slice(base.length),{headers:{Cookie:cookieOf(start,'bb_lid_inlog')}});return {cookie:cookieOf(finish,'bb_lid_sessie'),finish,start,back};
 }
 return {base,auth,ownerSession,call,pg,dir,logs,people,today,setMember,changeGuest,loginMember};
}
export async function approveExampleAgreement(s,key='chef',contractKey){
 const p=s.people[key],pick=view=>contractKey?view.contracts.find(c=>c.key===contractKey).latest:view.latest;let v=pick((await s.call(p.api+'/lidafspraak')).data);
 const sent=await s.call('/api/leden/afspraken',{owner:true,method:'POST',body:{action:'voorleggen',id:v.id,revision:v.revision}});if(sent.status!==200)throw Error(JSON.stringify(sent));
 v=pick((await s.call(p.api+'/lidafspraak')).data);
 const login=await s.loginMember(key);if(!login.cookie)throw Error('Member login failed');const signed=await s.call(p.api+'/lidafspraak',{method:'POST',headers:{Cookie:login.cookie},body:{action:'akkoord',id:v.id,hash:v.hash,confirm:true}});if(signed.status!==200)throw Error(JSON.stringify(signed));
 await approveGroups(s,v.groups);
 return (await s.call(p.api+'/lidafspraak')).data;
}
export async function approveGroups(s,groups){for(const g of groups){const row=(await s.pg.query('SELECT voters FROM overleg_proposals WHERE id=$1',[g.proposalId]))[0];for(const id of JSON.parse(row.voters)){const voter=Object.values(s.people).find(x=>x.id===id);if(!voter)throw Error('Unknown synthetic voter');const r=await s.call(voter.api+'/overleg',{method:'POST',body:{proposalId:g.proposalId,vote:'akkoord'}});if(r.status!==200)throw Error(JSON.stringify(r))}const proposal=(await s.pg.query('SELECT version FROM overleg_proposals WHERE id=$1',[g.proposalId]))[0];const r=await s.call('/api/overleg',{method:'POST',owner:true,body:{action:'vaststellen',id:g.proposalId,version:proposal.version}});if(r.status!==200)throw Error(JSON.stringify(r))}}

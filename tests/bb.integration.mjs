// BB-tegoed stap 1 (besluiten eigenaar 5 en 6 november 2026) tegen de gebouwde backoffice: bij het goedkeuren van de winkelweek krijgt
// een B-lid zijn opbrengst als BB (eenmalig), staat hij niet in het betaalbestand, en ziet hij zijn saldo op de ledenpagina.
// Een deelnemer zonder A/B wordt gewoon via de bank betaald. Eerst `npm run build`, dan: npm run test:cooperatie
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID,randomBytes} from 'node:crypto';
import {startPostgres} from './test-postgres.mjs';
import {fileURLToPath} from 'node:url';
import {loginEnv,sessionCookie,memberCookie} from './sessie.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),app=path.join(repo,'apps/backoffice');
const built=fs.existsSync(path.join(app,'.next/standalone/server.js'));
const owner={user:'bartele',pass:randomBytes(16).toString('hex')},auth=sessionCookie(owner.user);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const day=d=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(d);
const monday=s=>{const d=new Date(s+'T12:00:00Z');return new Date(d.getTime()-((d.getUTCDay()+6)%7)*86400000).toISOString().slice(0,10)};
const plus=(s,n)=>new Date(Date.parse(s+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);

// Winkelpot (lib/shop-pot.ts, STANDARD_SHOP_POT): vanaf die datum gaat er 5% extra af, bovenop het coöperatiedeel.
// De test rekent met „vorige week”, gezien vanaf vandaag; sinds 16 november 2026 valt die week na de ingangsdatum.
// De verwachte bedragen volgen daarom dezelfde regel als de backoffice (lib/coop-core.ts), met de datum uit de code.
const potStd=/STANDARD_SHOP_POT:PotRule=\{validFrom:'(\d{4}-\d{2}-\d{2})',bp:SHOP_POT_BP\}/.exec(fs.readFileSync(new URL('../apps/backoffice/lib/shop-pot.ts',import.meta.url),'utf8'));
const potBpStd=Number(/SHOP_POT_BP=(\d+)/.exec(fs.readFileSync(new URL('../apps/backoffice/lib/shop-pot-core.ts',import.meta.url),'utf8'))[1]);
const potOn=week=>potStd&&week>=potStd[1]?potBpStd:0;
/** Afrekening van één deelnemer, één percentage: coöperatiedeel, winkelpot en (bij inclusief btw) het btw-deel. */
const afrekening=(excl,vat,bp,pot,vatIncl)=>{const tot=Math.round(excl*(bp+pot)/10000),potC=Math.round(excl*pot/10000),vatShare=vatIncl?Math.round(vat*(10000-bp-pot)/10000):0;
 return {retained:tot-potC,pot:potC,vatShare,payout:excl-tot+vatShare}};
const euro=(c,sep='.')=>(c/100).toFixed(2).replace('.',sep);

test('BB-tegoed: B-lid krijgt de winkelweek als BB, niet via de bank',{skip:!built&&'eerst npm run build'},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-tegoed-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const port=5900+Math.floor(Math.random()*100), // niet 6000: die poort blokkeert fetch (X11)
 base='http://127.0.0.1:'+port;
 const pg=await startPostgres();
 const env={...Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^(BASIC_AUTH|LOCAL_NO_LOGIN|TUNNEL_NO_LOGIN|MAIL_|GUEST_)/.test(k))),
  BOER_BART_LOGIN:'aan',WEKEN_AUTOMATISCH:'uit',...loginEnv,APP_DATA_DIR:dir,PORT:String(port),APP_ORIGIN:base,SHEETS_CONFIG_KEY:'cd'.repeat(32),NEXT_TELEMETRY_DISABLED:'1',MAIL_SYNC:'0',...pg.env};
 const log=[];const child=spawn(process.execPath,['../../tools/start-app.mjs'],{cwd:app,env,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',d=>log.push(String(d)));child.stderr.on('data',d=>log.push(String(d)));
 t.after(async()=>{await new Promise(r=>{child.once('exit',r);child.kill()});await pg.stop()});
 let up=false;for(let i=0;i<100&&!up;i++){try{up=(await fetch(base+'/api/health')).ok}catch{}if(!up)await sleep(200)}
 assert.ok(up,'backoffice start niet:\n'+log.join(''));
 const call=async(p,body)=>{const r=await fetch(base+p,{method:body?'POST':'GET',headers:{cookie:auth,Origin:base,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}return {status:r.status,data,headers:r.headers}};
 const coop=b=>call('/api/cooperatie',b);
 const product=async(name,priceCents,vat)=>{const r=await call('/api/products',{action:'create-publish',product:{name,department:'Winkel',priceCents,vat,station:'winkel',available:true,photo:'',note:'',check:'',sourceId:'',optionGroups:[]}});assert.equal(r.status,200,JSON.stringify(r.data));
  return {id:r.data.id,version:1}}; // de openbare productlijst wordt een minuut bewaard; het ID komt uit het antwoord
 const bloemen=await product('Boeket Bindert',2420,'21'),brood=await product('Desembrood Rianne',545,'9');
 const thisMonday=monday(day(new Date())),lastMonday=plus(thisMonday,-7);
 const bindert=(await coop({action:'deelnemer',participant:{name:'Bindert',holder:'B. Bloem',iban:'NL91 ABNA 0417 1643 00',email:'',vatInclusive:false,active:true}})).data.id;
 const rianne=(await coop({action:'deelnemer',participant:{name:'Rianne',holder:'Rianne',iban:'NL20INGB0001234567',email:'',vatInclusive:false,active:true}})).data.id;
 for(const who of [bindert,rianne])assert.equal((await coop({action:'percentage',participantId:who,validFrom:'2026-01-01',percentBp:1000})).status,200);
 for(const [p,who] of [[bloemen,bindert],[brood,rianne]])assert.equal((await coop({action:'eigenaar',productId:p.id,participantId:who})).status,200);
 // Bindert is B-lid (ledenkaart); Rianne heeft (in deze test) nog geen soort lid en wordt via de bank betaald.
 await pg.query(`UPDATE coop_participants SET member_class='B' WHERE id=$1`,[bindert]);
 const sale=async(id,created,lines)=>{await pg.query(`INSERT INTO orders(id,request_id,request,data,created,mode,reference,status,payment_status,total_cents,test) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0)`,[id,randomUUID(),'{}',JSON.stringify({lines:[]}),created,'winkel','Winkel','vastgelegd','betaald',lines.reduce((n,l)=>n+l.total,0)]);
  for(const [i,l] of lines.entries())await pg.query(`INSERT INTO order_lines(order_id,position,product_id,name,station,quantity,unit_cents,total_cents,vat,vat_cents,owner_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[id,i,l.product,l.name,'winkel',1,l.total,l.total,l.vat,l.vatCents,l.owner])};
 await sale(201,new Date(lastMonday+'T10:00:00Z').toISOString(),[{product:bloemen.id,name:'Boeket Bindert',total:2420,vat:'21',vatCents:420,owner:bindert},{product:brood.id,name:'Desembrood Rianne',total:545,vat:'9',vatCents:45,owner:rianne}]);

 await t.test('goedkeuren schrijft BB bij voor het B-lid, één keer',async()=>{
  assert.equal((await coop({action:'goedkeuren',week:lastMonday})).status,200);
  const rows=await pg.query('SELECT participant_id AS p,kind,amount_cents AS a,source FROM bb_entries');
  const bbB=afrekening(2000,0,1000,potOn(lastMonday),false).payout;
  assert.deepEqual(rows,[{p:bindert,kind:'winkel-week',a:bbB,source:'winkel:'+lastMonday}],'2000 excl. btw min 10% (en de winkelpot zodra die geldt), alleen Bindert');
  if(!potOn(lastMonday))assert.equal(bbB,1800);
 });
 await t.test('het betaalbestand bevat alleen wie geen BB krijgt',async()=>{
  assert.equal((await coop({action:'instellingen',debtorName:'Coöperatie Boer Bart',iban:'DE89370400440532013000',version:0})).status,200);
  const x=await call(`/api/cooperatie?week=${lastMonday}&bestand=sepa`);assert.equal(x.status,200);
  assert.match(x.data,new RegExp(`<NbOfTxs>1</NbOfTxs>\\s*<CtrlSum>${euro(afrekening(500,45,1000,potOn(lastMonday),false).payout).replace('.','\\.')}</CtrlSum>`));assert.doesNotMatch(x.data,/B\. Bloem/);
 });
 await t.test('het lid ziet zijn BB-saldo op de ledenpagina; de ledenkaart toont het ook',async()=>{
  const path=(await coop({action:'link-maken',participantId:bindert})).data.path,token=path.split('/').pop();
  // Ledenlogin (9 november 2026): alleen de link is niet genoeg; met de eigen ledensessie wel.
  assert.equal((await fetch(base+'/api/deelnemer/'+token+'/bb')).status,401,'zonder ledenlogin dicht');
  const r=await fetch(base+'/api/deelnemer/'+token+'/bb',{headers:{cookie:memberCookie(token,{participantId:bindert})}});const d=await r.json();
  assert.equal(r.status,200);assert.equal(d.getsBb,true);assert.equal(d.balanceCents,afrekening(2000,0,1000,potOn(lastMonday),false).payout);assert.match(d.entries[0].note,/Producten in de winkel/);
  const leden=(await call('/api/leden')).data;assert.equal(leden.members.find(m=>m.id===bindert).bbCents,afrekening(2000,0,1000,potOn(lastMonday),false).payout);assert.equal(leden.members.find(m=>m.id===rianne).bbCents,null);
 });
});

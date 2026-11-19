// Coöperatieve winkel tegen de gebouwde backoffice: eigenaar per product, eigenaar vastgelegd bij verkoop, week
// goedkeuren, betaalbestand (SEPA en CSV) en een correctie na terugbetalen. Eerst `npm run build`, dan: npm run test:cooperatie
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID,randomBytes} from 'node:crypto';
import {startPostgres} from './test-postgres.mjs';
import {fileURLToPath} from 'node:url';
import {loginEnv,sessionCookie} from './sessie.mjs';

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

test('coöperatieve winkel: deelnemers, eigenaar bij verkoop, week goedkeuren, betaalbestand en correctie',{skip:!built&&'eerst npm run build'},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-coop-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const port=5900+Math.floor(Math.random()*100), // niet 6000: die poort blokkeert fetch (X11)
 base='http://127.0.0.1:'+port;
 const pg=await startPostgres();
 // Nagebootste Claude (etiket lezen, 9 november 2026): antwoordt met `claude.answer` als JSON-tekst en onthoudt de verzoeken.
 const http=await import('node:http'),claude={answer:null,requests:[]};
 const mock=http.createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{claude.requests.push({url:req.url,body:JSON.parse(body||'{}')});res.writeHead(200,{'Content-Type':'application/json'});
  res.end(JSON.stringify({id:'msg_test',type:'message',role:'assistant',model:'claude-opus-5-5',content:[{type:'text',text:JSON.stringify(claude.answer)}],stop_reason:'end_turn',stop_sequence:null,usage:{input_tokens:1,output_tokens:1}}))})});
 mock.listen(0,'127.0.0.1');await new Promise(r=>mock.once('listening',r));t.after(()=>mock.close());
 const env={...Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^(BASIC_AUTH|LOCAL_NO_LOGIN|TUNNEL_NO_LOGIN|MAIL_|GUEST_)/.test(k))),
  BOER_BART_LOGIN:'aan',WEKEN_AUTOMATISCH:'uit',...loginEnv,APP_DATA_DIR:dir,PORT:String(port),APP_ORIGIN:base,SHEETS_CONFIG_KEY:'cd'.repeat(32),NEXT_TELEMETRY_DISABLED:'1',MAIL_SYNC:'0',ANTHROPIC_API_KEY:'sk-ant-test-0000',ANTHROPIC_BASE_URL:'http://127.0.0.1:'+mock.address().port,...pg.env};
 const log=[];const child=spawn(process.execPath,['../../tools/start-app.mjs'],{cwd:app,env,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',d=>log.push(String(d)));child.stderr.on('data',d=>log.push(String(d)));
 t.after(async()=>{await new Promise(r=>{child.once('exit',r);child.kill()});await pg.stop()});
 let up=false;for(let i=0;i<100&&!up;i++){try{up=(await fetch(base+'/api/health')).ok}catch{}if(!up)await sleep(200)}
 assert.ok(up,'backoffice start niet:\n'+log.join(''));
 const call=async(p,body)=>{const r=await fetch(base+p,{method:body?'POST':'GET',headers:{cookie:auth,Origin:base,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}return {status:r.status,data,headers:r.headers}};
 const coop=b=>call('/api/cooperatie',b);
 const product=async(name,priceCents,vat)=>{const r=await call('/api/products',{action:'create-publish',product:{name,department:'Winkel',priceCents,vat,station:'winkel',available:true,photo:'',note:'',check:'',sourceId:'',optionGroups:[]}});assert.equal(r.status,200,JSON.stringify(r.data));
  return {id:r.data.id,version:1}}; // de openbare productlijst wordt een minuut bewaard; het ID komt uit het antwoord
 const bloemen=await product('Boeket Bindert',2420,'21'),brood=await product('Desembrood Rianne',545,'9'),eieren=await product('Eieren coöperatie',400,'9');

 const thisMonday=monday(day(new Date())),lastMonday=plus(thisMonday,-7);
 let bindert,rianne;
 await t.test('deelnemers met IBAN (versleuteld), percentage per datum, eigenaar per product',async()=>{
  assert.equal((await coop({action:'deelnemer',participant:{name:'Bindert',holder:'B. Bloem',iban:'NL91ABNA0417164301',email:'',vatInclusive:false,active:true}})).status,400,'fout IBAN geweigerd');
  bindert=(await coop({action:'deelnemer',participant:{name:'Bindert',holder:'B. Bloem',iban:'NL91 ABNA 0417 1643 00',email:'',vatInclusive:false,active:true}})).data.id;
  rianne=(await coop({action:'deelnemer',participant:{name:'Rianne',holder:'Rianne',iban:'NL20INGB0001234567',email:'rianne@boerbart.nl',vatInclusive:true,active:true}})).data.id;
  assert.equal((await coop({action:'percentage',participantId:bindert,validFrom:'2026-01-01',percentBp:1000})).status,200);
  assert.equal((await coop({action:'percentage',participantId:rianne,validFrom:'2026-01-01',percentBp:1500})).status,200);
  for(const [p,who] of [[bloemen,bindert],[brood,rianne]])assert.equal((await coop({action:'eigenaar',productId:p.id,participantId:who})).status,200);
  const o=(await coop()).data;
  assert.deepEqual(o.participants.map(p=>[p.name,p.hasIban,p.ibanEnd]),[['Bindert',true,'4300'],['Rianne',true,'4567']]);
  assert.equal(JSON.stringify(o).includes('ABNA'),false,'IBAN nooit leesbaar in het overzicht');
  assert.equal(o.owners[bloemen.id],bindert);assert.equal(o.lastClosedWeek,lastMonday);
  const sealed=await pg.query('SELECT iban_sealed AS s FROM coop_participants');
  assert.ok(sealed.every(r=>r.s&&!r.s.includes('NL91')&&!r.s.includes('NL20')),'IBAN versleuteld opgeslagen');
 });
 await t.test('de eigenaar wordt bij de verkoopregel vastgelegd; een latere wijziging verandert oude omzet niet',async()=>{
  const r=await call('/api/orders',{requestId:randomUUID(),mode:'winkel',reference:'Winkel',lines:[{productId:bloemen.id,version:bloemen.version,quantity:1,selections:{},note:''},{productId:eieren.id,version:eieren.version,quantity:1,selections:{},note:''}]});
  assert.equal(r.status,200,JSON.stringify(r.data));
  assert.equal((await coop({action:'eigenaar',productId:bloemen.id,participantId:rianne})).status,200);
  const rows=await pg.query('SELECT name,owner_id AS o FROM order_lines ORDER BY id');
  assert.deepEqual(rows,[{name:'Boeket Bindert',o:bindert},{name:'Eieren coöperatie',o:null}]);
  assert.equal((await coop({action:'eigenaar',productId:bloemen.id,participantId:bindert})).status,200);
  const v=(await call('/api/cooperatie?week='+thisMonday)).data;
  assert.equal(v.finished,false);assert.equal(v.settlement.testLines,2,'kassa-proefbestellingen worden niet afgerekend');assert.deepEqual(v.settlement.participants,[]);
 });
 // Echte verkopen van vorige week (zoals na livegang), rechtstreeks in de database gezet.
 const sale=async(id,created,lines,{status='vastgelegd',payment='betaald'}={})=>{await pg.query(`INSERT INTO orders(id,request_id,request,data,created,mode,reference,status,payment_status,total_cents,test) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0)`,[id,randomUUID(),'{}',JSON.stringify({lines:[]}),created,'winkel','Winkel',status,payment,lines.reduce((s,l)=>s+l.total,0)]);
  for(const [i,l] of lines.entries())await pg.query(`INSERT INTO order_lines(order_id,position,product_id,name,station,quantity,unit_cents,total_cents,vat,vat_cents,owner_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[id,i,l.product,l.name,'winkel',1,l.total,l.total,l.vat,l.vatCents,l.owner])};
 const at=(d,h=10)=>new Date(d+`T${String(h).padStart(2,'0')}:00:00Z`).toISOString();
 await sale(101,at(lastMonday),[{product:bloemen.id,name:'Boeket Bindert',total:2420,vat:'21',vatCents:420,owner:bindert},{product:brood.id,name:'Desembrood Rianne',total:545,vat:'9',vatCents:45,owner:rianne}]);
 await sale(102,at(plus(lastMonday,6),20),[{product:bloemen.id,name:'Boeket Bindert',total:2420,vat:'21',vatCents:420,owner:bindert}]);
 await sale(103,at(plus(lastMonday,2)),[{product:brood.id,name:'Desembrood Rianne',total:545,vat:'9',vatCents:45,owner:rianne}],{status:'wacht-op-betaling',payment:'open'});
 await sale(104,at(plus(lastMonday,3)),[{product:brood.id,name:'Desembrood Rianne',total:545,vat:'9',vatCents:45,owner:rianne}],{payment:'terugbetaald'});
 await sale(105,at(plus(lastMonday,4)),[{product:eieren.id,name:'Eieren coöperatie',total:400,vat:'9',vatCents:33,owner:null}]);

 await t.test('weekafsluiting: omzet exclusief btw, percentage per deelnemer, alleen doorgegane verkopen',async()=>{
  const v=(await call('/api/cooperatie?week='+lastMonday)).data;
  assert.equal(v.finished,true);assert.equal(v.status,'open');
  const b=v.settlement.participants.find(p=>p.name==='Bindert'),r=v.settlement.participants.find(p=>p.name==='Rianne');
  const pot=potOn(lastMonday),eb=afrekening(4000,0,1000,pot,false),er=afrekening(500,45,1500,pot,true);
  assert.deepEqual([b.revenueExclCents,b.retainedCents,b.payoutCents],[4000,400,eb.payout]);assert.equal(b.potCents??0,eb.pot);
  assert.deepEqual([r.revenueExclCents,r.retainedCents,r.vatShareCents,r.payoutCents],[500,75,er.vatShare,er.payout],'Rianne: inclusief btw-deel (85% van 0,45, min de winkelpot)');
  if(!pot)assert.deepEqual([eb.payout,er.vatShare,er.payout],[3600,38,463],'zonder winkelpot: de oorspronkelijke bedragen');
  assert.deepEqual(v.settlement.coop,{revenueExclCents:367,vatCents:33,lines:1});
  assert.equal(v.settlement.payoutTotalCents,eb.payout+er.payout);
 });
 await t.test('goedkeuren legt de week vast; daarna geen percentage meer in die week',async()=>{
  assert.equal((await coop({action:'goedkeuren',week:thisMonday})).status,409,'lopende week kan niet');
  assert.equal((await call(`/api/cooperatie?week=${lastMonday}&bestand=sepa`)).status,409,'eerst goedkeuren');
  assert.equal((await coop({action:'goedkeuren',week:lastMonday})).status,200);
  assert.equal((await coop({action:'goedkeuren',week:lastMonday})).status,409);
  const bad=await coop({action:'percentage',participantId:bindert,validFrom:lastMonday,percentBp:5000});assert.equal(bad.status,400);assert.match(bad.data.error,/al goedgekeurd/);
  await sale(106,at(plus(lastMonday,1)),[{product:bloemen.id,name:'Boeket Bindert',total:2420,vat:'21',vatCents:420,owner:bindert}]);
  const v=(await call('/api/cooperatie?week='+lastMonday)).data;
  assert.equal(v.status,'goedgekeurd');assert.equal(v.approvedBy,owner.user);assert.equal(v.settlement.payoutTotalCents,afrekening(4000,0,1000,potOn(lastMonday),false).payout+afrekening(500,45,1500,potOn(lastMonday),true).payout,'vastgelegd: later toegevoegde verkoop verandert niets');
 });
 await t.test('betaalbestand: SEPA na invullen rekening coöperatie, en de CSV',async()=>{
  const missing=await call(`/api/cooperatie?week=${lastMonday}&bestand=sepa`);assert.equal(missing.status,409);assert.match(missing.data.error,/IBAN van de coöperatie/);
  assert.equal((await coop({action:'instellingen',debtorName:'Coöperatie Boer Bart',iban:'NL02ABNA0123456780',version:0})).status,400,'fout IBAN');
  assert.equal((await coop({action:'instellingen',debtorName:'Coöperatie Boer Bart',iban:'DE89370400440532013000',version:0})).status,200);
  const x=await call(`/api/cooperatie?week=${lastMonday}&bestand=sepa`);assert.equal(x.status,200);
  assert.match(x.headers.get('content-disposition'),/boerbart-afrekening-.*\.xml/);
  const pb=afrekening(4000,0,1000,potOn(lastMonday),false).payout,pr=afrekening(500,45,1500,potOn(lastMonday),true).payout;
  assert.match(x.data,new RegExp(`<NbOfTxs>2</NbOfTxs>\\s*<CtrlSum>${euro(pb+pr).replace('.','\\.')}</CtrlSum>`));
  assert.match(x.data,/<Nm>B\. Bloem<\/Nm>\s*<\/Cdtr>\s*<CdtrAcct><Id><IBAN>NL91ABNA0417164300<\/IBAN>/);assert.ok(x.data.includes(`<InstdAmt Ccy="EUR">${euro(pb)}</InstdAmt>`));
  assert.match(x.data,/<DbtrAcct><Id><IBAN>DE89370400440532013000<\/IBAN>/);
  const c=await call(`/api/cooperatie?week=${lastMonday}&bestand=csv`);assert.match(c.data,new RegExp(`Naam;IBAN;Bedrag;Omschrijving\\r\\nB\\. Bloem;NL91ABNA0417164300;${euro(pb,',')};Boer Bart week \\d+`));
 });
 await t.test('terugbetaald na goedkeuren: correctie in de volgende week; uitbetaald markeren',async()=>{
  await pg.query(`UPDATE orders SET payment_status='terugbetaald' WHERE id=102`);
  const v=(await call('/api/cooperatie?week='+thisMonday)).data;
  // 102 terugbetaald (eraf), 106 kwam na het goedkeuren nog binnen in die week (erbij): allebei als correctie.
  assert.deepEqual(v.corrections,[{orderId:102,sign:-1},{orderId:106,sign:1}]);
  const b=v.settlement.participants.find(p=>p.name==='Bindert');assert.deepEqual([b.revenueExclCents,b.retainedCents,b.payoutCents,b.lines],[0,0,0,2]);
  await pg.query(`UPDATE orders SET payment_status='terugbetaald' WHERE id=106`);
  const w=(await call('/api/cooperatie?week='+thisMonday)).data;
  assert.deepEqual(w.corrections,[{orderId:102,sign:-1}]);
  const b2=w.settlement.participants.find(p=>p.name==='Bindert');assert.deepEqual([b2.revenueExclCents,b2.retainedCents,b2.payoutCents],[-2000,-200,afrekening(-2000,0,1000,potOn(thisMonday),false).payout]);
  assert.match(w.settlement.warnings.join(' '),/Bindert: negatief saldo/);
  assert.equal((await coop({action:'uitbetaald',week:lastMonday})).status,200);
  assert.equal((await coop({action:'uitbetaald',week:lastMonday})).status,409);
  assert.equal((await coop()).data.weeks[0].status,'uitbetaald');
 });
 await t.test('onderlinge ruil (BB stap 4): door een lid met BB betaald = 2% coöperatiedeel voor de leverancier',async()=>{
  const week=plus(lastMonday,-7);
  await sale(120,at(week),[{product:brood.id,name:'Desembrood Rianne',total:545,vat:'9',vatCents:45,owner:rianne}]);
  await pg.query(`INSERT INTO payments(id,request_id,order_id,method,amount_cents,status,provider,external_ref,version,created,updated) VALUES('bb-120','bb:r120',120,'bb',545,'betaald','bb:lid-anna','bb:lid-anna:120',1,$1,$1)`,[at(week)]);
  await sale(121,at(plus(week,1)),[{product:brood.id,name:'Desembrood Rianne',total:545,vat:'9',vatCents:45,owner:rianne}]);
  await pg.query(`INSERT INTO payments(id,request_id,order_id,method,amount_cents,status,provider,external_ref,version,created,updated) VALUES('pin-121','pin:r121',121,'pin',545,'betaald','pin','pin:121',1,$1,$1)`,[at(week)]);
  const v=(await call('/api/cooperatie?week='+week)).data,r=v.settlement.participants.find(p=>p.name==='Rianne');
  // 2 × € 5,00 excl: met BB 2% (€ 0,10), met pin 15% (€ 0,75). Btw-deel: 98% en 85% van € 0,45.
  assert.deepEqual([r.revenueExclCents,r.retainedCents,r.vatShareCents,r.payoutCents],[1000,85,82,997]);
 });
 await t.test('onderling met etiketprijs (besluit eigenaar 9 november 2026): de kok haalt vlees uit de vriezer; etiket min coöperatiedeel en winkelpot (16 november 2026)',async()=>{
  const label=async name=>{const r=await call('/api/products',{action:'create-publish',product:{name,department:'Winkel',priceCents:1500,vat:'9',station:'winkel',available:true,photo:'',note:'',check:'',sourceId:'',optionGroups:[],customerPrice:true}});assert.equal(r.status,200,JSON.stringify(r.data));return {id:r.data.id,version:1}};
  const lever=await label('Runderlever Rianne'),gehakt=await label('Rundergehakt coöperatie');
  assert.equal((await coop({action:'eigenaar',productId:lever.id,participantId:rianne})).status,200);
  const list=(await call('/api/orders?onderling=1')).data.products;
  assert.deepEqual(list.filter(p=>p.label).map(p=>[p.name,p.labelBp,p.priceCents]).sort(),[['Rundergehakt coöperatie',0,null],['Runderlever Rianne',2000,null]]);
  const take=lines=>call('/api/orders',{requestId:randomUUID(),mode:'onderling',reference:'',taker:'keuken',by:'Kok',lines});
  const line=(p,priceCents,quantity=1)=>({productId:p.id,version:p.version,quantity,selections:{},note:'',...(priceCents===undefined?{}:{priceCents})});
  assert.equal((await take([line(lever,undefined)])).status,400,'zonder etiketbedrag niet');
  assert.equal((await take([line(lever,1277,2)])).status,400,'elk etiket is één stuk');
  const r=await take([line(lever,1277),line(gehakt,1113)]);assert.equal(r.status,200,JSON.stringify(r.data));
  assert.equal(r.data.totalCents,1022+1113,'€ 12,77 min 15% + 5% winkelpot = € 10,22; coöperatie zelf: het volle bedrag');
  const rows=await pg.query('SELECT name,total_cents AS t,owner_id AS o FROM order_lines WHERE order_id=$1 ORDER BY position',[r.data.id]);
  assert.deepEqual(rows.map(x=>[x.name,Number(x.t),x.o]),[['Runderlever Rianne',1022,rianne],['Rundergehakt coöperatie',1113,null]]);
 });
 await t.test('onbekend etiket (wens eigenaar 9 november 2026): de zelfkassa maakt het product aan, niet op het startscherm, en verkoopt het',async()=>{
  const SITE='http://localhost:3002',image='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD';
  const label=()=>fetch(base+'/api/public/etiket',{method:'POST',headers:{'Content-Type':'application/json',Origin:SITE},body:JSON.stringify({image})}).then(async r=>({status:r.status,data:await r.json()}));
  claude.answer={readable:true,productId:null,labelName:'runderhaas',totalCents:2450,weightGrams:350,unitPriceCents:7000};
  const first=await label();assert.equal(first.status,200,JSON.stringify(first.data));
  assert.equal(first.data.created,true);assert.equal(first.data.totalCents,2450);
  assert.deepEqual([first.data.product.name,first.data.product.tile,first.data.product.customerPrice,first.data.product.route],['Runderhaas',false,true,'winkel']);
  const sent=claude.requests.at(-1).body;assert.equal(sent.model,'claude-opus-5-5');assert.equal(sent.messages[0].content[0].type,'image');
  assert.equal(sent.output_config.format.type,'json_schema');
  const row=(await call('/api/products')).data.find(p=>p.id===first.data.productId);
  assert.deepEqual([row.published.onStartscherm,row.published.zelfkassa.labelName,row.published.vat,row.published.department],[false,'runderhaas','9','Winkel']);
  const again=await label();assert.equal(again.data.created,false);assert.equal(again.data.productId,first.data.productId,'niet dubbel aangemaakt');
  const sold=await fetch(base+'/api/public/orders',{method:'POST',headers:{'Content-Type':'application/json',Origin:SITE},body:JSON.stringify({requestId:randomUUID(),route:'winkel',lines:[{productId:first.data.productId,version:1,quantity:1,priceCents:2450}]})}).then(async r=>({status:r.status,data:await r.json()}));
  assert.equal(sold.status,201,JSON.stringify(sold.data));assert.equal(sold.data.totalCents,2450,'verkocht voor het etiketbedrag');
  // Nagekeken in Gerechten & prijzen: op het startscherm en het kenmerk „nieuw via zelfkassa” eraf.
  const fix=await call('/api/products',{action:'stock-settings',id:row.id,version:row.version,settings:{onStartscherm:true,zelfkassa:null}});assert.equal(fix.status,200,JSON.stringify(fix.data));
  const after=(await call('/api/products')).data.find(p=>p.id===row.id);assert.equal(after.published.onStartscherm,true);assert.equal(after.published.zelfkassa,undefined);
  // Geen bruikbare naam: niets aangemaakt.
  claude.answer={readable:true,productId:null,labelName:'12',totalCents:500,weightGrams:null,unitPriceCents:null};
  assert.equal((await label()).status,422);
 });
 await t.test('streepjescodes (9 november 2026): bewaren in Voorraad & prijsadvies, één code hoort bij één product',async()=>{
  const all=(await call('/api/products')).data,b=all.find(p=>p.id===bloemen.id),e=all.find(p=>p.id===eieren.id);
  const save=(row,barcodes)=>call('/api/products',{action:'stock-settings',id:row.id,version:row.version,settings:{barcodes}});
  const ok=await save(b,['8712345678906']);assert.equal(ok.status,200,JSON.stringify(ok.data));
  const again=(await call('/api/products')).data.find(p=>p.id===bloemen.id);assert.deepEqual(again.published.barcodes,['8712345678906']);
  const clash=await save(e,['08712345678906']);assert.equal(clash.status,409);assert.match(clash.data.error,/hoort al bij Boeket Bindert/);
  assert.equal((await save(e,['abc'])).status,400,'alleen cijfers');
 });
});

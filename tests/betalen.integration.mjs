// Volledige keten van online betalen (Mollie, testmodus) tegen de gebouwde backoffice en een nagebootste Mollie.
// Er gaat geen geld om en er wordt niets naar Mollie gestuurd. Eerst `npm run build`, dan: npm run test:betalen
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID,randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createMollieMock} from './mollie-mock.mjs';
import {startPostgres} from './test-postgres.mjs';
import {loginEnv,sessionCookie} from './sessie.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),app=path.join(repo,'apps/backoffice');
const built=fs.existsSync(path.join(app,'.next/standalone/server.js'));
const KEY='test_'+randomBytes(15).toString('hex'),SITE='http://localhost:3002';
const owner={user:'bart',pass:randomBytes(16).toString('hex')};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function startApp(dir,port,mockPort,pg){
 const env={...Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^(BASIC_AUTH|MOLLIE_|LOCAL_NO_LOGIN|TUNNEL_NO_LOGIN|BACKOFFICE_TUNNEL|PUBLIC_ORDER|GUEST_)/.test(k))),
  BOER_BART_LOGIN:'aan',...loginEnv,APP_DATA_DIR:dir,PORT:String(port),APP_ORIGIN:'http://127.0.0.1:'+port,
  SHEETS_CONFIG_KEY:'cd'.repeat(32),NEXT_TELEMETRY_DISABLED:'1',MOLLIE_API_KEY:KEY,MOLLIE_API_BASE:'http://127.0.0.1:'+mockPort,...pg.env};
 const log=[];const child=spawn(process.execPath,['../../tools/start-app.mjs'],{cwd:app,env,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',d=>log.push(String(d)));child.stderr.on('data',d=>log.push(String(d)));
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/api/health`)).ok)return {stop:()=>new Promise(r=>{child.once('exit',r);child.kill()})}}catch{}await sleep(200)}
 child.kill();throw Error('backoffice start niet:\n'+log.join(''));
}

test('online betalen: bestellen, betalen bij Mollie (test), daarna pas naar de werkplek',{skip:!built&&'eerst npm run build'},async t=>{
 const mock=createMollieMock({key:KEY}),mockPort=await mock.listen();t.after(()=>mock.close());
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-betalen-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const port=4800+Math.floor(Math.random()*400),base='http://127.0.0.1:'+port;
 const pg=await startPostgres(),server=await startApp(dir,port,mockPort,pg);t.after(async()=>{await server.stop();await pg.stop()});
 const call=async(p,{method='GET',body,origin,form,owner:asOwner,ip}={})=>{
  const headers={...(asOwner?{cookie:sessionCookie(owner.user),Origin:base}:{}),...(origin?{Origin:origin}:{}),
   ...(body?{'Content-Type':'application/json'}:{}),...(ip?{'X-Forwarded-For':ip}:{}),...(form?{'Content-Type':'application/x-www-form-urlencoded'}:{})};
  const r=await fetch(base+p,{method,headers,body:body?JSON.stringify(body):form});const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}return {status:r.status,data};
 };
 const webhook=id=>call('/api/public/payments/mollie',{method:'POST',form:'id='+id});
 const status=id=>call('/api/public/payments?bestelling='+id).then(r=>r.data);
 const atBarista=async()=>(await call('/api/workplaces?station=barista',{owner:true})).data.map(o=>o.number);

 // Een gepubliceerd product, zoals op de kaart.
 const created=await call('/api/products',{method:'POST',owner:true,body:{action:'create-publish',product:{name:'Koffie',department:'Koffiebar',priceCents:350,vat:'9',station:'barista',available:true,photo:'',note:'',check:'',sourceId:'',optionGroups:[]}}});
 assert.equal(created.status,200,JSON.stringify(created.data));
 const product=(await call('/api/public/products')).data.products.find(p=>p.name==='Koffie');
 const order=async()=>{const requestId=randomUUID();const r=await call('/api/public/orders',{method:'POST',origin:SITE,body:{requestId,route:'eten-drinken',lines:[{productId:product.id,version:product.version,quantity:2}]}});assert.equal(r.status,201,JSON.stringify(r.data));return {requestId,number:r.data.number}};
 const pay=requestId=>call('/api/public/payments',{method:'POST',origin:SITE,body:{requestId,page:'/bestellen.html'}});

 const a=await order();
 await t.test('betalen start bij Mollie met het bedrag van de backoffice en de weg terug naar de bestelpagina',async()=>{
  const r=await pay(a.requestId);assert.equal(r.status,200,JSON.stringify(r.data));
  assert.match(r.data.checkoutUrl,/\/checkout\/tr_mock0001$/);
  const sent=mock.last();assert.equal(sent.amount.value,'7.00');assert.equal(sent.amount.currency,'EUR');
  assert.equal(sent.redirectUrl,SITE+'/bestellen.html?bestelling='+a.requestId);
  assert.equal(sent.webhookUrl,undefined,'zonder openbaar adres geen melding van Mollie; de pagina controleert bij terugkomst');
  assert.equal(sent.description,'Boerderijrecreatie bestelling '+a.number);
  assert.ok(mock.state.calls.find(c=>c.method==='POST').headers['idempotency-key']);
  const again=await pay(a.requestId);assert.equal(again.data.checkoutUrl,r.data.checkoutUrl,'nog eens op betalen: dezelfde betaalpagina');
  assert.equal(mock.state.created,1);
  const s=await status(a.requestId);assert.equal(s.paid,false);assert.equal(s.status,'wacht-op-betaling');assert.deepEqual(s.payment,{available:true,status:'open'});
  assert.ok(!(await atBarista()).includes(a.number),'onbetaald niet bij de koffiebar');
 });
 await t.test('alleen de website mag betalen starten; onbekende bestelling en aanvraag worden geweigerd',async()=>{
  assert.equal((await call('/api/public/payments',{method:'POST',origin:'http://evil.example',body:{requestId:a.requestId}})).status,403);
  assert.equal((await pay(randomUUID())).status,404);
  assert.equal((await call('/api/public/payments?bestelling=../../x')).status,400);
 });
 await t.test('een nagemaakte melding verandert niets: de stand komt altijd van Mollie',async()=>{
  assert.equal((await webhook('tr_mock0001')).status,200);
  assert.equal((await status(a.requestId)).paid,false);
  assert.equal((await webhook('tr_bestaatniet')).status,200);
  assert.equal((await webhook('<script>')).status,200);
 });
 await t.test('afgebroken betaling: opnieuw betalen maakt een nieuwe poging',async()=>{
  mock.setStatus('tr_mock0001','canceled');
  const s=await status(a.requestId);assert.equal(s.paid,false);assert.equal(s.payment.status,'mislukt');
  const r=await pay(a.requestId);assert.match(r.data.checkoutUrl,/tr_mock0002$/);assert.equal(mock.state.created,2);
 });
 await t.test('betaald volgens Mollie: bestelling gaat naar de koffiebar, één keer',async()=>{
  mock.setStatus('tr_mock0002','paid');
  assert.equal((await webhook('tr_mock0002')).status,200);
  const s=await status(a.requestId);assert.equal(s.paid,true);assert.equal(s.status,'vastgelegd');assert.equal(s.test,true);assert.equal(s.payment.status,'betaald');
  assert.equal((await webhook('tr_mock0002')).status,200,'dezelfde melding nog eens');
  assert.equal((await atBarista()).filter(n=>n===a.number).length,1);
  const r=await pay(a.requestId);assert.equal(r.data.paid,true,'al betaald: geen nieuwe betaling');assert.equal(mock.state.created,2);
  assert.equal(JSON.stringify(s).includes('tr_mock'),false,'geen kenmerken van Mollie naar de gast');
  // Eén status en één omzetregel: de backoffice ziet de betaalde bestelling als betaald en telt hem mee.
  const list=(await call('/api/orders',{owner:true})).data,row=list.find(o=>o.number===a.number);
  assert.equal(row.status,'vastgelegd');assert.equal(row.paymentStatus,'betaald');assert.equal(row.statusLabel,'Betaald');assert.equal(row.counted,true);assert.equal(row.paidCents,700);
 });
 await t.test('terug op de bestelpagina zonder melding: de status-check haalt de stand bij Mollie op',async()=>{
  const b=await order();await pay(b.requestId);mock.setStatus(mock.last().id,'paid');
  const s=await status(b.requestId);assert.equal(s.paid,true);
  assert.ok((await atBarista()).includes(b.number));
 });
 await t.test('klopt het bedrag bij Mollie niet, dan geldt de bestelling niet als betaald',async()=>{
  const c=await order();await pay(c.requestId);const id=mock.last().id;mock.setStatus(id,'paid');mock.state.amountOverride.set(id,'0.01');
  assert.equal((await webhook(id)).status,503);
  const s=await status(c.requestId);assert.equal(s.paid,false);assert.equal(s.status,'wacht-op-betaling');
  assert.ok(!(await atBarista()).includes(c.number));
  const row=(await call('/api/orders',{owner:true})).data.find(o=>o.number===c.number);
  assert.equal(row.statusLabel,'Wacht op betaling');assert.equal(row.counted,false,'onbetaald telt niet als omzet');
 });
 await t.test('eigen bedrag: Mollie rekent het gekozen bedrag af; nul euro gaat zonder betalen door; groepsrekening betaalt niets',async()=>{
  const on=await call('/api/bestelopties',{method:'POST',owner:true,body:{action:'instelling',version:0,setting:{context:'website',enabled:true,maxPercent:300,allowZero:true}}});assert.equal(on.status,200,JSON.stringify(on.data));
  const place=async extra=>{const requestId=randomUUID();const r=await call('/api/public/orders',{method:'POST',origin:SITE,body:{requestId,route:'eten-drinken',lines:[{productId:product.id,version:product.version,quantity:2}],...extra}});assert.equal(r.status,201,JSON.stringify(r.data));return {requestId,...r.data}};
  const own=await place({chosenCents:950});assert.equal(own.toPayCents,950);assert.equal(own.commercialCents,700);
  const r=await pay(own.requestId);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(mock.last().amount.value,'9.50');
  mock.setStatus(mock.last().id,'paid');const s=await status(own.requestId);assert.equal(s.paid,true,'betaald met het gekozen bedrag');
  assert.ok((await atBarista()).includes(own.number));
  const zero=await place({chosenCents:0});assert.equal(zero.toPayCents,0);
  const before=mock.state.created;assert.equal((await pay(zero.requestId)).status,409);assert.equal(mock.state.created,before,'niets naar Mollie');
  assert.ok((await atBarista()).includes(zero.number),'nul euro gaat meteen door');
  const g=await call('/api/bestelopties',{method:'POST',owner:true,body:{action:'nieuwe-groep',id:randomUUID(),group:{name:'Feest',host:'Opa',budgetCents:2000,validFrom:'2026-01-01',validUntil:'2099-12-31'}}});assert.equal(g.status,200,JSON.stringify(g.data));
  const grp=await place({groupCode:g.data.code,guest:{name:'Neef Piet',email:'piet@example.nl',phone:'0612345678'}});assert.equal(grp.toPayCents,0);assert.equal(grp.status,'op-groepsrekening');
  assert.equal((await pay(grp.requestId)).status,409);assert.equal(mock.state.created,before);
  assert.ok((await atBarista()).includes(grp.number),'groepsbestelling gaat meteen door');
 });
 await t.test('betaald evenement: aanmelden houdt de plaats vast, betalen bij Mollie, daarna pas betaald en bevestigd',async()=>{
  const day=new Date(Date.now()+10*86400000).toISOString().slice(0,10),eid=randomUUID();
  const g=(await call('/api/gasten',{owner:true})).data;assert.equal(g.mollie,true);
  const ev={id:eid,date:day,from:'14:00',to:'16:00',title:'Pompoenfeest',description:'Snijden en proeven',holiday:false,signup:true,capacity:3,priceCents:750,paymentInfo:'',payOnline:true};
  const saved=await call('/api/gasten',{method:'POST',owner:true,body:{action:'event',requestId:randomUUID(),version:g.version,event:ev}});assert.equal(saved.status,200,JSON.stringify(saved.data));
  const pub=(await call('/api/public/availability')).data.events.find(e=>e.id===eid);
  assert.equal(pub.payOnline,true);assert.equal(pub.priceCents,750);
  const signup=(people,name='Joke Visser')=>({requestId:randomUUID(),eventId:eid,name,email:'joke@example.nl',phone:'',people,note:'',consent:true});
  const send=b=>call('/api/public/event-signups',{method:'POST',origin:SITE,body:b});
  const a=signup(2),r=await send(a);assert.equal(r.status,201,JSON.stringify(r.data));assert.equal(r.data.pay,true);assert.equal(r.data.amountCents,1500);
  assert.equal((await send(signup(2,'Kees'))).status,409,'2 plaatsen vastgehouden: geen 2 meer vrij');
  const row=async()=>(await call('/api/gasten',{owner:true})).data.signups.find(x=>x.event_id===eid&&x.name==='Joke Visser');
  let s=await row();assert.equal(s.payment_status,'open');assert.equal(s.confirmation,'betaling','bevestiging wacht op de betaling');assert.ok(s.hold_until>new Date().toISOString());
  // Betalen starten: bedrag van de backoffice, terug naar de agenda op de website.
  const before=mock.state.created;
  const p=await call('/api/public/payments',{method:'POST',ip:'203.0.113.7',origin:SITE,body:{aanmelding:a.requestId,page:'/index.html'}});assert.equal(p.status,200,JSON.stringify(p.data));
  const sent=mock.last();assert.equal(sent.amount.value,'15.00');assert.equal(sent.redirectUrl,SITE+'/index.html?aanmelding='+a.requestId);
  assert.match(sent.description,/^Boerderijrecreatie - Pompoenfeest .* - 2 personen$/);assert.equal(sent.metadata.aanmelding,s.id);
  assert.equal((await call('/api/public/payments',{method:'POST',ip:'203.0.113.7',origin:SITE,body:{aanmelding:a.requestId,page:'https://evil.example/'}})).data.checkoutUrl,p.data.checkoutUrl,'nog eens: dezelfde betaalpagina');
  assert.equal(mock.state.created,before+1);
  assert.equal((await call('/api/public/payments',{method:'POST',ip:'203.0.113.7',origin:'http://evil.example',body:{aanmelding:a.requestId}})).status,403);
  assert.equal((await call('/api/public/payments?aanmelding='+randomUUID())).status,404);
  // Nagemaakte melding verandert niets; afgebroken betaling: opnieuw betalen kan.
  assert.equal((await webhook(sent.id)).status,200);
  let st=(await call('/api/public/payments?aanmelding='+a.requestId)).data;assert.equal(st.paid,false);assert.equal(st.payment.status,'open');assert.equal(st.title,'Pompoenfeest');
  mock.setStatus(sent.id,'canceled');
  st=(await call('/api/public/payments?aanmelding='+a.requestId)).data;assert.equal(st.paid,false);assert.equal(st.payment.status,'mislukt');
  const p2=await call('/api/public/payments',{method:'POST',ip:'203.0.113.7',origin:SITE,body:{aanmelding:a.requestId,page:'/'}});assert.equal(p2.status,200,JSON.stringify(p2.data));
  const second=mock.last();assert.notEqual(second.id,sent.id);assert.equal(second.redirectUrl,SITE+'/?aanmelding='+a.requestId);
  // Betaald volgens Mollie (melding): betaald, plaats vast, en de bevestiging gaat nu pas (hier staat mail uit).
  mock.setStatus(second.id,'paid');assert.equal((await webhook(second.id)).status,200);
  s=await row();assert.equal(s.payment_status,'betaald');assert.equal(s.paid_by,'Mollie (test)');assert.equal(s.hold_until,null);
  for(let i=0;i<50&&(s.confirmation==='wacht');i++){await sleep(200);s=await row()}
  assert.equal(s.confirmation,'uit','bevestiging is na de betaling in gang gezet (verzenden staat uit in deze test)');
  st=(await call('/api/public/payments?aanmelding='+a.requestId)).data;assert.equal(st.paid,true);assert.equal(JSON.stringify(st).includes('tr_'),false,'geen kenmerken van Mollie naar de gast');
  assert.equal((await call('/api/public/payments',{method:'POST',ip:'203.0.113.7',origin:SITE,body:{aanmelding:a.requestId}})).data.paid,true,'al betaald: geen nieuwe betaling');
  assert.equal((await webhook(second.id)).status,200,'dezelfde melding nog eens');
  assert.equal((await call('/api/gasten',{method:'POST',owner:true,body:{action:'signup-paid',id:s.id,paid:false,requestId:randomUUID(),version:0}})).status,400,'online betaald: niet met de hand terug te draaien');
  // Verlopen termijn zonder betaling: de plaats komt vrij; opnieuw betalen lukt alleen als er nog plaats is.
  const b=signup(1,'Piet');assert.equal((await send(b)).status,201);
  await pg.query('UPDATE event_signups SET hold_until=$1 WHERE request_id=$2',[new Date(Date.now()-60000).toISOString(),b.requestId]);
  assert.equal((await call('/api/public/payments?aanmelding='+b.requestId)).data.holdExpired,true);
  const c=signup(1,'Klaas');assert.equal((await send(c)).status,201,'verlopen plaats telt niet meer mee');
  const late=await call('/api/public/payments',{method:'POST',ip:'203.0.113.7',origin:SITE,body:{aanmelding:b.requestId}});assert.equal(late.status,409);assert.match(late.data.error,/vrijgegeven/);
  // Rem per e-mailadres (#132): hooguit 3 aanmeldingen per activiteit en 5 per uur op één adres.
  const eid2=randomUUID(),g2=(await call('/api/gasten',{owner:true})).data;
  const ev2={id:eid2,date:day,from:'10:00',to:'12:00',title:'Rondleiding',description:'',holiday:false,signup:true,priceCents:0,paymentInfo:'',payOnline:false};
  assert.equal((await call('/api/gasten',{method:'POST',owner:true,body:{action:'event',requestId:randomUUID(),version:g2.version,event:ev2}})).status,200);
  let n=0;const one=email=>call('/api/public/event-signups',{method:'POST',origin:SITE,ip:'198.51.100.'+(++n),body:{requestId:randomUUID(),eventId:eid2,name:'Vul Maar',email,phone:'',people:1,note:'',consent:true}});
  for(let i=0;i<3;i++)assert.equal((await one('veel@example.nl')).status,201);
  const fourth=await one('veel@example.nl');assert.equal(fourth.status,409);assert.match(fourth.data.error,/genoeg aanmeldingen/);
  // joke@example.nl heeft al 3 aanmeldingen in het afgelopen uur (Pompoenfeest): nog 2, dan is het genoeg.
  assert.equal((await one('joke@example.nl')).status,201);assert.equal((await one('joke@example.nl')).status,201);
  const sixth=await one('joke@example.nl');assert.equal(sixth.status,409);assert.match(sixth.data.error,/later opnieuw/);
 });

 await t.test('winkel vooraf bestellen: afhaalmoment uit de openingstijden, verkeerd moment geweigerd, na betaling in Planning',async()=>{
  const made=await call('/api/products',{method:'POST',owner:true,body:{action:'create-publish',product:{name:'Testhoning afhalen',department:'Winkel',priceCents:650,vat:'9',station:'winkel',available:true,photo:'',note:'',check:'',sourceId:'',optionGroups:[]}}});
  assert.equal(made.status,200,JSON.stringify(made.data));
  // Rechtstreeks uit de backoffice: de openbare productlijst ververst maar eens per minuut.
  const honing=(await call('/api/products',{owner:true})).data.find(p=>p.draft.name==='Testhoning afhalen'&&p.published);
  const days=(await call('/api/public/order-options')).data.pickup.days;assert.ok(days.length>0,'afhaalmomenten uit de openingstijden');
  for(const d of days)for(const t of d.times)assert.match(t,/^\d{2}:(00|30)$/);
  const place=(pickup,requestId=randomUUID())=>call('/api/public/orders',{method:'POST',origin:SITE,ip:'203.0.113.9',body:{requestId,route:'winkel',lines:[{productId:honing.id,version:honing.version,quantity:2}],pickup}});
  const wrong=await place({date:days[0].date,time:'03:00',name:'Jansen'});assert.equal(wrong.status,409);assert.equal(wrong.data.reason,'afhalen');
  assert.equal((await place({date:days[0].date,time:days[0].times[0],name:'J'})).status,400,'naam verplicht');
  const requestId=randomUUID(),pickup={date:days[0].date,time:days[0].times[0],name:'Jansen'};
  const ok=await place(pickup,requestId);assert.equal(ok.status,201,JSON.stringify(ok.data));assert.deepEqual(ok.data.pickup,pickup);
  const inPlanning=async()=>(await call('/api/gasten',{owner:true})).data.state.pickups.filter(p=>p.id.startsWith('online:'));
  assert.equal((await inPlanning()).length,0,'nog niet betaald: niet in Planning');
  await call('/api/public/payments',{method:'POST',ip:'203.0.113.9',origin:SITE,body:{requestId,page:'/bestellen.html'}});mock.setStatus(mock.last().id,'paid');
  assert.equal((await status(requestId)).paid,true);
  const listed=await inPlanning();assert.equal(listed.length,1);
  assert.equal(listed[0].date,pickup.date);assert.equal(listed[0].time,pickup.time);assert.equal(listed[0].name,'Jansen');assert.match(listed[0].description,/2× Testhoning afhalen/);
  const winkel=(await call('/api/workplaces?station=winkel',{owner:true})).data.find(o=>o.number===ok.data.number);
  assert.match(winkel.reference,/afhalen .* om \d{2}:\d{2} · Jansen/,'de werkplek Winkel ziet wanneer en voor wie');
 });
 await t.test('zelfservicekassa: contant betalen bij een medewerker; pas na bevestiging betaald; QR alleen voor Mollie',async()=>{
  const made=await call('/api/products',{method:'POST',owner:true,body:{action:'create-publish',product:{name:'Testeieren zelfservice',department:'Winkel',priceCents:400,vat:'9',station:'winkel',available:true,photo:'',note:'',check:'',sourceId:'',optionGroups:[]}}});
  assert.equal(made.status,200,JSON.stringify(made.data));
  const eggs=(await call('/api/products',{owner:true})).data.find(p=>p.draft.name==='Testeieren zelfservice'&&p.published);
  const requestId=randomUUID();
  const placed=await call('/api/public/orders',{method:'POST',origin:SITE,ip:'203.0.113.21',body:{requestId,route:'winkel',lines:[{productId:eggs.id,version:eggs.version,quantity:2}]}});
  assert.equal(placed.status,201,JSON.stringify(placed.data));
  const cash=await call('/api/public/payments',{method:'POST',origin:SITE,ip:'203.0.113.22',body:{requestId,method:'contant'}});
  assert.equal(cash.status,200,JSON.stringify(cash.data));assert.equal(cash.data.cash,true);assert.equal(cash.data.amountCents,800);
  assert.equal((await call('/api/public/payments',{method:'POST',origin:SITE,ip:'203.0.113.22',body:{requestId,method:'contant'}})).data.cash,true,'nog eens: geen tweede betaalregel');
  assert.equal((await status(requestId)).paid,false,'contant gekozen is nog niet betaald');
  const waiting=(await call('/api/werkplek/contant',{owner:true})).data.filter(o=>o.number===placed.data.number);
  assert.equal(waiting.length,1);assert.equal(waiting[0].amountCents,800);
  assert.ok(!(await call('/api/workplaces?station=winkel',{owner:true})).data.some(o=>o.number===placed.data.number),'nog niet bij de winkel zolang er niet betaald is');
  const ok=await call('/api/werkplek/contant',{method:'POST',owner:true,body:{orderId:waiting[0].orderId}});assert.equal(ok.status,200,JSON.stringify(ok.data));
  const s=await status(requestId);assert.equal(s.paid,true);assert.equal(s.status,'vastgelegd');
  // Zelfscan en zelfkassa (wens eigenaar 13 november 2026): betaald en meegenomen, dus niet op de werkplek Winkel. Afhalen wel (hierboven).
  assert.ok(!(await call('/api/workplaces?station=winkel',{owner:true})).data.some(o=>o.number===placed.data.number),'zelfscan niet bij de winkel, ook niet na betalen');
  assert.equal((await call('/api/werkplek/contant',{method:'POST',owner:true,body:{orderId:waiting[0].orderId}})).status,409,'twee keer bevestigen kan niet');
  assert.ok(!(await call('/api/werkplek/contant',{owner:true})).data.some(o=>o.number===placed.data.number));
  const row=(await call('/api/orders',{owner:true})).data.find(o=>o.number===placed.data.number);assert.equal(row.statusLabel,'Betaald');assert.equal(row.counted,true);
  const qr=await fetch(base+'/api/public/qr?url='+encodeURIComponent('https://www.mollie.com/checkout/test-mode?token=x'));
  assert.equal(qr.status,200);assert.match(qr.headers.get('content-type'),/svg/);assert.match(await qr.text(),/<svg/);
  assert.equal((await fetch(base+'/api/public/qr?url='+encodeURIComponent('https://evil.example/pay'))).status,400,'geen QR voor andere adressen');
 });
 await t.test('kassa: afrekenen met contant, pin of QR; niets dubbel; tafelnummer niet verplicht',async()=>{
  const kassa=async()=>{const r=await call('/api/orders',{method:'POST',owner:true,body:{requestId:randomUUID(),mode:'winkel',reference:'',lines:[{productId:product.id,version:product.version,quantity:1,selections:{},note:''}]}});assert.equal(r.status,200,JSON.stringify(r.data));return r.data};
  const afrekenen=(orderId,method)=>call('/api/kassa/afrekenen',{method:'POST',owner:true,body:{orderId,method}});
  const row=async number=>(await call('/api/orders',{owner:true})).data.find(o=>o.number===number);
  const c=await kassa();assert.equal(c.reference,'Kassa','leeg kenmerk wordt „Kassa”');assert.equal(c.paymentStatus,'niet-gekoppeld');
  const paid=await afrekenen(c.id,'contant');assert.equal(paid.status,200,JSON.stringify(paid.data));assert.equal(paid.data.paymentStatus,'betaald');
  assert.equal((await afrekenen(c.id,'pin')).status,200,'al betaald: nog eens afrekenen verandert niets');
  assert.equal((await row(c.number)).statusLabel,'Betaald');
  const p=await kassa();assert.equal((await afrekenen(p.id,'pin')).data.paymentStatus,'betaald');
  const q=await kassa(),start=await afrekenen(q.id,'qr');assert.equal(start.status,200,JSON.stringify(start.data));assert.match(start.data.checkoutUrl,/\/checkout\/tr_/);
  const sent=mock.last();assert.equal(sent.amount.value,'3.50');assert.match(sent.redirectUrl,/^http:\/\/localhost:3002\/bestellen\.html\?bestelling=[0-9a-f-]{36}$/,'de gast komt na het betalen op de bestelpagina');
  assert.equal((await call('/api/kassa/afrekenen?bestelling='+q.id,{owner:true})).data.paymentStatus,'niet-gekoppeld');
  mock.setStatus(sent.id,'paid');
  assert.equal((await call('/api/kassa/afrekenen?bestelling='+q.id,{owner:true})).data.paymentStatus,'betaald','de kassa ziet vanzelf dat er via QR betaald is');
  assert.equal((await afrekenen(q.id,'contant')).status,200);
  assert.equal((await row(q.number)).statusLabel,'Betaald');
  assert.equal((await afrekenen(q.id,'cheque')).status,400);assert.equal((await afrekenen(999999,'contant')).status,404);
  assert.ok([401,403].includes((await call('/api/kassa/afrekenen',{method:'POST',origin:'http://evil.example',body:{orderId:c.id,method:'contant'}})).status),'niet van buitenaf');
 });
 await t.test('werkplek dicht: producten niet te bestellen, bestelling geweigerd; weer open werkt het (wens eigenaar 14 november 2026)',async()=>{
  const reopen=async()=>{const n=(await call('/api/werkplek/open',{owner:true})).data;await call('/api/werkplek/open',{method:'POST',owner:true,body:{action:'pauze',station:'barista',paused:false}});
   const m=(await call('/api/werkplek/open',{owner:true})).data;if(m.settings.barista.mode!=='altijd')await call('/api/werkplek/open',{method:'POST',owner:true,body:{action:'instellen',version:m.version,settings:{...m.settings,barista:{...m.settings.barista,mode:'altijd'}}}});return n};
  try{
  const open=(await call('/api/werkplek/open',{owner:true})).data;assert.equal(open.status.barista.open,true,'standaard open');
  const paused=await call('/api/werkplek/open',{method:'POST',owner:true,body:{action:'pauze',station:'barista',paused:true,until:null}});assert.equal(paused.status,200,JSON.stringify(paused.data));
  const shown=(await call('/api/public/products')).data.products.find(p=>p.id===product.id);
  assert.equal(shown.available,false);assert.equal(shown.closed,'De koffiebar is nu even niet beschikbaar.');assert.equal(shown.station,undefined,'de werkplek gaat niet naar buiten');
  const refused=await call('/api/public/orders',{method:'POST',origin:SITE,ip:'203.0.113.77',body:{requestId:randomUUID(),route:'eten-drinken',lines:[{productId:product.id,version:product.version,quantity:1}]}});
  assert.equal(refused.status,409);assert.equal(refused.data.reason,'gesloten');assert.match(refused.data.error,/koffiebar/);
  // Alleen de eigenaar stelt de tijden in; de stand van een werkplek „Gesloten” geldt ook.
  const settings=open.settings;
  const set=await call('/api/werkplek/open',{method:'POST',owner:true,body:{action:'instellen',version:open.version+1,settings:{...settings,barista:{...settings.barista,mode:'dicht'}}}});assert.equal(set.status,200,JSON.stringify(set.data));
  await call('/api/werkplek/open',{method:'POST',owner:true,body:{action:'pauze',station:'barista',paused:false}});
  assert.equal((await call('/api/werkplek/open',{owner:true})).data.status.barista.open,false,'gesloten volgens instelling');
  const now=(await call('/api/werkplek/open',{owner:true})).data;
  assert.equal((await call('/api/werkplek/open',{method:'POST',owner:true,body:{action:'instellen',version:now.version,settings:{...now.settings,barista:{...now.settings.barista,mode:'altijd'}}}})).status,200);
  assert.equal((await call('/api/public/products')).data.products.find(p=>p.id===product.id).available,true,'weer open');
  const ok=await call('/api/public/orders',{method:'POST',origin:SITE,ip:'203.0.113.78',body:{requestId:randomUUID(),route:'eten-drinken',lines:[{productId:product.id,version:product.version,quantity:1}]}});assert.equal(ok.status,201,JSON.stringify(ok.data));
  }finally{await reopen()}
 });
 await t.test('gezamenlijke rekening: openen, meedoen met de code, vol is vol, verhogen, splitsen, iDEAL en kassa, factuur voldaan',async()=>{
  const anna={name:'Anna Jansen',email:'anna@example.nl',phone:'0611111111'},bert={name:'Bert de Boer',email:'bert@example.nl',phone:'0622222222'};
  const token=randomBytes(32).toString('base64url');
  const orderOn=extra=>call('/api/public/orders',{method:'POST',origin:SITE,ip:'203.0.113.40',body:{requestId:randomUUID(),route:'eten-drinken',lines:[{productId:product.id,version:product.version,quantity:2}],...extra}});
  const holder=()=>call('/api/public/rekening',{method:'POST',origin:SITE,ip:'203.0.113.41',body:{houder:token,action:'lezen'}});
  const opened=await orderOn({guest:anna,openBill:{name:'Familie Jansen',limitCents:1500,token}});
  assert.equal(opened.status,201,JSON.stringify(opened.data));assert.equal(opened.data.toPayCents,0);assert.match(opened.data.group.code,/^[A-Z2-9]{8}$/,'de opener krijgt de code om te delen');
  const code=opened.data.group.code;
  let h=await holder();assert.equal(h.status,200,JSON.stringify(h.data));assert.equal(h.data.name,'Familie Jansen');assert.equal(h.data.fill.spentCents,700);assert.equal(h.data.fill.limitCents,1500);
  assert.equal((await call('/api/public/rekening',{method:'POST',origin:SITE,ip:'203.0.113.41',body:{houder:'x'.repeat(43),action:'lezen'}})).status,404,'zonder de juiste beheerlink niets');
  // De beheerlink hoort niet in het adres (logboeken; #192): lezen via GET met ?houder= kan niet meer.
  const viaUrl=await call('/api/public/rekening?houder='+token,{ip:'203.0.113.41'});assert.equal(viaUrl.status,400);assert.equal(viaUrl.data.name,undefined);
  assert.equal((await orderOn({groupCode:code})).status,400,'meedoen zonder naam, mail en telefoon kan niet');
  const joined=await orderOn({groupCode:code,guest:bert});assert.equal(joined.status,201,JSON.stringify(joined.data));assert.equal(joined.data.group.code,undefined,'wie meedoet, krijgt de code niet terug');
  const full=await orderOn({groupCode:code,guest:bert});assert.equal(full.status,409);assert.match(full.data.error,/Vraag Anna Jansen om het maximum te verhogen/);
  const bar=(await call('/api/workplaces?station=barista',{owner:true})).data.find(o=>o.number===joined.data.number);
  assert.equal(bar.bill.name,'Familie Jansen');assert.equal(bar.bill.orderedBy,'Bert de Boer');assert.equal(bar.bill.percent,93);assert.equal(bar.bill.near,true,'bijna vol: waarschuwing op de werkplek');
  assert.equal((await call('/api/public/rekening',{method:'POST',origin:SITE,ip:'203.0.113.42',body:{houder:token,action:'maximum',limitCents:1000}})).status,400,'niet lager dan wat er al op staat');
  h=await call('/api/public/rekening',{method:'POST',origin:SITE,ip:'203.0.113.42',body:{houder:token,action:'maximum',limitCents:3000}});assert.equal(h.status,200,JSON.stringify(h.data));assert.equal(h.data.fill.limitCents,3000);
  const third=await orderOn({groupCode:code,guest:bert});assert.equal(third.status,201,'na verhogen kan er weer bij');
  // Meebetalen (wens eigenaar 5 november 2026): de rekeninghouder vinkt Bert aan; ieder krijgt een gelijk deel.
  assert.deepEqual(h.data.participants.map(p=>[p.name,p.holder]),[['Anna Jansen',true],['Bert de Boer',false]]);assert.equal(h.data.participants[0].email,undefined);
  const bertKey=h.data.participants[1].key;
  h=await call('/api/public/rekening',{method:'POST',origin:SITE,ip:'203.0.113.42',body:{houder:token,action:'afrekenen',payers:[bertKey]}});
  assert.equal(h.status,200,JSON.stringify(h.data));assert.deepEqual(h.data.shares.map(x=>[x.payer,x.amountCents,x.holder]),[['Anna Jansen',1050,true],['Bert de Boer',1050,false]]);assert.equal(h.data.invoice.paid,false);
  // De rekeninghouder ziet wie er besteld hebben en wat er in totaal besteld is, niet wie wat nam (wens eigenaar 5 november 2026).
  assert.deepEqual(h.data.invoice.orderedBy,['Anna Jansen','Bert de Boer']);assert.deepEqual(h.data.invoice.people,[],'geen uitsplitsing per persoon naar de website');
  assert.deepEqual(h.data.invoice.products.map(p=>[p.name,p.quantity,p.totalCents]),[['Koffie',6,2100]]);
  assert.equal((await orderOn({groupCode:code,guest:bert})).status,400,'tijdens het afrekenen kan er niets meer bij');
  const [annaShare,bertShare]=h.data.shares;
  // Bert komt binnen via de ene link met het e-mailadres van zijn bestelling; een ander adres niet.
  assert.equal((await call('/api/public/rekening',{method:'POST',origin:SITE,ip:'203.0.113.44',body:{meebetalen:code,email:'iemand@example.nl'}})).status,404);
  const found=await call('/api/public/rekening',{method:'POST',origin:SITE,ip:'203.0.113.44',body:{meebetalen:code,email:'BERT@example.nl'}});assert.equal(found.data.deel,bertShare.id);
  const share=await call('/api/public/rekening?deel='+bertShare.id,{ip:'203.0.113.43'});
  assert.deepEqual([share.data.amountCents,share.data.payer,share.data.paid,share.data.ownAmount?.maxPercent],[1050,'Bert de Boer',false,300],'alleen het gedeelde bedrag, met Jou wat goed fielt');
  assert.equal((await call('/api/public/rekening',{method:'POST',origin:SITE,ip:'203.0.113.43',body:{deel:bertShare.id,page:'/bestellen.html',chosenCents:999999}})).status,400,'boven het maximum niet');
  const start=await call('/api/public/rekening',{method:'POST',origin:SITE,ip:'203.0.113.43',body:{deel:bertShare.id,page:'/bestellen.html',chosenCents:800}});
  assert.equal(start.status,200,JSON.stringify(start.data));assert.match(start.data.checkoutUrl,/\/checkout\/tr_/);assert.equal(mock.last().amount.value,'8.00','Bert koos zelf € 8 voor zijn deel');
  assert.equal(mock.last().redirectUrl,SITE+'/bestellen.html?deel='+bertShare.id);
  mock.setStatus(mock.last().id,'paid');
  // Betaald bij Mollie maar de melding is er nog niet: opnieuw verdelen mag dat deel nooit laten vervallen (#189).
  const again=await call('/api/public/rekening',{method:'POST',origin:SITE,ip:'203.0.113.42',body:{houder:token,action:'afrekenen',payers:[]}});
  assert.equal(again.status,409,JSON.stringify(again.data));assert.match(again.data.error,/al een deel betaald/);
  assert.equal((await call('/api/public/rekening?deel='+bertShare.id,{ip:'203.0.113.43'})).data.paid,true,'Berts deel is afgerekend, ook al betaalde hij minder');
  h=await holder();assert.deepEqual(h.data.shares.map(x=>[x.payer,x.status,x.paidCents]),[['Anna Jansen','open',undefined],['Bert de Boer','betaald',undefined]],'de houder ziet wel of, niet hoeveel');
  const kassa=await call('/api/rekeningen',{method:'POST',owner:true,body:{shareId:annaShare.id,method:'contant'}});assert.equal(kassa.status,200,JSON.stringify(kassa.data));
  assert.equal(kassa.data.invoice.paid,true);assert.ok(kassa.data.paidAt);assert.match(kassa.data.invoice.number,/^BB-\d{5}$/);
  assert.deepEqual(kassa.data.invoice.payments.map(p=>[p.method,p.amountCents]),[['iDEAL (Mollie)',800],['Contant',1050]]);assert.equal(kassa.data.invoice.differenceCents,-250);
  assert.equal(kassa.data.invoice.people[0].email,'anna@example.nl','backoffice ziet wel alle gegevens');
  const rows=(await call('/api/orders',{owner:true})).data.filter(o=>[opened.data.number,joined.data.number,third.data.number].includes(o.number));
  assert.deepEqual(rows.map(o=>o.statusLabel),['Betaald','Betaald','Betaald']);
  // Omzet: wat er echt betaald is (€ 18,50), naar verhouding over de drie bestellingen, met de btw daarover.
  assert.equal(rows.reduce((t,o)=>t+o.paidCents,0),1850);assert.ok(rows.every(o=>o.counted));
  // Winkelproducten kunnen niet op een rekening.
  assert.equal((await call('/api/public/orders',{method:'POST',origin:SITE,ip:'203.0.113.45',body:{requestId:randomUUID(),route:'winkel',lines:[{productId:product.id,version:product.version,quantity:1}],groupCode:code,guest:bert}})).data.reason,'groep');
  assert.ok((await call('/api/rekeningen?soort=facturen',{owner:true})).data.some(b=>b.name==='Familie Jansen'&&b.paidAt));
  assert.ok(!(await call('/api/rekeningen',{owner:true})).data.some(b=>b.name==='Familie Jansen'),'niet meer bij de open rekeningen');
  h=await holder();assert.equal(h.data.invoice.paid,true,'de rekeninghouder ziet Voldaan');
  // Voldaan-mail aan de rekeninghouder: in deze test is Gmail niet gekoppeld, dus 'uit' met de reden (niets verstuurd).
  let mailed;for(let i=0;i<30&&!mailed?.mailPaid;i++){await sleep(300);mailed=(await call('/api/rekeningen?soort=facturen',{owner:true})).data.find(b=>b.name==='Familie Jansen')}
  assert.equal(mailed.mailPaid,'uit');assert.match(mailed.mailError,/niet gekoppeld|staat uit/);
  assert.equal((await call('/api/rekeningen',{method:'POST',owner:true,body:{id:mailed.id,action:'mail'}})).data.kind,'voldaan','opnieuw versturen kan');
  // Wachten tot de nieuwe mailpoging klaar is (status weer gezet), zodat de backoffice niets meer doet als de test stopt.
  mailed=null;for(let i=0;i<30&&mailed?.mailPaid!=='uit';i++){await sleep(300);mailed=(await call('/api/rekeningen?soort=facturen',{owner:true})).data.find(b=>b.name==='Familie Jansen')}
  assert.equal(mailed.mailPaid,'uit','de nieuwe poging is uitgevoerd');
 });
});

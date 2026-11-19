// Voorspelling daggasten (wens eigenaar 6 november 2026): aanpasbaar en zelflerend op het werkelijke bezoek van een periode.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import './helpers/ts-resolve.mjs';
const fc=await import('../lib/forecast-core.ts');

test('zelf bijstellen op het werkelijke bezoek, correctie in procenten en een eigen getal',()=>{
 const s={auto:true,periodDays:28,manualPct:0};
 assert.equal(fc.calibration([{date:'a',predicted:100,actual:120}],s).factor,null,'te weinig dagen');
 const pairs=[100,80,120].map((p,i)=>({date:'d'+i,predicted:p,actual:Math.round(p*1.25)}));
 assert.equal(fc.calibration(pairs,s).factor,1.25);
 assert.equal(fc.calibration(pairs,{...s,auto:false}).factor,null);
 assert.equal(fc.calibration(pairs.map(p=>({...p,actual:p.predicted*5})),s).factor,2,'begrensd');
 assert.deepEqual(fc.adjust(100,{factor:1.25,manualPct:10,override:null}),{expected:138,how:'bijgesteld'});
 assert.deepEqual(fc.adjust(100,{factor:null,manualPct:0,override:null}),{expected:100,how:'basis'});
 assert.deepEqual(fc.adjust(null,{factor:1.2,manualPct:0,override:250}),{expected:250,how:'eigen getal'});
 assert.deepEqual(fc.adjust(null,{factor:1.2,manualPct:0,override:null}),{expected:null,how:'geen basis'});
 assert.throws(()=>fc.parseSettings({periodDays:3,manualPct:0}),/periode/);assert.throws(()=>fc.parseSettings({periodDays:28,manualPct:-95}),/correctie/);
});

const run=(name,code)=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-'+name+'-'));
 try{const r=spawnSync(process.execPath,['--experimental-transform-types','--input-type=module','-e',"import './tests/helpers/ts-resolve.mjs';import assert from 'node:assert/strict';"+code],
  {cwd:new URL('../',import.meta.url),env:{...process.env,APP_DATA_DIR:dir,APP_ORIGIN:'http://127.0.0.1:3001',PUBLIC_ORDER_ORIGINS:'',SHEETS_CONFIG_KEY:'ab'.repeat(32),GUEST_WEATHER_LOCATION:''},encoding:'utf8',timeout:120000});
  assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/ok/)}finally{fs.rmSync(dir,{recursive:true,force:true})}};

test('keten: werkelijk bezoek uit de verkochte entree, de correctiefactor, een eigen getal en de instellingen',()=>run('voorspelling',`
 const {getDb}=await import('./db/index.ts');const s=await import('./db/schema.ts');const fc=await import('./lib/forecast.ts');
 const {loadGuest}=await import('./lib/guest-store.ts');const {today}=await import('./lib/pot-agreements.ts');
 const db=getDb(),t=new Date().toISOString(),day0=today(),add=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
 await db.insert(s.products).values({id:'entree',draft:'{}',published:JSON.stringify({name:'Entree',pot:'speelboerderij',priceCents:900}),version:1});
 for(const [i,n] of [[2,24],[3,30],[4,36]]){const d=add(day0,-i);
  const [o]=await db.insert(s.orders).values({requestId:'r'+i,request:'{}',data:'{}',status:'afgehaald',paymentStatus:'betaald',created:d+'T12:00:00.000Z',test:0,mode:'kassa',reference:'',totalCents:n*900}).returning({id:s.orders.id});
  await db.insert(s.orderLines).values({orderId:o.id,position:0,productId:'entree',name:'Entree',quantity:n,unitCents:900,totalCents:n*900,vat:'9',vatCents:0,station:''});
  await db.insert(s.forecastLog).values({date:d,predicted:Math.round(n/1.2),temperature:15,rain:0,at:t})}
 // Een proefbestelling telt nooit mee.
 const [p]=await db.insert(s.orders).values({requestId:'proef',request:'{}',data:'{}',status:'afgehaald',paymentStatus:'betaald',created:add(day0,-3)+'T13:00:00.000Z',test:1,mode:'kassa',reference:'',totalCents:900}).returning({id:s.orders.id});
 await db.insert(s.orderLines).values({orderId:p.id,position:0,productId:'entree',name:'Entree',quantity:99,unitCents:900,totalCents:900,vat:'9',vatCents:0,station:''});
 const {state}=await loadGuest();const act=await fc.actualVisitors(add(day0,-5),add(day0,-1),state.visits);assert.equal(act.get(add(day0,-3)),30);
 let f=await fc.forecastsFor(day0,3);assert.equal(f.calibration.factor,1.2,f.calibration.reason);assert.equal(f.period.length,3);
 await fc.setOverride(add(day0,1),250,'Open dag','Rianne');f=await fc.forecastsFor(day0,3);assert.deepEqual([f.days[1].expected,f.days[1].how],[250,'eigen getal']);
 assert.equal((await fc.forecastMap(day0,3))[add(day0,1)],250,'dezelfde voorspelling in de personeelsplanning');
 await fc.setOverride(add(day0,1),null,'','Rianne');f=await fc.forecastsFor(day0,3);assert.equal(f.days[1].override,null);
 await fc.saveSettings({auto:false,periodDays:28,manualPct:10},0,'Rianne');f=await fc.forecastsFor(day0,3);assert.equal(f.calibration.factor,null);assert.equal(f.settings.manualPct,10);
 await assert.rejects(()=>fc.saveSettings({auto:true,periodDays:28,manualPct:0},0,'Bartele'),/net gewijzigd/);
 console.log('ok');`));

// Wens eigenaar 6 november 2026: de verwachting automatisch in de personeelsplanning (gasten × € 15, norm van de eigenaar).
test('keten: de verwachting zet de plekken in de personeelsplanning van het restaurant; met de hand gaat voor',()=>run('norm',`
 const {getDb}=await import('./db/index.ts');const s=await import('./db/schema.ts');const fc=await import('./lib/forecast.ts');
 const pl=await import('./lib/pot-planning.ts');const {today}=await import('./lib/pot-agreements.ts');
 const db=getDb(),t=new Date().toISOString(),day0=today(),add=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
 let day=add(day0,1);while(![4,5,6,0].includes(new Date(day+'T12:00:00Z').getUTCDay()))day=add(day,1); // do t/m zo open
 const roles=[{id:'chef-kok',name:'Chef-kok',points:4},{id:'kok',name:'Kok',points:3},{id:'hoofdbediening',name:'Hoofdbediening',points:3},{id:'bediening',name:'Bediening',points:2},{id:'afwas',name:'Afwas',points:2}];
 await db.insert(s.potAgreements).values({id:'a1',pot:'restaurant',validFrom:add(day0,-30),percentBp:3000,roles:JSON.stringify(roles),tipRule:'gelijk',note:'',required:'[]',status:'geldig',proposedBy:'test',proposedAt:t,decidedAt:t});
 const need=async()=>Object.fromEntries((await pl.roster('restaurant',day,1)).days[0].slots.map(x=>[x.roleId,x.need]));
 await fc.setOverride(day,40,'','test');      // 40 × € 15 = € 600: chef en hoofdbediening
 assert.deepEqual(await need(),{'chef-kok':1,kok:0,hoofdbediening:1,bediening:0,afwas:0});
 await fc.setOverride(day,200,'','test');     // € 3.000: twee koks, twee bediening, een afwas
 assert.deepEqual(await need(),{'chef-kok':1,kok:1,hoofdbediening:1,bediening:1,afwas:1});
 const r=await pl.roster('restaurant',day,1);assert.deepEqual([r.days[0].norm.guests,r.days[0].norm.omzetCents,r.days[0].norm.people],[200,300000,5]);
 await db.insert(s.potNeeds).values({pot:'restaurant',day,roleId:'bediening',count:3,note:'',at:t,by:'Rianne'}).onConflictDoNothing();
 assert.equal((await need()).bediening,3,'met de hand gaat voor');
 console.log('ok');`));
test('bezoekdagen uit eerdere jaren inlezen: datum en aantal per regel',async()=>{
 const {parseVisitLines}=await import('../lib/forecast-core.ts');
 assert.deepEqual(parseVisitLines('datum;bezoekers\n2025-06-14;120\n15-6-2025, 180\n\n2025-06-14;125','2026-11-09'),[{date:'2025-06-14',visitors:125},{date:'2025-06-15',visitors:180}]);
 assert.throws(()=>parseVisitLines('2027-01-01;5','2026-11-09'),/geen bezoekdagen/);
 assert.throws(()=>parseVisitLines('2025-13-01;1\n2025-02-30;2\n2025-14-01;3\n2025-00-01;4\n2025-01-01;5','2026-11-09'),/niet te lezen/);
});
test('bezoekdagen inlezen leest de koppelingsinstellingen (weerlocatie)',()=>{
 const src=fs.readFileSync(new URL('../app/api/voorspelling/route.ts',import.meta.url),'utf8');
 assert.match(src,/withConnectionSettings\(\(\)=>importVisits\(b\.text,by\)\)/);
});
test('verder dan 16 dagen vooruit: seizoensgemiddelde van dezelfde weekdag uit de vergelijkingsjaren',async()=>{
 const {predict}=await import('../lib/guest-forecast.ts');
 // Zaterdagen in mei 2025, rond 2027-05-15 (ook een zaterdag; vergelijkingsjaar 2025).
 const visits=[['2025-05-03',300],['2025-05-10',400],['2025-05-17',500],['2025-05-24',200],['2025-05-14',999]].map(([date,visitors])=>({date,visitors,temperature:15,rain:0}));
 const p=predict(visits,'2027-05-15',null,[2025]);
 assert.equal(p.expected,350);assert.equal(p.samples,4);assert.match(p.reason,/Seizoensgemiddelde van 4 zaterdagen uit 2025/);
 assert.equal(predict(visits,'2027-05-15',{temperature:15,rain:0},[2025]).expected,350,'met weer: vergelijkbaar weer');
 assert.match(predict(visits,'2027-05-15',{temperature:35,rain:0},[2025]).reason,/te weinig dagen met vergelijkbaar weer/);
 assert.equal(predict([],'2027-05-15',null,[2025]).expected,null);
});

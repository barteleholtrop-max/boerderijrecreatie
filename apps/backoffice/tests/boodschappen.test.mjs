// Boodschappenlijst bij de Weekassistent (wens eigenaar 9 november 2026): uit het weekmenu en de vaste rekenregel van
// Inkoop & voorraad; een vinkje is een bestelling „onderweg”, niets dubbel, uitvinken annuleert. Tegen een echte tijdelijke database.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spokenItem} from '../lib/spraak-core.ts';

test('ingesproken boodschap: alleen wat er op de lijst moet',()=>{
 for(const [said,item] of [['Zet wc-papier op de lijst','wc-papier'],['zet nog twee kratten melk op de boodschappenlijst.','twee kratten melk'],['We hebben nog servetten nodig','servetten'],['Voeg afwasmiddel toe aan de lijst','afwasmiddel'],['Doe eieren erbij','eieren'],['Wc-papier','wc-papier'],['kun je zet koffiebonen op het lijstje','koffiebonen']])assert.equal(spokenItem(said),item,said);
});

test('boodschappenlijst: weekmenu → wat te kopen; vink besteld telt mee als onderweg; dubbel tikken en uitvinken',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-boodschappen-'));
 try{const code=`
 import './tests/helpers/ts-resolve.mjs';import assert from 'node:assert/strict';
 const {env}=await import('./lib/portable/env.ts');const {getDb}=await import('./db/index.ts');const {products}=await import('./db/schema.ts');
 const {loadOps,saveOps}=await import('./lib/operations-store.ts');const {shoppingPlan}=await import('./lib/operations-core.ts');
 const B=await import('./lib/boodschappen.ts');
 const week=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date(Date.now()+7*86400000));
 const p={name:'Boerenkoolstamppot',department:'Keuken',priceCents:1450,vat:'9',station:'keuken',available:true,photo:'',check:'',note:'',sourceId:''};
 await getDb().insert(products).values({id:'p1',draft:JSON.stringify(p),published:JSON.stringify(p),version:1});
 await getDb().insert(products).values({id:'p2',draft:JSON.stringify({...p,name:'Soep'}),published:null,version:1});
 const ops=await loadOps('none'),n=structuredClone(ops.state);
 const ing=(id,name,unit,stock,known,pack,supplier)=>({id,name,unit,supplier,article:'',stock,known,countedAt:known?'2026-11-01':'',pack,min:0,leadDays:0,shelfDays:0,allergens:[],checked:true,notes:'',origin:'inkoop',ownCents:null});
 n.ingredients.push(ing('kool','Boerenkool','kg',1,true,2.5,'Hanos'),ing('aard','Aardappelen','kg',100,true,10,'Hanos'),ing('worst','Rookworst','st',0,false,1,'Slager'));
 n.recipes.push({productId:'p1',name:'Boerenkoolstamppot',yield:10,lines:[{ingredientId:'kool',quantity:2},{ingredientId:'aard',quantity:3},{ingredientId:'worst',quantity:10}],method:'',lossPct:0,packagingCents:0,version:1,reviewed:true});
 assert.equal(await saveOps(ops,n,'opbouw-0001','test'),'saved');
 // Nog geen menu: lege lijst.
 let l=await B.shoppingList(week);assert.equal(l.menu,null);assert.equal(l.lines.length,0);
 await env.DB.prepare("INSERT INTO week_menus(id, week, status, version, thread_id, created, updated) VALUES('m1', ?1, 'concept', 1, 't1', 'x', 'x')").bind(week).run();
 await env.DB.prepare("INSERT INTO week_menu_items(menu_id, position, product_id, day, portions, note) VALUES('m1',0,'p1','do',40,''),('m1',1,'p2','vr',null,'')").run();
 l=await B.shoppingList(week);
 // 40 porties: 8 kg boerenkool nodig, 1 kg op voorraad → 7 kg → 3 zakken van 2,5 kg = 7,5 kg. Aardappelen genoeg. Rookworst niet geteld.
 const kool=l.lines.find(x=>x.ingredientId==='kool');assert.equal(kool.quantity,7.5);assert.equal(kool.packs,3);assert.equal(kool.supplier,'Hanos');assert.equal(kool.checked,false);
 assert.ok(!l.lines.some(x=>x.ingredientId==='aard'),'genoeg op voorraad: niet op de lijst');
 const worst=l.lines.find(x=>x.ingredientId==='worst');assert.equal(worst.quantity,null);assert.equal(worst.counted,false);
 assert.deepEqual(l.missingPortions,['Soep']);
 // Zelfde uitkomst als de rekenregel van Inkoop & voorraad.
 const plan=shoppingPlan((await loadOps('none')).state,[{productId:'p1',portions:40}],week,week);assert.equal(plan.lines.find(x=>x.ingredient.id==='kool').quantity,7.5);
 // Vinkje: onderweg in Inkoop & voorraad; de regel blijft staan met vink.
 await B.setChecked(week,'kool',true,'vink-00000001','rianne');
 let s=(await loadOps('none')).state,o=s.incoming.find(x=>x.id===B.shoppingId(week,'kool'));assert.equal(o.status,'confirmed');assert.equal(o.remaining,7.5);assert.equal(o.supplier,'Hanos');
 l=await B.shoppingList(week);assert.equal(l.lines.find(x=>x.ingredientId==='kool').checked,true);assert.equal(l.lines.find(x=>x.ingredientId==='kool').quantity,7.5);
 assert.equal(shoppingPlan(s,[{productId:'p1',portions:40}],week,week).lines.find(x=>x.ingredient.id==='kool').quantity,0,'telt mee als onderweg');
 // Dubbel tikken: niets dubbel.
 assert.equal((await B.setChecked(week,'kool',true,'vink-00000002','rianne')).already,true);
 assert.equal((await loadOps('none')).state.incoming.filter(x=>x.ingredientId==='kool').length,1);
 // Niet geteld: geen vink.
 await assert.rejects(()=>B.setChecked(week,'worst',true,'vink-00000003','rianne'),e=>e.status===409&&/Tel eerst/.test(e.message));
 // Uitvinken: geannuleerd, telt niet meer mee.
 await B.setChecked(week,'kool',false,'vink-00000004','rianne');
 s=(await loadOps('none')).state;assert.equal(s.incoming.find(x=>x.id===B.shoppingId(week,'kool')).status,'geannuleerd');
 l=await B.shoppingList(week);assert.equal(l.lines.find(x=>x.ingredientId==='kool').checked,false);
 // Weer aanvinken hergebruikt dezelfde bestelling.
 await B.setChecked(week,'kool',true,'vink-00000005','rianne');
 s=(await loadOps('none')).state;assert.equal(s.incoming.filter(x=>x.ingredientId==='kool').length,1);assert.equal(s.incoming[0].status,'confirmed');
 await assert.rejects(()=>B.setChecked('2026-1-1','kool',true,'vink-00000006','x'),/Ongeldige/);
 // Voorraad onder het minimum (na een telling) komt er vanzelf op, ook zonder dat het in het menu zit.
 const o2=await loadOps('none'),n2=structuredClone(o2.state);n2.ingredients.push(ing('wc','Wc-papier','st',2,true,12,'Hanos'));n2.ingredients.find(x=>x.id==='wc').min=20;
 assert.equal(await saveOps(o2,n2,'opbouw-0002','test'),'saved');
 l=await B.shoppingList(week);const wc=l.lines.find(x=>x.ingredientId==='wc');assert.equal(wc.reason,'voorraad');assert.equal(wc.quantity,24,'20 min 2 = 18 → 2 pakken van 12');
 assert.equal(l.lines.find(x=>x.ingredientId==='kool').reason,'menu');
 // Zelf toevoegen: niet dubbel, aanvinken, weghalen.
 const a=await B.addItem(week,'  Servetten ','2 pakken','bartele');assert.equal(a.already,false);
 assert.equal((await B.addItem(week,'servetten','3 pakken','rianne')).already,true);
 l=await B.shoppingList(week);assert.equal(l.items.length,1);assert.equal(l.items[0].name,'Servetten');assert.equal(l.items[0].amount,'3 pakken');
 await B.updateItem(a.id,{checked:true},'rianne');l=await B.shoppingList(week);assert.equal(l.items[0].checked,true);assert.equal(l.items[0].checkedBy,'rianne');
 await B.updateItem(a.id,{removed:true},'rianne');l=await B.shoppingList(week);assert.equal(l.items.length,0);
 await assert.rejects(()=>B.updateItem(a.id,{checked:true},'x'),e=>e.status===409);
 await assert.rejects(()=>B.addItem(week,'','',''),/naam/);
 // Via de Weekassistent: dezelfde lijst.
 const {runTool}=await import('./lib/assistant-tools.ts');
 const ctx={today:week,week,products:async()=>[],ops:async()=>(await loadOps('none')).state,weekMenus:async()=>({concept:null,confirmed:null}),proposeWeekMenu:async()=>({proposalId:'',menuId:''}),addShopping:(w,nm,am)=>B.addItem(w,nm,am,'rianne via assistent')};
 const t=await runTool('boodschap_toevoegen',{naam:'wc-papier',hoeveelheid:''},ctx);assert.equal(t.isError,false);assert.match(t.content,/toegevoegd/);
 l=await B.shoppingList(week);assert.equal(l.items[0].name,'wc-papier');assert.equal(l.items[0].createdBy,'rianne via assistent');
 console.log('boodschappen ok');
 `;const r=spawnSync(process.execPath,['--experimental-transform-types','--input-type=module','-e',code],{cwd:new URL('../',import.meta.url),env:{...process.env,APP_DATA_DIR:dir,DATABASE_URL:''},encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stderr+'\n'+r.stdout);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

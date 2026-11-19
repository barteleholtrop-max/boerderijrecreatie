// Klantenkaart uit bestellingen (wens eigenaar 8 november 2026): alleen met toestemming („Onthoud mij als klant van Boerderijrecreatie”),
// gekoppeld op e-mailadres aan de bestaande klantenkaart, en op verzoek te vergeten.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import './helpers/ts-resolve.mjs';
const P=await import('../lib/public-orders.ts'),G=await import('../lib/guest-customers.ts');
const base={requestId:'11111111-1111-4111-8111-111111111111',route:'winkel',lines:[{productId:'eieren',version:1,quantity:1,note:'',selections:{}}],chosenCents:null,groupCode:null};

test('bestelpagina: zonder vinkje geen klantgegevens; met vinkje naam en e-mail verplicht, telefoon mag leeg',()=>{
 assert.equal(P.parseGuestOrder(base).klant,undefined);
 assert.equal(P.parseGuestOrder({...base,klant:{name:'Ans',email:'ans@example.nl',toestemming:false}}).klant,undefined,'zonder toestemming niets');
 assert.deepEqual(P.parseGuestOrder({...base,klant:{name:' Ans  Bakker ',email:'Ans@Example.NL',phone:'',toestemming:true}}).klant,{name:'Ans Bakker',email:'ans@example.nl',phone:'',consent:true});
 assert.throws(()=>P.parseGuestOrder({...base,klant:{name:'Ans',email:'geen-mail',toestemming:true}}),/e-mailadres/);
});
test('klantenkaart: bestellingen komen op de kaart met hetzelfde e-mailadres, anders een eigen kaart',()=>{
 const state={customers:[{id:'k1',name:'Ans Bakker',email:'ans@example.nl',phone:'',company:'',address:'',notes:''}],threads:[],reservations:[]};
 const orders=[{email:'ans@example.nl',name:'Ans',phone:'0612345678',count:2,totalCents:2450,first:'2026-11-01',last:'2026-11-07',favorites:[{name:'Eieren',quantity:3}],recent:[]},
  {email:'piet@example.nl',name:'Piet',phone:'',count:1,totalCents:500,first:'2026-11-05',last:'2026-11-05',favorites:[],recent:[]}];
 const cards=G.customerCards(state,[],orders);
 const ans=cards.find(c=>c.id==='k1');assert.equal(ans.orders.count,2);assert.equal(ans.phone,'0612345678','lege telefoon aangevuld');assert.equal(cards.filter(c=>c.email==='ans@example.nl').length,1,'geen dubbele kaart');
 const piet=cards.find(c=>c.email==='piet@example.nl');assert.equal(piet.orders.totalCents,500);assert.equal(piet.id,'email:piet@example.nl');
});
test('alleen bestellingen met toestemming die als omzet tellen; vergeten haalt de klantgegevens eruit',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-klantenkaart-'));process.env.APP_DATA_DIR=dir;process.env.DATABASE_URL='';process.env.SHEETS_CONFIG_KEY='cd'.repeat(32);
 const {getDb}=await import('../db/index.ts'),s=await import('../db/schema.ts'),{closeDatabase}=await import('../lib/portable/env.ts'),oc=await import('../lib/order-customers.ts');
 t.after(async()=>{await closeDatabase();fs.rmSync(dir,{recursive:true,force:true})});
 const db=getDb(),klant={name:'Ans',email:'ans@example.nl',phone:'',consent:true};
 const add=async(n,o)=>{const [r]=await db.insert(s.orders).values({requestId:'r'+n,request:JSON.stringify({channel:'website',route:'winkel',...(o.klant?{klant:o.klant}:{})}),data:'{}',created:o.created,mode:'winkel',reference:'W'+n,status:o.status||'vastgelegd',paymentStatus:o.pay||'betaald',totalCents:o.total,test:o.test||0}).returning({id:s.orders.id});
  await db.insert(s.orderLines).values({orderId:r.id,position:1,productId:'eieren',name:o.product||'Eieren',station:'winkel',quantity:o.qty||1,unitCents:o.total,totalCents:o.total,vat:'9',vatCents:0}).catch(e=>{throw Error('orderLines: '+e.message)});return r.id};
 await add(1,{klant,created:'2026-11-01T10:00:00Z',total:1200,qty:2});
 await add(2,{klant:{...klant,email:'ANS@example.nl',phone:'0612345678'},created:'2026-11-07T10:00:00Z',total:800,product:'Kaas'});
 await add(3,{created:'2026-11-07T11:00:00Z',total:999});                                   // geen toestemming
 await add(4,{klant,created:'2026-11-08T10:00:00Z',total:700,status:'wacht-op-betaling',pay:'open'}); // nog niet betaald
 await add(5,{klant,created:'2026-11-08T11:00:00Z',total:300,test:1});                       // proef
 let list=await oc.orderCustomers();assert.equal(list.length,1);const a=list[0];
 assert.equal(a.email,'ans@example.nl');assert.equal(a.count,2);assert.equal(a.totalCents,2000);assert.equal(a.phone,'0612345678','laatste gegevens');
 assert.deepEqual(a.favorites.map(f=>f.name),['Eieren','Kaas']);assert.equal(a.recent[0].reference,'W2');
 assert.equal(await oc.forgetOrderCustomer('Ans@Example.nl'),4,'alle bestellingen van dit adres, ook die niet meetellen');
 assert.deepEqual(await oc.orderCustomers(),[]);const left=await db.select().from(s.orders);assert.equal(left.length,5,'de bestellingen zelf blijven');assert.ok(left.every(o=>!o.request.includes('ans@example')));
});

// Rentepot (wens eigenaar 8 november 2026): rentesaldo dat leden in de winkel besteden, gaat van de bunq-rekening Rente & vaste kosten
// naar de coöperatie (rentekosten, niet uit een pot). Eigen concept vanaf die rekening, pas na akkoord, nooit dubbel.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import './helpers/ts-resolve.mjs';
const {planSplit}=await import('../lib/bank-split-core.ts');
const acc=(id)=>({id,iban:'NL0'+id,description:''});
test('verdeelstaat: rente-regel van Rente & vaste kosten naar de coöperatie; zonder rekening wacht de week',()=>{
 const base={week:'2026-10-26',label:'w',inflows:[{id:1,created:'',amountCents:10000,description:'Mollie',counterpartyName:'Stichting Mollie Payments',counterpartyIban:''}],members:[],funds:[],vatCents:0,blockers:[],notes:[]};
 const no=planSplit({...base,renteSpentCents:1240,accounts:{main:acc(1),cooperatie:acc(5)}});
 assert.equal(no.ready,false);assert.match(no.blockers.join(),/Rente & vaste kosten/);
 const yes=planSplit({...base,renteSpentCents:1240,accounts:{main:acc(1),cooperatie:acc(5),rente:acc(6)}});
 assert.ok(yes.ready,yes.blockers.join());assert.deepEqual(yes.rente,{cents:1240,fromId:6,fromIban:'NL06',toId:5,toIban:'NL05'});
 assert.equal(planSplit({...base,accounts:{main:acc(1),cooperatie:acc(5)}}).rente,null,'geen rente besteed: geen regel');
});
const run=(name,code)=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-'+name+'-'));
 try{const r=spawnSync(process.execPath,['--experimental-transform-types','--input-type=module','-e',"import './tests/helpers/ts-resolve.mjs';import assert from 'node:assert/strict';"+code],
  {cwd:new URL('../',import.meta.url),env:{...process.env,APP_DATA_DIR:dir,APP_ORIGIN:'http://127.0.0.1:3001',PUBLIC_ORDER_ORIGINS:'',SHEETS_CONFIG_KEY:'ab'.repeat(32),GUEST_BUNQ_API_KEY:'sandbox_'+'k'.repeat(40),BUNQ_LIVE_ENABLED:''},encoding:'utf8',timeout:120000});
  assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/ok/)}finally{fs.rmSync(dir,{recursive:true,force:true})}};
test('akkoord → concept vanaf Rente & vaste kosten → bevestigd → geld bij de coöperatie',()=>run('rente',`
 const {bunqMock}=await import('./tests/helpers/bunq-mock.mjs');const mock=bunqMock();mock.state.apiKey=process.env.GUEST_BUNQ_API_KEY;process.env.BUNQ_API_BASE=await mock.start();
 const {getDb}=await import('./db/index.ts');const s=await import('./db/schema.ts');const bank=await import('./lib/bank-split.ts');
 const db=getDb(),W='2026-10-26',at='2026-10-28T10:00:00.000Z';
 const o=(await db.insert(s.orders).values({requestId:'r1',request:'{}',data:'{}',created:at,mode:'winkel',reference:'',status:'vastgelegd'}).returning({id:s.orders.id}))[0];
 await db.insert(s.payments).values({id:'dividend-'+o.id,requestId:'dividend:r1',orderId:o.id,method:'dividend',amountCents:1240,status:'betaald',provider:'dividend:bloei:sc:1',externalRef:null,version:1,created:at,updated:at});
 const coop={week:W,label:'week 44',computedAt:at,settlement:{participants:[],coop:{revenueExclCents:0,vatCents:0,lines:0},retainedTotalCents:0,payoutTotalCents:0,testLines:0,warnings:[]},included:[],corrections:[],products:[]};
 await db.insert(s.coopWeeks).values({week:W,status:'goedgekeurd',snapshot:JSON.stringify(coop),approvedBy:'Rianne',approvedAt:at});
 mock.add(1,10000,{name:'Stichting Mollie Payments',description:'Mollie settlement'});mock.add(6,50000,{name:'Bloei',description:'rentepot'});
 await bank.saveAccounts({main:1,tegoed:2,btw:3,potten:4,cooperatie:5},0,'Bartele');
 let v=await bank.splitView(W);assert.equal(v.ready,false);assert.match(v.blockers.join(),/Rente & vaste kosten/);
 await bank.saveAccounts({main:1,tegoed:2,btw:3,potten:4,cooperatie:5,rente:6},1,'Bartele');
 v=await bank.splitView(W);assert.ok(v.ready,v.blockers.join());assert.equal(v.rente.cents,1240);
 const lines=Object.fromEntries(v.lines.map(l=>[l.target,l.cents]));
 await assert.rejects(()=>bank.approveSplit(W,{receivedCents:v.receivedCents,lines,renteCents:0},'Bartele'),/net veranderd/);
 v=await bank.approveSplit(W,{receivedCents:v.receivedCents,lines,renteCents:1240},'Bartele');
 const rente=()=>v.transfers.find(x=>x.target==='rente');assert.equal(rente().status,'in-bunq');
 const fromRente=[...mock.state.drafts].filter(([,d])=>d.from===6);assert.equal(fromRente.length,1,'precies één concept vanaf Rente');
 v=await bank.executeSplit(W,{create:true});assert.equal([...mock.state.drafts].filter(([,d])=>d.from===6).length,1,'nooit dubbel');
 for(const [id] of [...mock.state.drafts])mock.accept(id);v=await bank.executeSplit(W);
 assert.equal(rente().status,'verstuurd');assert.equal(v.status,'uitgevoerd');assert.equal(mock.balance(6),50000-1240);
 await mock.stop();console.log('ok');
`));

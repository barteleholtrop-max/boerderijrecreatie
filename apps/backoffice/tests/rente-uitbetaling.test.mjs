// Rente-uitbetaling obligaties (wensen eigenaar 8 november 2026): alleen 2% en 2,6%, één keer per jaar op 15 mei, vanaf de bunq-rekening
// Rente & vaste kosten, naar rato per dag. Klaarzetten → goedkeuren → concept in bunq → bevestigd → bericht aan de houder. Nooit dubbel.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import './helpers/ts-resolve.mjs';
const {renteFor,renteYear,nextPayoutYear,payoutDay}=await import('../lib/rente-payout-core.ts');
const pos=(o)=>({memberId:'m1',scheme:'cash2',rate:2,units:10,unitCents:10000,issued:'2020-01-01',matures:null,...o});

test('rentejaar loopt van 15 mei tot 15 mei; uitbetaling op 15 mei',()=>{
 assert.deepEqual(renteYear(2027),{start:'2026-05-15',end:'2027-05-15',days:365});
 assert.equal(renteYear(2028).days,366,'schrikkeljaar telt mee');
 assert.equal(payoutDay(2027),'2027-05-15');
 assert.equal(nextPayoutYear('2026-11-08'),2027);assert.equal(nextPayoutYear('2027-05-15'),2027);assert.equal(nextPayoutYear('2027-05-16'),2028);
});
test('alleen 2% en 2,6% krijgen rente op de bank; 6% en renteloos niet',()=>{
 const r=renteFor([pos({}),pos({scheme:'cash26',rate:2.6,units:4,unitCents:25000}),pos({scheme:'grocery6',rate:6}),pos({scheme:'zero30',rate:0})],2027);
 assert.equal(r.length,1);assert.equal(r[0].cents,2000+2600,'€ 1.000 × 2% + € 1.000 × 2,6%');
 assert.deepEqual(r[0].lines.map(l=>[l.scheme,l.cents]),[['cash2',2000],['cash26',2600]]);
});
test('een deel van het jaar telt naar rato per dag; einddatum van de 10-jarige telt mee',()=>{
 const half=renteFor([pos({issued:'2026-11-14'})],2027)[0];       // 182 van 365 dagen
 assert.equal(half.cents,Math.floor(100000*200*182/(10000*365)));assert.equal(half.lines[0].days,182);
 const ended=renteFor([pos({scheme:'cash26',rate:2.6,matures:'2026-08-15'})],2027)[0];   // 92 dagen
 assert.equal(ended.cents,Math.floor(100000*260*92/(10000*365)));
 assert.equal(renteFor([pos({issued:'2027-06-01'})],2027).length,0,'nog niet uitgegeven: niets');
 assert.equal(renteFor([pos({matures:'2026-01-01'})],2027).length,0,'al afgelopen: niets');
 assert.match(renteFor([pos({issued:null})],2027)[0].warnings.join(),/uitgiftedatum/);
});

const run=(name,code)=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-'+name+'-'));
 try{const r=spawnSync(process.execPath,['--experimental-transform-types','--input-type=module','-e',"import './tests/helpers/ts-resolve.mjs';import assert from 'node:assert/strict';"+code],
  {cwd:new URL('../',import.meta.url),env:{...process.env,APP_DATA_DIR:dir,APP_ORIGIN:'http://127.0.0.1:3001',PUBLIC_ORDER_ORIGINS:'',SHEETS_CONFIG_KEY:'ab'.repeat(32),GUEST_BUNQ_API_KEY:'sandbox_'+'k'.repeat(40),BUNQ_LIVE_ENABLED:''},encoding:'utf8',timeout:120000});
  assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/ok/)}finally{fs.rmSync(dir,{recursive:true,force:true})}};
test('klaarzetten → goedkeuren → concept vanaf Rente & vaste kosten → bevestigd → bericht; nooit dubbel',()=>run('rente-uit',`
 const {bunqMock}=await import('./tests/helpers/bunq-mock.mjs');const mock=bunqMock();mock.state.apiKey=process.env.GUEST_BUNQ_API_KEY;process.env.BUNQ_API_BASE=await mock.start();
 const {getDb}=await import('./db/index.ts');const s=await import('./db/schema.ts');const {env}=await import('./lib/portable/env.ts');const {seal}=await import('./lib/sheets.ts');
 const real=await import('./lib/bloei-real-store.ts');const bank=await import('./lib/bank-split.ts');const rente=await import('./lib/rente-payout.ts');const {memberInleg}=await import('./lib/member-inleg.ts');
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date()),Y=Number(today.slice(0,4))-(today.slice(5)<'05-15'?1:0);
 const P=(memberId,scheme,rate,units,issued)=>({id:memberId+scheme,memberId,scheme,rate,units,unitCents:10000,serials:[],issued,matures:null,sourceRef:'t',origin:'foundation'});
 const M=(id,name,iban)=>({id,externalId:null,name,emails:[],address:'',legalType:'',iban,sourceRefs:[],issuer:false});
 const state={schema:1,mode:'imported',importedAt:'',digest:'d',members:[M('sc:1','Anna Kaart',''),M('sc:2','Bert Bloei','NL91 ABNA 0417 1643 00'),M('sc:3','Cor Zonder',''),M('sc:4','Dirk Zes','NL91ABNA0417164300')],
  positions:[P('sc:1','cash2',2,10,'2020-01-01'),P('sc:2','cash26',2.6,5,'2020-01-01'),P('sc:3','cash2',2,1,'2020-01-01'),P('sc:4','grocery6',6,10,'2020-01-01')],credits:[],history:[],warnings:[],sources:[]};
 const at=new Date().toISOString();
 await env.DB.prepare("INSERT INTO bloei_administration(id,digest,data_sealed,sources_sealed,imported_at,imported_by) VALUES('main',?,?,?,?,?)").bind('a'.repeat(64),real.sealImport(state),'x',at,'test').run();
 await getDb().insert(s.coopParticipants).values({id:'kaart-anna',name:'Anna Kaart',holder:'A. Kaart',bloeiMemberId:'sc:1',ibanSealed:await seal('NL02ABNA0123456789'),ibanLast4:'6789',created:at,updated:at});
 let v=await rente.renteView(Y);
 assert.deepEqual(v.rows.map(r=>[r.name,r.amountCents,r.ibanSource]),[['Anna Kaart',2000,'kaart'],['Bert Bloei',1300,'bloei'],['Cor Zonder',200,null]],'6% staat er niet bij');
 assert.match(v.rows[2].warnings.join(),/IBAN/);assert.equal(v.canPrepare,true);assert.equal(v.toPrepare,2);
 await assert.rejects(()=>rente.prepareRente(Y+1,'Bartele'),/vanaf/,'vóór 15 mei kan het niet');
 assert.equal(await rente.prepareRente(Y,'Bartele'),2);assert.equal(await rente.prepareRente(Y,'Bartele'),0,'nooit dubbel klaargezet');
 v=await rente.renteView(Y);const anna=v.rows[0].payout;assert.equal(anna.status,'klaar');
 await assert.rejects(()=>rente.approveRente(anna.id,anna.version,'Bartele'),/Rente & vaste kosten/,'eerst de rekening kiezen');
 mock.add(6,50000,{name:'Bloei',description:'rentepot'});
 await bank.saveAccounts({main:1,tegoed:2,btw:3,potten:4,cooperatie:5,rente:6},0,'Bartele');
 await rente.approveRente(anna.id,anna.version,'Bartele');
 await assert.rejects(()=>rente.approveRente(anna.id,anna.version,'Bartele'),/al behandeld/,'niet twee keer');
 const drafts=[...mock.state.drafts].filter(([,d])=>d.from===6);assert.equal(drafts.length,1,'concept vanaf Rente & vaste kosten');
 assert.equal(drafts[0][1].entry.counterparty_alias.value,'NL02ABNA0123456789','naar het IBAN op de kaart');assert.equal(drafts[0][1].entry.amount.value,'20.00');
 const bert=(await rente.renteView(Y)).rows[1].payout;await rente.rejectRente(bert.id,bert.version,'Eerst IBAN checken','Bartele');
 assert.equal(await rente.refreshRente('Bartele'),0,'nog niet bevestigd');
 mock.accept(drafts[0][0]);assert.equal(await rente.refreshRente('Bartele'),1);
 v=await rente.renteView(Y);assert.equal(v.rows[0].payout.status,'uitbetaald');assert.equal(v.rows[1].payout.status,'afgewezen');assert.equal(mock.balance(6),50000-2000);
 const msgs=await getDb().select().from(s.memberMessages);assert.equal(msgs.length,1);assert.match(msgs[0].body,/20,00/);assert.equal(msgs[0].participantId,'kaart-anna');
 const inleg=await memberInleg('kaart-anna');assert.deepEqual(inleg.cash.paid,[{year:Y,amountCents:2000}]);assert.equal(inleg.cash.expectedCents,2000);
 await mock.stop();console.log('ok');
`));

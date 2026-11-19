// Bloei goed inrichten (wens eigenaar 12 november 2026: „Is de Bloei wel goed ingericht?”, stap 1 en 2). Per lid een versleuteld
// uittreksel (bloei_leden), zodat de ledenpagina niet het hele pakket opent; de administratie blijft de enige bron. Alle gegevens
// hier zijn verzonnen.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import './helpers/ts-resolve.mjs';
const core=await import('../lib/bloei-real-core.ts'),{marketAnnualGrant}=await import('../lib/bloei-market-core.ts');
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');

const pos=(id,memberId,scheme,serials,unitCents=10000,origin='foundation')=>({id,memberId,scheme,rate:scheme==='grocery6'?6:2,units:serials.length,unitCents,serials,issued:'2024-01-01',matures:'2034-01-01',sourceRef:'src:'+id,origin});
const member=(id,name)=>({id,externalId:null,name,emails:[id+'@example.invalid'],address:'Verzonnen 1',legalType:'natural_person',iban:'NL00TEST0000000000',sourceRefs:['src:'+id],issuer:false});
function state(){
 const positions=[pos('a1','A','grocery6',[1,2,3]),pos('a2','A','cash2',[10]),pos('b1','B','grocery6',[4,5]),pos('c1','C','zero30',[20,21])];
 return {schema:1,mode:'imported',importedAt:'2026-11-05T12:00:00.000Z',digest:'d1',members:[member('A','Anna'),member('B','Bram'),member('C','Cor')],positions,
  credits:[{memberId:'A',remainingCents:500,sourceBaseCents:1800,withdrawnCents:1300,annualGrantCents:1800,year:2026,sourceRef:'src:A',kind:'product'},{memberId:'B',remainingCents:-50,sourceBaseCents:1200,withdrawnCents:1250,annualGrantCents:1200,year:2026,sourceRef:'src:B',kind:'product'}],
  history:[{scheme:'grocery6',status:'done',sourceId:'h1',date:'2025-01-01',senderId:'A',receiverId:'B',sender:'Anna',receiver:'Bram',units:1,unitCents:10000,serials:[4],sourceRef:'src:A'},{scheme:'zero30',status:'done',sourceId:'h2',date:'2025-02-01',senderId:'C',receiverId:'C',sender:'Cor',receiver:'Cor',units:1,unitCents:10000,serials:[20],sourceRef:'src:C'}],
  warnings:[{sourceRef:'src:A',message:'let op A'},{sourceRef:'src:C',message:'let op C'}],sources:[{name:'x.xlsx',sha256:'0'.repeat(64),scheme:'grocery6'}],
  // Bloeimarkt: obligatie 3 ging van A naar B, en 4 van B naar C (vóór de grens); 1 later terug van A naar C (ná de grens).
  market:{baselinePositions:positions,transfers:[{id:'t1',at:'2026-01-10T10:00:00.000Z',fromId:'A',toId:'B',assetKeys:['grocery6:foundation:3']},{id:'t2',at:'2026-02-10T10:00:00.000Z',fromId:'B',toId:'C',assetKeys:['grocery6:foundation:4']},{id:'t3',at:'2027-06-01T10:00:00.000Z',fromId:'A',toId:'C',assetKeys:['grocery6:foundation:1']}]}};
}

test('uittreksel per lid: dezelfde uitkomst als het hele pakket, zonder gegevens van anderen',async()=>{
 const s=state();
 process.env.SHEETS_CONFIG_KEY=randomBytes(32).toString('hex');
 const {creditInfoFor}=await import('../lib/bloei-real-store.ts');
 for(const id of ['A','B','C','X']){
  const sl=core.memberSlice(s,id);
  assert.deepEqual(sl.positions,s.positions.filter(p=>p.memberId===id),'posities '+id);
  for(const boundary of ['2026-04-30T22:00:00.000Z','2027-04-30T22:00:00.000Z','2028-04-30T22:00:00.000Z'])assert.equal(marketAnnualGrant(sl,id,boundary),marketAnnualGrant(s,id,boundary),'jaarlijks tegoed '+id+' '+boundary);
  for(const now of ['2026-11-12T12:00:00Z','2027-06-01T12:00:00Z','2028-06-01T12:00:00Z'])assert.deepEqual(creditInfoFor(sl,id,new Date(now)),creditInfoFor(s,id,new Date(now)),'tegoed '+id+' '+now);
  assert.ok(sl.members.every(m=>m.id===id),'alleen de eigen identiteit');assert.equal(sl.sources.length,0,'geen bronbestanden');
  assert.ok(sl.history.every(h=>h.senderId===id||h.receiverId===id));assert.ok(sl.warnings.every(w=>w.message.endsWith(id)));
  assert.ok(sl.market.baselinePositions.every(p=>p.memberId===id||p.serials.some(n=>sl.market.transfers.some(t=>t.assetKeys.includes(`${p.scheme}:${p.origin}:${n}`)))),'alleen obligaties die met dit lid te maken hebben');
 }
 assert.equal(core.memberSlice(s,'C').positions.length,1);assert.equal(core.memberSlice(s,'X').positions.length,0,'onbekend lid: leeg');
 assert.deepEqual(core.sliceIds(s).sort(),['A','B','C']);
});

test('opslag: uittreksels in bloei_leden, vanzelf bijgewerkt na een wijziging, ook zonder nieuwe digest; Bloeimarkt uit het geheugen',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-bloei-leden-'));
 Object.assign(process.env,{APP_DATA_DIR:dir,DATABASE_URL:''});
 const {env,closeDatabase}=await import('../lib/portable/env.ts'),store=await import('../lib/bloei-real-store.ts');
 t.after(async()=>{await closeDatabase();fs.rmSync(dir,{recursive:true,force:true})});
 assert.equal(await store.readRealFor('A'),null,'zonder administratie niets');
 const s=state();
 await env.DB.prepare("INSERT INTO bloei_administration(id,digest,data_sealed,sources_sealed,imported_at,imported_by) VALUES('main',?,?,?,?,?)").bind(s.digest,store.sealImport(s),store.sealImport({}),s.importedAt,'test').run();
 const a=await store.readRealFor('A');assert.deepEqual(a,core.memberSlice(s,'A'));
 const rows=await env.DB.prepare('SELECT member_id,bron,data_sealed FROM bloei_leden ORDER BY member_id').all();
 assert.deepEqual(rows.results.map(r=>r.member_id),['*','A','B','C'],'een uittreksel per lid, plus het lege');
 assert.ok(rows.results.every(r=>!r.data_sealed.includes('Anna')&&!r.data_sealed.includes('NL00TEST')),'versleuteld: geen naam of IBAN leesbaar');
 assert.equal((await store.readRealFor('X')).positions.length,0,'gekoppelde kaart zonder Bloei-gegevens: leeg uittreksel');
 assert.deepEqual(await store.realCreditInfo('A',new Date('2026-11-12T12:00:00Z')),store.creditInfoFor(s,'A',new Date('2026-11-12T12:00:00Z')));
 // Wijziging zoals de Bloeimarkt die doet: dezelfde digest, nieuwe versleutelde tekst. Het volgende lezen ziet de nieuwe stand.
 const changed=state();changed.positions.find(p=>p.id==='a2').units=7;
 await env.DB.prepare("UPDATE bloei_administration SET data_sealed=? WHERE id='main'").bind(store.sealImport(changed)).run();
 assert.equal((await store.readRealFor('A')).positions.find(p=>p.id==='a2').units,7,'bijgewerkt na een wijziging');
 assert.equal((await store.readReal()).positions.find(p=>p.id==='a2').units,7,'het hele pakket ook');
 const bron=await env.DB.prepare("SELECT DISTINCT bron FROM bloei_leden").all();assert.equal(bron.results.length,1,'alle uittreksels volgen dezelfde administratie');
 // Bloeimarkt: markt en administratie uit het geheugen zolang ze niet veranderen; versie komt mee.
 await env.DB.prepare("INSERT INTO bloei_market(id,version,data_sealed,updated,updated_by) VALUES('main',3,?,?,?)").bind(store.sealImport({offers:[],orders:[],audit:[],settings:{}}),'2026-11-12','test').run();
 const m1=await store.cachedSealed('bloei_market'),m2=await store.cachedSealed('bloei_market');assert.equal(m1.version,3);assert.equal(m1.sealed,m2.sealed);
});

test('lezers: ledenpagina, rente en tegoed per lid; de markt en import werken de uittreksels bij; migratie met beveiliging per rij',()=>{
 assert.match(read('lib/member-inleg.ts'),/readRealFor\(p\.bloeiMemberId\)/);assert.doesNotMatch(read('lib/member-inleg.ts'),/readReal\(\)/);
 assert.match(read('lib/rente-payout.ts'),/readRealFor\(bloeiMemberId\)/);
 assert.match(read('lib/bloei-real-store.ts'),/export async function realCreditInfo[^\n]*readRealFor\(memberId\)/);
 const market=read('lib/bloei-market-store.ts');assert.match(market,/cachedSealed\('bloei_market'\)/);assert.match(market,/finally\{await refreshMemberSlices\(\)/);
 assert.match(read('lib/bloei-real-store.ts'),/try\{return await importInTransaction\(state,input,by\)\}finally\{await refreshMemberSlices\(\)/);
 const sql=read('drizzle-pg/0062_bloei_leden.sql');assert.match(sql,/CREATE TABLE "bloei_leden"/);assert.match(sql,/ALTER TABLE "bloei_leden" ENABLE ROW LEVEL SECURITY/);
});

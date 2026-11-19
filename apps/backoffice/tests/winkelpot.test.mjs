// Winkelpot (wens eigenaar 8 november 2026): 5% bovenop het coöperatiedeel (15%), verdeeld over wie winkeldiensten draaide, naar
// dagdelen. Gaat pas in na vaststelling in Overleg. BB-waarde blijft 1 + 15% − 2%.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import './helpers/ts-resolve.mjs';
const C=await import('../lib/coop-core.ts'),P=await import('../lib/shop-pot-core.ts'),B=await import('../lib/bb-core.ts');
const line=o=>({orderId:1,number:'P00001',day:'2026-11-10',productName:'Eieren',quantity:1,ownerId:'ingeborg',paidCents:1090,paidVatCents:90,sign:1,test:false,...o});
const people=[{id:'ingeborg',name:'Ingeborg',vatInclusive:false},{id:'bindert',name:'Bindert',vatInclusive:true}];
const rates=[{participantId:'ingeborg',validFrom:'2026-01-01',percentBp:1500},{participantId:'bindert',validFrom:'2026-01-01',percentBp:1500}];

test('afrekening: vanaf de ingangsdatum 5% winkelpot bovenop het coöperatiedeel; daarvoor niet',()=>{
 const pot=[{validFrom:'2026-11-09',bp:500}];
 const s=C.settle([line({day:'2026-11-08'}),line({}),line({ownerId:'bindert',paidCents:2420,paidVatCents:420}),line({ownerId:null})],people,rates,pot);
 const i=s.participants.find(p=>p.id==='ingeborg'),b=s.participants.find(p=>p.id==='bindert');
 assert.equal(i.retainedCents,150+150,'coöperatiedeel blijft 15%');assert.equal(i.potCents,50,'alleen de verkoop vanaf de ingangsdatum');assert.equal(i.payoutCents,2000-300-50);
 assert.equal(b.retainedCents,300);assert.equal(b.potCents,100);assert.equal(b.vatShareCents,Math.round(420*0.8),'btw-deel alleen over het eigen deel');assert.equal(b.payoutCents,2000-400+336);
 assert.equal(s.shopPotCents,150);assert.equal(s.retainedTotalCents,600,'het totaal coöperatiedeel telt de winkelpot niet mee');
 assert.equal(C.settle([line({})],people,rates).shopPotCents,undefined,'zonder afspraak geen winkelpot');
 assert.equal(C.potOn([{validFrom:'2026-11-09',bp:500},{validFrom:'2027-01-04',bp:0}],'2027-02-01'),0,'een later besluit (stoppen) gaat voor');
 assert.equal(B.bbValueBp(1500),11300,'BB-waarde volgt alleen het coöperatiedeel: 1 + 15% − 2%');
});
test('verdelen naar dagdelen, op de cent precies; zonder diensten blijft de pot bij de coöperatie',()=>{
 const r=P.splitShopPot(1000,[{participantId:'a',name:'Anna'},{participantId:'a',name:'Anna'},{participantId:'b',name:'Bert'}]);
 assert.deepEqual(r.map(x=>[x.name,x.parts,x.cents]),[['Anna',2,667],['Bert',1,333]]);
 assert.equal(P.splitShopPot(100,[{participantId:'a',name:'A'},{participantId:'b',name:'B'},{participantId:'c',name:'C'}]).reduce((n,x)=>n+x.cents,0),100);
 assert.deepEqual(P.splitShopPot(500,[]),[]);assert.equal(P.splitShopPot(-50,[{participantId:'a',name:'A'}])[0].cents,0);
 const e=B.shopPotEntries('2026-11-09','week 46',[{participantId:'a',parts:2,cents:667},{participantId:'c',parts:1,cents:333}],id=>id==='a'?'B':'C','2026-11-16');
 assert.equal(e.length,1,'alleen A-, B- en L-leden als BB');assert.equal(e[0].source,'winkelpot:2026-11-09');assert.equal(e[0].kind,'pot-week');assert.match(e[0].note,/2 dagdelen/);
});
test('voorstel in Overleg → vastgesteld → winkelpot geldt; verdeling uit het winkelrooster; betaalbestand voor wie geen BB krijgt',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-winkelpot-'));process.env.APP_DATA_DIR=dir;process.env.DATABASE_URL='';process.env.SHEETS_CONFIG_KEY='cd'.repeat(32);
 const {env,closeDatabase}=await import('../lib/portable/env.ts'),shop=await import('../lib/shop-pot.ts'),o=await import('../lib/overleg.ts'),store=await import('../lib/coop-store.ts'),{seal}=await import('../lib/sheets.ts');
 t.after(async()=>{await closeDatabase();fs.rmSync(dir,{recursive:true,force:true})});
 const at=new Date().toISOString(),A=randomUUID(),Bm=randomUUID(),Cm=randomUUID(),W='2026-11-09';
 for(const [id,name,cls] of [[A,'Anna','A'],[Bm,'Bert','B'],[Cm,'Cees','C']])await env.DB.prepare('INSERT INTO coop_participants(id,name,holder,email,member_class,units,iban_sealed,iban_last4,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,name,name,'',cls,'["levert"]',await seal('NL91ABNA0417164300'),'4300',at,at).run();
 const STD={validFrom:'2026-11-09',bp:500}; // vaste afspraak (besluit eigenaar 9 november 2026)
 assert.deepEqual(await shop.shopPotRules(),[STD]);
 await assert.rejects(()=>shop.proposeShopPot({validFrom:'morgen'},'Bartele'),/ingangsdatum/);
 let v=await shop.proposeShopPot({validFrom:W},'Bartele');assert.match(v.open.title,/5% voor wie winkeldiensten draait/);
 await assert.rejects(()=>shop.proposeShopPot({validFrom:W},'Bartele'),/al een voorstel/);
 const row=await env.DB.prepare("SELECT id,voters,text,version FROM overleg_proposals WHERE pot='winkel'").first();
 assert.deepEqual(JSON.parse(row.voters).sort(),[A,Bm,Cm].sort(),'Winkel & leveranciers beslist');assert.match(row.text,/in totaal 20% af in plaats van 15%/);assert.match(row.text,/BB-waarde blijft 1 \+ 15% − 2%/);
 assert.deepEqual(await shop.shopPotRules(),[STD],'een voorstel geldt nog niet');
 for(const id of [A,Bm,Cm])await o.vote(id,row.id,{vote:'akkoord'},'lid');
 const fresh=await env.DB.prepare('SELECT version FROM overleg_proposals WHERE id=?').bind(row.id).first();await o.decide(row.id,'vaststellen',fresh.version,'Bartele');
 // Een ingangsdatum in het verleden wordt bij vaststellen de dag van vaststellen (lib/overleg-core.ts validFromOf); de test draait
 // niet altijd op 9 november (sinds 10 november 2026 faalde hij op elke pull request).
 const {validFromOf,amsterdamDay}=await import('../lib/overleg-core.ts');
 assert.deepEqual(await shop.shopPotRules(),[STD,{validFrom:validFromOf(W,amsterdamDay(new Date())),bp:500}]);v=await shop.shopPotView();assert.equal(v.open,null);
 // Winkelrooster van die week: Anna 2 dagdelen, Cees 1, een vervallen dienst telt niet.
 for(const [day,part,id,cancelled] of [['2026-11-10','ochtend',A,''],['2026-11-10','middag',A,''],['2026-11-12','ochtend',Cm,''],['2026-11-13','ochtend',Bm,'2026-11-12T10:00:00Z'],['2026-11-17','ochtend',Bm,'']])
  await env.DB.prepare("INSERT INTO member_shop_shifts(day,part,participant_id,events,at,by,cancelled) VALUES(?,?,?,'[]',?,'test',?)").bind(day,part,id,at,cancelled).run();
 const week=await shop.shopPotWeek(W,900);assert.equal(week.parts,3);assert.deepEqual(week.shares.map(s=>[s.name,s.parts,s.cents]),[['Anna',2,600],['Cees',1,300]]);
 assert.match((await shop.shopPotWeek('2026-11-23',100)).warnings.join(),/blijft bij de coöperatie/);
 // Goedgekeurde week: Anna (A) krijgt BB, Cees (C) staat in het betaalbestand.
 const snapshot={week:W,label:'week 46',computedAt:at,settlement:{participants:[],coop:{revenueExclCents:0,vatCents:0,lines:0},retainedTotalCents:0,payoutTotalCents:0,testLines:0,warnings:[],shopPotCents:900},included:[],corrections:[],products:[],shopPot:week};
 await env.DB.prepare("INSERT INTO coop_weeks(week,status,snapshot,approved_by,approved_at) VALUES(?,'goedgekeurd',?,'Bartele',?)").bind(W,JSON.stringify(snapshot),at).run();
 const {credit,memberClasses}=await import('../lib/bb.ts');await credit(B.shopPotEntries(W,'week 46',week.shares,await memberClasses(),'2026-11-16'),'Bartele');
 const bb=await env.DB.prepare("SELECT participant_id,amount_cents FROM bb_entries WHERE source=?").bind('winkelpot:'+W).all();assert.deepEqual(bb.results.map(r=>[r.participant_id,Number(r.amount_cents)]),[[A,600]]);
 const file=await store.paymentFile(W,'csv');assert.match(file.body,/Cees/);assert.doesNotMatch(file.body,/Anna/);assert.match(file.body,/3[,.]00/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import './helpers/ts-resolve.mjs';
const core=await import('../lib/member-agreement-core.ts');
test('contract periods, immutable source signatures and twelve interest-free instalments',()=>{
 assert.equal(core.endOfPeriod('2026-11-01','maand'),'2026-11-30');assert.equal(core.endOfPeriod('2026-11-01','kwartaal'),'2027-01-31');assert.equal(core.endOfPeriod('2026-11-01','jaar'),'2027-10-31');assert.throws(()=>core.loanPlan(12.5,'2026-12'));assert.throws(()=>core.loanPlan(100,'2026-13'));
 const plan=core.loanPlan(100001,'2026-12');assert.equal(plan.length,12);assert.equal(plan.reduce((n,p)=>n+p.amountCents,0),100001);assert.equal(plan[11].month,'2027-11');assert.equal(core.dueBy(plan,'2026-11'),0);assert.equal(core.dueBy(plan,'2027-01'),plan[0].amountCents+plan[1].amountCents);
 const rules=core.defaultAgreementRules(),source={id:'synthetic',name:'Voorbeeld',memberClass:'B',units:['restaurant'],roles:[{key:'restaurant:constructor',group:'restaurant',roleId:'constructor',name:'Eigen rol'}]};
 assert.equal(typeof core.buildAgreement(source,rules).clauses.at(-1).text,'string');assert.throws(()=>core.parseRules({...rules,common:123},2));
});
test('loan principal and repayment are separate from profit advance and taxable deliveries',async()=>{
 const {buildDocument,documentText}=await import('../lib/bb-core.ts');
 const party={name:'Voorbeeld bedrijf',lines:[],kvk:'12345678',vatNumber:'NL000000000B00',kor:false,email:'test@example.invalid',company:true};
 const doc=buildDocument({party,entries:[{id:'loan',kind:'inkomenslening',amountCents:120000,meta:''},{id:'repayment',kind:'aflossing',amountCents:-10000,meta:''},{id:'advance',kind:'pot-week',amountCents:20000,meta:''}],withdrawCents:130000,balanceAfterCents:0,number:'BBU-voorbeeld',date:'2026-11-06',week:'voorbeeld'});
 assert.equal(doc.kind,'overzicht');assert.equal(doc.advanceCents,20000);assert.equal(doc.loanCents,120000);assert.equal(doc.repaymentCents,10000);assert.equal(doc.vatCents,0);assert.deepEqual(doc.deliveries,[]);assert.match(documentText(doc,{name:'Voorbeeld coöperatie',address:'',kvk:'',vatNumber:''}).body,/geen omzet of winstvoorschot/);
});
test('membership agreements, governance, supplier duties and income loans use existing member identities',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-contracts-'));process.env.APP_DATA_DIR=dir;process.env.DATABASE_URL='';process.env.SHEETS_CONFIG_KEY='ad'.repeat(32);process.env.APP_ORIGIN='http://localhost:3001';
 const {env,closeDatabase}=await import('../lib/portable/env.ts'),m=await import('../lib/members.ts'),a=await import('../lib/member-agreements.ts'),o=await import('../lib/overleg.ts'),loan=await import('../lib/income-loans.ts'),bb=await import('../lib/bb.ts'),shop=await import('../lib/member-shop.ts'),guest=await import('../lib/guest-store.ts');
 t.after(async()=>{await closeDatabase();fs.rmSync(dir,{recursive:true,force:true})});
 const ids={chef:randomUUID(),head:randomUUID(),supplier:randomUUID(),secondSupplier:randomUUID(),other:randomUUID()},at=new Date().toISOString(),today=core.dayOf();
 for(const [role,id] of Object.entries(ids))await env.DB.prepare('INSERT INTO coop_participants(id,name,email,member_class,units,pot_roles,created,updated) VALUES(?,?,?,?,?,?,?,?)').bind(id,'Voorbeeld '+role,role+'@example.invalid','B',JSON.stringify(role==='chef'||role==='head'?['restaurant']:role.toLowerCase().includes('supplier')?['levert']:['boerderij']),JSON.stringify(role==='chef'?{restaurant:['chef-kok']}:role==='head'?{restaurant:['hoofdbediening']}:{}),at,at).run();
 await env.DB.prepare('UPDATE coop_participants SET member_login_email=email').run();
 await env.DB.prepare("INSERT INTO pot_agreements(id,pot,valid_from,percent_bp,roles,tip_rule,note,required,status,proposed_by,proposed_at,decided_at,version) VALUES(?,'restaurant','2020-01-01',3000,?,'gelijk','',?,'geldig','test',?,?,1)").bind(randomUUID(),JSON.stringify([{id:'chef-kok',name:'Chef-kok',points:4},{id:'hoofdbediening',name:'Hoofdbediening',points:3},{id:'afwas',name:'Afwas',points:2}]),JSON.stringify([ids.chef,ids.head]),at,at).run();
 const fields=(roles={restaurant:['chef-kok']},units=['restaurant'])=>({memberClass:'B',memberSince:'2026-01-01',voting:'auto',phone:'',address:'',units,bloeiMemberId:'',potRoles:roles});
 let validId;
 await t.test('member save automatically creates a draft; unchanged responsibilities do not duplicate a contract',async()=>{
  await m.saveMember(ids.chef,1,fields(),'Eigenaar');let v=await a.memberAgreementView(ids.chef);assert.equal(v.contracts.length,2);assert.equal(v.versions.length,1);assert.equal(v.latest.status,'concept');assert.equal(v.latest.data.organisation,'Boer Bart-coöperatie');assert.equal(v.latest.data.source.roles[0].roleId,'chef-kok');assert.match(v.latest.text,/inkoop/);
  await m.saveMember(ids.chef,2,{...fields(),phone:'0612345678'},'Eigenaar');v=await a.memberAgreementView(ids.chef);assert.equal(v.versions.length,1,'contact edits are not new contracts');
 });
 await t.test('the existing group vote and exact personal acceptance are both needed; objections never silently change a contract',async()=>{
  let v=(await a.memberAgreementView(ids.chef)).latest;const original=v.text;await a.proposeMemberAgreement(v.id,v.revision,'Eigenaar');v=(await a.memberAgreementView(ids.chef)).latest;const pid=v.groups[0].proposalId;
  assert.equal((await o.memberView(ids.other)).open.some(p=>p.id===pid),false);assert.equal((await o.memberView(ids.head)).open.some(p=>p.id===pid),true);
  await assert.rejects(()=>a.acceptMemberAgreement(v.id,'wrong',ids.chef));await assert.rejects(()=>a.acceptMemberAgreement(v.id,v.hash,ids.other,{participantId:ids.other,email:'other@example.invalid',subject:'synthetic-other',provider:'google'}),/niet gevonden/);
  await a.acceptMemberAgreement(v.id,v.hash,ids.chef,{participantId:ids.chef,email:'chef@example.invalid',subject:'synthetic-chef',provider:'google'});assert.equal((await a.memberAgreementView(ids.chef)).current,null);
  const pr=(await o.overview()).proposals.find(p=>p.id===pid);await assert.rejects(()=>o.decide(pid,'vaststellen',pr.version,'Eigenaar'),/instemming/);
  const counter=await o.vote(ids.head,pid,{vote:'beter-voorstel',counter:'Graag expliciet de overdracht van de keuken vastleggen.'},'Voorbeeld hoofdbediening');assert.ok(counter.counterId);
  await o.runDeadlines(new Date(Date.now()+9*86400000));assert.equal((await a.memberAgreementView(ids.chef)).current,null);assert.equal((await a.memberAgreementView(ids.chef)).versions[0].text,original,'a counterproposal does not rewrite the signed personal text');
  const last=(await a.memberAgreementView(ids.chef)).latest;const nextId=await a.reviseMemberAgreement(last.id,last.revision,{...last.data,period:'kwartaal',reason:'Overdracht expliciet toegevoegd',extras:'De keuken draagt bijzonderheden schriftelijk over.'},'Voorbeeld chef',ids.chef);
  let next=(await a.memberAgreementView(ids.chef)).latest;assert.equal(next.id,nextId);assert.equal(next.sequence,2);assert.equal(next.status,'concept');await a.proposeMemberAgreement(next.id,next.revision,'Eigenaar');next=(await a.memberAgreementView(ids.chef)).latest;
  await a.acceptMemberAgreement(next.id,next.hash,ids.chef,{participantId:ids.chef,email:'chef@example.invalid',subject:'synthetic-chef',provider:'google'});const np=next.groups[0].proposalId;
  await o.vote(ids.chef,np,{vote:'akkoord'},'Voorbeeld chef');await o.vote(ids.head,np,{vote:'akkoord'},'Voorbeeld hoofd');const p=(await o.overview()).proposals.find(p=>p.id===np);await o.decide(np,'vaststellen',p.version,'Eigenaar');
  const current=(await a.memberAgreementView(ids.chef)).current;assert.equal(current.id,next.id);assert.equal(current.validUntil,core.endOfPeriod(current.validFrom,'kwartaal'));validId=current.id;
 });
 await t.test('multiple functions have independent contracts; only a signed and approved successor replaces its predecessor',async()=>{
  const before=(await a.memberAgreementView(ids.chef)).current;
  await m.saveMember(ids.chef,3,fields({restaurant:['chef-kok','afwas']},['restaurant','levert']),'Eigenaar');
  let view=await a.memberAgreementView(ids.chef);assert.equal(view.contracts.length,4,'membership, chef, dishes and supplier');
  const chef=view.contracts.find(c=>c.key==='restaurant:chef-kok'),dishes=view.contracts.find(c=>c.key==='restaurant:afwas'),supplier=view.contracts.find(c=>c.key==='winkel:leverancier');
  assert.equal(chef.current.id,validId);assert.equal(chef.current.text,before.text);assert.equal(chef.latest.id,validId,'adding another function does not rewrite the chef contract');
  assert.match(chef.latest.text,/30%/);assert.match(chef.latest.text,/4 punten/);assert.equal(supplier.latest.sequence,1);
  async function establish(v){await a.proposeMemberAgreement(v.id,v.revision,'Eigenaar');v=(await a.memberAgreementView(ids.chef)).contracts.find(c=>c.key===v.contractKey).latest;await a.acceptMemberAgreement(v.id,v.hash,ids.chef,{participantId:ids.chef,email:'chef@example.invalid',subject:'synthetic-chef',provider:'google'});for(const g of v.groups){const row=(await a.queryRows('SELECT voters FROM overleg_proposals WHERE id=?',g.proposalId))[0];for(const id of JSON.parse(row.voters))await o.vote(id,g.proposalId,{vote:'akkoord'},'Voorbeeld');const proposal=(await o.overview()).proposals.find(p=>p.id===g.proposalId);await o.decide(g.proposalId,'vaststellen',proposal.version,'Eigenaar')}return v.id}
  const dishesId=await establish(dishes.latest);
  const revisedId=await a.reviseMemberAgreement(chef.latest.id,chef.latest.revision,{...chef.latest.data,reason:'Heldere overdracht voor de keuken',extras:'De kok tekent de overdracht af.'},'Eigenaar');
  view=await a.memberAgreementView(ids.chef);const next=view.contracts.find(c=>c.key==='restaurant:chef-kok').latest;assert.equal(next.id,revisedId);assert.equal(view.contracts.find(c=>c.key==='restaurant:chef-kok').current.id,validId);
  await establish(next);view=await a.memberAgreementView(ids.chef);const currentChef=view.contracts.find(c=>c.key==='restaurant:chef-kok');assert.equal(currentChef.current.id,revisedId);assert.equal(currentChef.versions.find(v=>v.id===validId).status,'vervangen');assert.equal(currentChef.versions.find(v=>v.id===validId).replacedFrom,today);assert.equal(view.contracts.find(c=>c.key==='restaurant:afwas').current.id,dishesId,'a chef successor leaves dishes valid');
  await m.saveMember(ids.chef,4,fields({restaurant:['afwas']},['restaurant','levert']),'Eigenaar');view=await a.memberAgreementView(ids.chef);const ending=view.contracts.find(c=>c.key==='restaurant:chef-kok');assert.equal(ending.latest.data.source.ending,true);assert.equal(ending.current.id,revisedId,'removal prepares an end agreement without silently cancelling signed terms');await a.proposeMemberAgreement(ending.latest.id,ending.latest.revision,'Eigenaar');view=await a.memberAgreementView(ids.chef);assert.deepEqual(view.contracts.find(c=>c.key==='restaurant:chef-kok').latest.groups.map(g=>g.group),['restaurant']);assert.equal((await a.queryRows('SELECT id FROM coop_participants')).length,5);
 });
 await t.test('a nearing period end makes one continuation draft; no silent renewal or revival of replaced terms',async()=>{
  const old=(await a.memberAgreementView(ids.other)).latest;
  await env.DB.prepare("UPDATE member_agreements SET status='geldig',valid_from=?,valid_until=? WHERE id=?").bind(core.previousDay(today),today,old.id).run();
  let view=await a.memberAgreementView(ids.other);assert.equal(view.current.id,old.id);assert.equal(view.latest.sequence,2);assert.equal(view.latest.status,'concept');assert.equal(view.latest.data.requestedFrom,new Date(Date.parse(today+'T12:00:00Z')+86400000).toISOString().slice(0,10));
  view=await a.memberAgreementView(ids.other);assert.equal(view.versions.length,2,'reading twice never duplicates the continuation');
  await env.DB.prepare("UPDATE member_agreements SET status='geldig',valid_from=?,valid_until=? WHERE id=?").bind(today,core.endOfPeriod(today,'maand'),view.latest.id).run();
  view=await a.memberAgreementView(ids.other);assert.equal(view.current.sequence,2);assert.equal(view.versions.find(v=>v.id===old.id).status,'vervangen');
  await env.DB.prepare('UPDATE coop_participants SET active=0 WHERE id=?').bind(ids.other).run();view=await a.memberAgreementView(ids.other);assert.equal(view.current,null);assert.equal(view.versions.length,2,'stopped members keep originals without renewing');
 });
 let loanId;
 await t.test('only income support; the borrower accepts the plan, an owner approves, and principal is not income or its own repayment',async()=>{
  const first=core.addMonths(today.slice(0,7)+'-01',1).slice(0,7),body={amountCents:120001,firstMonth:first,purpose:'inkomen',incomeOnly:true,consent:true};
  await assert.rejects(()=>loan.requestIncomeLoan(ids.supplier,{...body,purpose:'auto'}),/uitsluitend/);
  loanId=await loan.requestIncomeLoan(ids.supplier,body);await assert.rejects(()=>loan.requestIncomeLoan(ids.supplier,body),/al een aanvraag/);await assert.rejects(()=>loan.decideIncomeLoan(loanId,{action:'goedkeuren',incomeVerified:false},'Eigenaar'));
  await loan.decideIncomeLoan(loanId,{action:'goedkeuren',incomeVerified:true},'Eigenaar');await assert.rejects(()=>loan.decideIncomeLoan(loanId,{action:'goedkeuren',incomeVerified:true},'Eigenaar'),/al beoordeeld/);
  const list=(await loan.memberLoans(ids.supplier)).loans;assert.equal(list[0].amountCents,120001);assert.equal(list[0].paidCents,0);assert.equal(list[0].remainingCents,120001);assert.equal(list[0].interest,0);assert.equal((await bb.memberBb(ids.supplier)).balanceCents,120001);
 });
 await t.test('future earned BB is withheld exactly once, only up to the monthly plan and without touching a held bank payout',async()=>{
  // Arrange an older approved loan whose first instalment falls in the current month.
  const plan=core.loanPlan(120001,today.slice(0,7));await env.DB.prepare('UPDATE bloei_income_loans SET first_month=?,plan=? WHERE id=?').bind(today.slice(0,7),JSON.stringify(plan),loanId).run();
  const heldId=randomUUID();await env.DB.prepare("INSERT INTO bb_payouts(id,participant_id,amount_cents,iban_sealed,iban_last4,holder,status,requested_at,note) VALUES(?,?,120001,'test','0000','Voorbeeld','aangevraagd',?,'test')").bind(heldId,ids.supplier,at).run();
  const earn=(source,amount)=>({participantId:ids.supplier,day:today,kind:'winkel-week',amountCents:amount,source,note:'Fictieve productinkomsten'});
  await Promise.all([bb.credit([earn('synthetic-income-1',7000)],'test'),bb.credit([earn('synthetic-income-2',7000)],'test')]);const info=(await loan.memberLoans(ids.supplier)).loans[0];assert.equal(info.paidCents,plan[0].amountCents);assert.equal((await bb.memberBb(ids.supplier)).balanceCents,120001+14000-plan[0].amountCents);
  await bb.credit([earn('synthetic-income-1',7000)],'test');assert.equal((await loan.memberLoans(ids.supplier)).loans[0].paidCents,plan[0].amountCents,'same week never deducted twice');
  const repayments=await a.queryRows('SELECT bb_entry_id FROM bloei_loan_repayments WHERE loan_id=?',loanId);assert.ok(repayments.every(r=>r.bb_entry_id));
 });
 await t.test('stopping never forgives debt; bank repayments and an agreed exit plan do not deduct BB twice',async()=>{
  await env.DB.prepare('UPDATE coop_participants SET active=0 WHERE id=?').bind(ids.supplier).run();const before=(await loan.memberLoans(ids.supplier)).loans[0],bbBefore=(await bb.memberBb(ids.supplier)).balanceCents;
  await loan.recordLoanBankRepayment(loanId,{amountCents:1000,reference:'synthetic-bank-1',verified:true},'Eigenaar');assert.equal((await bb.memberBb(ids.supplier)).balanceCents,bbBefore);await assert.rejects(()=>loan.recordLoanBankRepayment(loanId,{amountCents:1000,reference:'synthetic-bank-1',verified:true},'Eigenaar'),/al verwerkt/);
  const next=core.addMonths(today.slice(0,7)+'-01',1).slice(0,7);await loan.proposeExitPlan(ids.supplier,loanId,{firstMonth:next,consent:true});await loan.approveExitPlan(loanId,'Eigenaar');const after=(await loan.memberLoans(ids.supplier)).loans[0];assert.equal(after.remainingCents,before.remainingCents-1000);assert.equal(after.exitPlan.plan.length,12);assert.equal(after.exitPlan.plan.reduce((n,p)=>n+p.amountCents,0),after.remainingCents);assert.equal(after.exitPlan.status,'goedgekeurd');
 });
 await t.test('supplier shifts use central shop hours, are offered instead of withdrawn, and closure cancels them permanently',async()=>{
  const g=await guest.loadGuest();g.state.services={...g.state.services,winkel:true};g.state.hours=g.state.hours.map(()=>({open:true,from:'10:00',to:'18:00'}));await guest.saveGuest(g.version,g.state,randomUUID());
  await assert.rejects(()=>shop.shopRoster(ids.head),/leveranciers/);const from=core.addMonths(today,0),day=new Date(Date.parse(from+'T12:00:00Z')+3*86400000).toISOString().slice(0,10);
  const results=await Promise.allSettled([shop.changeShopShift(ids.chef,{action:'claim',day,part:'ochtend'},'chef'),shop.changeShopShift(ids.secondSupplier,{action:'claim',day,part:'ochtend'},'supplier')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const row=(await a.queryRows('SELECT * FROM member_shop_shifts WHERE day=? AND part=?',day,'ochtend'))[0],winner=row.participant_id,taker=winner===ids.chef?ids.secondSupplier:ids.chef;
  await assert.rejects(()=>shop.changeShopShift(winner,{action:'teruggeven',day,part:'ochtend'},'test'),/blijft/);await shop.changeShopShift(winner,{action:'aanbieden',day,part:'ochtend'},'test');assert.equal((await a.queryRows('SELECT participant_id FROM member_shop_shifts WHERE day=?',day))[0].participant_id,winner);
  await shop.changeShopShift(taker,{action:'overnemen',day,part:'ochtend'},'test');assert.equal((await a.queryRows('SELECT participant_id FROM member_shop_shifts WHERE day=?',day))[0].participant_id,taker);
  // Beheer vanuit de personeelsplanning (wens eigenaar 7 november 2026): inplannen, vervangen en vrijgeven; alleen leveranciers.
  await shop.planShopShift({day,part:'middag',participantId:ids.secondSupplier},'eigenaar');assert.equal((await shop.shopRoster()).days.find(d=>d.day===day).slots[1].participantId,ids.secondSupplier);
  await shop.planShopShift({day,part:'middag',participantId:ids.chef},'eigenaar');assert.equal((await shop.shopRoster()).days.find(d=>d.day===day).slots[1].participantId,ids.chef,'beheer kan iemand anders zetten');
  await assert.rejects(()=>shop.planShopShift({day,part:'middag',participantId:ids.head},'eigenaar'),/leveren/);
  await assert.rejects(()=>shop.planShopShift({day:'2020-01-01',part:'middag',participantId:ids.chef},'eigenaar'),/toekomstig/);
  await shop.planShopShift({day,part:'middag',participantId:null},'eigenaar');const freed=await shop.shopRoster(ids.chef);assert.equal(freed.days.find(d=>d.day===day).slots[1].participantId,null);
  assert.equal(freed.cancelled.some(c=>c.day===day&&c.part==='middag'),false,'vrijgeven is geen „vervallen wegens gesloten winkel”');
  const closed=await guest.loadGuest();closed.state.exceptions.push({date:day,hours:{open:false,from:'10:00',to:'18:00'},note:'Fictieve sluiting'});await guest.saveGuest(closed.version,closed.state,randomUUID());assert.ok((await a.queryRows('SELECT cancelled FROM member_shop_shifts WHERE day=?',day))[0].cancelled);
  const reopened=await guest.loadGuest();reopened.state.exceptions=reopened.state.exceptions.filter(e=>e.date!==day);await guest.saveGuest(reopened.version,reopened.state,randomUUID());const roster=await shop.shopRoster(taker);assert.equal(roster.days.find(d=>d.day===day).slots[0].participantId,null,'no silent revival when reopened');
  await shop.changeShopShift(taker,{action:'claim',day,part:'ochtend'},'Test');const paused=await guest.loadGuest();paused.state.servicePauses={winkel:{from:day,to:day}};await guest.saveGuest(paused.version,paused.state,randomUUID());assert.equal((await shop.shopRoster(taker)).days.find(d=>d.day===day).open,false,'the newly merged central closure period also cancels shop duties');
 });
 await t.test('a Foundation bondholder is not automatically a cooperative member or contract party',async()=>{
  const id=randomUUID();await env.DB.prepare('INSERT INTO coop_participants(id,name,email,bloei_member_id,created,updated) VALUES(?,?,?,?,?,?)').bind(id,'Obligatiehouder Voorbeeld','bond@example.invalid','foundation-example',at,at).run();
  assert.equal(await a.syncMemberAgreement(id,'Test'),null);assert.equal((await a.memberAgreementView(id)).latest,null);assert.equal((await a.agreementOverview()).members.some(m=>m.id===id),false);
 });
 await t.test('stopping retires a pending signature; restarting needs a fresh version and approval',async()=>{
  let v=(await a.memberAgreementView(ids.head)).latest;await a.proposeMemberAgreement(v.id,v.revision,'Test');await env.DB.prepare('UPDATE coop_participants SET active=0 WHERE id=?').bind(ids.head).run();
  await a.syncMemberAgreement(ids.head,'Test');v=(await a.memberAgreementView(ids.head)).latest;assert.equal(v.status,'ingetrokken');assert.equal(v.acceptedAt,null);
  await env.DB.prepare('UPDATE coop_participants SET active=1 WHERE id=?').bind(ids.head).run();const fresh=(await a.memberAgreementView(ids.head)).latest;assert.equal(fresh.status,'concept');assert.notEqual(fresh.id,v.id);assert.equal(fresh.acceptedAt,null);
 });

});

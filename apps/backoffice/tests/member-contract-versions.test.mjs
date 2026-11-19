import './helpers/ts-resolve.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

test('published templates, immutable financial appendices and iterative assistant proposals',{timeout:90000},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-function-versions-'));process.env.APP_DATA_DIR=dir;process.env.DATABASE_URL='';process.env.SHEETS_CONFIG_KEY='ab'.repeat(32);process.env.APP_ORIGIN='http://localhost:3001';
 const {env,closeDatabase}=await import('../lib/portable/env.ts'),a=await import('../lib/member-agreements.ts'),m=await import('../lib/members.ts'),o=await import('../lib/overleg.ts'),{runTool}=await import('../lib/hulp-tools.ts'),h=await import('../lib/hulp-store.ts');
 t.after(async()=>{await closeDatabase();fs.rmSync(dir,{recursive:true,force:true})});
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date()),at=new Date().toISOString(),chef=randomUUID(),head=randomUUID(),newcomer=randomUUID(),after=randomUUID();
 const roles=[{id:'chef-kok',name:'Chef-kok',points:4},{id:'afwas',name:'Afwas',points:2},{id:'hoofdbediening',name:'Hoofdbediening',points:3}];
 await env.DB.prepare("INSERT INTO pot_agreements(id,pot,valid_from,percent_bp,roles,status,proposed_at) VALUES(?,'restaurant','2020-01-01',3000,?,'geldig',?)").bind(randomUUID(),JSON.stringify(roles),at).run();
 async function add(id,name,keys){await env.DB.prepare('INSERT INTO coop_participants(id,name,email,created,updated) VALUES(?,?,?,?,?)').bind(id,name,id+'@example.invalid',at,at).run();await m.saveMember(id,1,{memberClass:'B',memberSince:today,voting:'auto',phone:'',address:'',units:['restaurant'],bloeiMemberId:'',potRoles:{restaurant:keys}},'Eigenaar')}
 await add(chef,'Chef Voorbeeld',['chef-kok','afwas']);await add(head,'Hoofd Voorbeeld',['hoofdbediening']);
 const contract=async(id,key)=>(await a.memberAgreementView(id)).contracts.find(c=>c.key===key);
 async function groupApprove(groups,from){for(const group of groups){const p=(await a.queryRows('SELECT voters,version FROM overleg_proposals WHERE id=?',group.proposalId))[0];for(const id of JSON.parse(p.voters))await o.vote(id,group.proposalId,{vote:'akkoord'},'Fictief lid');const fresh=(await a.queryRows('SELECT version FROM overleg_proposals WHERE id=?',group.proposalId))[0];await o.decide(group.proposalId,'vaststellen',fresh.version,'Eigenaar',from)}}
 async function signFunction(id,key){let v=(await contract(id,key)).latest;await a.proposeMemberAgreement(v.id,v.revision,'Eigenaar');v=(await contract(id,key)).latest;await a.acceptMemberAgreement(v.id,v.hash,id,{participantId:id,email:id+'@example.invalid',subject:'synthetic-'+id,provider:'google'});await groupApprove(v.groups);return (await contract(id,key)).current}
 let publishedText;
 await t.test('a proposed template never becomes the default before group approval',async()=>{
  const initial=await a.agreementRules(),before=(await contract(chef,'restaurant:chef-kok')).latest;
  publishedText=initial.rules.roles['chef-kok']+' De dagstart wordt samen kort doorgenomen.';
  const draft=await a.saveAgreementRules({...initial.rules,roles:{...initial.rules.roles,'restaurant:chef-kok':publishedText}},initial.version,'Eigenaar');
  assert.equal((await a.agreementRules()).rules.revision,1);assert.equal((await contract(chef,'restaurant:chef-kok')).latest.id,before.id);
  await add(newcomer,'Nieuw Voorbeeld',['chef-kok']);assert.equal((await contract(newcomer,'restaurant:chef-kok')).latest.data.rulesRevision,1);assert.doesNotMatch((await contract(newcomer,'restaurant:chef-kok')).latest.text,/dagstart wordt samen/);
  const proposal=await a.agreementRules();await a.proposeAgreementRules(draft,proposal.ruleDraft.version,'Eigenaar');const pending=(await a.agreementRules()).ruleDraft;
  const p=(await a.queryRows('SELECT version FROM overleg_proposals WHERE id=?',pending.groups[0].proposalId))[0];await assert.rejects(()=>o.decide(pending.groups[0].proposalId,'vaststellen',p.version,'Eigenaar'),/instemming/);
  await groupApprove(pending.groups);assert.equal((await a.agreementRules()).rules.revision,2);assert.equal((await a.agreementRules()).ruleDraft,null);
  await add(after,'Nieuwste Voorbeeld',['chef-kok']);const latest=(await contract(after,'restaurant:chef-kok')).latest;assert.equal(latest.data.rulesRevision,2);assert.match(latest.text,/dagstart wordt samen/);
 });
 await t.test('approved percentages and all role points are frozen in the appendix; only relevant decisions create a new proposal',async()=>{
  const chief=await signFunction(chef,'restaurant:chef-kok'),dishes=await signFunction(chef,'restaurant:afwas'),base=(await contract(chef,'lidmaatschap')).latest;
  assert.match(chief.text,/30%/);assert.match(chief.text,/4 punten/);assert.match(chief.text,/Afwas: 2 punten/);
  await o.saveMeeting({date:today,title:'Gewoon overleg',pot:'restaurant',attendees:['Chef Voorbeeld'],agenda:'Overdracht',notes:'Alleen besproken; nog geen nieuw besluit.'},'Eigenaar');assert.equal((await contract(chef,'restaurant:chef-kok')).latest.id,chief.id);
  const nextRoles=roles.map(r=>r.id==='chef-kok'?{...r,points:5}:r);
  await env.DB.prepare("INSERT INTO pot_agreements(id,pot,valid_from,percent_bp,roles,status,proposed_at) VALUES(?,'restaurant',?,3500,?,'geldig',?)").bind(randomUUID(),today,JSON.stringify(nextRoles),at).run();
  const updated=await contract(chef,'restaurant:chef-kok');assert.equal(updated.current.id,chief.id);assert.equal(updated.current.text,chief.text);assert.equal(updated.latest.status,'concept');assert.match(updated.latest.text,/35%/);assert.match(updated.latest.text,/5 punten/);assert.equal((await contract(chef,'restaurant:afwas')).current.id,dishes.id);assert.equal((await contract(chef,'lidmaatschap')).latest.id,base.id);
 });
 await t.test('the assistant listens to a revision request, creates only a concept and re-reads the next version',async()=>{
  const thread=randomUUID();await h.startHulpThread(thread,'test-owner','/leden/afspraken','Maak de overdracht concreter.');let actionId;
  const ctx={today,members:async()=>[{id:chef,name:'Chef Voorbeeld',email:'chef@example.invalid',active:true,memberClass:'B',phone:'',address:'',memberSince:today,units:['restaurant'],potRoles:{restaurant:['chef-kok','afwas']}}],contracts:a.assistantContractsView,propose:async action=>{const saved=await h.saveAction(thread,action);actionId=saved.id;return saved}};
  let c=(await a.assistantContractsView(chef)).contracts.find(c=>c.key==='restaurant:chef-kok');const before=c.id;
  const write=async(text,goal='dit_contract')=>runTool('contract_tekstvoorstel',{lid_id:chef,contract_id:c.id,basis_hash:c.hash,doel:goal,roltekst:text,aanvullingen:null,protocollen:null,reden:'Verbetering uit het gesprek: duidelijke keukenoverdracht.'},ctx);
  assert.equal((await write('De chef legt na elke dienst de open keukenpunten vast.')).isError,false);assert.equal((await contract(chef,'restaurant:chef-kok')).latest.id,before,'proposing alone writes no contract');
  const result=await h.decideAction({id:actionId,threadId:thread,requestId:randomUUID(),account:'test-owner',decision:'uitvoeren',origin:'http://localhost:3001'});assert.equal(result.status,'uitgevoerd',result.result);
  let revised=(await contract(chef,'restaurant:chef-kok')).latest;assert.notEqual(revised.id,before);assert.equal(revised.status,'concept');assert.match(revised.text,/open keukenpunten/);assert.match(revised.text,/35%/);assert.match(revised.text,/5 punten/);assert.equal(revised.acceptedAt,null);
  c=(await a.assistantContractsView(chef)).contracts.find(c=>c.key==='restaurant:chef-kok');assert.equal(c.id,revised.id);assert.equal((await write('De chef legt open keukenpunten vast en bespreekt ze met de opvolger.')).isError,false);
  const second=await h.decideAction({id:actionId,threadId:thread,requestId:randomUUID(),account:'test-owner',decision:'uitvoeren',origin:'http://localhost:3001'});assert.equal(second.status,'uitgevoerd',second.result);revised=(await contract(chef,'restaurant:chef-kok')).latest;assert.match(revised.text,/bespreekt ze met de opvolger/);assert.equal(revised.status,'concept');
  const projection=JSON.stringify(await a.assistantContractsView(chef));assert.doesNotMatch(projection,/iban|subject|acceptedAt|signature|balanceCents/i);
 });
 await t.test('an assistant template improvement also stays a proposal for future members',async()=>{
  const c=(await a.assistantContractsView(chef)).contracts.find(c=>c.key==='restaurant:chef-kok'),rules=await a.agreementRules();
  await a.draftTemplateFromAgreement(c.id,c.hash,rules.version,'Nieuwe algemene functietekst voor chefs.', 'Eigenaar');assert.equal((await a.agreementRules()).rules.revision,2);assert.equal((await a.agreementRules()).ruleDraft.status,'concept');assert.match((await a.agreementRules()).ruleDraft.rules.roles['restaurant:chef-kok'],/Nieuwe algemene/);
 });
 await t.test('adding or transferring pot management maintains the right member contracts automatically',async()=>{
  const funds=await import('../lib/unit-funds.ts'),id=await funds.createFund({name:'Fictieve tuinpot',managerId:chef,shareBp:200},'Eigenaar');
  const first=(await a.queryRows('SELECT data,status FROM member_agreements WHERE participant_id=? AND contract_key=?',chef,'potbeheer:'+id))[0];assert.equal(first.status,'concept');assert.match(JSON.parse(first.data).source.business.lines[0],/2%/);
  await funds.updateFund(id,1,{managerId:head},'Eigenaar');const previous=(await a.queryRows('SELECT status FROM member_agreements WHERE participant_id=? AND contract_key=?',chef,'potbeheer:'+id))[0];assert.equal(previous.status,'ingetrokken','an unsigned draft needs no termination contract');assert.ok((await a.queryRows('SELECT id FROM member_agreements WHERE participant_id=? AND contract_key=?',head,'potbeheer:'+id)).length);
 });

 await t.test('a later draft cannot cancel an approved template with a future starting date',async()=>{
  let current=await a.agreementRules();const id=await a.saveAgreementRules({...current.rules,roles:{...current.rules.roles,'restaurant:chef-kok':'De vastgestelde toekomstige functietekst.'}},current.version,'Eigenaar');current=await a.agreementRules();const approvedVersion=current.ruleDraft.version;await a.proposeAgreementRules(id,approvedVersion,'Eigenaar');const pending=(await a.agreementRules()).ruleDraft,future=new Date(Date.parse(today+'T12:00:00Z')+2*86400000).toISOString().slice(0,10);await groupApprove(pending.groups,future);assert.equal((await a.agreementRules()).rules.revision,2);
  current=await a.agreementRules();await a.saveAgreementRules({...current.ruleDraft.rules,roles:{...current.ruleDraft.rules.roles,'restaurant:chef-kok':'Een nog niet goedgekeurd volgend idee.'}},current.version,'Eigenaar');assert.equal((await a.queryRows('SELECT status FROM member_agreement_rule_versions WHERE id=?',id))[0].status,'voorgesteld');
  for(const g of pending.groups)await env.DB.prepare('UPDATE overleg_proposals SET valid_from=? WHERE id=?').bind(today,g.proposalId).run();await a.reconcileMemberAgreements();current=await a.agreementRules();assert.equal(current.rules.revision,approvedVersion);assert.equal(current.rules.roles['restaurant:chef-kok'],'De vastgestelde toekomstige functietekst.');assert.equal(current.ruleDraft.status,'concept');
 });
 await t.test('earlier combined contracts keep their signed content until scoped successors are in force',async()=>{
  const core=await import('../lib/member-agreement-core.ts'),id=randomUUID(),oldId=randomUUID(),rules=(await a.agreementRules()).rules;
  await env.DB.prepare('INSERT INTO coop_participants(id,name,email,member_login_email,member_class,units,pot_roles,created,updated) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,'Eerder Voorbeeld',id+'@example.invalid',id+'@example.invalid','B','["restaurant"]','{"restaurant":["chef-kok","afwas"]}',at,at).run();const source=await a.memberSource(id),data=core.buildAgreement(source,rules);delete data.contractKey;delete data.contractName;const hash=core.signature(data),text=core.agreementText(data);
  await env.DB.prepare("INSERT INTO member_agreements(id,participant_id,sequence,data,hash,source_hash,status,valid_from,valid_until,created,created_by) VALUES(?,?,1,?,?,?,'geldig',?,?,?,'Fictieve eerdere proef')").bind(oldId,id,JSON.stringify(data),hash,data.sourceHash,today,core.endOfPeriod(today,'jaar'),at).run();let view=await a.memberAgreementView(id);assert.equal(view.contracts.find(c=>c.key==='legacy').current.hash,hash);await signFunction(id,'restaurant:chef-kok');view=await a.memberAgreementView(id);assert.equal(view.contracts.find(c=>c.key==='legacy').current.id,oldId);
  await signFunction(id,'restaurant:afwas');await signFunction(id,'lidmaatschap');view=await a.memberAgreementView(id);const old=view.contracts.find(c=>c.key==='legacy').latest;assert.equal(old.status,'vervangen');assert.equal(old.hash,hash);assert.equal(old.text,text);assert.equal(old.replacedFrom,today);
 });

});

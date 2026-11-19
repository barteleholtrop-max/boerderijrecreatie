import './helpers/ts-resolve.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

test('new roles have independent contract preparations, guided assistant drafts and approved defaults',{timeout:90000},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-role-contracts-'));process.env.APP_DATA_DIR=dir;process.env.DATABASE_URL='';process.env.SHEETS_CONFIG_KEY='ab'.repeat(32);process.env.APP_ORIGIN='http://localhost:3001';
 const {env,closeDatabase}=await import('../lib/portable/env.ts'),roles=await import('../lib/pot-roles.ts'),rc=await import('../lib/role-contracts.ts'),a=await import('../lib/member-agreements.ts'),m=await import('../lib/members.ts'),o=await import('../lib/overleg.ts'),h=await import('../lib/hulp-store.ts'),{runTool}=await import('../lib/hulp-tools.ts');
 t.after(async()=>{await closeDatabase();fs.rmSync(dir,{recursive:true,force:true})});
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date()),at=new Date().toISOString(),chef=randomUUID(),head=randomUUID();
 await env.DB.prepare("INSERT INTO pot_agreements(id,pot,valid_from,percent_bp,roles,status,proposed_at) VALUES(?,'restaurant','2020-01-01',3000,?,'geldig',?)").bind(randomUUID(),JSON.stringify([{id:'chef-kok',name:'Chef-kok',points:4},{id:'hoofdbediening',name:'Hoofdbediening',points:3}]),at).run();
 async function member(id,name,keys){const existing=await env.DB.prepare('SELECT id FROM coop_participants WHERE id=?').bind(id).first();if(!existing)await env.DB.prepare('INSERT INTO coop_participants(id,name,email,created,updated) VALUES(?,?,?,?,?)').bind(id,name,id+'@example.invalid',at,at).run();const version=(await m.memberCards()).members.find(x=>x.id===id).version;await m.saveMember(id,version,{memberClass:'B',memberSince:today,voting:'auto',phone:'',address:'',units:['restaurant'],bloeiMemberId:'',potRoles:{restaurant:keys}},'Eigenaar')}
 await member(chef,'Chef Voorbeeld',['chef-kok']);await member(head,'Hoofd Voorbeeld',['hoofdbediening']);
 const originalChef=(await a.memberAgreementView(chef)).latest.id;let roleId,initialHash,proposedAction,actionId;
 await t.test('adding a new role creates a stored concept before anyone is assigned, without publishing a template',async()=>{
  roleId=await roles.addRole('restaurant',{name:'Veiligheidscoördinator',kind:'dag'},'Eigenaar');
  const row=await env.DB.prepare('SELECT contract_draft FROM pot_roles WHERE pot=? AND id=?').bind('restaurant',roleId).first();assert.equal(JSON.parse(row.contract_draft).version,1);
  const view=await rc.roleContractView('restaurant',roleId);initialHash=view.hash;assert.equal(view.needsDetails,true);assert.equal(view.status,'concept');assert.equal(view.questions.length,6);assert.match(view.base.clauses.find(c=>c.key==='financien').text,/maandag/i);assert.match(view.base.business.lines[0],/30%/);
  assert.equal((await a.agreementRules()).ruleDraft,null);assert.equal((await a.agreementRules()).rules.revision,1);assert.equal((await a.queryRows('SELECT id FROM member_agreements WHERE contract_key=?','restaurant:'+roleId)).length,0);
 });
 await t.test('assigning the role immediately adds a named personal concept while other function contracts stay unchanged',async()=>{
  await member(chef,'Chef Voorbeeld',['chef-kok',roleId]);const rows=await a.queryRows('SELECT data,status FROM member_agreements WHERE participant_id=? AND contract_key=?',chef,'restaurant:'+roleId);assert.equal(rows.length,1);assert.equal(rows[0].status,'concept');assert.equal(JSON.parse(rows[0].data).requiresRoleDetails,true);assert.match(JSON.parse(rows[0].data).contractName,/Veiligheidscoördinator/);
  const v=(await a.memberAgreementView(chef)).contracts.find(c=>c.key==='restaurant:'+roleId).latest;await assert.rejects(()=>a.proposeMemberAgreement(v.id,v.revision,'Eigenaar'),/concrete verantwoordelijkheden/);assert.equal((await a.memberAgreementView(chef)).contracts.find(c=>c.key==='restaurant:chef-kok').latest.id,originalChef);
 });
 const thread=randomUUID();await h.startHulpThread(thread,'test-owner','/leden/rollen','Werk de veiligheidsrol uit; vraag eerst naar verantwoordelijkheden.');
 const ctx={roleContract:rc.roleContractView,propose:async action=>{proposedAction=action;const saved=await h.saveAction(thread,action);actionId=saved.id;return saved}};
 const input=()=>({pot:'restaurant',rol_id:roleId,basis_hash:initialHash,roltekst:'Controleert de looproutes bij opening, meldt gebreken aan de hoofdbediening en draagt de controlelijst over. Beslist binnen de bestaande veiligheidsprotocollen; extra bevoegdheden vragen overleg.',periode:'kwartaal',protocollen:'Bestaande veiligheidscontrole en sluitingslijst.',reden:'Taken, beslisruimte en overdracht besproken met de groep.'});
 await t.test('the assistant reads the actual basis, proposes text and changes nothing until Uitvoeren',async()=>{
  const read=await runTool('rolcontract_bekijken',{pot:'restaurant',rol_id:roleId},ctx);assert.equal(read.isError,false);assert.match(read.content,/twaalf maanden/);assert.doesNotMatch(read.content,/subject|acceptedAt|iban|balanceCents/);
  assert.equal((await runTool('rolcontract_voorstel',{...input(),percent_bp:9900},ctx)).isError,true,'financial inputs are not accepted');
  assert.equal((await runTool('rolcontract_voorstel',input(),ctx)).isError,false);assert.equal((await rc.roleContractView('restaurant',roleId)).draft.version,1);
  const result=await h.decideAction({id:actionId,threadId:thread,requestId:randomUUID(),account:'test-owner',decision:'uitvoeren',origin:'http://localhost:3001'});assert.equal(result.status,'uitgevoerd',result.result);const view=await rc.roleContractView('restaurant',roleId);assert.equal(view.draft.version,2);assert.equal(view.draft.period,'kwartaal');assert.match(view.draft.roleText,/looproutes/);assert.equal((await a.agreementRules()).ruleDraft,null);
 });
 await t.test('feedback builds on the latest draft; stale proposals and changed basis are rejected',async()=>{
  assert.equal((await runTool('rolcontract_voorstel',input(),ctx)).isError,true);const current=await rc.roleContractView('restaurant',roleId);initialHash=current.hash;
  assert.equal((await runTool('rolcontract_voorstel',{...input(),roltekst:input().roltekst+' Bespreekt open punten met de volgende verantwoordelijke.'},ctx)).isError,false);
  await rc.saveRoleContract('restaurant',roleId,current.hash,{...current.draft,reason:'Collega verduidelijkt de taak.'},'Collega');const refused=await h.decideAction({id:actionId,threadId:thread,requestId:randomUUID(),account:'test-owner',decision:'uitvoeren',origin:'http://localhost:3001'});assert.equal(refused.status,'mislukt');assert.match(refused.result,/gewijzigd/);
  initialHash=(await rc.roleContractView('restaurant',roleId)).hash;assert.equal((await runTool('rolcontract_voorstel',{...input(),roltekst:input().roltekst+' Bespreekt open punten met de volgende verantwoordelijke.'},ctx)).isError,false);assert.equal((await h.decideAction({id:actionId,threadId:thread,requestId:randomUUID(),account:'test-owner',decision:'uitvoeren',origin:'http://localhost:3001'})).status,'uitgevoerd');
 });
 await t.test('the correct group approves the role template; existing numbers are unchanged',async()=>{
  let view=await rc.roleContractView('restaurant',roleId);await rc.proposeRoleContract('restaurant',roleId,view.hash,'Eigenaar');const state=await a.agreementRules();assert.equal(state.rules.revision,1);assert.equal(state.ruleDraft.status,'voorgesteld');assert.deepEqual(state.ruleDraft.groups.map(g=>g.group),['restaurant']);
  const before=randomUUID();await member(before,'Voor Goedkeuring',[roleId]);assert.equal((await a.memberAgreementView(before)).latest.data.requiresRoleDetails,true);
  for(const group of state.ruleDraft.groups){const p=(await a.queryRows('SELECT voters FROM overleg_proposals WHERE id=?',group.proposalId))[0];for(const id of JSON.parse(p.voters))await o.vote(id,group.proposalId,{vote:'akkoord'},'Lid');const fresh=(await a.queryRows('SELECT version FROM overleg_proposals WHERE id=?',group.proposalId))[0];await o.decide(group.proposalId,'vaststellen',fresh.version,'Eigenaar')}
  await a.reconcileMemberAgreements();assert.equal((await a.agreementRules()).rules.revision,2);view=await rc.roleContractView('restaurant',roleId);assert.equal(view.status,'vastgesteld');
  const newer=(await a.memberAgreementView(before)).latest;assert.equal(newer.data.period,'kwartaal');assert.equal(newer.data.protocols,input().protocollen);assert.equal(!!newer.data.requiresRoleDetails,false);assert.match(newer.text,/volgende verantwoordelijke/);
  const after=randomUUID();await member(after,'Na Goedkeuring',[roleId]);const v=(await a.memberAgreementView(after)).latest;assert.equal(v.data.period,'kwartaal');assert.equal(v.data.rulesRevision,2);assert.match(v.text,/looproutes/);assert.match(v.text,/30%/);assert.match(v.text,/nog geen punten/);assert.equal((await a.memberAgreementView(chef)).contracts.find(c=>c.key==='restaurant:chef-kok').latest.id,originalChef);
  assert.equal((await a.queryRows('SELECT percent_bp FROM pot_agreements'))[0].percent_bp,3000);assert.equal((await a.queryRows('SELECT id FROM bb_entries')).length,0);
 });
 await t.test('another role never cancels an existing template proposal and renaming keeps contract identity',async()=>{
  const current=await a.agreementRules(),other=await a.saveAgreementRules({...current.rules,common:current.rules.common+' Samen zorgvuldig werken.'},current.version,'Eigenaar');
  const second=await roles.addRole('restaurant',{name:'Tuincontact',kind:'week'},'Eigenaar');let view=await rc.roleContractView('restaurant',second);await rc.saveRoleContract('restaurant',second,view.hash,{roleText:'Stemt het tuinonderhoud en de overdracht af.',period:'jaar',protocols:'Bestaande overdracht.',reason:'Taken besproken.'},'Eigenaar');view=await rc.roleContractView('restaurant',second);
  await assert.rejects(()=>rc.proposeRoleContract('restaurant',second,view.hash,'Eigenaar'),/al een basistekstvoorstel/);assert.equal((await a.agreementRules()).ruleDraft.id,other);
  const prior=(await a.memberAgreementView(chef)).contracts.find(c=>c.key==='restaurant:'+roleId).latest;await roles.updateRole('restaurant',roleId,{name:'Veiligheid en overdracht'},'Eigenaar');const renamed=(await a.memberAgreementView(chef)).contracts.find(c=>c.key==='restaurant:'+roleId).latest;assert.notEqual(renamed.id,prior.id);assert.match(renamed.data.contractName,/Veiligheid en overdracht/);assert.equal((await a.queryRows('SELECT hash FROM member_agreements WHERE id=?',prior.id))[0].hash,prior.hash);
  assert.equal(proposedAction.type,'rolcontract_voorstel');
 });
});

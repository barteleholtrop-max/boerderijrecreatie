import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {memberCookie} from './sessie.mjs';
import {agreementsBuilt,startAgreementTest,approveExampleAgreement,approveGroups} from './member-agreements-server.mjs';
test('automatic cooperative agreements and financial consent through the protected HTTP routes',{skip:!agreementsBuilt,timeout:180000},async t=>{
 const s=await startAgreementTest(t),{call,people,pg}=s;
 await t.test('the owner keeps administration access; links expose only their own terms and loans',async()=>{
  for(const url of ['/api/leden/afspraken','/api/leden/winkeldiensten','/api/bloei/inkomensleningen'])assert.equal((await call(url,{headers:{'x-boer-bart-verified-user':'owner','x-boer-bart-role':'owner'}})).status,401);
  const own=await call(people.chef.api+'/lidafspraak');assert.equal(own.status,200);assert.match(own.headers.get('cache-control'),/no-store/);assert.equal(own.headers.get('referrer-policy'),'no-referrer');assert.equal(own.data.latest.status,'concept');assert.match(own.data.latest.text,/hele keuken/);assert.equal(own.data.versions.length,1);
  assert.equal((await call(people.chef.api+'/lidafspraak',{method:'POST',headers:{Origin:'https://other.example.invalid'},body:{action:'akkoord',id:own.data.latest.id,hash:own.data.latest.hash,confirm:true}})).status,403);
  const other=(await call(people.other.api+'/lidafspraak')).data.latest;
  assert.equal((await call(people.chef.api+'/lidafspraak',{method:'POST',body:{action:'voorleggen',id:other.id,revision:other.revision}})).status,404);
  // Ledenlogin (9 november 2026): zonder ledensessie eerst 401; met een sessie voor die (onbekende) link 404.
  assert.equal((await call('/api/deelnemer/'+'z'.repeat(43)+'/lidafspraak')).status,401);
  assert.equal((await call('/api/deelnemer/'+'z'.repeat(43)+'/lidafspraak',{headers:{Cookie:memberCookie('z'.repeat(43))}})).status,404);
  // Ledenlogin (9 november 2026): de persoonlijke link alleen is niet meer genoeg.
  assert.equal((await call(people.chef.api+'/lidafspraak',{headers:{Cookie:''}})).status,401);
 });
 await t.test('new role contracts are protected, created immediately and saved as drafts without changing approved rules',async()=>{
  assert.equal((await call('/api/rollen')).status,401);
  const created=await call('/api/rollen',{owner:true,method:'POST',body:{action:'nieuw',pot:'restaurant',name:'Kwaliteitscontact',kind:'dag'}});assert.equal(created.status,200);const id=created.data.id;
  const url='/api/rollen?pot=restaurant&rol='+id;let view=(await call(url,{owner:true})).data.contract;assert.equal(view.needsDetails,true);assert.equal(view.draft.version,1);assert.equal(view.base.version,1);
  const body={action:'rolcontract-bewaren',pot:'restaurant',id,hash:view.hash,contract:{roleText:'Controleert de ontvangst en draagt afwijkingen over aan de hoofdbediening.',period:'jaar',protocols:'Bestaande kwaliteitscontrole.',reason:'Taak en overdracht besproken.'}};
  assert.equal((await call('/api/rollen',{owner:true,method:'POST',headers:{Origin:'https://other.example.invalid'},body})).status,403);
  assert.equal((await call('/api/rollen',{owner:true,method:'POST',body})).status,200);assert.equal((await call('/api/rollen',{owner:true,method:'POST',body})).status,409,'stale draft is refused');
  view=(await call(url,{owner:true})).data.contract;assert.equal(view.draft.period,'jaar');assert.match(view.draft.roleText,/ontvangst/);assert.equal(view.base.version,1);assert.equal((await pg.query('SELECT id FROM member_agreement_rule_versions')).length,0);
 });
 await t.test('saving an assignment is enough; material changes produce a version and contact edits do not',async()=>{
  assert.equal((await s.setMember('chef',{phone:'0612345678'})).status,200);assert.equal((await call(people.chef.api+'/lidafspraak')).data.versions.length,1);
  const current=(await call(people.chef.api+'/lidafspraak')).data.latest;
  const stale=await call('/api/leden/afspraken',{owner:true,method:'POST',body:{action:'wijzigen',id:current.id,revision:999,agreement:{...current.data,reason:'Test'}}});assert.equal(stale.status,409);
 });
 await t.test('the existing Overleg route and personal exact-version agreement both control activation',async()=>{
  const own=(await call(people.chef.api+'/lidafspraak')).data.latest;
  assert.equal((await call('/api/leden/afspraken',{method:'POST',owner:true,body:{action:'voorleggen',id:own.id,revision:own.revision}})).status,200);
  const proposed=(await call(people.chef.api+'/lidafspraak')).data.latest,pid=proposed.groups[0].proposalId,proposal=(await pg.query('SELECT version FROM overleg_proposals WHERE id=$1',[pid]))[0];
  assert.equal((await call('/api/overleg',{method:'POST',owner:true,body:{action:'vaststellen',id:pid,version:proposal.version}})).status,409);
  assert.equal((await call(people.chef.api+'/lidafspraak',{method:'POST',body:{action:'akkoord',id:proposed.id,hash:proposed.hash,confirm:true}})).status,401,'a personal link alone cannot sign');
  assert.equal((await call(people.chef.api+'/lidafspraak',{method:'POST',headers:{Cookie:s.ownerSession},body:{action:'akkoord',id:proposed.id,hash:proposed.hash,confirm:true}})).status,401,'owner login cannot sign for a member');
  const wrong=await s.loginMember('chef','head@example.invalid');assert.equal(wrong.cookie,'');
  const signedIn=await s.loginMember('chef');assert.ok(signedIn.cookie);assert.match(signedIn.finish.headers.getSetCookie().find(c=>c.startsWith('bb_lid_sessie=')),/HttpOnly/);
  assert.equal((await call('/api/leden/afspraken',{headers:{Cookie:signedIn.cookie}})).status,401,'a member login grants no backoffice role');
  assert.equal((await call('/api/leden/afspraken',{headers:{Cookie:signedIn.cookie.replace('bb_lid_sessie=','bb_sessie=')}})).status,401,'member signatures use a different signing key from the owner session');
  assert.equal((await call(people.head.api+'/lidafspraak',{headers:{Cookie:signedIn.cookie}})).status,401,'a member session opens only its own link (ledenlogin, 9 november 2026)');
  await pg.query('UPDATE coop_participants SET email=$1 WHERE id=$2',['other-contact@example.invalid',people.chef.id]);
  assert.equal((await call(people.chef.api+'/lidafspraak',{headers:{Cookie:signedIn.cookie}})).data.signing.authenticated,true,'contact edits do not change the owner-approved login');
  const takeover=await s.loginMember('chef','other-contact@example.invalid');assert.equal(takeover.cookie,'','contact email alone cannot replace the signature account');
  assert.equal((await call(people.chef.api+'/lidafspraak',{method:'POST',headers:{Cookie:signedIn.cookie},body:{action:'akkoord',id:proposed.id,hash:'incorrect',confirm:true}})).status,409);
  // Preserve the first proposal in history, then review a quarterly version through real vote endpoints.
  assert.equal((await call(people.chef.api+'/lidafspraak',{method:'POST',body:{action:'wijzigen',id:proposed.id,revision:proposed.revision,agreement:{...proposed.data,period:'kwartaal',reason:'Kwartaal afgesproken',extras:'Schriftelijke overdracht na de dienst.'}}})).status,200);
  const accepted=await approveExampleAgreement(s);assert.ok(accepted.current);assert.equal(accepted.current.sequence,2);assert.equal(accepted.current.data.period,'kwartaal');assert.equal(accepted.versions[1].status,'ingetrokken');
  const evidence=accepted.current.events.find(e=>e.signature)?.signature;assert.equal(evidence.email,'chef@example.invalid');assert.equal(evidence.participantId,people.chef.id);assert.equal(evidence.hash,accepted.current.hash);assert.equal(evidence.provider,'google');assert.ok(evidence.at);
  assert.equal((await pg.query('SELECT id FROM coop_participants')).length,5,'same central member IDs');
 });
 await t.test('separate function contracts and approved templates are preserved through the HTTP routes',async()=>{
  let view=(await call(people.chef.api+'/lidafspraak')).data;const signed=view.contracts.find(c=>c.key==='restaurant:chef-kok').current;
  assert.equal((await s.setMember('chef',{potRoles:{restaurant:['chef-kok','afwas']}})).status,200);view=(await call(people.chef.api+'/lidafspraak')).data;assert.equal(view.contracts.length,3);assert.equal(view.contracts.find(c=>c.key==='restaurant:chef-kok').current.id,signed.id);
  await approveExampleAgreement(s,'chef','restaurant:afwas');view=(await call(people.chef.api+'/lidafspraak')).data;const dishes=view.contracts.find(c=>c.key==='restaurant:afwas').current;
  const next=await call('/api/leden/afspraken',{owner:true,method:'POST',body:{action:'wijzigen',id:signed.id,revision:signed.revision,agreement:{...signed.data,reason:'Concretere keukenoverdracht',extras:'De chef legt de voorraadtekorten vast.'}}});assert.equal(next.status,200);
  view=await approveExampleAgreement(s,'chef','restaurant:chef-kok');const chef=view.contracts.find(c=>c.key==='restaurant:chef-kok');assert.equal(chef.versions.find(v=>v.id===signed.id).status,'vervangen');assert.equal(chef.versions.find(v=>v.id===signed.id).replacedFrom,s.today);assert.equal(view.contracts.find(c=>c.key==='restaurant:afwas').current.id,dishes.id);
  const rules=(await call('/api/leden/afspraken',{owner:true})).data,newText=rules.rules.roles['chef-kok']+' Controleer samen de overdracht.';
  assert.equal((await call('/api/leden/afspraken',{owner:true,method:'POST',body:{action:'basisteksten',version:rules.version,rules:{...rules.rules,roles:{...rules.rules.roles,'restaurant:chef-kok':newText}}}})).status,200);
  let pending=(await call('/api/leden/afspraken',{owner:true})).data;assert.equal(pending.rules.revision,1);assert.equal(pending.ruleDraft.status,'concept');
  assert.equal((await call('/api/leden/afspraken',{owner:true,method:'POST',body:{action:'basisteksten-voorleggen',id:pending.ruleDraft.id,version:pending.ruleDraft.version}})).status,200);pending=(await call('/api/leden/afspraken',{owner:true})).data;await approveGroups(s,pending.ruleDraft.groups);
  assert.equal((await call('/api/leden/afspraken',{owner:true})).data.rules.revision,2);
  const created=await call('/api/cooperatie',{owner:true,method:'POST',body:{action:'deelnemer',participant:{name:'Nieuwste Coöperatielid Voorbeeld',holder:'Nieuwste Coöperatielid Voorbeeld',email:'newest@example.invalid',vatInclusive:false,active:true}}});assert.equal(created.status,200);
  const id=created.data.id;assert.equal((await call('/api/leden',{owner:true,method:'POST',body:{action:'lid',id,version:1,member:{memberClass:'B',memberSince:s.today,voting:'auto',phone:'',address:'',units:['restaurant'],potRoles:{restaurant:['chef-kok']},bloeiMemberId:''}}})).status,200);
  const newest=(await call('/api/leden/afspraken?lid='+id,{owner:true})).data.contracts.find(c=>c.key==='restaurant:chef-kok').latest;assert.equal(newest.data.rulesRevision,2);assert.match(newest.text,/Controleer samen de overdracht/);assert.match(newest.text,/30%/);assert.match(newest.text,/4 punten/);
 });
 let loan;
 await t.test('a loan is private and interest-free; approval creates exactly one principal credit',async()=>{
  const own=(await call(people.supplier.api+'/inkomenslening')).data;
  const body={action:'aanvragen',amountCents:120001,firstMonth:own.firstMonth,purpose:'inkomen',incomeOnly:true,consent:true};
  assert.equal((await call(people.supplier.api+'/inkomenslening',{method:'POST',body:{...body,purpose:'auto'}})).status,400);
  const requested=await call(people.supplier.api+'/inkomenslening',{method:'POST',body});assert.equal(requested.status,200);loan=requested.data.loans[0];assert.equal(loan.plan.length,12);assert.equal(loan.plan.reduce((n,x)=>n+x.amountCents,0),120001);
  assert.equal((await call(people.other.api+'/inkomenslening')).data.loans.length,0);
  assert.equal((await pg.query('SELECT id FROM bb_entries WHERE participant_id=$1',[people.supplier.id])).length,0);
  const approved=await call('/api/bloei/inkomensleningen',{owner:true,method:'POST',body:{action:'goedkeuren',id:loan.id,incomeVerified:true}});assert.equal(approved.status,200);assert.equal(approved.data.loans[0].interest,0);assert.equal(approved.data.loans[0].paidCents,0);
  assert.equal((await call('/api/bloei/inkomensleningen',{owner:true,method:'POST',body:{action:'goedkeuren',id:loan.id,incomeVerified:true}})).status,409);
  const rows=await pg.query('SELECT kind,amount_cents FROM bb_entries WHERE participant_id=$1',[people.supplier.id]);assert.deepEqual(rows,[{kind:'inkomenslening',amount_cents:120001}]);
 });
 await t.test('suppliers choose actual open shop slots and can only offer an accepted duty for takeover',async()=>{
  assert.equal((await call(people.chef.api+'/winkeldiensten')).status,403);
  const roster=await call(people.supplier.api+'/winkeldiensten');assert.equal(roster.status,200);assert.equal(roster.data.minimumPerWeek,1);const day=roster.data.days.find(d=>d.day>=s.today&&d.open).day,body={day,part:'ochtend'};
  assert.equal((await call(people.supplier.api+'/winkeldiensten',{method:'POST',body:{...body,action:'claim'}})).status,200);
  assert.equal((await call(people.supplier2.api+'/winkeldiensten',{method:'POST',body:{...body,action:'claim'}})).status,409);
  assert.equal((await call(people.supplier.api+'/winkeldiensten',{method:'POST',body:{...body,action:'teruggeven'}})).status,400);
  assert.equal((await call(people.supplier.api+'/winkeldiensten',{method:'POST',body:{...body,action:'aanbieden'}})).status,200);
  const take=await call(people.supplier2.api+'/winkeldiensten',{method:'POST',body:{...body,action:'overnemen'}});assert.equal(take.status,200);assert.equal(take.data.days.find(d=>d.day===day).slots[0].mine,true);
  const close=await s.changeGuest({action:'exception',exception:{date:day,hours:{open:false,from:'10:00',to:'18:00'},note:'Fictieve sluiting'}});assert.equal(close.status,200);
  const closed=await call(people.supplier2.api+'/winkeldiensten');assert.equal(closed.data.days.find(d=>d.day===day).open,false);assert.ok(closed.data.cancelled.some(d=>d.day===day));
 });
 await t.test('stopping preserves only the own archive and debt; revoking the token also closes that archive',async()=>{
  await pg.query('UPDATE coop_participants SET active=0 WHERE id=$1',[people.supplier.id]);
  assert.equal((await call(people.supplier.api)).status,404);const history=await call(people.supplier.api+'/lidafspraak');assert.equal(history.status,200);assert.equal(history.data.active,false);assert.equal(history.data.current,null);
  const view=await call(people.supplier.api+'/inkomenslening');assert.equal(view.status,200);assert.equal(view.data.loans[0].remainingCents,120001);
  assert.equal((await call(people.supplier.api+'/inkomenslening',{method:'POST',body:{action:'aanvragen',amountCents:100,firstMonth:view.data.firstMonth,purpose:'inkomen',incomeOnly:true,consent:true}})).status,403);
  const exit=await call(people.supplier.api+'/inkomenslening',{method:'POST',body:{action:'stopplan',id:loan.id,firstMonth:view.data.firstMonth,consent:true}});assert.equal(exit.status,200);assert.equal(exit.data.loans[0].exitPlan.plan.length,12);
  assert.equal((await call('/api/bloei/inkomensleningen',{method:'POST',owner:true,body:{action:'stopplan-goedkeuren',id:loan.id}})).status,200);
  const tokenHash=createHash('sha256').update(people.supplier.token).digest('hex');await pg.query('DELETE FROM coop_portal_links WHERE token_hash=$1',[tokenHash]);assert.equal((await call(people.supplier.api+'/lidafspraak')).status,404);assert.equal((await call(people.supplier.api+'/inkomenslening')).status,404);
 });
});

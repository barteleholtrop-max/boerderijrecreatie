// Contracten (wens eigenaar 8 november 2026): een contract geldt pas na menselijk akkoord (groepsbesluit én eigen ondertekening), en het eerste
// goedgekeurde contract van een functie zonder basistekst wordt de basistekst voor die functie. Een bestaande basistekst blijft staan.
import './helpers/ts-resolve.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

test('het eerste goedgekeurde contract van een nieuwe functie wordt de basistekst',{timeout:90000},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-basistekst-'));process.env.APP_DATA_DIR=dir;process.env.DATABASE_URL='';process.env.SHEETS_CONFIG_KEY='ab'.repeat(32);process.env.APP_ORIGIN='http://localhost:3001';
 const {env,closeDatabase}=await import('../lib/portable/env.ts'),a=await import('../lib/member-agreements.ts'),m=await import('../lib/members.ts'),o=await import('../lib/overleg.ts');
 t.after(async()=>{await closeDatabase();fs.rmSync(dir,{recursive:true,force:true})});
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date()),at=new Date().toISOString(),first=randomUUID(),second=randomUUID(),later=randomUUID(),KEY='restaurant:grillmeester';
 const roles=[{id:'chef-kok',name:'Chef-kok',points:4},{id:'grillmeester',name:'Grillmeester',points:3}];
 await env.DB.prepare("INSERT INTO pot_agreements(id,pot,valid_from,percent_bp,roles,status,proposed_at) VALUES(?,'restaurant','2020-01-01',3000,?,'geldig',?)").bind(randomUUID(),JSON.stringify(roles),at).run();
 async function add(id,name,keys){await env.DB.prepare('INSERT INTO coop_participants(id,name,email,created,updated) VALUES(?,?,?,?,?)').bind(id,name,id+'@example.invalid',at,at).run();await m.saveMember(id,1,{memberClass:'B',memberSince:today,voting:'auto',phone:'',address:'',units:['restaurant'],bloeiMemberId:'',potRoles:{restaurant:keys}},'Eigenaar')}
 const contract=async(id,key=KEY)=>(await a.memberAgreementView(id)).contracts.find(c=>c.key===key);
 async function groupApprove(groups){for(const g of groups){const p=(await a.queryRows('SELECT voters FROM overleg_proposals WHERE id=?',g.proposalId))[0];for(const v of JSON.parse(p.voters))await o.vote(v,g.proposalId,{vote:'akkoord'},'Fictief lid');const fresh=(await a.queryRows('SELECT version FROM overleg_proposals WHERE id=?',g.proposalId))[0];await o.decide(g.proposalId,'vaststellen',fresh.version,'Eigenaar')}}
 async function writeAndSign(id,text){
  let v=(await contract(id)).latest;assert.equal(v.data.requiresRoleDetails,true,'nieuwe functie zonder basistekst: eerst verantwoordelijkheden invullen');
  await a.reviseMemberAgreement(v.id,v.revision,{period:'kwartaal',requestedFrom:today,supplierMode:'individueel',extras:'',protocols:'Grillprotocol',reason:'Eerste uitwerking',roleText:text},'Eigenaar');
  v=(await contract(id)).latest;await a.proposeMemberAgreement(v.id,v.revision,'Eigenaar');v=(await contract(id)).latest;
  assert.equal((await contract(id)).current,null,'voorgesteld is nog niet geldig');
  await a.acceptMemberAgreement(v.id,v.hash,id,{participantId:id,email:id+'@example.invalid',subject:'synthetic-'+id,provider:'google'});
  assert.equal((await contract(id)).current,null,'alleen de eigen handtekening is nog niet genoeg');
  await groupApprove(v.groups);return (await contract(id)).current;
 }
 await add(first,'Eerste Grill',['grillmeester']);await add(second,'Tweede Grill',['grillmeester']);
 const before=await a.agreementRules();assert.equal(before.rules.roles[KEY],undefined);assert.equal(before.rules.roles['grillmeester'],undefined);
 const chefText=before.rules.roles['chef-kok'];

 const signed=await writeAndSign(first,'De grillmeester bewaakt de kerntemperatuur en zet elke ochtend de grill klaar.');
 assert.ok(signed,'na groepsbesluit en eigen ondertekening geldt het contract');
 const after=await a.agreementRules();
 assert.equal(after.rules.roles[KEY],'De grillmeester bewaakt de kerntemperatuur en zet elke ochtend de grill klaar.','eerste goedgekeurde tekst is de basistekst');
 assert.deepEqual(after.rules.roleDefaults[KEY],{period:'kwartaal',protocols:'Grillprotocol'});
 assert.equal(after.rules.roles['chef-kok'],chefText,'andere basisteksten blijven');assert.equal(after.ruleDraft,null);
 const history=await a.queryRows("SELECT status,events FROM member_agreement_rule_versions ORDER BY version DESC");assert.equal(history[0].status,'geldig');assert.match(history[0].events,/Eerste goedgekeurde afspraak/);

 const own=await contract(first);assert.equal(own.current.id,signed.id);assert.equal(own.latest.id,signed.id,'het eigen contract blijft gelden, zonder nieuwe ronde');
 const other=(await contract(second)).latest;assert.equal(other.status,'concept');assert.notEqual(other.data.requiresRoleDetails,true);assert.match(other.text,/kerntemperatuur/,'collega krijgt de basistekst als concept');
 assert.equal((await contract(second)).current,null,'en dat concept geldt pas na akkoord');

 await add(later,'Later Grill',['grillmeester']);assert.match((await contract(later)).latest.text,/kerntemperatuur/);

 // Een tweede goedgekeurd contract met een eigen tekst overschrijft de basistekst niet.
 let v=(await contract(second)).latest;await a.reviseMemberAgreement(v.id,v.revision,{period:'maand',requestedFrom:today,supplierMode:'individueel',extras:'',protocols:'',reason:'Eigen accent',roleText:'Een andere grilltekst.'},'Eigenaar');
 v=(await contract(second)).latest;await a.proposeMemberAgreement(v.id,v.revision,'Eigenaar');v=(await contract(second)).latest;
 await a.acceptMemberAgreement(v.id,v.hash,second,{participantId:second,email:second+'@example.invalid',subject:'synthetic-'+second,provider:'google'});await groupApprove(v.groups);
 assert.ok((await contract(second)).current);assert.equal((await a.agreementRules()).rules.roles[KEY],'De grillmeester bewaakt de kerntemperatuur en zet elke ochtend de grill klaar.');
});

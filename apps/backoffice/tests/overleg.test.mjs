// Overleg en afspraken (wens eigenaar 6 november 2026): rekenregels en de hele keten tegen een echte, tijdelijke database.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import './helpers/ts-resolve.mjs';
const core=await import('../lib/overleg-core.ts');
const T0=new Date('2026-11-09T10:00:00Z'),day=n=>new Date(T0.getTime()+n*86400000);

test('7 dagen; zonder beter voorstel gaat het besluit door; een beter voorstel houdt aan; herinnering één keer, 2 dagen vooraf',()=>{
 const p={status:'voorstel',sentAt:T0.toISOString(),deadline:core.deadlineOf(T0.toISOString()),voters:['a','b','c'],remindedAt:null};
 const ak=id=>({participantId:id,vote:'akkoord',reaction:'',counterId:null,at:T0.toISOString()});
 assert.equal(core.nextStatus(p,[ak('a')],day(6.9)),null);
 assert.equal(core.nextStatus(p,[ak('a')],day(7)),'vastgesteld','wie niet reageert, houdt het besluit niet tegen');
 assert.equal(core.nextStatus(p,[ak('a'),{...ak('b'),vote:'beter-voorstel'}],day(1)),'aangehouden');
 assert.equal(core.nextStatus({...p,status:'aangehouden'},[],day(9)),null,'aangehouden wordt nooit vanzelf vastgesteld');
 assert.deepEqual(core.tally(p,[ak('a'),ak('x')]),{akkoord:['a'],beter:[],open:['b','c']},'alleen wie bij het versturen lid was');
 assert.equal(core.reminderDue(p,[ak('a')],day(4.9)),false);assert.equal(core.reminderDue(p,[ak('a')],day(5)),true);
 assert.equal(core.reminderDue({...p,remindedAt:'x'},[],day(5.5)),false);assert.equal(core.reminderDue(p,['a','b','c'].map(ak),day(5.5)),false,'iedereen heeft al gereageerd');
 assert.equal(core.validFromOf('2026-12-01','2026-11-16'),'2026-12-01');assert.equal(core.validFromOf('2026-11-01','2026-11-16'),'2026-11-16','nooit met terugwerkende kracht');
 assert.throws(()=>core.parseVote({vote:'beter-voorstel',counter:'nee'}),/betere voorstel/);
 assert.throws(()=>core.parseVote({vote:'niet-akkoord'}),/beter voorstel/);
 assert.throws(()=>core.parseProposal({title:'Verdeling',text:'40% voor de pot',topic:'verdeling'},['restaurant']),/hoort bij een pot/);
});

test('niet reageren telt niet als akkoord: „niet gereageerd” na 7 dagen; oude voorstellen houden hun stand (9 november 2026)',()=>{
 const sent=T0.toISOString(),deadline=core.deadlineOf(sent),ak=id=>({participantId:id,vote:'akkoord',reaction:'',counterId:null,at:sent});
 const p={status:'voorstel',sentAt:sent,deadline,voters:['a','b','c'],remindedAt:null,decidedAt:null};
 assert.deepEqual(core.tally(p,[ak('a')]),{akkoord:['a'],beter:[],open:['b','c']},'wie niet reageerde, telt nooit mee bij akkoord');
 assert.equal(core.noReplyStand(p,day(6.9)),'nog-niet-gereageerd');
 assert.equal(core.noReplyStand(p,day(7)),'niet-gereageerd','na 7 dagen: niet gereageerd');
 assert.equal(core.noReplyStand({...p,status:'aangehouden'},day(8)),'niet-gereageerd');
 assert.equal(core.noReplyStand({...p,status:'vastgesteld',decidedAt:day(7).toISOString()},day(7)),'niet-gereageerd');
 assert.equal(core.noReplyStand({...p,status:'ingetrokken',decidedAt:day(1).toISOString()},day(1)),'niet-gereageerd');
 assert.equal(core.noReplyStand({...p,status:'vastgesteld',decidedAt:'2026-11-08T22:59:00Z'},day(30)),'stilte-akkoord','vóór 9 november afgerond: oude stand blijft');
 assert.equal(core.noReplyStand({...p,status:'vastgesteld',decidedAt:'2026-11-08T23:00:00Z'},day(30)),'niet-gereageerd','9 november 00:00 Amsterdam: nieuwe regel');
 assert.equal(core.noReplyStand({...p,deadline:'2026-11-05T10:00:00Z'},day(0)),'niet-gereageerd','nog open voorstel uit de oude periode volgt de nieuwe regel');
 assert.equal(core.NO_REPLY_LABEL['niet-gereageerd'],'niet gereageerd');
});

const run=(name,code)=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-'+name+'-'));
 try{const r=spawnSync(process.execPath,['--experimental-transform-types','--input-type=module','-e',"import './tests/helpers/ts-resolve.mjs';import assert from 'node:assert/strict';"+code],
  {cwd:new URL('../',import.meta.url),env:{...process.env,APP_DATA_DIR:dir,APP_ORIGIN:'http://127.0.0.1:3001',PUBLIC_ORDER_ORIGINS:'',SHEETS_CONFIG_KEY:'ab'.repeat(32)},encoding:'utf8',timeout:120000});
  assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/ok/)}finally{fs.rmSync(dir,{recursive:true,force:true})}};

test('overleg: voorstel, reageren, beter voorstel, vanzelf vaststellen, actiepunten',()=>run('overleg',`
 const {getDb}=await import('./db/index.ts');const s=await import('./db/schema.ts');const o=await import('./lib/overleg.ts');
 const db=getDb(),t=new Date().toISOString(),ids=['a','b','c','d'].map(x=>x.repeat(8)+'-0000-4000-8000-00000000000'+'abcd'.indexOf(x));
 const [A,B,C,D]=ids;
 await db.insert(s.coopParticipants).values([['Anna',A],['Bauke',B],['Cees',C]].map(([name,id])=>({id,name,units:'["restaurant"]',created:t,updated:t})).concat([{id:D,name:'Dirk',units:'["winkel"]',created:t,updated:t}]));
 // Concept (zoals de assistent het klaarzet): nog niet zichtbaar voor leden.
 const p1=await o.createProposal({title:'Schoonmaak op zaterdag',text:'Wie op zaterdag werkt, doet ook de vloer.',pot:'restaurant'},'Bartele');
 assert.equal((await o.memberView(A)).open.length,0);
 let v=await o.overview();let x=v.proposals.find(p=>p.id===p1);assert.equal(x.status,'concept');
 await assert.rejects(()=>o.decide(p1,'vaststellen',x.version,'Bartele'),/eerst/);
 await o.sendProposal(p1,'weekbericht','Bartele');
 x=(await o.overview()).proposals.find(p=>p.id===p1);assert.equal(x.status,'voorstel');assert.deepEqual(x.open.sort(),['Anna','Bauke','Cees'],'alleen de leden van de pot');
 assert.equal((await o.memberView(A)).waitingOnMe,1);assert.equal((await o.memberView(D)).open.length,0);
 await assert.rejects(()=>o.vote(D,p1,{vote:'akkoord'},'Dirk'),/niet bij de leden/);
 await o.vote(A,p1,{vote:'akkoord',reaction:'Prima'},'Anna');
 // Herinnering 2 dagen voor het einde, één keer; na 7 dagen vanzelf vastgesteld (Bauke en Cees zwegen).
 const sent=Date.parse(x.sentAt);
 assert.deepEqual(await o.runDeadlines(new Date(sent+5.5*86400000)),{decided:0,reminded:1});
 assert.deepEqual(await o.runDeadlines(new Date(sent+6*86400000)),{decided:0,reminded:0});
 assert.deepEqual(await o.runDeadlines(new Date(sent+7*86400000+1000)),{decided:1,reminded:0});
 x=(await o.overview()).proposals.find(p=>p.id===p1);assert.equal(x.status,'vastgesteld');assert.equal(x.decidedBy,'vanzelf na 7 dagen');assert.ok(x.validFrom);
 assert.ok(x.history.some(h=>/Anna: akkoord/.test(h.what)));assert.ok(x.history.some(h=>/Herinnering/.test(h.what)));
 // Over de verdeling: Bauke heeft een beter voorstel. Het origineel wordt aangehouden; het betere voorstel gaat naar dezelfde leden.
 const p2=await o.createProposal({title:'Restaurantpot 35%',text:'Het percentage van de restaurantpot gaat naar 35%.',pot:'restaurant',topic:'verdeling'},'Bartele','direct');
 const r=await o.vote(B,p2,{vote:'beter-voorstel',counter:'Liever 32%, en na drie maanden opnieuw bekijken.',reaction:'35 is te veel'},'Bauke');
 assert.ok(r.counterId);
 v=await o.overview();x=v.proposals.find(p=>p.id===p2);const c=v.proposals.find(p=>p.id===r.counterId);
 assert.equal(x.status,'aangehouden');assert.equal(c.status,'voorstel');assert.equal(c.parentTitle,'Restaurantpot 35%');assert.equal(c.topic,'verdeling');
 assert.deepEqual((await o.tasks()).waiting.map(w=>w.id),[p2],'de beheerder ziet het aangehouden voorstel bij Vandaag & taken');
 // Het betere voorstel wordt na 7 dagen vanzelf vastgesteld; het origineel vervalt. De pot-afspraak verandert niet vanzelf.
 await o.runDeadlines(new Date(Date.parse(c.sentAt)+8*86400000));
 v=await o.overview();assert.equal(v.proposals.find(p=>p.id===r.counterId).status,'vastgesteld');assert.equal(v.proposals.find(p=>p.id===p2).status,'ingetrokken');
 assert.equal(v.proposals.find(p=>p.id===r.counterId).needsPotChange,true);
 assert.equal((await db.select().from(s.potAgreements)).length,0,'geen pot-afspraak aangemaakt of gewijzigd');
 // Beheerder stelt een ander voorstel zelf vast; een tweede klik met de oude versie wordt geweigerd.
 const p3=await o.createProposal({title:'Koffie voor leden',text:'Leden drinken gratis koffie tijdens hun dienst.',pot:''},'Rianne','direct');
 x=(await o.overview()).proposals.find(p=>p.id===p3);assert.deepEqual(x.open.length,3,'algemeen: iedereen die in een pot werkt');
 await o.decide(p3,'vaststellen',x.version,'Rianne','2026-12-01');await assert.rejects(()=>o.decide(p3,'intrekken',x.version,'Rianne'),/gewijzigd|afgehandeld/);
 // Vergadering en actiepunten; open actiepunten bij Vandaag & taken.
 const m=await o.saveMeeting({date:'2026-11-10',title:'Ledenoverleg',attendees:[A,B],agenda:'1. Schoonmaak',notes:'Afgesproken: rooster ophangen.'},'Rianne');
 const act=await o.addAction({text:'Rooster ophangen in de keuken',ownerId:A,due:'2026-11-12',meetingId:m},'Rianne');
 assert.deepEqual((await o.tasks()).actions.map(a=>[a.text,a.owner]),[['Rooster ophangen in de keuken','Anna']]);
 await o.setActionDone(act,true,'Anna');assert.equal((await o.tasks()).actions.length,0);
 assert.equal((await o.search('restaurantpot')).length>=1,true);
 console.log('ok');`));

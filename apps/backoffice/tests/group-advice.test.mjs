import './helpers/ts-resolve.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
const {checkAdvice,emptyDossier,proposalTotal,guestText,assertBasis,availabilityFor,knowledgeSchema}=await import('../lib/group-advice.ts');
const {initialGuestState}=await import('../lib/guest-core.ts');
const {customerView}=await import('../lib/guest-customers.ts');
const advice=()=>({wishes:'Familiefeest voorjaar 2027, volwassenen en kinderen',solution:'Samen lunchen en spelen',reason:'Past bij de leeftijden',missing:['Exacte datum en aantallen'],conflicts:[],exampleIds:[],comparisons:['Actuele regionale vergelijking ontbreekt'],proposal:{items:[{description:'Fictieve testlunch',quantity:12,unitCents:1250}],assumptions:['Alleen testbedragen'],vat:'Ter beoordeling',included:['Lunch'],unknown:['Drankjes']},review:['Uitvoerbaarheid beoordelen'],nextAction:'Datum afstemmen',guestDraft:'Dag familie, wat leuk dat jullie bij ons willen samenkomen! Samen lunchen en spelen lijkt ons een fijne invulling. Welke datum hebben jullie in gedachten? Groet, Sanne'});
test('TEST – aanvraag familiefeest voorjaar 2027: internal calculation never becomes guest text before approval',()=>{
 const d=emptyDossier(),a=checkAdvice(advice(),[]);d.note='INTERN: onbekende kostprijs';d.revisions.push({id:'r1',advice:a});
 assert.equal(proposalTotal(a.proposal),15000);assert.equal(guestText(d,'r1'),a.guestDraft);assert.doesNotMatch(guestText(d,'r1'),/150|kostprijs|testbedragen|Ter beoordeling/);
 d.approvals.push({revisionId:'r1',totalCents:15000,proposal:structuredClone(a.proposal)});
 assert.match(guestText(d,'r1'),/150,00/);assert.doesNotMatch(guestText(d,'r1'),/INTERN|testbedragen/);
 const before=JSON.stringify(d.approvals);d.revisions.push({id:'r2',advice:{...a,proposal:null}});assert.equal(guestText(d,'r2'),a.guestDraft);assert.equal(JSON.stringify(d.approvals),before);
});
test('invalid output, invented evidence, money and availability claims fail closed',()=>{
 for(const guestDraft of ['Dat is €150','De prijs is 150 euro','Het is gratis','De datum is beschikbaar'])assert.throws(()=>checkAdvice({...advice(),guestDraft},[]));
 assert.throws(()=>checkAdvice({...advice(),exampleIds:['verzonnen']},[]));assert.throws(()=>checkAdvice({...advice(),comparisons:['Geraadpleegd: https://verzonnen.example/prijzen']},[]),/bronlink/);assert.throws(()=>checkAdvice({...advice(),internal:'leak'},[]));
 assert.throws(()=>assertBasis('old-draft','manual-edit'),/gewijzigd/);assert.throws(()=>assertBasis('old-mail','new-mail'),/gewijzigd/);
});
test('uses central capacity; absent capacity stays for review; multiple groups can coexist',()=>{
 const s=initialGuestState();s.reservations=[{id:'test',threadId:'gmail:test',date:'2027-04-04',from:'11:00',to:'13:00',activity:'groep',people:12,status:'aanvraag',tables:[]}];
 assert.match(availabilityFor(s,'gmail:test')[0].result,/Ter beoordeling/);s.capacity.groep=30;
 s.reservations.push({...s.reservations[0],id:'other',threadId:'gmail:other',status:'bevestigd',people:10});assert.match(availabilityFor(s,'gmail:test')[0].result,/Past volgens/);
 s.reservations[1].people=25;assert.match(availabilityFor(s,'gmail:test')[0].result,/Ter beoordeling/);assert.equal(s.reservations[0].status,'aanvraag');
});
test('advice history survives SQLite close/reopen and workspace revision rejects concurrent booking',t=>{
 const dir=fs.mkdtempSync('/tmp/group-advice-');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=dir+'/test.sqlite';
 let db=new DatabaseSync(file);db.exec(fs.readFileSync(new URL('../drizzle/0009_guest_workspace.sql',import.meta.url),'utf8'));
 const state=initialGuestState();state.groupAdvice={'gmail:test':{...emptyDossier(),note:'Bewaren',revisions:[{id:'r1',advice:advice()}]}};
 db.prepare('INSERT INTO guest_workspace VALUES(1,1,?)').run(JSON.stringify(state));db.close();db=new DatabaseSync(file);t.after(()=>db.close());
 assert.equal(JSON.parse(db.prepare('SELECT data FROM guest_workspace').get().data).groupAdvice['gmail:test'].note,'Bewaren');
 assert.throws(()=>db.prepare('UPDATE guest_workspace SET version=CASE WHEN version=? THEN ? ELSE NULL END').run(0,1),/NOT NULL/);
});
test('general guest read model never exposes internal advice',()=>{const s=initialGuestState();s.groupAdvice={'gmail:private':emptyDossier()};s.groupKnowledge=[];assert.equal(customerView(s,{manage:false,mailboxes:[]}).groupAdvice,undefined);assert.equal(customerView(s,{manage:false,mailboxes:[]}).groupKnowledge,undefined)});

test('historical sources require a date, price/evidence status and safe source link',()=>{const v={id:'H-001',source:'https://trello.com/c/example',informationDate:'2026-01-01',consultedAt:'2026-11-03T10:00:00Z',wishes:'Lunch voor een groep',solution:'Maatwerk',included:['Lunch'],unknown:['Btw'],evidence:'feit',status:'aangeboden',historicalPrices:['Historisch voorstel, geen algemene regel']};assert.equal(knowledgeSchema.parse(v).status,'aangeboden');assert.equal(knowledgeSchema.safeParse({...v,source:'javascript:alert(1)'}).success,false);assert.equal(knowledgeSchema.safeParse({...v,status:'definitieve-prijslijst'}).success,false);});

test('imported historical knowledge is validated, anonymous and keeps uncertainty instead of creating rules',async()=>{const {HISTORICAL_GROUP_EXAMPLES:examples}=await import('../lib/group-knowledge.ts');assert.equal(examples.length,9);for(const e of examples){knowledgeSchema.parse(e);assert.doesNotMatch(JSON.stringify(e),/@|06[0-9]{8}/)}assert.ok(examples.some(e=>e.status==='geaccepteerd'));assert.equal(examples.find(e=>e.id==='T-121-20231114').status,'onbekend');assert.equal(examples.filter(e=>e.id.startsWith('R-')).length,3);});

test('AI-antwoord met lijstjes in tekstvelden (of andersom) wordt hersteld; echte vormfouten geven een begrijpelijke melding',()=>{
 // Seen with Claude on 3 November 2026: wishes, solution and reason as arrays of sentences.
 const a=checkAdvice({...advice(),wishes:['Familiefeest','25 volwassenen'],solution:['Lunch','Spelen'],reason:['Past bij leeftijden'],missing:'Drankkeuze',review:null,proposal:{...advice().proposal,assumptions:'Alleen testbedragen',vat:['Ter beoordeling']}},[]);
 assert.equal(a.wishes,'Familiefeest\n25 volwassenen');assert.equal(a.solution,'Lunch\nSpelen');assert.equal(a.reason,'Past bij leeftijden');
 assert.deepEqual(a.missing,['Drankkeuze']);assert.deepEqual(a.review,[]);assert.deepEqual(a.proposal.assumptions,['Alleen testbedragen']);assert.equal(a.proposal.vat,'Ter beoordeling');
 // Price checks still apply after repairing the shape.
 assert.throws(()=>checkAdvice({...advice(),guestDraft:['Beste familie,','dat kost €150']},[]),/onbevestigde prijs/);
 // Anything else: a clear Dutch message without technical JSON.
 assert.throws(()=>checkAdvice({...advice(),wishes:{tekst:'x'}},[]),e=>/niet de verwachte vorm \(wishes\)/.test(e.message)&&!e.message.includes('invalid_type'));
 assert.throws(()=>checkAdvice('geen object',[]),/niet de verwachte vorm/);
});

test('voorstel voor de agenda uit het advies: geldig blijft staan, onduidelijk wordt weggelaten zonder het advies af te keuren',()=>{
 const booking={activity:'groep',date:'2027-04-17',from:'14:00',to:'18:00',people:37};
 assert.deepEqual(checkAdvice({...advice(),booking},[]).booking,booking);
 assert.equal(checkAdvice({...advice(),booking:{...booking,people:'37'}},[]).booking.people,37,'aantal als tekst wordt een getal');
 for(const bad of [{...booking,date:'17 april'},{...booking,date:'2027-02-30'},{...booking,from:'18:00',to:'14:00'},{...booking,activity:'feest'},{...booking,people:0},'zaterdag middag',[booking]])
  assert.equal(checkAdvice({...advice(),booking:bad},[]).booking,null,JSON.stringify(bad));
 assert.equal(checkAdvice({...advice(),booking:null},[]).booking,null);
 assert.equal(checkAdvice(advice(),[]).booking,null,'zonder voorstel: veld leeg, advies geldig');
});

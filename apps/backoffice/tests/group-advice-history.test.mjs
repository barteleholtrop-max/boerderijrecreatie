// Meest recente geschiedenis (3 november 2026): goedgekeurd voorstel → bronvoorbeeld, nieuwste eerst, zonder contactgegevens.
import './helpers/ts-resolve.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const {approvalKnowledge,approvalKnowledgeId,newestFirst,knowledgeSchema}=await import('../lib/group-advice.ts');
const advice={wishes:'Familiefeest, mail jan@voorbeeld.nl of bel 06-12345678',solution:'Koffie, lunch en spelen',reason:'',missing:[],conflicts:[],exampleIds:[],comparisons:[],review:[],nextAction:'Drankkeuze vragen',guestDraft:'Hoi',
 proposal:{items:[{description:'Koffie en taart',quantity:25,unitCents:1050},{description:'Lunchbuffet',quantity:25,unitCents:1750}],assumptions:[],vat:'9% inbegrepen',included:['Koffie, taart, lunch'],unknown:['Drankjes']}};
const r={id:'abcdef12-3456-7890-abcd-ef1234567890',at:'2026-11-03T12:00:00.000Z',by:'bart',basis:'x',advice,availability:[],sources:[]};
const a={revisionId:r.id,at:'2026-11-03T13:00:00.000Z',by:'bart',totalCents:70000,proposal:advice.proposal};
test('goedgekeurd prijsvoorstel wordt een geldig bronvoorbeeld zonder contactgegevens',()=>{
 const k=approvalKnowledge(r,a,'https://mail.google.com/mail/u/rianne%40boerbart.nl/#all/t1');
 assert.equal(k.id,approvalKnowledgeId(r.id,a.at));assert.equal(k.id,'B-20261103-abcdef12');
 assert.equal(knowledgeSchema.parse(k).id,k.id);assert.equal(k.informationDate,'2026-11-03');assert.equal(k.status,'aangeboden');
 assert.doesNotMatch(k.wishes,/jan@voorbeeld\.nl|06-12345678/);assert.match(k.wishes,/\[e-mail\].*\[telefoon\]/);
 assert.ok(k.historicalPrices.some(p=>/^Totaal €\s700,00 · btw: 9% inbegrepen$/.test(p)),k.historicalPrices.join(' | '));
 assert.ok(k.historicalPrices.some(p=>/Lunchbuffet: 25 × €\s17,50/.test(p)));
});
test('voorbeelden nieuwste eerst',()=>{
 const e=(id,d)=>({id,informationDate:d,consultedAt:d+'T00:00:00Z'});
 assert.deepEqual(newestFirst([e('a','2023-11-14'),e('b','2026-11-03'),e('c','2025-11-05')]).map(x=>x.id),['b','c','a']);
});

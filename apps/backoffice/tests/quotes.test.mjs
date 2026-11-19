// Offertes (wens eigenaar 5 november 2026): voorstel dat Sanne aanpast, gekoppeld aan de klantenkaart.
import './helpers/ts-resolve.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const {saveQuote,deleteQuote,quoteTotals,nextQuoteNumber,quotesForCard,isExpired}=await import('../lib/quotes.ts');
const base={id:'a0000000-0000-4000-8000-000000000001',customer:{name:'Anna de Vries',email:'Anna@Example.nl',phone:'',company:'Teamuitje BV'},title:'Teamuitje 24 personen',people:24,
 lines:[{description:'Pannenkoek',quantity:24,unitCents:750,vat:'9'},{description:'Rondleiding',quantity:24,unitCents:600,vat:'21'}]};
const at=new Date('2026-11-05T10:00:00Z');

test('offerte: totaal incl. btw, btw per tarief uit het bedrag incl. btw',()=>{
 const t=quoteTotals(base.lines);assert.equal(t.totalCents,32400);
 assert.deepEqual(t.vat.map(v=>[v.rate,v.vatCents]),[['9',1486],['21',2499]]);assert.equal(t.exclCents,32400-1486-2499);
});

test('offerte: nieuw concept krijgt een volgnummer per jaar; e-mail klein; wijzigen verhoogt de revisie',()=>{
 let {list,quote}=saveQuote([],base,'sanne',at);
 assert.equal(quote.number,'OFF-2026-001');assert.equal(quote.status,'concept');assert.equal(quote.rev,1);assert.equal(quote.customer.email,'anna@example.nl');
 ({list,quote}=saveQuote(list,{...base,rev:1,title:'Teamuitje met lunch',status:'verstuurd'},'sanne',at));
 assert.equal(quote.rev,2);assert.equal(quote.number,'OFF-2026-001','nummer blijft');assert.ok(quote.sentAt);assert.deepEqual(quote.history.map(h=>h.status),['concept','verstuurd']);
 assert.throws(()=>saveQuote(list,{...base,rev:1}, 'jan',at),/door iemand anders gewijzigd/);
 const second=saveQuote(list,{...base,id:'b0000000-0000-4000-8000-000000000002'},'sanne',at).quote;assert.equal(second.number,'OFF-2026-002');
 assert.equal(nextQuoteNumber([{number:'OFF-2026-007'},{number:'OFF-2025-012'}],at),'OFF-2026-008');
 assert.equal(nextQuoteNumber([{number:'OFF-2026-007'}],new Date('2027-01-02T10:00:00Z')),'OFF-2027-001');
});

test('offerte: controles; zonder regels niet versturen; alleen een concept mag weg',()=>{
 assert.throws(()=>saveQuote([],{...base,title:''},'r',at),/titel/);
 assert.throws(()=>saveQuote([],{...base,customer:{...base.customer,name:''}},'r',at),/naam/);
 assert.throws(()=>saveQuote([],{...base,lines:[{description:'X',quantity:0,unitCents:100,vat:'9'}]},'r',at));
 assert.throws(()=>saveQuote([],{...base,lines:[{description:'X',quantity:1,unitCents:100,vat:'6'}]},'r',at));
 assert.throws(()=>saveQuote([],{...base,lines:[],status:'verstuurd'},'r',at),/zonder regels/);
 const {list}=saveQuote([],{...base,status:'verstuurd'},'r',at);
 assert.throws(()=>deleteQuote(list,base.id),/Alleen een concept/);
 const c=saveQuote([],base,'r',at).list;assert.deepEqual(deleteQuote(c,base.id),[]);
});

test('offerte bij de klantenkaart: zelfde kaart, e-mailadres, gesprek of aanvraag',()=>{
 const mk=(id,patch)=>saveQuote([],{...base,id,...patch},'r',at).quote;
 const qs=[mk('c0000000-0000-4000-8000-000000000001',{customerId:'kaart-1'}),mk('c0000000-0000-4000-8000-000000000002',{customerId:'',threadId:'gmail:t1'}),mk('c0000000-0000-4000-8000-000000000003',{customerId:'',reservationId:'r9',customer:{...base.customer,email:''}}),mk('c0000000-0000-4000-8000-000000000004',{customerId:'ander',customer:{...base.customer,email:'iemand@anders.nl'}})];
 assert.equal(quotesForCard(qs,{id:'kaart-1',email:'anna@example.nl',threadIds:[],reservationIds:[]}).length,2,'kaart en e-mail');
 assert.equal(quotesForCard(qs,{id:'x',email:'',threadIds:['gmail:t1'],reservationIds:['r9']}).length,2,'gesprek en aanvraag');
 assert.equal(quotesForCard(qs,{id:'x',email:'',threadIds:[],reservationIds:[]}).length,0);
 assert.equal(isExpired({status:'verstuurd',validUntil:'2026-11-01'},'2026-11-05'),true);assert.equal(isExpired({status:'concept',validUntil:'2026-11-01'},'2026-11-05'),false);
});

test('offerte versturen: mailvoorstel met totaal, geldigheid en de plek van de link; gast ziet geen interne velden',async()=>{
 const {quoteMailDraft,withQuoteLink,publicQuote,QUOTE_LINK}=await import('../lib/quotes.ts');
 const q=saveQuote([],{...base,validUntil:'2026-12-01'},'sanne',at).quote;
 const d=quoteMailDraft(q,'Boerderijrecreatie');
 assert.equal(d.subject,'Offerte OFF-2026-001: Teamuitje 24 personen · Boerderijrecreatie');
 assert.match(d.body,/Totaal: €\s324,00 inclusief btw \(€\s13,50 per persoon\)/);assert.match(d.body,/Geldig tot 1 december 2026/);assert.ok(d.body.includes(QUOTE_LINK));
 assert.equal(withQuoteLink(d.body,'https://x/offerte/abc').includes(QUOTE_LINK),false);assert.ok(withQuoteLink(d.body,'https://x/offerte/abc').includes('https://x/offerte/abc'));
 assert.ok(withQuoteLink('Hallo','https://x/o').endsWith('Bekijk de offerte: https://x/o'),'link weggehaald: onderaan erbij');
 const p=publicQuote({...q,shareToken:'geheim',mails:[{at:'',by:'sanne',to:'a@b.nl',subject:'',messageId:''}]});
 assert.deepEqual(Object.keys(p).sort(),['accepted','customer','date','eventDate','intro','lines','number','people','question','rev','status','terms','title','totals','validUntil']);
 assert.deepEqual(p.customer,{name:'Anna de Vries',company:'Teamuitje BV'});assert.equal(JSON.stringify(p).includes('geheim'),false);
});

test('online akkoord: alleen op een verstuurde, geldige offerte en op de versie die de gast ziet; legt vast wat geaccepteerd is',async()=>{
 const {guestRespond,respondProblem,publicQuote}=await import('../lib/quotes.ts');
 const concept=saveQuote([],{...base,validUntil:'2026-12-01'},'sanne',at).quote;
 assert.throws(()=>guestRespond(concept,{kind:'akkoord',rev:concept.rev,name:'Anna',agree:true},'2026-11-05'),/niet meer online reageren/);
 const sent=saveQuote([concept],{...base,validUntil:'2026-12-01',rev:concept.rev,status:'verstuurd'},'sanne',at).quote;
 assert.throws(()=>guestRespond(sent,{kind:'akkoord',rev:sent.rev,name:'Anna'},'2026-11-05'),/Vink aan/);
 assert.throws(()=>guestRespond(sent,{kind:'akkoord',rev:sent.rev-1,name:'Anna',agree:true},'2026-11-05'),/intussen aangepast/);
 assert.throws(()=>guestRespond(sent,{kind:'akkoord',rev:sent.rev,name:'Anna',agree:true},'2026-12-02'),/verlopen/);
 assert.throws(()=>guestRespond(sent,{kind:'vraag',rev:sent.rev,name:'Anna',message:''},'2026-11-05'),/wilt aanpassen/);
 const asked=guestRespond(sent,{kind:'vraag',rev:sent.rev,name:'Anna',message:'Met 20 personen graag.'},'2026-11-05',at);
 assert.equal(asked.status,'verstuurd');assert.equal(asked.rev,sent.rev,'een vraag verandert de offerte niet');assert.ok(publicQuote(asked).question);
 const ok=guestRespond(asked,{kind:'akkoord',rev:asked.rev,name:'Anna de Vries',agree:true},'2026-11-05',at);
 assert.equal(ok.status,'geaccepteerd');assert.equal(ok.rev,sent.rev+1);assert.equal(ok.accepted.totalCents,32400);assert.equal(ok.accepted.rev,sent.rev);assert.equal(ok.accepted.lines.length,2);
 assert.equal(ok.history.at(-1).by,'gast: Anna de Vries');assert.deepEqual(publicQuote(ok).accepted,{at:at.toISOString(),name:'Anna de Vries'});
 assert.match(respondProblem(ok,'2026-11-05'),/al geaccepteerd/);
 assert.throws(()=>guestRespond(ok,{kind:'akkoord',rev:ok.rev,name:'Anna',agree:true},'2026-11-05'),/al geaccepteerd/);
});

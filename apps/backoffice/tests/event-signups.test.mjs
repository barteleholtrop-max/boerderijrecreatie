import './helpers/ts-resolve.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
// Dynamic import: event-signups-core imports other lib files without extension (resolved by the helper above).
const {parseSignup,signupState,MAX_PEOPLE}=await import('../lib/event-signups-core.ts');
import {dayLabel} from '../lib/day-label.ts';
const ok={requestId:'0d6f9c1e-6a2b-4c4f-9f2e-1a2b3c4d5e6f',eventId:'ev-1',name:'Anna de Vries',email:'Anna@Example.nl',phone:'06 12345678',people:3,note:'Twee kinderen',consent:true,website:''};
test('aanmelding: geldige gegevens, opgeschoond',()=>{
 const r=parseSignup(ok);assert.equal(r.email,'anna@example.nl');assert.equal(r.people,3);assert.equal(r.name,'Anna de Vries');
 assert.equal(parseSignup({...ok,name:'  Piet\u0000  '}).name,'Piet');
});
test('aanmelding: toestemming, e-mail, aantal en spamveld worden gecontroleerd',()=>{
 for(const [change,msg] of [[{consent:false},/toestemming/],[{email:'geen-adres'},/e-mailadres/],[{people:0},/aantal/],[{people:MAX_PEOPLE+1},/aantal/],[{people:1.5},/aantal/],[{name:'A'},/naam/],[{phone:'bel me'},/telefoon/],[{note:'x'.repeat(1001)},/opmerking/],[{requestId:'x'},/Ververs/],[{website:'spam'},/niet worden verstuurd/]])
  assert.throws(()=>parseSignup({...ok,...change}),msg,JSON.stringify(change));
});
test('aanmelden open, vol, uit, voorbij of voorbeeld',()=>{
 const e={id:'ev-1',date:'2027-11-05',from:'14:00',to:'16:00',title:'Pompoenfeest',holiday:false};
 assert.deepEqual(signupState(e,0,'2027-11-01'),{open:true,reason:'',spotsLeft:null});
 assert.equal(signupState({...e,capacity:10},7,'2027-11-01').spotsLeft,3);
 assert.equal(signupState({...e,capacity:10},10,'2027-11-01').open,false);
 assert.equal(signupState({...e,signup:false},0,'2027-11-01').open,false);
 assert.equal(signupState(e,0,'2027-11-06').open,false,'al geweest');
 assert.equal(signupState({...e,example:true},0,'2027-11-01').open,false);
 assert.equal(signupState({...e,holiday:true},0,'2027-11-01').open,false);
 assert.equal(signupState(undefined,0,'2027-11-01').open,false);
});
test("datum in de backoffice: dag uitgeschreven, \"vrijdag 5 nov '27\"",()=>{
 assert.equal(dayLabel('2027-11-05'),"vrijdag 5 nov '27");
 assert.equal(dayLabel('2026-11-05'),"donderdag 5 nov '26");
 assert.equal(dayLabel('2027-03-28'),"zondag 28 mrt '27");
 assert.equal(dayLabel('2027-02-30'),'2027-02-30');assert.equal(dayLabel(''),'');
});
test('website krijgt per evenement alleen open/vol en vrije plaatsen, geen aanmeldgegevens',async()=>{
 const {publicPlanning}=await import('../lib/guest-public.ts');const {initialGuestState}=await import('../lib/guest-core.ts');
 const s=initialGuestState();s.events=[{id:'ev-1',date:'2027-11-05',from:'14:00',to:'16:00',title:'Pompoenfeest',holiday:false,capacity:10},{id:'ev-2',date:'2027-11-06',from:'10:00',to:'12:00',title:'Rondleiding',holiday:false,signup:false}];
 const pub=publicPlanning(s,new Date('2027-11-01T10:00:00Z'),new Map([['ev-1',8]]));
 assert.deepEqual(pub.events.map(e=>[e.id,e.signup]),[['ev-1',{open:true,spotsLeft:2}],['ev-2',{open:false,spotsLeft:null}]]);
 assert.ok(!JSON.stringify(pub).includes('capacity'),'het maximum zelf wordt niet gepubliceerd');
});
test('betaald evenement: bedrag op het moment van aanmelden, bevestiging met datum, kosten en betaalinstructie',async()=>{
 const {signupAmount,confirmationText,priceOf}=await import('../lib/event-signups-core.ts');
 const e={id:'ev',date:'2026-11-20',from:'14:00',to:'16:00',title:'Pompoenfeest',holiday:false,priceCents:750,paymentInfo:'Je betaalt ter plekke contant of met pin.'};
 assert.equal(signupAmount(e,3),2250);assert.equal(signupAmount({...e,priceCents:0},3),0);assert.equal(priceOf({priceCents:-5}),0);
 const t=confirmationText(e,{name:'Anna',people:3,note:'Twee kinderen',amountCents:2250});
 assert.equal(t.subject,"Je aanmelding: Pompoenfeest op vrijdag 20 nov '26");
 assert.ok(!t.body.includes('Anna')&&!t.body.includes('Twee kinderen'),'geen vrije tekst uit het formulier in de mail (#132)');
 for(const s of ['Hallo,',"vrijdag 20 nov '26, 14:00–16:00 uur",'Aantal personen: 3','Je opmerking hebben we ook ontvangen','€ 22,50 (3 × € 7,50)','ter plekke contant of met pin','Antwoord dan even op deze mail'])assert.ok(t.body.includes(s),s);
 assert.ok(!confirmationText({...e,priceCents:0},{name:'Piet',people:1,note:'',amountCents:0}).body.includes('Kosten'),'gratis: geen kosten');
});
test('bevestigingsmail: vaste Message-ID, UTF-8, geen extra kopregels via invoer',async()=>{
 const {buildMessage,decodeBase64Url}=await import('../lib/mail-core.ts');
 const raw=decodeBase64Url(buildMessage({from:'rianne@boerbart.nl',to:'anna@example.nl',subject:'Je aanmelding: Café-avond op vrijdag 20 nov',body:'Hé Anna',messageId:'<aanmelding-1@boerbart.nl>'}));
 assert.match(raw,/^From: rianne@boerbart.nl\r\nTo: anna@example.nl\r\nSubject: =\?UTF-8\?B\?/);assert.match(raw,/Message-ID: <aanmelding-1@boerbart.nl>/);assert.match(raw,/Auto-Submitted: auto-generated/);
 assert.doesNotMatch(decodeBase64Url(buildMessage({from:'a@b.nl',to:'x@y.nl\r\nBcc: evil@z.nl',subject:'s',body:'b',messageId:'<m@b.nl>'})),/\r\nBcc:/);
 assert.throws(()=>buildMessage({from:'a@b.nl',to:'geen adres',subject:'s',body:'b',messageId:'<m@b.nl>'}));
});
test('klantenkaart: aanmeldingen komen automatisch bij de kaart met hetzelfde e-mailadres',async()=>{
 const {customerCards}=await import('../lib/guest-customers.ts');const {initialGuestState}=await import('../lib/guest-core.ts');
 const s=initialGuestState();s.customers=[{id:'k1',name:'Anna de Vries',email:'anna@example.nl',phone:'',company:'',address:'',notes:''}];
 const cards=customerCards(s,[{id:'a1',name:'Anna',email:'ANNA@example.nl',phone:''},{id:'a2',name:'Piet',email:'piet@example.nl',phone:'0612345678'}]);
 assert.deepEqual(cards.find(c=>c.id==='k1').signupIds,['a1']);
 const piet=cards.find(c=>c.signupIds.includes('a2'));assert.equal(piet.name,'Piet');assert.equal(piet.phone,'0612345678');
});

test('online betalen (Mollie): alleen bij een prijs en als Mollie aan staat; uit te zetten per evenement',async()=>{
 const {paysOnline}=await import('../lib/event-signups-core.ts');
 assert.equal(paysOnline({priceCents:750},true),true);
 assert.equal(paysOnline({priceCents:750},false),false,'Mollie staat uit: ter plekke betalen');
 assert.equal(paysOnline({priceCents:0},true),false,'gratis');
 assert.equal(paysOnline({priceCents:750,payOnline:false},true),false,'uitgezet bij het evenement');
 const {publicPlanning}=await import('../lib/guest-public.ts');const {initialGuestState}=await import('../lib/guest-core.ts');
 const s=initialGuestState();s.events=[{id:'a',date:'2027-11-05',from:'14:00',to:'16:00',title:'Betaald',holiday:false,priceCents:500},{id:'b',date:'2027-11-05',from:'14:00',to:'16:00',title:'Ter plekke',holiday:false,priceCents:500,payOnline:false}];
 const now=new Date('2027-11-01T10:00:00Z');
 assert.deepEqual(publicPlanning(s,now,new Map(),true).events.map(e=>e.payOnline),[true,false]);
 assert.deepEqual(publicPlanning(s,now,new Map(),false).events.map(e=>e.payOnline),[false,false]);
});
test('vastgehouden plaats: telt mee tot de betaaltermijn verloopt, betaald telt altijd, geannuleerd nooit',async()=>{
 const {holdsPlace,HOLD_MINUTES}=await import('../lib/event-signups-core.ts');
 const now='2027-11-01T10:00:00.000Z';
 assert.equal(HOLD_MINUTES,60);
 assert.equal(holdsPlace({status:'aangemeld',holdUntil:null,paymentStatus:''},now),true,'gratis of ter plekke betalen');
 assert.equal(holdsPlace({status:'aangemeld',holdUntil:'2027-11-01T10:30:00.000Z',paymentStatus:'open'},now),true,'nog aan het betalen');
 assert.equal(holdsPlace({status:'aangemeld',holdUntil:'2027-11-01T09:59:00.000Z',paymentStatus:'open'},now),false,'termijn verlopen, niet betaald');
 assert.equal(holdsPlace({status:'aangemeld',holdUntil:'2027-11-01T09:59:00.000Z',paymentStatus:'betaald'},now),true,'betaald');
 assert.equal(holdsPlace({status:'geannuleerd',holdUntil:null,paymentStatus:'betaald'},now),false);
});
test('bevestiging na online betalen zegt dat er betaald is, zonder betaalinstructie',async()=>{
 const {confirmationText}=await import('../lib/event-signups-core.ts');
 const e={id:'ev',date:'2026-11-20',from:'14:00',to:'16:00',title:'Pompoenfeest',holiday:false,priceCents:750,paymentInfo:'Je betaalt ter plekke.'};
 const t=confirmationText(e,{name:'Anna',people:2,note:'',amountCents:1500,paidOnline:true});
 assert.ok(t.body.includes('€ 15,00 (2 × € 7,50)'));assert.ok(t.body.includes('Je hebt online betaald'));assert.ok(!t.body.includes('ter plekke'));
});

test('foto bij een evenement: openbaar adres op de website, alleen beeldbankfoto’s van evenementen worden vrijgegeven',async()=>{
 const {publicPlanning,eventMediaIds}=await import('../lib/guest-public.ts');const {initialGuestState}=await import('../lib/guest-core.ts');
 const id='0d6f9c1e-6a2b-4c4f-9f2e-1a2b3c4d5e6f',other='1d6f9c1e-6a2b-4c4f-9f2e-1a2b3c4d5e6f';
 const s=initialGuestState();s.events=[
  {id:'ev-1',date:'2027-11-05',from:'14:00',to:'16:00',title:'Pompoenfeest',holiday:false,photo:'/api/media/'+id},
  {id:'ev-2',date:'2027-11-06',from:'10:00',to:'12:00',title:'Markt',holiday:false,photo:'https://example.org/markt.jpg'},
  {id:'ev-3',date:'2027-11-07',from:'10:00',to:'12:00',title:'Zonder foto',holiday:false},
  {id:'ev-4',date:'2027-11-08',from:'00:00',to:'23:59',title:'Feestdag',holiday:true,photo:'/api/media/'+other},
 ];
 const ev=publicPlanning(s,new Date('2027-11-01T10:00:00Z')).events;
 assert.equal(ev.find(e=>e.id==='ev-1').photo,'/api/public/media/'+id);
 assert.equal(ev.find(e=>e.id==='ev-2').photo,'https://example.org/markt.jpg');
 assert.equal(ev.find(e=>e.id==='ev-3').photo,null);
 assert.deepEqual([...eventMediaIds(s)],[id],'feestdagen en links tellen niet mee');
});

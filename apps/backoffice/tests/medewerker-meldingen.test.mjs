// Meldingen voor medewerkers (wens eigenaar 9 november 2026): nieuwe gastmail en nieuwe aanvragen in de backoffice-app.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './helpers/ts-resolve.mjs';
const {isNewGuestMail,mailMessage,groupMessage,yteMessage,parseStaffMessage}=await import('../lib/staff-push-core.ts');
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
test('alleen een echt nieuw bericht van een gast geeft een melding',()=>{
 const t={lastMessageId:'m2',lastFromUs:0,automated:0,labeled:1};
 assert.equal(isNewGuestMail({lastMessageId:'m1'},t),true);
 assert.equal(isNewGuestMail(undefined,t),true,'nieuw gesprek');
 assert.equal(isNewGuestMail({lastMessageId:'m2'},t),false,'niets nieuws');
 assert.equal(isNewGuestMail({lastMessageId:'m1'},{...t,lastFromUs:1}),false,'ons eigen antwoord');
 assert.equal(isNewGuestMail({lastMessageId:'m1'},{...t,automated:1}),false,'automatische mail');
 assert.equal(isNewGuestMail({lastMessageId:'m1'},{...t,labeled:0}),false,'niet in de inbox of het label');
});
test('teksten en adressen van de meldingen',()=>{
 const m=mailMessage({threadId:'abc',customerName:'Anna de Vries',customerEmail:'anna@example.nl',subject:'Kinderfeestje zaterdag'});
 assert.deepEqual(m,{title:'Nieuwe mail van Anna de Vries',body:'Kinderfeestje zaterdag',url:'/management/gesprekken?gesprek=gmail%3Aabc',tag:'mail:abc'});
 const g=groupMessage({requestId:'r1',name:'Piet',activity:'Bedrijfsuitje',date:'2026-11-21',people:24});
 assert.equal(g.title,'Nieuwe aanvraag: Bedrijfsuitje');assert.match(g.body,/^Piet · 24 personen · za 21 nov/);assert.equal(g.url,'/gesprekken?gesprek=web%3Ar1');
 const y=yteMessage({id:'y1',name:'Kees',date:'2026-11-14',from:'18:00',people:4});
 assert.equal(y.title,'Nieuwe reservering Ite');assert.match(y.body,/Kees · 4 personen · za 14 nov 18:00/);assert.equal(y.url,'/reserveringen');
});
test('een melding opent alleen een pagina van de backoffice zelf',()=>{
 assert.equal(parseStaffMessage({title:'x',tag:'t',url:'https://example.com'}),null);
 assert.equal(parseStaffMessage({title:'x',tag:'t',url:'//example.com'}),null);
 assert.equal(parseStaffMessage({title:'x',tag:'t',url:'/gesprekken'})?.url,'/gesprekken');
 assert.match(read('public/backoffice-sw.js'),/self\.location\.origin/);
});
test('aangesloten: Gmail-ronde, website-aanvragen, werkproces, tabel met beveiliging per rij',()=>{
 assert.match(read('lib/mail-store.ts'),/refreshThread\(g,id,labelId,!known\.has\(id\),true\)/,'alleen in de gewone ronde');
 assert.match(read('app/api/public/group-requests/route.ts'),/queueStaffNotice\(groupMessage\(request\)\)/);
 assert.match(read('app/api/public/yte-requests/route.ts'),/if\(!duplicate\)await queueStaffNotice\(yteMessage\(r\)\)/);
 assert.match(read('lib/assistant-jobs.ts'),/'medewerker-melding'/);
 assert.match(read('drizzle-pg/0046_gastcontact.sql'),/ALTER TABLE "staff_push" ENABLE ROW LEVEL SECURITY/);
 assert.match(read('proxy.ts'),/p==='\/backoffice-sw\.js'/);
});

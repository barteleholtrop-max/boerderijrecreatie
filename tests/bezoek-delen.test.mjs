// Bezoek in je agenda zetten of delen met vrienden (wens eigenaar 4 november 2026). De hulpfuncties uit apps/website/index.html
// worden los uitgevoerd met een nagebootste browser, zodat de agenda-uitnodiging en de deeltekst vastliggen.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../apps/website/index.html',import.meta.url),'utf8');
const start=html.indexOf('// Bezoek in je agenda zetten of delen'),end=html.indexOf('const sheetBeforeAgenda=renderSheet;');
const code=html.slice(start,end);
function sandbox(contact={street:'Schoterweg 26',postalCode:'8462 TD',city:'Rotstergaast'}){
 const out={};
 const ctx={playDrafts:[{date:'2026-11-05',time:'ochtend'}],live:{availability:{contact}},URLSearchParams,encodeURIComponent,Math,String,Number,Date,
  visitData:()=>({blocks:[{id:'ochtend',name:'Ochtend',start:'10:00',end:'12:00'}],days:['2026-11-05']}),
  isoDay:v=>/^\d{4}-\d{2}-\d{2}$/.test(v),isClock:v=>/^([01]\d|2[0-3]):[0-5]\d$/.test(v),
  dayLabel:d=>new Intl.DateTimeFormat('nl-NL',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z')),
  location:{origin:'https://www.boerbart.nl'},setTimeout:()=>{},
  Blob:class{constructor(parts){out.ics=parts.join('')}},URL:{createObjectURL:()=>'blob:x',revokeObjectURL(){}},
  document:{createElement:()=>({click(){out.clicked=true},remove(){}}),body:{appendChild(a){out.file=a.download}},getElementById:()=>({set innerHTML(v){out.note=v}})},
  navigator:{share:async v=>{out.shared=v}},window:{open(){}}};
 vm.createContext(ctx);vm.runInContext(code,ctx);return {ctx,out};
}
test('agenda: uitnodiging met Nederlandse tijd, adres uit de backoffice en een link naar de website',()=>{
 const {ctx,out}=sandbox();ctx.visitToCalendar(0);
 assert.equal(out.file,'bezoek-boer-bart-2026-11-05.ics');
 assert.match(out.ics,/^BEGIN:VCALENDAR\r\n/);assert.match(out.ics,/TZID:Europe\/Amsterdam/);
 assert.match(out.ics,/DTSTART;TZID=Europe\/Amsterdam:20261105T100000\r\n/);assert.match(out.ics,/DTEND;TZID=Europe\/Amsterdam:20261105T120000\r\n/);
 assert.match(out.ics,/SUMMARY:Bezoek aan Boer Bart · Ochtend\r\n/);assert.match(out.ics,/LOCATION:Boer Bart\\, Schoterweg 26\\, 8462 TD Rotstergaast\r\n/);
 assert.match(out.ics,/END:VCALENDAR\r\n$/);
});
test('Google Agenda-link met dezelfde tijden',()=>{
 const {ctx}=sandbox();const u=new URL(ctx.visitGoogleUrl(0));
 assert.equal(u.origin,'https://calendar.google.com');assert.equal(u.searchParams.get('dates'),'20261105T100000/20261105T120000');assert.equal(u.searchParams.get('ctz'),'Europe/Amsterdam');
});
test('delen: deelknop van de telefoon met dag, tijdblok en de website; zonder adres valt de plaats terug op Rotstergaast',async()=>{
 const {ctx,out}=sandbox({});await ctx.shareVisit(0);
 assert.match(out.shared.text,/^Wij gaan naar Boer Bart! do 5 nov · Ochtend · 10:00–12:00\. Ga je mee\?$/);assert.equal(out.shared.url,'https://www.boerbart.nl/');
 assert.equal(ctx.playVisit(0).where,'Boer Bart, Rotstergaast');
 ctx.playDrafts[0]={date:'2026-11-05',time:'onbekend'};assert.equal(ctx.playVisit(0),null);
});

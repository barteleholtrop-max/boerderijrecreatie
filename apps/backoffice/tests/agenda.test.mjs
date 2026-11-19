// Agenda koppelen en één rooster (wens eigenaar 7 november 2026).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './helpers/ts-resolve.mjs';
const {buildIcs,fold,icsText,parseHours,calendarUrls}=await import('../lib/member-calendar-core.ts');
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');

test('agenda: diensten met tijd in Amsterdamse tijd, zonder tijd als hele dag, gesorteerd',()=>{
 const ics=buildIcs([{uid:'winkel-2026-11-12-ochtend-p1@boerbart',day:'2026-11-12',from:'10:00',to:'14:00',title:'Winkel · eerste dagdeel'},
  {uid:'restaurant-2026-11-05-kok-p1@boerbart',day:'2026-11-05',title:'Restaurant · Chef-kok, keuken; afwas'}],new Date('2026-11-07T10:00:00Z'));
 assert.match(ics,/^BEGIN:VCALENDAR\r\n/);assert.match(ics,/END:VCALENDAR\r\n$/);assert.ok(!/[^\r]\n/.test(ics),'alleen CRLF');
 assert.match(ics,/BEGIN:VTIMEZONE\r\nTZID:Europe\/Amsterdam/);
 assert.match(ics,/DTSTART;TZID=Europe\/Amsterdam:20261112T100000\r\nDTEND;TZID=Europe\/Amsterdam:20261112T140000/);
 assert.match(ics,/DTSTART;VALUE=DATE:20261105\r\nDTEND;VALUE=DATE:20261106/);
 assert.match(ics,/SUMMARY:Restaurant · Chef-kok\\, keuken\; afwas/);
 assert.match(ics,/DTSTAMP:20261107T100000Z/);
 assert.ok(ics.indexOf('20261105')<ics.indexOf('20261112'),'op datum');
 assert.equal(buildIcs([]).includes('BEGIN:VEVENT'),false);
});
test('agenda: lange regels gevouwen op 75 bytes, ook met meerbyte-tekens',()=>{
 const line='SUMMARY:'+'é'.repeat(80),out=fold(line);
 for(const part of out.split('\r\n'))assert.ok(new TextEncoder().encode(part).length<=75);
 assert.equal(out.split('\r\n').map((p,i)=>i?p.slice(1):p).join(''),line);
 assert.equal(icsText('a\nb'),'a\\nb');
});
test('agenda: openingstijden lezen en links maken',()=>{
 assert.deepEqual(parseHours('10:00–18:00'),{from:'10:00',to:'18:00'});assert.deepEqual(parseHours('9:30-17:00'),{from:'09:30',to:'17:00'});assert.equal(parseHours('gesloten'),null);
 const t='A'.repeat(43),u=calendarUrls('https://boerbart-backoffice-206627521194.europe-west3.run.app/',t);
 assert.equal(u.url,'https://boerbart-backoffice-206627521194.europe-west3.run.app/api/agenda/'+t+'.ics');assert.equal(u.webcal,'webcal://boerbart-backoffice-206627521194.europe-west3.run.app/api/agenda/'+t+'.ics');
 assert.ok(u.google.startsWith('https://calendar.google.com/calendar/r?cid=webcal%3A%2F%2F'));
});
test('agenda: eigen sleutel met beveiliging per rij; feed alleen GET en los van de ledenlink',()=>{
 const sql=read('drizzle-pg/0038_agenda_koppelen.sql');
 assert.match(sql,/CREATE TABLE "member_calendar_links"/);assert.match(sql,/ALTER TABLE "member_calendar_links" ENABLE ROW LEVEL SECURITY/);assert.match(sql,/CREATE UNIQUE INDEX "member_calendar_links_hash"/);
 const proxy=read('proxy.ts');assert.match(proxy,/\\\/api\\\/agenda\\\/\[A-Za-z0-9_-\]\{43\}\(\\\.ics\)\?\$\/\.test\(request\.nextUrl\.pathname\)&&request\.method==='GET'/);
 const feed=read('app/api/agenda/[token]/route.ts');assert.ok(!/export async function POST/.test(feed));assert.match(feed,/calendarOwner/);assert.ok(!/participantByToken/.test(feed));
 const lib=read('lib/member-calendar.ts');assert.match(lib,/memberCalendarLinks/);assert.ok(!/coopPortalLinks/.test(lib),'nooit de ledenlink als agendasleutel');
});
test('één rooster: restaurant alleen als je daar werkt, winkel alleen als je levert',()=>{
 const page=read('app/deelnemer/[token]/lid-pagina.tsx');
 assert.match(page,/<Rooster api=\{api\} restaurant=\{card\.unitKeys\.some\(u=>ROSTER_UNITS\.includes\(u\)\)\} shop=\{supplierRoster\}\/>/);
 assert.ok(!/<SupplierDuties/.test(page),'geen tweede agenda meer');
 const r=read('app/deelnemer/[token]/rooster.tsx');assert.match(r,/if\(restaurant\)fetch\(api\+'\/rooster'/);assert.match(r,/if\(shop\)fetch\(api\+'\/winkeldiensten'/);assert.match(r,/<AgendaKoppelen/);
});

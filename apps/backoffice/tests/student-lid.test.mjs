// Student naast vrijwilliger (wens eigenaar 13 november 2026: „Kun je bij vrijwilligerslid ook student neerzetten?”). Zelfde regels
// als een vrijwilliger (geen stemrecht, geen pot, wel rooster en vergoeding), eigen naam.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './helpers/ts-resolve.mjs';
const C=await import('../lib/members-core.ts');
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('labels: student en vrijwilliger',()=>{
 assert.match(C.memberClassLabel('',true,'student'),/^Student/);assert.match(C.memberClassLabel('',true,'vrijwilliger'),/^Vrijwilligerslid/);assert.match(C.memberClassLabel('',true),/^Vrijwilligerslid/);
 assert.equal(C.memberClassLabel('',false,'student'),'','zonder vrijwilligersmarkering geen student');
 assert.equal(C.helperName('student'),'Student');assert.equal(C.helperName(undefined),'Vrijwilliger');
});
test('opslag, kaart, ledenapp en migratie',()=>{
 assert.match(read('db/schema.ts'),/volunteerKind:text\('volunteer_kind'\)\.notNull\(\)\.default\('vrijwilliger'\)/);
 assert.match(read('drizzle-pg/0065_volunteer_kind.sql'),/ADD COLUMN "volunteer_kind" text DEFAULT 'vrijwilliger' NOT NULL/);
 assert.match(read('lib/members.ts'),/volunteer_kind=\?/);assert.match(read('lib/members.ts'),/f\.volunteer&&f\.volunteerKind==='student'\?'student':'vrijwilliger'/);
 const p=read('app/leden/page.tsx');assert.match(p,/<option value=\{STUDENT_CHOICE\}>\{STUDENT_CLASS_LABEL\}<\/option>/);assert.match(p,/helperName\(m\.volunteerKind\)/);
 assert.match(read('app/deelnemer/[token]/lid-pagina.tsx'),/volunteerKind==='student'\?'Student':'Vrijwilliger'/);
});

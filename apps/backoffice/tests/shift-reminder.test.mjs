// Herinnering de dag ervoor (wens eigenaar 5 november 2026).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './helpers/ts-resolve.mjs';
const {reminderMessage,reminderPlan,amsterdamAt,TITLES,BODIES,REMINDER_TIME}=await import('../lib/shift-reminder-core.ts');
const isWeek=r=>r.week??['schoonmaak','organisatie'].includes(r.id);
const roles=[{id:'chef-kok',name:'Chef-kok'},{id:'bediening',name:'Bediening'},{id:'afwas',name:'Afwas'},{id:'schoonmaak',name:'Schoonmaak'}];

test('veel verschillende, vrolijke teksten; naam, rol en dag ingevuld, geen losse {placeholders}',()=>{
 assert.ok(TITLES.length>=10&&BODIES.length>=30);assert.equal(REMINDER_TIME,'18:00');
 const m=reminderMessage({participantId:'p1',name:'Anna de Vries',day:'2026-11-06',roles:['Bediening','Afwas'],opens:'10:00'});
 assert.doesNotMatch(m.title+m.body,/\{|\}/);assert.equal(m.tag,'dienst-2026-11-06');
 const all=new Set();for(let i=1;i<=28;i++){const d='2026-12-'+String(i).padStart(2,'0');const x=reminderMessage({participantId:'p1',name:'Anna',day:d,roles:['Bediening']});all.add(x.body);assert.doesNotMatch(x.title+x.body,/\{|\}/)}
 assert.ok(all.size>=12,'de tekst wisselt per dag');
 assert.deepEqual(reminderMessage({participantId:'p1',name:'Anna',day:'2026-11-06',roles:['Bediening']}),reminderMessage({participantId:'p1',name:'Anna',day:'2026-11-06',roles:['Bediening']}),'zelfde lid en dag: zelfde tekst');
 for(const t of BODIES)assert.ok(t.length<=200);
});

test('wie een herinnering krijgt: elke rol morgen; een weektaak alleen op de eerste dag in de week',()=>{
 const shifts=[{day:'2026-11-06',participantId:'anna',roleId:'bediening'},{day:'2026-11-06',participantId:'anna',roleId:'afwas'},
  {day:'2026-11-05',participantId:'bram',roleId:'schoonmaak'},{day:'2026-11-06',participantId:'bram',roleId:'schoonmaak'},
  {day:'2026-11-06',participantId:'cees',roleId:'schoonmaak'},{day:'2026-11-07',participantId:'dirk',roleId:'chef-kok'}];
 assert.deepEqual(reminderPlan({day:'2026-11-06',shifts,roles,isWeek}),[{participantId:'anna',roles:['Bediening','Afwas']},{participantId:'cees',roles:['Schoonmaak']}]);
});

test('18.00 uur Amsterdamse tijd, in winter- en zomertijd',()=>{
 assert.equal(amsterdamAt('2026-11-05','18:00').toISOString(),'2026-11-05T17:00:00.000Z');
 assert.equal(amsterdamAt('2026-07-01','18:00').toISOString(),'2026-07-01T16:00:00.000Z');
});

test('dagelijkse taak in het werkproces, via de bestaande berichten aan leden (geen tweede aanmelding)',()=>{
 const jobs=fs.readFileSync(new URL('../lib/assistant-jobs.ts',import.meta.url),'utf8');assert.match(jobs,/'dienst-herinnering:'\+tomorrow/);assert.match(jobs,/hour>=21/);
 const push=fs.readFileSync(new URL('../lib/member-push.ts',import.meta.url),'utf8');assert.match(push,/export async function sendShiftReminders/);assert.match(push,/notifyMembers\(\[participantId\],reminderMessage/);
});

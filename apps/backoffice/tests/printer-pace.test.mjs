// Rustige stand voor de bonprinters (wens eigenaar 7 november 2026): druk rond openingstijden, rustig daarbuiten.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/ts-resolve.mjs';
const {busyWindows,busyAt,amsterdamNow,plan,QUIET_CHECK_MS,TOUCH_MS,AWAKE_AFTER_JOB_MS,CONNECTED_MS}=await import('../lib/printer-pace-core.ts');
const at=(h,m=0)=>h*60+m;

test('druk: een uur vóór tot een uur na openingstijden, reserveringen, evenementen en de Ite-avond',()=>{
 const w=busyWindows({openings:[{open:true,from:'10:00',to:'18:00'},{open:false,from:'09:00',to:'12:00'},null],slots:[{from:'19:00',to:''},{from:'x'}]});
 assert.deepEqual(w,[[at(9),at(19)],[at(18),24*60]]);
 assert.equal(busyAt(w,at(8,59)),false);assert.equal(busyAt(w,at(9)),true);assert.equal(busyAt(w,at(23,30)),true);
 assert.equal(busyAt(busyWindows({openings:[{open:false,from:'10:00',to:'18:00'}],slots:[]}),at(12)),false,'gesloten dag is rustig');
});

test('Amsterdamse tijd: zomer- en wintertijd',()=>{
 assert.deepEqual(amsterdamNow(Date.parse('2026-07-01T08:30:00Z')),{day:'2026-07-01',minute:at(10,30)});
 assert.deepEqual(amsterdamNow(Date.parse('2026-12-31T23:30:00Z')),{day:'2027-01-01',minute:at(0,30)});
});

test('druk: elke vraag in de database; rustig: hooguit één keer per minuut; na een bon twee minuten weer vlot',()=>{
 const t=1_000_000_000;
 assert.deepEqual(plan(undefined,t,false),{check:true,touch:true,quiet:true},'eerste keer altijd kijken');
 const p={lastCheck:t,lastTouch:t,lastJob:0};
 assert.equal(plan(p,t+5000,true).check,true);
 assert.equal(plan(p,t+5000,false).check,false);assert.equal(plan(p,t+QUIET_CHECK_MS,false).check,true);
 assert.equal(plan({...p,lastJob:t},t+5000,false).check,true);assert.equal(plan({...p,lastJob:t,lastCheck:t+AWAKE_AFTER_JOB_MS-5000},t+AWAKE_AFTER_JOB_MS,false).check,false);
 assert.equal(plan(p,t+5000,true).touch,false,'laatst gezien niet elke 5 seconden');assert.equal(plan(p,t+TOUCH_MS,true).touch,true);
 assert.ok(CONNECTED_MS>TOUCH_MS,'printer blijft „verbonden” tussen twee keer bijwerken');
});

// Weken vanzelf goedkeuren (wens eigenaar 16 november 2026).
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const src=fs.readFileSync(new URL('../lib/week-auto.ts',import.meta.url),'utf8');
const jobs=fs.readFileSync(new URL('../lib/assistant-jobs.ts',import.meta.url),'utf8');
test('alleen weken die voorbij zijn, op volgorde',async()=>{
 const {mondayOf,weekEnd}=await import('../lib/coop-core.ts');
 const body=src.match(/const MAX_WEEKS=\d+;\n(const addDays=[^\n]+)\n[^]*?export function weeksToApprove\(from:string,today:string\)\{\n([^\n]+)\n\}/);
 const weeksToApprove=new Function('mondayOf','weekEnd','MAX_WEEKS',body[1].replace(/:string|:number/g,'')+';return (from,today)=>{'+body[2].replace(/:string\[\]/g,'')+'}')(mondayOf,weekEnd,104);
 assert.deepEqual(weeksToApprove('2026-11-04','2026-11-16'),['2026-11-02','2026-11-09']);
 assert.deepEqual(weeksToApprove('2026-11-04','2026-11-15'),['2026-11-02']);
 assert.deepEqual(weeksToApprove('2026-11-16','2026-11-16'),[]);
});
test('winkel en elke pot, met bonvraag- en correctiestop',()=>{
 assert.match(src,/approveWeek\(w,AUTO_BY\)/);assert.match(src,/approvePotWeek\(p\.id,w,AUTO_BY\)/);
 assert.match(src,/corrections\.length/);assert.match(src,/out\.stopped\.push[^]*return/);
 assert.doesNotMatch(src,/practice=true|,true\)/);
});
test('het werkproces draait het elk uur',()=>{
 assert.match(jobs,/'weken-goedkeuren':async/);assert.match(jobs,/enqueue\('weken-goedkeuren:'/);
});
test('integratietests die zelf goedkeuren zetten het werkproces uit',()=>{
 assert.match(src,/process\.env\.WEKEN_AUTOMATISCH==='uit'\)return out/);
 for(const t of ['cooperatie','bb'])assert.match(fs.readFileSync(new URL(`../../../tests/${t}.integration.mjs`,import.meta.url),'utf8'),/WEKEN_AUTOMATISCH:'uit'/,t);
});

// Hulpmiddelen van de assistent: Claude weigert een schema waarin een enum met null bij een type-lijst staat
// (fout 7 november 2026: „Enum value 'dag' does not match declared type ['string','null']”, de assistent deed niets meer).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/ts-resolve.mjs';
const sources=[['hulp',(await import('../lib/hulp-tools.ts')).TOOL_DEFINITIONS]];
try{const a=await import('../lib/assistant-tools.ts');for(const [k,v] of Object.entries(a))if(Array.isArray(v)&&v[0]?.input_schema)sources.push(['assistent:'+k,v])}catch{}
function walk(s,path,out){
 if(!s||typeof s!=='object')return;
 if(Array.isArray(s.enum)&&Array.isArray(s.type))out.push(path+': enum bij een type-lijst; gebruik anyOf:[{type,enum},{type:"null"}]');
 if(Array.isArray(s.enum)&&s.enum.includes(null)&&!Array.isArray(s.type)&&s.type!=='null')out.push(path+': null in enum');
 for(const [k,v] of Object.entries(s.properties||{}))walk(v,path+'.'+k,out);
 if(s.items)walk(s.items,path+'[]',out);
 for(const x of s.anyOf||[])walk(x,path+'|',out);
}
test('geen enkel hulpmiddel heeft een enum die Claude weigert',()=>{
 const bad=[];for(const [name,tools] of sources)for(const t of tools)walk(t.input_schema,name+'/'+t.name,bad);
 assert.deepEqual(bad,[]);
 assert.ok(sources[0][1].some(t=>t.name==='rol_wijzigen'));
});

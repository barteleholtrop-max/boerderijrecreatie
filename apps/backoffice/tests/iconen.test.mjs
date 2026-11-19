// Iconen van de apps (wens eigenaar 13 november 2026): één familie. Eigen kleur per app, het originele Boer Bart-logo
// ongewijzigd, rechtsonder een wit rondje met een pictogram. Hier: elk icoon bestaat, heeft de juiste maat en is per app anders.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../../../',import.meta.url);
const size=f=>{const b=fs.readFileSync(new URL(f,root));assert.equal(b.toString('ascii',1,4),'PNG',f);return [b.readUInt32BE(16),b.readUInt32BE(20)]};
const files={backoffice:['leden','gesprekken','backoffice','werkplek','kassa','opnemen'].map(k=>'apps/backoffice/public/icons/'+k),website:['bestellen','zelfscan','zelfkassa'].map(k=>'apps/website/beeld/'+k)};
test('elk icoon in 192 en 512, allemaal verschillend (de tablet-zelfkassa deelt het kassa-icoon)',()=>{
 const seen=new Set();
 for(const base of [...files.backoffice,...files.website])for(const s of [192,512]){const f=`${base}-${s}.png`;assert.deepEqual(size(f),[s,s],f);const h=createHash('sha256').update(fs.readFileSync(new URL(f,root))).digest('hex');if(!base.endsWith('zelfkassa')){assert.ok(!seen.has(h),'dubbel: '+f);seen.add(h)}}
});
test('manifesten wijzen naar het eigen icoon',()=>{
 const m=n=>JSON.parse(fs.readFileSync(new URL('apps/website/'+n,root),'utf8')).icons.map(i=>i.src);
 assert.deepEqual(m('zelfscan-app.json'),['beeld/zelfscan-192.png','beeld/zelfscan-512.png']);
 assert.deepEqual(m('zelfkassa-app.json'),['beeld/zelfkassa-192.png','beeld/zelfkassa-512.png']);
 for(const p of ['zelfscan','zelfkassa','bestellen'])assert.match(fs.readFileSync(new URL(`apps/website/${p}.html`,root),'utf8'),new RegExp(`apple-touch-icon" href="beeld/${p}-192\\.png"`),p);
});

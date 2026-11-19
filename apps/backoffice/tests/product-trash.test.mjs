// Product verwijderen via de prullenbak (wens eigenaar 5 november 2026).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isDeleted,trashDraft,restoreDraft,inView} from '../lib/product-trash.ts';

test('verwijderen bewaart alle gegevens en terugzetten haalt alleen het verwijdermoment weg',()=>{
 const draft={name:'Melk, 1 liter',priceCents:150,vat:'9',station:'winkel',sourceId:'bron-0255'};
 const gone=trashDraft(draft,new Date('2026-11-05T09:00:00Z'));
 assert.equal(isDeleted(gone),true);assert.equal(gone.deletedAt,'2026-11-05T09:00:00.000Z');assert.equal(gone.sourceId,'bron-0255');
 assert.equal(isDeleted(draft),false);assert.deepEqual(restoreDraft(gone),draft);
});
test('lijsten tonen standaard geen verwijderde producten; de prullenbak alleen verwijderde',()=>{
 const rows=[{id:'a',draft:JSON.stringify({name:'A'})},{id:'b',draft:JSON.stringify({name:'B',deletedAt:'2026-11-05T09:00:00.000Z'})}];
 assert.deepEqual(inView(rows,false).map(r=>r.id),['a']);assert.deepEqual(inView(rows,true).map(r=>r.id),['b']);
});

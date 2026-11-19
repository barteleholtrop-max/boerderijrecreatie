// Totale stroom op „Bestellingen & uitgifte” (wens eigenaar 5 november 2026).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mergeFlow,splitFlow,stationStats} from '../lib/work-flow.ts';
const o=(id,status,created,updated=created,lines=[{name:'x',quantity:1}])=>({id,number:'B'+id,reference:'Tafel '+id,mode:'yte',created,status,updated,test:false,lines});
const kok=[o(1,'nieuw','2026-11-05T10:00:00Z'),o(2,'gereed','2026-11-05T09:00:00Z','2026-11-05T09:20:00Z'),o(3,'behandeling','2026-11-05T09:30:00Z')];
const barista=[o(1,'gereed','2026-11-05T10:00:00Z','2026-11-05T10:05:00Z'),o(2,'gereed','2026-11-05T09:00:00Z','2026-11-05T09:10:00Z'),o(4,'nieuw','2026-11-05T10:10:00Z')];

test('een bestelling met regels voor kok en barista is één regel in de stroom, met per werkplek de stand',()=>{
 const f=mergeFlow({kok,barista});assert.equal(f.length,4);
 const one=f.find(x=>x.id===1);assert.deepEqual(one.parts.map(p=>[p.station,p.status]),[['kok','nieuw'],['barista','gereed']]);
 assert.equal(one.state,'bezig','barista is klaar, kok nog niet: onderweg');
 assert.equal(f.find(x=>x.id===2).state,'klaar');assert.equal(f.find(x=>x.id===2).finished,'2026-11-05T09:20:00Z','klaar op het moment dat de laatste werkplek klaar was');
 assert.equal(f.find(x=>x.id===4).state,'nieuw');assert.equal(f.find(x=>x.id===3).state,'bezig');
});
test('onderweg: langst wachtend bovenaan; klaar: laatst afgerond bovenaan',()=>{
 const {open,done}=splitFlow(mergeFlow({kok,barista}));
 assert.deepEqual(open.map(x=>x.id),[3,1,4]);assert.deepEqual(done.map(x=>x.id),[2]);
});
test('per werkplek: nieuw, bezig, klaar en de oudste open bestelling',()=>{
 const s=stationStats({kok,barista});
 assert.deepEqual(s.map(x=>[x.station,x.nieuw,x.bezig,x.klaar,x.oldest]),[['kok',1,1,1,'2026-11-05T09:30:00Z'],['barista',1,0,2,'2026-11-05T10:10:00Z'],['winkel',0,0,0,null]]);
});

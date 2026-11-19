// Boeking verwijderen (wens eigenaar 12 november 2026: „ik kan een reservering niet verwijderen”).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=f=>fs.readFileSync(new URL(f,import.meta.url),'utf8');

test('API: verwijderen alleen met planningbeheer en bevestiging; niet bij een offerte; agenda bijgewerkt',()=>{
 const api=read('../app/api/gasten/route.ts');
 const at=api.indexOf("case 'reservation-delete':");
 assert.ok(at>0,'actie bestaat');
 assert.ok(api.indexOf('if(!p.manage)')<at,'achter de beheercontrole');
 const body=api.slice(at,api.indexOf("case 'appointment-delete':",at));
 assert.match(body,/b\.confirm!==true/,'alleen na bevestiging');
 assert.match(body,/q\.reservationId===id/,'een boeking met offerte blijft staan');
 assert.match(body,/s\.reservations=s\.reservations\.filter\(r=>r\.id!==id\)/);
 assert.match(body,/reservationId:''/,'een overleg verliest alleen de koppeling');
 assert.match(api,/\['reservation','reservation-delete',/,'Google Agenda wordt bijgewerkt');
});

test('scherm: knop Verwijderen bij een bestaande boeking, met bevestiging',()=>{
 const ui=read('../app/planning/workspace.tsx');
 assert.match(ui,/\{edit&&<button className="btn red"[^>]*onClick=\{async\(\)=>\{if\(!confirm\(/);
 assert.match(ui,/action:'reservation-delete',id:edit\.id,confirm:true/);
});

// Pakbon fotograferen (wens eigenaar 17 november 2026): lezen, voorstel per regel en boeken in de voorraad.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './helpers/ts-resolve.mjs';
const P=await import('../lib/packing-slip-core.ts');

const ing=(p)=>({id:'x',name:'',unit:'st',supplier:'',article:'',stock:0,known:false,countedAt:'',pack:1,min:0,leadDays:1,shelfDays:0,allergens:[],checked:false,notes:'',origin:'inkoop',ownCents:null,...p});
const tomaat=ing({id:'tom',name:'Tomaten',unit:'kg',supplier:'Bidfood',article:'12345',stock:2,known:true,countedAt:'2026-11-10'});
const melk=ing({id:'melk',name:'Volle melk',unit:'l',supplier:'HANOS',stock:0});
const eigen=ing({id:'eigen',name:'Eieren',unit:'st',origin:'eigen'});
const servet=ing({id:'serv',name:'Servetten',unit:'st',pack:500,kind:'magazijn'});
const all=[tomaat,melk,eigen,servet];

test('schema en vraag: alleen ingrediënten van leveranciers, eenheden kg/l/st',()=>{
 const s=P.slipSchema([{id:'tom',name:'Tomaten',unit:'kg',supplier:'Bidfood',article:'12345'}]);
 assert.deepEqual(s.properties.lines.items.properties.unit.enum,['kg','l','st']);
 assert.match(P.slipPrompt([{id:'tom',name:'Tomaten',unit:'kg',supplier:'Bidfood',article:'12345'}]),/tom: Tomaten · kg · Bidfood · 12345/);
 assert.match(P.slipPrompt([]),/ingredientId steeds op null/);
 const src=fs.readFileSync(new URL('../lib/packing-slip.ts',import.meta.url),'utf8');assert.match(src,/origin!=='eigen'/);
});
test('voorstel per regel: artikelnummer, naam, keuze van Claude, nieuw, en omrekenen',()=>{
 const r=P.checkSlip({readable:true,supplier:'Bidfood',number:'PB-77',date:'2026-11-17',lines:[
  {article:'12345',description:'TOMATEN TROS 5KG',packages:2,perPackage:5,quantity:10,unit:'kg',ingredientId:null},
  {article:'',description:'Volle melk 1L',packages:6,perPackage:1,quantity:6,unit:'l',ingredientId:null},
  {article:'999',description:'Servet wit 33x33',packages:2,perPackage:null,quantity:2,unit:'st',ingredientId:'serv'},
  {article:'555',description:'Eieren scharrel',packages:1,perPackage:30,quantity:30,unit:'st',ingredientId:'eigen'},
  {article:'',description:'',packages:null,perPackage:null,quantity:1,unit:'st',ingredientId:null},
  {article:'1',description:'Kapot',packages:null,perPackage:null,quantity:0,unit:'st',ingredientId:null}]},all);
 assert.equal(r.ok,true);const l=r.slip.lines;
 assert.equal(r.slip.supplier,'Bidfood');assert.equal(r.slip.number,'PB-77');assert.equal(l.length,4,'lege en nul-regels vallen weg');
 assert.equal(l[0].ingredientId,'tom');assert.equal(l[0].match,'artikel');assert.equal(l[0].amount,10);
 assert.equal(l[1].ingredientId,'melk');assert.equal(l[1].match,'naam');
 assert.equal(l[2].ingredientId,'serv');assert.equal(l[2].match,'claude');assert.equal(l[2].amount,2);
 assert.equal(l[3].ingredientId,null,'eigen boerderij nooit van een leverancier');assert.equal(l[3].match,null);
 const conv=P.checkSlip({readable:true,supplier:'X',number:'',date:null,lines:[{article:'',description:'Tomaten doos',packages:3,perPackage:null,quantity:3,unit:'st',ingredientId:'tom'}]},[{...tomaat,pack:6}]);
 assert.equal(conv.slip.lines[0].amount,18,'3 dozen × 6 kg');assert.match(conv.slip.lines[0].note,/Controleer/);
 assert.equal(P.checkSlip({readable:false},all).ok,false);
 assert.equal(P.checkSlip({readable:true,supplier:'X',lines:[]},all).ok,false);
});
test('boeken: bestaand ophogen, nieuw aanmaken met leverancier en artikelnummer, nooit geteld = beginvoorraad',()=>{
 const s={ingredients:structuredClone(all),moves:[],invoices:[],recipes:[],incoming:[],recipeHistory:[]};let n=0;const newId=()=>'id'+(++n);
 const b=P.checkBooking({by:'Sanne',supplier:'Bidfood',number:'PB-77',lines:[{ingredientId:'tom',quantity:10},{ingredientId:'melk',quantity:6},{quantity:4,newIngredient:{name:'',description:'BASILICUM POT',article:'777',unit:'st',perPackage:null}}]});
 const r=P.applySlip(s,b,{today:'2026-11-17',newId});
 assert.deepEqual(r,{lines:3,created:1});
 const t=s.ingredients.find(i=>i.id==='tom');assert.equal(t.stock,12);
 const m=s.ingredients.find(i=>i.id==='melk');assert.equal(m.stock,6);assert.equal(m.known,true);assert.equal(m.countedAt,'2026-11-17');
 const basil=s.ingredients.find(i=>i.article==='777');assert.equal(basil.supplier,'Bidfood');assert.equal(basil.name,'Basilicum pot');assert.equal(basil.stock,4);assert.match(basil.notes,/prijs komt uit de factuur/);
 assert.deepEqual(s.moves.map(x=>x.reason),['Levering (pakbon)','Beginvoorraad (levering pakbon)','Beginvoorraad (levering pakbon)']);
 assert.equal(s.moves[0].reference,'Pakbon Bidfood PB-77 · Sanne');
 // Tweede keer hetzelfde nieuwe artikel: geen tweede ingrediënt.
 P.applySlip(s,P.checkBooking({by:'Sanne',supplier:'bidfood',number:'PB-78',lines:[{quantity:2,newIngredient:{name:'Basilicum',description:'BASILICUM POT',article:'777',unit:'st',perPackage:null}}]}),{today:'2026-11-17',newId});
 assert.equal(s.ingredients.filter(i=>i.article==='777').length,1);assert.equal(basil.stock,6);
 assert.throws(()=>P.checkBooking({supplier:'X',lines:[{ingredientId:'a',quantity:1}]}),/wie je bent/);
 assert.throws(()=>P.checkBooking({by:'S',supplier:'X',lines:[{ingredientId:'a',quantity:0}]}),/hoeveelheid/);
 assert.throws(()=>P.checkBooking({by:'S',supplier:'X',lines:[{ingredientId:'a',quantity:1},{ingredientId:'a',quantity:2}]}),/twee keer/);
 assert.throws(()=>P.applySlip(s,P.checkBooking({by:'S',supplier:'X',lines:[{ingredientId:'weg',quantity:1}]}),{today:'2026-11-17',newId}),/bestaat niet meer/);
});
test('API: lezen achter de login, boeken via operations met dubbele-pakbon-controle',()=>{
 const route=fs.readFileSync(new URL('../app/api/werkplek/pakbon/route.ts',import.meta.url),'utf8');
 assert.match(route,/isSameOrigin/);assert.match(route,/createRateLimit/);assert.match(route,/MAX_SLIP_PAGES/);
 const ops=fs.readFileSync(new URL('../app/api/operations/route.ts',import.meta.url),'utf8');
 assert.match(ops,/case 'pakbon':\{const p=checkBooking\(b\);if\(p\.stock&&p\.number&&await slipBooked/);
 const ui=fs.readFileSync(new URL('../app/werkplek/voorraad/pakbon.tsx',import.meta.url),'utf8');
 assert.match(ui,/Pakbon fotograferen/);assert.match(ui,/action:'pakbon'/);assert.match(ui,/Overslaan/);
});
test('kassabon (eigen inkoop Lidl of Jumbo): prijs per regel, btw eraf, inkoopbon bij Inkoop, regels al ontvangen',()=>{
 assert.deepEqual(P.slipSchema([],true).properties.lines.items.required.slice(-2),['totalCents','vatPct']);
 assert.match(P.slipPrompt([],true),/kassabon/);assert.match(P.slipPrompt([],true),/korting/);
 const r=P.checkSlip({readable:true,supplier:'Lidl',number:'14:32 bon 0457',date:'2026-11-17',lines:[
  {article:'',description:'VOLLE MELK 1L',packages:2,perPackage:1,quantity:2,unit:'l',ingredientId:'melk',totalCents:218,vatPct:9},
  {article:'',description:'AFWASMIDDEL',packages:1,perPackage:null,quantity:1,unit:'st',ingredientId:null,totalCents:199,vatPct:21}]},all,true);
 assert.equal(r.ok,true);assert.equal(r.slip.receipt,true);
 assert.equal(r.slip.lines[0].totalCents,218);assert.equal(r.slip.lines[0].vatPct,9);assert.equal(r.slip.lines[1].article,'AFWASMIDDEL','de tekst van de bon is het artikel');
 assert.equal(P.netOf(218,9),200);assert.equal(P.netOf(121,21),100);
 const s={ingredients:structuredClone(all),moves:[],invoices:[],recipes:[],incoming:[],recipeHistory:[]};let n=0;const newId=()=>'k'+(++n);
 assert.throws(()=>P.checkBooking({receipt:true,by:'Bart',supplier:'Lidl',number:'',lines:[{ingredientId:'melk',quantity:2,totalCents:218,vatPct:9}]}),/bonnummer/);
 assert.throws(()=>P.checkBooking({receipt:true,by:'Bart',supplier:'Lidl',number:'1',lines:[{ingredientId:'melk',quantity:2}]}),/bedrag/);
 const b=P.checkBooking({receipt:true,date:'2026-11-17',by:'Bart',supplier:'Lidl',number:'14:32 bon 0457',lines:[{ingredientId:'melk',quantity:2,totalCents:218,vatPct:9},{quantity:1,totalCents:199,vatPct:21,newIngredient:{name:'Afwasmiddel',description:'AFWASMIDDEL',article:'AFWASMIDDEL',unit:'st',perPackage:null}}]});
 P.applySlip(s,b,{today:'2026-11-17',newId});
 assert.deepEqual(s.moves.map(m=>m.reason),['Beginvoorraad (kassabon)','Beginvoorraad (kassabon)']);assert.match(s.moves[0].reference,/^Kassabon Lidl 14:32 bon 0457 · Bart$/);
 assert.equal(s.invoices.length,1);const v=s.invoices[0];
 assert.equal(v.supplier,'Lidl');assert.equal(v.date,'2026-11-17');assert.equal(v.reviewed,true);
 assert.deepEqual(v.lines.map(l=>[l.netCents,l.received,l.unit,l.quantity]),[[200,true,'l',2],[164,true,'st',1]]);
 const afwas=s.ingredients.find(i=>i.article==='AFWASMIDDEL');assert.equal(afwas.supplier,'Lidl');assert.match(afwas.notes,/kassabon/);
 // Volgende keer: dezelfde regel van dezelfde winkel wordt herkend.
 const again=P.checkSlip({readable:true,supplier:'Lidl',number:'x',date:null,lines:[{article:'',description:'AFWASMIDDEL',packages:null,perPackage:null,quantity:1,unit:'st',ingredientId:null,totalCents:199,vatPct:21}]},s.ingredients,true);
 assert.equal(again.slip.lines[0].ingredientId,afwas.id);assert.equal(again.slip.lines[0].match,'artikel');
 assert.throws(()=>P.applySlip(s,b,{today:'2026-11-17',newId}),/al verwerkt/);
 assert.throws(()=>P.applySlip(s,P.checkBooking({receipt:true,by:'B',supplier:'Jumbo',number:'1',lines:[{ingredientId:'eigen',quantity:1,totalCents:100,vatPct:9}]}),{today:'2026-11-17',newId}),/eigen boerderij/);
});
test('uploaden: factuur (foto of PDF) met prijzen zonder btw; levering al via de pakbon = alleen prijzen',()=>{
 assert.equal(P.kindOf(true),'kassabon');assert.equal(P.kindOf('factuur'),'factuur');assert.equal(P.kindOf('raar'),'pakbon');
 assert.match(P.slipSchema([],'factuur').properties.lines.items.properties.totalCents.description,/zonder btw/);
 assert.match(P.slipPrompt([],'factuur'),/inkoopfactuur/);
 const r=P.checkSlip({readable:true,supplier:'Bidfood',number:'F-2026-881',date:'2026-11-16',lines:[{article:'12345',description:'TOMATEN TROS 5KG',packages:2,perPackage:5,quantity:10,unit:'kg',ingredientId:null,totalCents:1850,vatPct:9}]},all,'factuur');
 assert.equal(r.slip.kind,'factuur');assert.equal(r.slip.lines[0].ingredientId,'tom');assert.equal(r.slip.lines[0].totalCents,1850);
 assert.throws(()=>P.checkBooking({kind:'factuur',by:'R',supplier:'Bidfood',number:'',lines:[{ingredientId:'tom',quantity:10,totalCents:1850,vatPct:9}]}),/factuurnummer/);
 // Alleen prijzen: de voorraad blijft gelijk, de factuur komt bij Inkoop met het nettobedrag (zonder btw eraf te halen).
 const s={ingredients:structuredClone(all),moves:[],invoices:[],recipes:[],incoming:[],recipeHistory:[]};let n=0;const newId=()=>'f'+(++n);
 const only=P.checkBooking({kind:'factuur',stock:false,by:'Sanne',supplier:'Bidfood',number:'F-2026-881',date:'2026-11-16',lines:[{ingredientId:'tom',quantity:10,totalCents:1850,vatPct:9}]});
 assert.equal(only.stock,false);P.applySlip(s,only,{today:'2026-11-17',newId});
 assert.equal(s.ingredients.find(i=>i.id==='tom').stock,2,'voorraad onveranderd');assert.equal(s.moves.length,0);
 assert.equal(s.invoices[0].lines[0].netCents,1850);assert.equal(s.invoices[0].date,'2026-11-16');assert.match(s.invoices[0].source,/al via de pakbon/);
 // Met voorraad: ook een beweging Levering (factuur).
 P.applySlip(s,P.checkBooking({kind:'factuur',by:'Sanne',supplier:'Bidfood',number:'F-2026-882',lines:[{ingredientId:'tom',quantity:5,totalCents:925,vatPct:9}]}),{today:'2026-11-17',newId});
 assert.equal(s.moves[0].reason,'Levering (factuur)');assert.equal(s.ingredients.find(i=>i.id==='tom').stock,7);
 assert.throws(()=>P.applySlip(s,only,{today:'2026-11-17',newId}),/factuur is al verwerkt/);
 assert.ok(P.BOOKED_REASONS.includes('Levering (factuur)'));
 const route=fs.readFileSync(new URL('../app/api/werkplek/pakbon/route.ts',import.meta.url),'utf8');assert.match(route,/application\\\/pdf/);
 const reader=fs.readFileSync(new URL('../lib/packing-slip.ts',import.meta.url),'utf8');assert.match(reader,/type:'document'/);
});

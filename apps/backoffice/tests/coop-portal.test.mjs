import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import './helpers/ts-resolve.mjs';
const {newToken,hashToken,validToken,portalPath,validDelivery,validPrice,validEmail,applyDelivery}=await import('../lib/coop-portal-core.ts');
const {emptyOps}=await import('../lib/operations-core.ts');

test('persoonlijke link: lang en willekeurig, alleen de hash wordt opgezocht',()=>{
 const a=newToken(),b=newToken();
 assert.equal(validToken(a),true);assert.notEqual(a,b);assert.equal(a.length,43);
 assert.equal(hashToken(a),hashToken(a));assert.notEqual(hashToken(a),a);
 assert.equal(validToken('kort'),false);assert.equal(validToken('../'+a.slice(3)),false);
 assert.equal(portalPath(a),'/deelnemer/'+a);
});
test('invoer: levering 1–2000 stuks, prijs € 0,05–€ 1.000, e-mail',()=>{
 assert.equal(validDelivery(20),true);assert.equal(validDelivery(0),false);assert.equal(validDelivery(2.5),false);assert.equal(validDelivery(2001),false);
 assert.equal(validPrice(450),true);assert.equal(validPrice(4),false);assert.equal(validPrice(100001),false);
 assert.equal(validEmail(''),true);assert.equal(validEmail('ingeborg@voorbeeld.nl'),true);assert.equal(validEmail('geen-mail'),false);
});
const opts=(o={})=>{let n=0;return {productId:'eieren',productName:'Scharreleieren (doos 10)',supplier:'Ingeborg',quantity:20,today:'2026-11-04',newId:()=>'id-'+(++n),reference:'Ingeborg via deelnemerspagina',...o}};
test('eerste levering: doorverkooprecept en telling beginnen, voorraad is meteen de levering',()=>{
 const s=emptyOps(),r=applyDelivery(s,opts());
 assert.equal(r.createdRecipe,true);assert.equal(r.stock,20);
 assert.equal(s.recipes[0].lines[0].ingredientId,s.ingredients[0].id);assert.equal(s.ingredients[0].supplier,'Ingeborg');assert.equal(s.ingredients[0].known,true);
 assert.deepEqual(s.moves.map(m=>[m.quantity,m.reason]),[[20,'Beginvoorraad (levering deelnemer)']]);
});
test('volgende levering telt op bij de bestaande voorraad',()=>{
 const s=emptyOps();applyDelivery(s,opts());s.ingredients[0].stock=4;
 const r=applyDelivery(s,opts({quantity:20}));
 assert.equal(r.createdRecipe,false);assert.equal(r.stock,24);assert.equal(s.moves.at(-1).reason,'Levering deelnemer');assert.equal(s.recipes.length,1);
});
test('een product met een echt recept kan niet via de deelnemerspagina',()=>{
 const s=emptyOps();s.ingredients=[{id:'a',name:'A',unit:'kg',stock:1,known:true}];s.recipes=[{productId:'eieren',name:'x',yield:2,lines:[{ingredientId:'a',quantity:1}],lossPct:0}];
 assert.throws(()=>applyDelivery(s,opts()),/meer ingrediënten/);
});
test('migratie 0024: link per deelnemer met unieke hash, verzoeken standaard open',()=>{
 const dir=new URL('../drizzle/',import.meta.url),files=fs.readdirSync(dir).filter(n=>n.endsWith('.sql')).sort();
 const db=new DatabaseSync(':memory:');for(const n of files)db.exec(fs.readFileSync(new URL(n,dir),'utf8'));
 db.prepare("INSERT INTO coop_participants(id,name,created,updated) VALUES('p1','Ingeborg','x','x')").run();
 db.prepare("INSERT INTO coop_portal_links(participant_id,token_hash,token_sealed,created) VALUES('p1','h1','s','x')").run();
 db.prepare("INSERT INTO coop_participants(id,name,created,updated) VALUES('p2','Bindert','x','x')").run();
 assert.throws(()=>db.prepare("INSERT INTO coop_portal_links(participant_id,token_hash,token_sealed,created) VALUES('p2','h1','s','x')").run(),/UNIQUE/);
 db.prepare("INSERT INTO coop_requests(id,participant_id,kind,created) VALUES('r1','p1','iban','x')").run();
 assert.equal(db.prepare("SELECT status FROM coop_requests").get().status,'open');
});

// ---- Nieuw product door een deelnemer (besluit eigenaar 4 november 2026: meteen live, met een kleine melding) ----
const core=await import('../lib/coop-portal-core.ts');
const {allergenNames}=await import('../lib/sheet-core.ts');
const {publicProducts}=await import('../lib/public-products.ts');
test('nieuw product: invoer wordt gecontroleerd en netjes gemaakt',()=>{
 const ok=core.parseNewProduct({name:'  Aardbeienjam   250 g ',priceCents:450,description:' Eigen jam ',allergens:['Sulfiet','Sulfiet'],allergensChecked:true,quantity:12});
 assert.deepEqual(ok,{name:'Aardbeienjam 250 g',priceCents:450,description:'Eigen jam',vat:'9',allergens:['Sulfiet'],allergensChecked:true,quantity:12,organic:false,skal:false});
 assert.equal(core.parseNewProduct({name:'Bos tulpen',priceCents:500,vat:'21'}).vat,'21');
 assert.equal(core.parseNewProduct({name:'Bos tulpen',priceCents:500}).quantity,0);
 assert.match(core.parseNewProduct({name:'x',priceCents:500}),/productnaam/);
 assert.match(core.parseNewProduct({name:'Jam',priceCents:2}),/prijs/);
 assert.match(core.parseNewProduct({name:'Jam',priceCents:300,vat:'6'}),/btw/);
 assert.match(core.parseNewProduct({name:'Jam',priceCents:300,allergens:['Kaas']}),/allergenen/);
 assert.match(core.parseNewProduct({name:'Jam',priceCents:300,allergens:['Melk']}),/Bevestig/);
 assert.match(core.parseNewProduct({name:'Jam',priceCents:300,quantity:5000}),/levering/);
 // Dezelfde allergenenlijst als de rest van de backoffice.
 assert.deepEqual([...core.ALLERGENS],allergenNames);
});
test('nieuw product: winkelproduct, meteen gepubliceerd en te koop in kassa en webwinkel',()=>{
 const n=core.parseNewProduct({name:'Scharreleieren 6 stuks',priceCents:350,allergens:['Eieren'],allergensChecked:true});
 const d=core.newProductData(n,'/api/media/'+'a'.repeat(8)+'-aaaa-aaaa-aaaa-'+'a'.repeat(12),'Ingeborg','2026-11-04');
 assert.equal(d.station,'winkel');assert.equal(d.department,'Winkel');assert.equal(d.vat,'9');assert.equal(d.available,true);assert.equal(d.check,'');
 assert.match(d.note,/Toegevoegd door Ingeborg via de deelnemerspagina \(2026-11-04\)/);
 const [p]=publicProducts([{id:'p1',version:1,published:JSON.stringify(d)}]);
 assert.equal(p.route,'winkel');assert.equal(p.available,true);assert.deepEqual(p.allergens,['Eieren']);assert.match(p.photo,/^\/api\/public\/media\//);
 // Allergenen niet bevestigd: de website vraagt dan om het in de winkel na te vragen.
 const [q]=publicProducts([{id:'p2',version:1,published:JSON.stringify(core.newProductData(core.parseNewProduct({name:'Bos tulpen',priceCents:500}),'','Bindert','2026-11-04'))}]);
 assert.equal(q.allergens,null);assert.equal(q.photo,null);
});
test('nieuw product: alleen echte foto’s (herkend aan de inhoud)',()=>{
 assert.equal(core.photoType(new Uint8Array([255,216,255,224])),'image/jpeg');
 assert.equal(core.photoType(new Uint8Array([137,80,78,71,13,10])),'image/png');
 assert.equal(core.photoType(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ')),'image/webp');
 assert.equal(core.photoType(new TextEncoder().encode('<svg onload=alert(1)>')),null);
 assert.equal(core.photoType(new TextEncoder().encode('%PDF-1.7')),null);
});
test('nieuw product: melding voor de eigenaar, en de toegang zonder login alleen voor dit adres',async()=>{
 const dir=new URL('../drizzle/',import.meta.url),files=fs.readdirSync(dir).filter(n=>n.endsWith('.sql')).sort();
 const db=new DatabaseSync(':memory:');for(const n of files)db.exec(fs.readFileSync(new URL(n,dir),'utf8'));
 db.prepare("INSERT INTO coop_participants (id,name,created,updated) VALUES ('d1','Ingeborg','nu','nu')").run();
 db.prepare("INSERT INTO coop_requests (id,participant_id,kind,product_id,status,created) VALUES ('r1','d1','nieuw-product','p1','open','nu')").run();
 assert.equal(db.prepare("SELECT product_id FROM coop_requests WHERE id='r1'").get().product_id,'p1');
 // Ledendeuren op één plek (13 november 2026): lib/member-routes.ts.
 const {memberRoute}=await import('../lib/member-routes.ts'),t='a'.repeat(43),rule={test:p=>memberRoute(p,'POST')};
 assert.equal(rule.test('/api/deelnemer/'+t+'/product'),true);assert.equal(rule.test('/api/deelnemer/'+t),true);
 assert.equal(rule.test('/api/deelnemer/'+t+'/product/x'),false);assert.equal(rule.test('/api/deelnemer/'+t+'/anders'),false);
 const lib=fs.readFileSync(new URL('../lib/coop-portal.ts',import.meta.url),'utf8');
 assert.match(lib,/kind:'nieuw-product',productId:id,status:'open'/);
 assert.match(lib,/status:'gezien'/);
});

test('leverancier verwijdert een eigen product: prullenbak, melding voor Boer Bart, niet meer in de lijst',()=>{
 const lib=fs.readFileSync(new URL('../lib/coop-portal.ts',import.meta.url),'utf8');
 assert.match(lib,/export async function removeProduct\(p:PortalParticipant,productId:string\)\{\n await ownProduct\(p,productId\)/,'alleen eigen producten');
 assert.match(lib,/draft:JSON\.stringify\(trashDraft\(draft\)\),published:null/,'uit website en kassa, nooit echt gewist');
 assert.match(lib,/kind:'product-weg',productId,status:'open'/);assert.match(lib,/!isDeleted\(JSON\.parse\(r\.draft\)\)/);
 assert.match(lib,/r\.kind==='nieuw-product'\|\|r\.kind==='product-gewijzigd'\|\|r\.kind==='product-weg'/,'gezien haalt alleen de melding weg');
 const route=fs.readFileSync(new URL('../app/api/deelnemer/[token]/route.ts',import.meta.url),'utf8');assert.match(route,/case 'verwijderen'/);
 const admin=fs.readFileSync(new URL('../app/winkel/afrekening/portaal.tsx',import.meta.url),'utf8');assert.match(admin,/r\.kind==='product-weg'/);assert.match(admin,/r\.kind==='iban'\)\.map/);
});

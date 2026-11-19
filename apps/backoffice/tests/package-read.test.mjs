// Verpakte producten herkennen (wens eigenaar 10 november 2026): streepjescode, inkoopregel uit de facturen, prijsvoorstel met
// 20% marge als er nog geen eigen doelmarge is, en het nieuwe product meteen te koop (keuze A van de eigenaar).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import './helpers/ts-resolve.mjs';
const P=await import('../lib/package-read-core.ts');
const candidates=[{id:'p-melk',name:'1L Melk'},{id:'p-lever',name:'Runderlever'}];
const lines=[{id:'r1',supplier:'Zuivelrijck',date:'2026-11-03',article:'4410',description:'Vanillevla 1 liter (doos 6 st)',quantity:2,unit:'doos',netCents:1680},
 {id:'r2',supplier:'Zuivelrijck',date:'2026-11-03',article:'4420',description:'Yoghurt naturel 1 liter',quantity:12,unit:'stuk',netCents:1440}];

test('streepjescode: alleen met geldig controlecijfer; voorloopnul telt niet',()=>{
 assert.equal(P.normalizeEan('8710400000051'),'8710400000051');
 assert.equal(P.normalizeEan('8710 4000 0005 1'),'8710400000051');
 assert.equal(P.normalizeEan('8710400000052'),null,'verkeerd controlecijfer');
 assert.equal(P.normalizeEan('96385074'),'96385074','EAN-8');
 assert.equal(P.normalizeEan('036000291452'),'036000291452','UPC-A');
 assert.equal(P.normalizeEan('12345'),null);assert.equal(P.normalizeEan(null),null);assert.equal(P.normalizeEan('abc'),null);
 assert.equal(P.sameEan('036000291452','0036000291452'),true);
});

test('prijsvoorstel: inkoopprijs excl. btw + 20% marge + 9% btw, naar boven op 10 cent; nooit onder de marge',()=>{
 assert.equal(P.NEW_PRODUCT_MARGIN_PCT,20);
 // 140 cent inkoop → 175 excl. btw (20% marge) → 190,75 incl. 9% btw → € 1,95? nee: naar boven op 10 cent = € 2,00
 assert.equal(P.proposalCents(140,9),200);
 assert.equal(P.proposalCents(100,9),140,'100/0,8=125 ×1,09=136,25 → 140');
 assert.equal(P.proposalCents(80,9),110,'80/0,8=100 ×1,09=109 → 110');
 assert.equal(P.proposalCents(100,21,40),210,'eigen marge en hoog tarief');
 for(const cost of [37,99,140,1234]){const p=P.proposalCents(cost,9);const ex=p/1.09;assert.ok((ex-cost)/ex>=0.2-1e-9,`marge ≥ 20% bij ${cost}`)}
 assert.throws(()=>P.proposalCents(0,9));assert.throws(()=>P.proposalCents(100,9,100));
});

test('inkoopprijs per verpakking: regel ÷ aantal ÷ stuks per eenheid',()=>{
 assert.equal(P.unitCost(lines[0],6),140,'2 dozen van 6 voor € 16,80 = € 1,40 per pak');
 assert.equal(P.unitCost(lines[1],1),120);
 assert.equal(P.unitCost(lines[1],null),120,'onbekend aantal per eenheid: 1');
 assert.equal(P.unitCost({...lines[1],quantity:0},1),null);
});

test('verpakking lezen: nieuw product met naam, streepjescode en inkoopregel; bekend product; onleesbaar',()=>{
 const r=P.checkPackage({readable:true,productId:null,labelName:'',productName:'Zuivelrijck vanillevla 1 liter',barcode:'8710400000051',invoiceLineId:'r1',piecesPerUnit:6,totalCents:null},candidates,lines);
 assert.deepEqual(r,{ok:true,productId:null,newName:'Zuivelrijck vanillevla 1 liter',labelName:'Zuivelrijck vanillevla 1 liter',barcode:'8710400000051',
  cost:{supplier:'Zuivelrijck',date:'2026-11-03',description:'Vanillevla 1 liter (doos 6 st)',unitCostCents:140}});
 const known=P.checkPackage({readable:true,productId:'p-melk',productName:'Melk',barcode:null,invoiceLineId:null,piecesPerUnit:null},candidates,lines);
 assert.equal(known.ok&&known.productId,'p-melk');
 const unknownLine=P.checkPackage({readable:true,productId:null,productName:'Kwark 500 g',barcode:'123',invoiceLineId:'r99',piecesPerUnit:1},candidates,lines);
 assert.equal(unknownLine.ok&&unknownLine.cost,null,'onbekende regel-id: geen inkoopprijs');assert.equal(unknownLine.ok&&unknownLine.barcode,null,'ongeldige code weg');
 assert.equal(P.checkPackage({readable:false},candidates,lines).ok,false);
 assert.equal(P.checkPackage({readable:true,productId:null,productName:'??',labelName:''},candidates,lines).ok,false);
 const s=P.readSchema(candidates,lines);assert.equal(s.additionalProperties,false);for(const k of ['productName','barcode','invoiceLineId','piecesPerUnit'])assert.ok(s.required.includes(k));
 assert.match(P.readPrompt(candidates,lines),/r1: Zuivelrijck, Vanillevla 1 liter \(doos 6 st\) \(art\. 4410\), 2 × doos/);
});

test('aanmaken en koppelen: nieuw product met vaste prijs en code, hergebruik op code, code bij bestaand product, herkend zonder Claude',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-pakket-'));process.env.APP_DATA_DIR=dir;
 const {closeDatabase}=await import('../lib/portable/env.ts');
 t.after(async()=>{await closeDatabase();fs.rmSync(dir,{recursive:true,force:true})});
 const L=await import('../lib/label-products.ts'),R=await import('../lib/label-read.ts');
 const cost={supplier:'Zuivelrijck',date:'2026-11-03',description:'Vanillevla 1 liter (doos 6 st)',unitCostCents:140};
 const made=await L.ensurePackagedProduct('Zuivelrijck vanillevla 1 liter','vanillevla','8710400000051',200,cost);
 assert.equal(made.ok&&made.created,true);
 const p=made.ok&&made.product;assert.equal(p.priceCents,200);assert.equal(p.customerPrice,false);assert.equal(p.route,'winkel');assert.deepEqual(p.barcodes,['8710400000051']);
 const again=await L.ensurePackagedProduct('Andere naam','x','8710400000051',300,cost);
 assert.equal(again.ok&&again.created,false,'zelfde code: zelfde product');assert.equal(again.ok&&again.product.id,p.id);
 // Herkend op de streepjescode, zonder foto te lezen (geen Claude-sleutel nodig).
 const seen=await R.readLabelProduct({mediaType:'image/jpeg',data:'QUJD'},'8710400000051');
 assert.equal(seen.ok&&seen.productId,p.id);assert.equal(seen.ok&&seen.totalCents,200);
 // Code bij een ander product: niet dubbel; bij hetzelfde product: al aanwezig.
 const other=await L.ensurePackagedProduct('Zuivelrijck yoghurt 1 liter','yoghurt',null,160,cost);
 assert.equal(await L.attachBarcode(other.product.id,'8710400000051'),false,'hoort al bij de vla');
 assert.equal(await L.attachBarcode(other.product.id,'96385074'),true);
 assert.equal(await L.attachBarcode(other.product.id,'96385074'),false,'al aanwezig');
 const by=await R.readLabelProduct({mediaType:'image/jpeg',data:'QUJD'},'96385074');assert.equal(by.ok&&by.productId,other.product.id);
});

test('Levering fotograferen (werkplek): zonder inkoopprijs zelf de verkoopprijs invullen; daarna herkend op de streepjescode',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-levering-'));process.env.APP_DATA_DIR=dir;delete process.env.APP_ORIGIN;
 const {closeDatabase}=await import('../lib/portable/env.ts');
 t.after(async()=>{await closeDatabase();fs.rmSync(dir,{recursive:true,force:true})});
 const {POST}=await import('../app/api/werkplek/etiket/route.ts');
 const call=body=>POST(new Request('http://127.0.0.1:3001/api/werkplek/etiket',{method:'POST',headers:{'Content-Type':'application/json',origin:'http://127.0.0.1:3001','x-boer-bart-account':'test'},body:JSON.stringify(body)}));
 assert.equal((await call({name:'Kwark',priceCents:0})).status,400,'geen prijs');
 const r=await call({name:'Zuivelrijck kwark 500 gram',barcode:'96385074',priceCents:275});const d=await r.json();
 assert.equal(r.status,200);assert.equal(d.created,true);assert.equal(d.totalCents,275);assert.equal(d.product.customerPrice,false);assert.deepEqual(d.product.barcodes,['96385074']);
 const again=await call({image:'data:image/jpeg;base64,QUJD',barcode:'96385074'});const a=await again.json();
 assert.equal(again.status,200);assert.equal(a.productId,d.productId);assert.equal(a.created,false);
 const bad=await POST(new Request('http://127.0.0.1:3001/api/werkplek/etiket',{method:'POST',headers:{'Content-Type':'application/json',origin:'https://elders.example'},body:'{}'}));
 assert.equal(bad.status,403,'alleen vanaf de eigen backoffice');
});

test('werkplek: Uit de winkel halen en Levering gebruiken de eigen camera met Volgend etiket en Klaar, zoals de zelfkassa',()=>{
 const page=fs.readFileSync(new URL('../app/werkplek/voorraad/page.tsx',import.meta.url),'utf8'),cam=fs.readFileSync(new URL('../app/werkplek/label-camera.tsx',import.meta.url),'utf8');
 assert.equal((page.match(/<LabelCamera /g)||[]).length,2,'in beide tabbladen');
 assert.match(cam,/Volgend etiket/);assert.match(cam,/Klaar \(/);assert.match(cam,/getUserMedia/);assert.match(cam,/capture="environment"/,'zonder camera: de camera-app');
 assert.match(page,/barcode\?\{image,barcode\}:\{image\}/,'streepjescode gaat mee');
});

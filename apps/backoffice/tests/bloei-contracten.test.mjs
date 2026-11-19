// ShareCouncil-contracten koppelen (12 november 2026). Alleen verzonnen namen en adressen; nooit een echt contract hierin.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import './helpers/ts-resolve.mjs';
const core=await import('../lib/bloei-contracten-core.ts');
const {parseContract,matchContracts,contractCoverage,nameMatch}=core;

// Zelfde opbouw als een ShareCouncil-bevestiging (Nederlands, daarna Engels), met verzonnen gegevens.
const contract=({buyer='Jantje Voorbeeld',born='donderdag 9 augustus 1962',address='Proefweg 1, 1234AB Voorbeeldstad',date='dinsdag 20 juni 2023',product='Boer Bart Bloei-Obligatie 2 procent',units=2,price='1.000'}={})=>`Bevestiging van Inschrijving
en
Uitgifte
en
Verkoop
en
Levering
van
${product}
Dit is een bevestiging van de inschrijving, uitgifte, verkoop en levering van ${product} Obligaties welke
plaatsvond op ${date} tussen:
${buyer}, een individu geboren op ${born} in Nederland, momenteel woonachtig te ${address},
Nederland (de ‘Koper’ )
en
Boer Bartele, een vennootschap onder firma met beperkte aansprakelijkheid opgericht in Nederland op dinsdag 17 december
2013 naar Nederlands recht, gevestigd te Schoterweg 26 8462TD Rotstergaast, Nederland, ingeschreven in het
handelsregister van de Kamer van Koophandel ('Handelsregister') onder nummer 00 0 00000 (de ‘Uitgever’ )
De Koper heeft zich hierbij voor een aantal Obligaties ingeschreven.
‘Aantal Obligaties’: ${units}
‘Prijs per Obligatie’: € ${price}
‘Totale Inschrijfprijs’: € 2.000
Powered by
Confirmation of the Subscription
This is a confirmation that took place on Tuesday 1st January 2030 between: Someone Else, an individual (the 'Buyer')`;

const person=(id,name,issuer=false)=>({id,externalId:id,name,emails:[],address:'',legalType:'natural_person',iban:'',sourceRefs:[],issuer});
const tx=(sourceId,receiverId,receiver,date,units,extra={})=>({scheme:'cash2',status:'completed',sourceId,date,senderId:'sc:boer',receiverId,sender:'Boer Bartele',receiver,units,unitCents:100000,serials:[],sourceRef:'x',...extra});
function real(){return {schema:1,mode:'imported',importedAt:'2026-11-06T10:00:00.000Z',digest:'a'.repeat(64),
 members:[person('sc:boer','Boer Bartele',true),person('sc:1','Jantje Voorbeeld'),person('sc:2','Pietje Proef'),person('sc:3','Klaas de Vries'),person('sc:4','Klaas de Vries')],
 positions:[{id:'p1',memberId:'sc:1',scheme:'cash2',rate:2,units:2,unitCents:100000,serials:[1,2],issued:'2023-06-20',matures:null,sourceRef:'x',origin:'foundation'},{id:'p2',memberId:'sc:2',scheme:'cash2',rate:2,units:1,unitCents:100000,serials:[3],issued:'2023-07-01',matures:null,sourceRef:'x',origin:'foundation'}],
 credits:[],warnings:[],sources:[],
 history:[tx('11','sc:1','Jantje Voorbeeld','2023-06-20',2),tx('12','sc:2','Pietje Proef','2023-07-01',1),tx('13','sc:1','Jantje Voorbeeld','2023-06-20',2,{scheme:'grocery6'})]};}
const item=(text,n=1)=>({name:`TransactionDocument_${n}.pdf`,sha256:createHash('sha256').update(text+n).digest('hex'),text});

test('leest koper, datum, regeling, aantal en prijs uit de Nederlandse helft (niet de geboortedatum of het Engels)',()=>{
 const p=parseContract(contract());
 assert.equal(p.buyer.name,'Jantje Voorbeeld');assert.equal(p.buyer.address,'Proefweg 1, 1234AB Voorbeeldstad');assert.equal(p.seller.role,'uitgever');
 assert.equal(p.date,'2023-06-20');assert.equal(p.units,2);assert.equal(p.unitCents,100000);assert.equal(p.scheme,'cash2');assert.equal(p.product,'Boer Bart Bloei-Obligatie 2 procent');
 assert.equal(parseContract(contract({product:'Boer Bart Bloei-Obligatie 2,6 procent'})).scheme,'cash26');
 assert.equal(parseContract('Een factuur zonder bevestiging'),null);
});

test('namen: hoofdletters, accenten en tussennamen tellen niet als verschil; een andere naam wel',()=>{
 assert.equal(nameMatch('Jantje Voorbeeld','jantje  voorbéeld'),2);assert.equal(nameMatch('Jantje Maria Voorbeeld','Jantje Voorbeeld'),1);assert.equal(nameMatch('Jantje Voorbeeld','Pietje Proef'),0);
});

test('koppelt aan de transactie met dezelfde koper, datum, aantal, prijs en regeling; twee keer dezelfde PDF of transactie valt op',()=>{
 const r=real(),[a,b,c,d]=matchContracts([item(contract(),1),item(contract({buyer:'Pietje Proef',date:'zaterdag 1 juli 2023',units:1}),2),item(contract(),1),item(contract(),4)],r);
 assert.equal(a.status,'zeker');assert.equal(a.memberId,'sc:1');assert.equal(a.sourceRef,'cash2:11');assert.match(a.title,/Bevestiging inschrijving · Boer Bart Bloei-Obligatie 2 procent · 2 obligaties · 20-06-2023/);assert.equal(a.documentVersion,'2023-06-20');
 assert.equal(b.status,'zeker');assert.equal(b.memberId,'sc:2');
 assert.equal(c.status,'dubbel');
 assert.equal(d.status,'controleren');assert.equal(d.memberId,'sc:1');assert.equal(d.sourceRef,'');
 // Al opgeslagen in Bloei: dezelfde PDF of dezelfde transactie.
 assert.equal(matchContracts([item(contract(),1)],r,[{sha256:a.sha256}])[0].status,'dubbel');
 assert.equal(matchContracts([item(contract(),9)],r,[{sourceRef:'cash2:11'}])[0].status,'controleren');
});

test('zonder passende transactie alleen op naam; twijfel bij dubbele of onbekende namen; nooit bij de uitgever',()=>{
 const r=real();
 const p=matchContracts([item(contract({date:'maandag 2 januari 2023'}),1)],r)[0];assert.equal(p.status,'waarschijnlijk');assert.equal(p.memberId,'sc:1');assert.equal(p.sourceRef,'');
 const twin=matchContracts([item(contract({buyer:'Klaas de Vries',date:'maandag 2 januari 2023'}),2)],r)[0];assert.equal(twin.status,'controleren');assert.equal(twin.memberId,'');assert.deepEqual(twin.candidates.map(c=>c.id).sort(),['sc:3','sc:4']);
 const unknown=matchContracts([item(contract({buyer:'Niemand Bekend'}),3)],r)[0];assert.equal(unknown.status,'controleren');assert.equal(unknown.memberId,'');
 const boer=matchContracts([item(contract({buyer:'Boer Bartele'}),4)],r)[0];assert.notEqual(boer.memberId,'sc:boer');
 assert.equal(matchContracts([item('niets bruikbaars',5)],r)[0].status,'onleesbaar');
});

test('dekking: welke houders en afgeronde transacties nog geen contract hebben',()=>{
 const c=contractCoverage(real(),[{category:'overeenkomst',memberId:'sc:1',sourceRef:'cash2:11'},{category:'reglement',memberId:'',sourceRef:'cash2:12'}]);
 assert.equal(c.agreements,1);assert.equal(c.holders,2);assert.deepEqual(c.holdersWithout.map(m=>m.id),['sc:2']);
 assert.equal(c.transactions,3);assert.deepEqual(c.transactionsWithout.map(t=>t.sourceRef).sort(),['cash2:12','grocery6:13']);
});

test('opslaan: één handeling voor alle bevestigde koppelingen, versleuteld, per lid, en geen tweede keer dezelfde PDF',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-contract-'));process.env.APP_DATA_DIR=dir;process.env.DATABASE_URL='';process.env.SHEETS_CONFIG_KEY='cd'.repeat(32);delete process.env.BLOEI;
 const {env,closeDatabase}=await import('../lib/portable/env.ts');const realStore=await import('../lib/bloei-real-store.ts');const store=await import('../lib/bloei-market-store.ts');
 t.after(async()=>{await closeDatabase();fs.rmSync(dir,{recursive:true,force:true})});
 await env.DB.prepare("INSERT INTO bloei_administration(id,digest,data_sealed,sources_sealed,imported_at,imported_by) VALUES('main',?,?,?,?,?)").bind('b'.repeat(64),realStore.sealImport(real()),'archief','2026-11-06T10:00:00.000Z','test').run();
 const pdf=n=>Buffer.from(`%PDF-1.4\nverzonnen contract ${n}\n%%EOF`),sha=b=>createHash('sha256').update(b).digest('hex');
 const files=[1,2].map(n=>new File([pdf(n)],`TransactionDocument_${n}.pdf`,{type:'application/pdf'}));
 const plan=[{memberId:'sc:1',sha256:sha(pdf(1)),title:'Bevestiging inschrijving',documentVersion:'2023-06-20',sourceRef:'cash2:11'},{memberId:'sc:2',sha256:sha(pdf(2)),title:'Bevestiging inschrijving',documentVersion:'2023-07-01',sourceRef:''}];
 const version=async()=>String((await store.marketAdmin()).version);
 await assert.rejects(async()=>store.saveContractBatch(files,{plan:JSON.stringify(plan),confirm:'false',publish:'true',version:await version()},'test'),/Bevestig/);
 await assert.rejects(async()=>store.saveContractBatch(files,{plan:JSON.stringify([{...plan[0],memberId:'sc:boer'},plan[1]]),confirm:'true',publish:'true',version:await version()},'test'),/bestaand lid/);
 await assert.rejects(async()=>store.saveContractBatch(files,{plan:JSON.stringify([{...plan[0],sha256:'0'.repeat(64)},plan[1]]),confirm:'true',publish:'true',version:await version()},'test'),/gewijzigd na de controle/);
 assert.equal((await store.marketAdmin()).documents.length,0);
 const ids=await store.saveContractBatch(files,{plan:JSON.stringify(plan),confirm:'true',publish:'true',version:await version()},'test');assert.equal(ids.length,2);
 const docs=(await store.marketAdmin()).documents;assert.deepEqual(docs.map(d=>[d.memberId,d.category,d.visibility,d.published,d.sourceRef]),[['sc:1','overeenkomst','member',true,'cash2:11'],['sc:2','overeenkomst','member',true,undefined]]);
 assert.deepEqual(Buffer.from(await (await store.documentDownload(ids[0],{memberId:'sc:1'})).arrayBuffer()),pdf(1));
 await assert.rejects(()=>store.documentDownload(ids[0],{memberId:'sc:2'}),/niet gevonden/);
 assert.equal((await store.documentsForMember('sc:2')).length,1);
 await assert.rejects(async()=>store.saveContractBatch([files[0]],{plan:JSON.stringify([plan[0]]),confirm:'true',publish:'true',version:await version()},'test'),/staat al in Bloei/);
 const review=await store.contractReview([{name:'TransactionDocument_1.pdf',sha256:sha(pdf(1)),text:contract()}]);assert.equal(review.proposals[0].status,'dubbel');
 assert.deepEqual(review.coverage.holdersWithout,[]);
});

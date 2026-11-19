// Server Direct Print van begin tot eind (akkoord eigenaar 5 november 2026): echte verzoeken zoals de Epson-printer ze stuurt,
// tegen de echte database-opbouw (PGlite in een tijdelijke map), met de ingang, de wachtrij en de beheer-API samen.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-print-queue-'));
process.env.APP_DATA_DIR=dir;
process.env.PRINTER_RUSTIG='uit'; // altijd de drukke stand; de rustige stand heeft eigen tests (printer-pace.test.mjs)
import './helpers/ts-resolve.mjs';
const {runQuery,closeDatabase,numberParams}=await import('../lib/portable/env.ts');
const {handlePrinterRequest}=await import('../lib/print-endpoint.ts');
const {hashSecret,newSecret,EPOS_NS}=await import('../lib/printer-sdp.ts');
const {testPrint,reprint,recentJobs}=await import('../lib/print-queue.ts');
test.after(async()=>{await closeDatabase();fs.rmSync(dir,{recursive:true,force:true})});

const q=async(sql,...p)=>(await runQuery(numberParams(sql),p,false)).rows;
// Twee testprinters (de database begint zonder printers; die voeg je toe bij Koppelingen & printers).
await q(`INSERT INTO printers(id,name,station,host,port,model,paper,active,note,version,updated,updated_by) VALUES
 ('printer-kok','Printer kok','kok','192.168.1.20',9100,'Epson TM-m30III',80,1,'test',1,'2026-11-19T00:00:00.000Z','test'),
 ('printer-barista','Printer barista','barista','192.168.1.21',9100,'Epson TM-m30III',80,1,'test',1,'2026-11-19T00:00:00.000Z','test') ON CONFLICT (id) DO NOTHING`);
const secret=newSecret(),barSecret=newSecret();
const basic=(user,pass)=>'Basic '+Buffer.from(user+':'+pass).toString('base64');
const ask=(auth=basic('printer-kok',secret),token)=>handlePrinterRequest(new Request('https://backoffice.test/api/public/printers/sdp'+(token?'/'+token:''),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',...(auth?{Authorization:auth}:{})},body:'ConnectionType=GetRequest&ID=printer-kok&Name=TM-m30III'}),token);
const answer=(job,success,code='',auth=basic('printer-kok',secret))=>{
 const file=`<?xml version="1.0" encoding="utf-8"?><PrintResponseInfo Version="2.00"><ePOSPrint><Parameter><devid>local_printer</devid><printjobid>${job}</printjobid></Parameter><PrintResponse><response success="${success}" code="${code}" status="0" battery="0" xmlns="${EPOS_NS}"></response></PrintResponse></ePOSPrint></PrintResponseInfo>`;
 return handlePrinterRequest(new Request('https://backoffice.test/api/public/printers/sdp',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Authorization:auth},body:'ConnectionType=SetResponse&ID=printer-kok&ResponseFile='+encodeURIComponent(file)}));
};
const jobOf=async r=>{const x=await r.text();return x?/<printjobid>(bb\d+)<\/printjobid>/.exec(x)?.[1]+'|'+x:''};
let n=0;
async function order({lines,status='vastgelegd',created=new Date().toISOString(),reference='Tafel 4',mode='yte'}){
 const data=JSON.stringify({mode,reference,lines:lines.map(([name,station,quantity])=>({productId:name,name,quantity,unitCents:100,totalCents:100*quantity,vat:'9',vatCents:8,station,choices:[],note:''})),guest:{name:'Sanne'}});
 const [{id}]=await q('INSERT INTO orders(request_id,request,data,created,mode,reference,status) VALUES(?,?,?,?,?,?,?) RETURNING id','print-'+(++n),'{}',data,created,mode,reference,status);
 let pos=0;for(const [name,station,quantity] of lines)await q('INSERT INTO order_lines(order_id,position,product_id,name,station,quantity,unit_cents,total_cents,vat,vat_cents) VALUES(?,?,?,?,?,?,?,?,?,?)',id,pos++,name,name,station,quantity,100,100*quantity,'9',8);
 return id;
}

test('de printer haalt alleen zijn eigen bonnen op, één keer, en herstelt na papier op',async()=>{
 const linked=new Date().toISOString();
 const before=await order({lines:[['Oude soep','kok',1]],created:new Date(Date.now()-3600000).toISOString()});
 await q("UPDATE printers SET secret_hash=?,print_from=? WHERE id='printer-kok'",hashSecret(secret),linked);
 await q("UPDATE printers SET secret_hash=?,print_from=? WHERE id='printer-barista'",hashSecret(barSecret),linked);

 // Zonder of met een verkeerde sleutel: niets.
 for(const auth of [null,basic('printer-kok','x'.repeat(43)),basic('printer-barista',secret),basic('printer-kok','kort')]){const r=await ask(auth);assert.equal(r.status,401);assert.match(r.headers.get('www-authenticate'),/Basic/);assert.equal(await r.text(),'')}
 assert.equal((await ask()).status,200);assert.equal(await (await ask()).text(),'','geen bestellingen: lege reactie');

 const first=await order({lines:[['Monchoutaart','kok',2],['Cappuccino','barista',1]]});
 const waiting=await order({lines:[['Boerenlunch','kok',1]],status:'wacht-op-betaling',reference:'Online 7'});
 let r=await ask();assert.equal(r.headers.get('content-type'),'text/xml; charset=utf-8');
 let got=await jobOf(r);const [job]=got.split('|');
 assert.ok(got.includes('2x Monchoutaart')&&got.includes('P'+String(first).padStart(5,'0'))&&got.includes('Tafel 4'));
 assert.ok(!got.includes('Cappuccino'),'dranken gaan naar de barista');assert.ok(!got.includes('Oude soep'),'geen bestellingen van voor het koppelen');assert.ok(!got.includes('Boerenlunch'),'onbetaald: nog niet');
 assert.equal(await (await ask()).text(),'','verstuurde bon wordt niet direct nog eens gegeven');

 // Papier op: de bon blijft wachten en komt bij de volgende vraag terug.
 assert.equal((await answer(job,false,'EPTR_REC_EMPTY')).status,200);
 let [row]=await q('SELECT status,last_error,attempts FROM print_jobs WHERE id=?',Number(job.slice(2)));assert.deepEqual(row,{status:'wachtrij',last_error:'het papier is op (EPTR_REC_EMPTY)',attempts:1});
 got=await jobOf(await ask());assert.equal(got.split('|')[0],job);
 await answer(job,true);[row]=await q('SELECT status,attempts,done_at FROM print_jobs WHERE id=?',Number(job.slice(2)));assert.equal(row.status,'afgedrukt');assert.equal(row.attempts,2);assert.ok(row.done_at);
 assert.equal(await (await ask()).text(),'');

 // Betaald: dan komt de bon alsnog.
 await q("UPDATE orders SET status='vastgelegd' WHERE id=?",waiting);
 got=await jobOf(await ask());assert.ok(got.includes('1x Boerenlunch')&&got.includes('Online 7'));await answer(got.split('|')[0],true);

 // De barista heeft een eigen wachtrij, ook via de sleutel in het adres.
 const bar=await jobOf(await ask(null,barSecret));assert.ok(bar.includes('1x Cappuccino')&&bar.includes('>BAR&#10;'));
 assert.equal((await answer(bar.split('|')[0],true,'',basic('printer-kok',secret))).status,200);
 assert.equal((await q('SELECT status FROM print_jobs WHERE id=?',Number(bar.split('|')[0].slice(2))))[0].status,'verstuurd','een printer kan geen bon van een andere printer afmelden');

 assert.deepEqual((await q("SELECT order_id FROM print_jobs WHERE kind='bon' AND printer_id='printer-kok' ORDER BY id")).map(x=>x.order_id),[first,waiting],'elke bestelling precies één bon');
 assert.equal((await q('SELECT count(*)::int c FROM print_jobs WHERE order_id=?',before))[0].c,0);
 assert.ok((await q("SELECT last_seen FROM printers WHERE id='printer-kok'"))[0].last_seen>=linked);
});

test('testafdruk, opnieuw afdrukken, niet-herstelbare fout en verlopen bonnen',async()=>{
 await testPrint('printer-kok','eigenaar');
 let got=await jobOf(await ask());assert.ok(got.includes('TESTAFDRUK'));await answer(got.split('|')[0],true);
 const [done]=await q("SELECT id FROM print_jobs WHERE printer_id='printer-kok' AND kind='bon' ORDER BY id LIMIT 1");
 await reprint(done.id,'eigenaar');got=await jobOf(await ask());assert.ok(got.includes('OPNIEUW AFGEDRUKT')&&got.includes('2x Monchoutaart'));
 // Onleesbare bon (schemafout): na 5 pogingen gemarkeerd als mislukt, zodat hij niet eindeloos blijft terugkomen.
 const id=got.split('|')[0];for(let i=1;i<5;i++){await answer(id,false,'SchemaError');got=await jobOf(await ask());assert.equal(got.split('|')[0],id)}
 await answer(id,false,'SchemaError');assert.equal((await q('SELECT status FROM print_jobs WHERE id=?',Number(id.slice(2))))[0].status,'fout');
 // Een bon van 13 uur geleden (printer stond een nacht uit) wordt niet meer afgedrukt.
 await q("INSERT INTO print_jobs(printer_id,kind,xml,title,created) VALUES('printer-kok','test','<text/>','oud',?)",new Date(Date.now()-13*3600000).toISOString());
 assert.equal(await (await ask()).text(),'');
 assert.equal((await q("SELECT status FROM print_jobs WHERE title='oud'"))[0].status,'verlopen');
 const overview=(await recentJobs(['printer-kok'])).get('printer-kok');assert.equal(overview.waiting,0);assert.ok(overview.jobs.some(j=>j.status==='fout'));
});

test('twee vragen tegelijk krijgen nooit dezelfde bon',async()=>{
 await order({lines:[['Soep','kok',1]]});await order({lines:[['Brood','kok',1]]});
 const [a,b]=await Promise.all([ask(),ask()]).then(rs=>Promise.all(rs.map(jobOf)));
 const ids=[a,b].map(x=>x.split('|')[0]).filter(Boolean);
 assert.equal(new Set(ids).size,ids.length);
});

test('afhalen en winkel: de bon komt pas na het afrekenen (besluit eigenaar 8 november 2026)',async()=>{
 for(const mode of ['zelfservice','winkel']){
  const id=await order({lines:[['Latte '+mode,'barista',1]],mode,reference:'Afhaal '+mode});
  assert.equal(await (await ask(null,barSecret)).text(),'',mode+': nog niet afgerekend, dus nog geen bon');
  await q("UPDATE orders SET payment_status='betaald' WHERE id=?",id);
  const got=await jobOf(await ask(null,barSecret));assert.ok(got.includes('1x Latte '+mode),mode+': na het afrekenen komt de bon');
  await answer(got.split('|')[0],true,'',basic('printer-barista',barSecret));
 }
 // Ite (tafelbediening) rekent achteraf af: die bon komt meteen.
 await order({lines:[['Thee aan tafel','barista',1]]});
 const got=await jobOf(await ask(null,barSecret));assert.ok(got.includes('1x Thee aan tafel'));
 await answer(got.split('|')[0],true,'',basic('printer-barista',barSecret));
});

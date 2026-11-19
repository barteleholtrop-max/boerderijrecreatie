import {test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/ts-resolve.mjs';
const {parseSdpForm,parseResponseFile,printRequest,ticketBody,testBody,markReprint,printable,basicCredentials,hashSecret,newSecret,SECRET,recoverable,explainCode,jobIdFromPrinter,printJobId,EPOS_NS}=await import('../lib/printer-sdp.ts');

const ticket={station:'kok',number:'P00042',reference:'Tafel 4',mode:'yte',created:'2026-11-05T11:30:00.000Z',paper:80,guest:'Sanne',
 lines:[{name:'Monchoutaart',quantity:2,choices:['Slagroom: ja'],note:'zonder noten'},{name:'🍯🥛Honing & Melk <pakket>',quantity:1,choices:[],note:''}]};

test('formulier van de printer: GetRequest en SetResponse met ResponseFile',()=>{
 assert.deepEqual(parseSdpForm('ConnectionType=GetRequest&ID=printer-kok&Name=TM-m30III'),{type:'GetRequest',id:'printer-kok',name:'TM-m30III',responseFile:''});
 const file='<?xml version="1.0" encoding="utf-8"?><PrintResponseInfo Version="2.00"><ePOSPrint><Parameter><devid>local_printer</devid><printjobid>bb17</printjobid></Parameter><PrintResponse><response success="false" code="EPTR_REC_EMPTY" status="252182532" battery="0" xmlns="'+EPOS_NS+'"/></PrintResponse></ePOSPrint></PrintResponseInfo>';
 const f=parseSdpForm('ConnectionType=SetResponse&ID=printer-kok&ResponseFile='+encodeURIComponent(file));
 assert.equal(f.type,'SetResponse');
 assert.deepEqual(parseResponseFile(f.responseFile),{jobId:'bb17',success:false,code:'EPTR_REC_EMPTY',status:'252182532'});
 assert.equal(parseResponseFile(file.replace('success="false" code="EPTR_REC_EMPTY"','success="true" code=""')).success,true);
 assert.equal(parseResponseFile('<rommel/>'),null);assert.equal(parseResponseFile(''),null);
});
test('antwoord met bon: PrintRequestInfo 2.00 met opdrachtnummer en epos-print',()=>{
 const xml=printRequest(17,ticketBody(ticket));
 assert.match(xml,/^<\?xml version="1.0" encoding="utf-8"\?>\n<PrintRequestInfo Version="2.00"><ePOSPrint><Parameter><devid>local_printer<\/devid><timeout>10000<\/timeout><printjobid>bb17<\/printjobid><\/Parameter><PrintData><epos-print xmlns="http:\/\/www.epson-pos.com\/schemas\/2011\/03\/epos-print">/);
 assert.match(xml,/<\/epos-print><\/PrintData><\/ePOSPrint><\/PrintRequestInfo>$/);
 assert.equal(jobIdFromPrinter(printJobId(17)),17);assert.equal(jobIdFromPrinter('bb17x'),null);assert.equal(jobIdFromPrinter('17'),null);
 assert.ok(printJobId(Number.MAX_SAFE_INTEGER).length<=30,'Epson keeps job IDs of at most 30 characters');
});
test('bereidingsbon: werkplek, groot nummer en tafel, regels met keuzes en opmerking, afsnijden',()=>{
 const body=ticketBody(ticket);
 for(const s of ['KEUKEN','P00042','Tafel 4','Yte - aan tafel','Gast: Sanne','2x Monchoutaart','Slagroom: ja','! zonder noten','<cut type="feed"/>'])assert.ok(body.includes(s),s);
 assert.ok(body.includes('1x Honing &amp; Melk &lt;pakket&gt;'),'emoji removed, special characters escaped');
 assert.ok(!/[^\x20-\x7e]/.test(body),'only printable ASCII goes to the printer');
 assert.equal((body.match(/-{48}/g)||[]).length,2,'80 mm: 48 columns');
 assert.equal((ticketBody({...ticket,paper:58}).match(/-{32}&#10;/g)||[]).length,2,'58 mm: 32 columns');
 assert.ok(ticketBody({...ticket,station:'barista'}).includes('>BAR&#10;'));
 const again=markReprint(body);assert.ok(again.includes('OPNIEUW AFGEDRUKT'));assert.equal(markReprint(again),again);
 assert.match(testBody({name:'Printer kok',station:'kok',paper:80},'2026-11-05T11:30:00.000Z'),/TESTAFDRUK.*Printer kok/);
});
test('tekst voor de bonprinter: accenten, euro en emoji',()=>{
 assert.equal(printable('Crème brûlée € 4,50 🍰'),'Creme brulee EUR 4,50');
 assert.equal(printable('Kofje “tsjok” – 2×'),'Kofje "tsjok" - 2x');
});
test('koppelsleutel: willekeurig, alleen als hash bewaard, Basic-aanmelding gelezen',()=>{
 const a=newSecret(),b=newSecret();assert.match(a,SECRET);assert.notEqual(a,b);assert.equal(hashSecret(a).length,64);assert.notEqual(hashSecret(a),a);
 assert.deepEqual(basicCredentials('Basic '+Buffer.from('printer-kok:'+a).toString('base64')),{user:'printer-kok',password:a});
 assert.equal(basicCredentials('Bearer x'),null);assert.equal(basicCredentials(null),null);assert.equal(basicCredentials('Basic '+Buffer.from('zonderdubbelepunt').toString('base64')),null);
});
test('fouten: papier op of klep open blijft wachten, andere fouten krijgen een uitleg',()=>{
 assert.equal(recoverable('EPTR_REC_EMPTY'),true);assert.equal(recoverable('EPTR_COVER_OPEN'),true);assert.equal(recoverable('SchemaError'),false);
 assert.equal(explainCode('EPTR_REC_EMPTY'),'het papier is op (EPTR_REC_EMPTY)');assert.equal(explainCode('XYZ'),'printerfout (XYZ)');
});

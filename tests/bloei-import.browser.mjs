import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import fs from 'node:fs';
import {deflateRawSync} from 'node:zlib';
import {createRequire} from 'node:module';
const {chromium}=createRequire(new URL('./browser/package.json',import.meta.url))('playwright');
function crc32(bytes){let c=-1;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0)}return (c^-1)>>>0}
function zip(parts,compressed){
 const blocks=[],central=[];let offset=0;
 for(const [name,text] of parts){const n=Buffer.from(name),bytes=Buffer.from(text),data=compressed?deflateRawSync(bytes):bytes,method=compressed?8:0,crc=crc32(bytes),local=Buffer.alloc(30),entry=Buffer.alloc(46);
  local.writeUInt32LE(0x04034b50);local.writeUInt16LE(method,8);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(bytes.length,22);local.writeUInt16LE(n.length,26);
  entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(method,10);entry.writeUInt32LE(crc,16);entry.writeUInt32LE(data.length,20);entry.writeUInt32LE(bytes.length,24);entry.writeUInt16LE(n.length,28);entry.writeUInt32LE(offset,42);
  blocks.push(local,n,data);central.push(entry,n);offset+=local.length+n.length+data.length;
 }
 const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(parts.length,8);end.writeUInt16LE(parts.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...blocks,directory,end]);
}
const parts=()=>[
 ['xl/workbook.xml','<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Voorbeeld" r:id="r1"/></sheets></workbook>'],
 ['xl/_rels/workbook.xml.rels','<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>'],
 ['xl/sharedStrings.xml','<sst><si><t>Voorbeeld &amp; controle</t></si></sst>'],
 ['xl/worksheets/sheet1.xml','<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>Renée</t></is></c></row><row r="2"><c r="A2"><v>95</v></c><c r="B2"><f>120-25</f><v>95</v></c><c r="C2" t="b"><v>1</v></c><c r="D2" t="e"><f>NA()</f><v>#N/A</v></c></row><row r="3"><c r="A3"><f>SUM(A1:A2)</f><v/></c></row></sheetData></worksheet>']
];
test('Bloei XLSX reader preserves values and cached formulas, rejects corrupt archives and never follows external XML',async t=>{
 const requests=[],server=http.createServer((req,res)=>{requests.push(req.url);if(req.url==='/reader.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(new URL('../apps/backoffice/public/bloei-xlsx.js',import.meta.url)))}else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>XLSX test</title>')}});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close()});
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});t.after(()=>browser.close());const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
 const read=(bytes,name='voorbeeld.xlsx')=>page.evaluate(async({base64,name})=>{try{const {readWorkbook}=await import('/reader.js');const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));return {data:await readWorkbook(new File([bytes],name))}}catch(e){return {error:e.message}}},{base64:bytes.toString('base64'),name});
 for(const compressed of [false,true]){const r=await read(zip(parts(),compressed));assert.equal(r.error,undefined);const rows=r.data.sheets[0].rows;assert.deepEqual(rows[0].values,['Voorbeeld & controle','Renée']);assert.deepEqual(rows[1].values,['95','95','true','#N/A']);assert.equal(rows[1].formulas[1],'120-25');assert.equal(rows.length,2,'cached-empty template rows are not imported as records');assert.match(r.data.sha256,/^[a-f0-9]{64}$/)}
 const bad=zip(parts(),false);bad[35]^=1;assert.ok((await read(bad)).error);
 assert.ok((await read(zip(parts(),true),'voorbeeld.csv')).error);
 const entity=parts();entity[3][1]='<!DOCTYPE worksheet [<!ENTITY ext SYSTEM "http://127.0.0.1/forbidden">]><worksheet>&ext;</worksheet>';assert.match((await read(zip(entity,true))).error,/XML/);
 const external=parts();external[1][1]='<Relationships><Relationship Id="r1" Target="http://127.0.0.1/forbidden" TargetMode="External"/></Relationships>';assert.ok((await read(zip(external,true))).error);
 assert.ok((await read(zip([...parts(),parts()[0]],true))).error);assert.ok(!requests.some(url=>url.includes('forbidden')));
});

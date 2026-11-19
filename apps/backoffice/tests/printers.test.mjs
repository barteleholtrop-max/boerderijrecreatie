import {test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/ts-resolve.mjs';
import {pgDb} from './helpers/pg-db.mjs';
const {parsePrinter,printerWarnings}=await import('../lib/printers.ts');

const input={name:'Printer kok',station:'kok',host:'192.168.192.168',port:9100,model:'',paper:80,active:true,note:''};
const printer=(id,extra={})=>({id,version:1,updated:'x',updatedBy:'',...input,...extra});

test('geldige printer wordt overgenomen, met opgeschoonde tekst',()=>{
 assert.deepEqual(parsePrinter({...input,name:'  Printer kok ',model:' Epson TM-m30III '}),{...input,model:'Epson TM-m30III'});
 assert.equal(parsePrinter({...input,host:''}).host,'','adres mag nog leeg zijn');
 assert.equal(parsePrinter({...input,host:'bonprinter-bar.local'}).host,'bonprinter-bar.local');
});
test('ongeldige invoer geeft een begrijpelijke melding',()=>{
 for(const [change,msg] of [[{name:' '},/naam/],[{station:'gast'},/kok, barista, winkel of kassa/],[{host:'192.168.1.300'},/geldig IP-adres/],[{host:'http://x'},/geldig IP-adres/],[{port:0},/poort/],[{port:70000},/poort/],[{port:'9100x'},/poort/],[{paper:72},/58 of 80/],[{active:'ja'},/in gebruik/],[{name:'x'.repeat(61)},/te lang/]])
  assert.throws(()=>parsePrinter({...input,...change}),msg,JSON.stringify(change));
 assert.throws(()=>parsePrinter(null),/Ongeldige/);
});
test('waarschuwt bij een routeradres, ontbrekend of dubbel adres en een werkplek zonder printer',()=>{
 const w=printerWarnings([printer('printer-kok'),printer('printer-barista',{name:'Printer barista',station:'barista',host:'192.168.68.1'})]);
 assert.deepEqual(w.map(x=>x.id),['printer-barista']);assert.match(w[0].text,/router/);
 const twin=printerWarnings([printer('a'),printer('b',{name:'Tweede',station:'barista'})]);assert.match(twin.map(x=>x.text).join(),/hetzelfde adres/);assert.equal(twin.length,1);
 assert.match(printerWarnings([printer('a',{host:''})])[0].text,/nog niet ingevuld/);
 const none=printerWarnings([printer('a',{station:'barista',active:false})]).map(x=>x.text).join(' ');
 assert.match(none,/geen printer in gebruik voor de kok/);assert.match(none,/voor de barista/,'an inactive printer does not count');
});
test('de database begint zonder printers en bewaakt poort en papierbreedte',async t=>{
 const db=await pgDb();t.after(()=>db.close());
 assert.deepEqual(await db.all('SELECT id FROM printers'),[]);
 await db.run("INSERT INTO printers(id,name,station,host,port,model,paper,active,note,version,updated,updated_by) VALUES('printer-kok','Printer kok','kok','192.168.1.20',9100,'Epson TM-m30III',80,1,'',1,'2026-11-19T00:00:00.000Z','test')");
 await assert.rejects(db.run("UPDATE printers SET port=0 WHERE id='printer-kok'"),/printers_port/);
 await assert.rejects(db.run("UPDATE printers SET paper=72 WHERE id='printer-kok'"),/printers_paper/);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import './helpers/ts-resolve.mjs';
const {pdfAttachments,summarizeInvoiceMail,supplierGuess,mailSource,sourceMessageId,validMessageId,INVOICE_SCOPES,INVOICE_MAILBOX_DEFAULT,INVOICE_LABEL_DEFAULT}=await import('../lib/invoice-mail-core.ts');

const hdr=(name,value)=>({name,value});
const message={id:'18c2abc',threadId:'18c2abc',internalDate:String(Date.parse('2026-11-03T08:15:00Z')),payload:{mimeType:'multipart/mixed',headers:[hdr('From','"Fruitbedrijf De Boomgaard - facturatie" <facturen@boomgaard.nl>'),hdr('Subject','Factuur 2026-1187')],parts:[
 {partId:'0',mimeType:'text/plain',body:{data:'SGFsbG8='}},
 {partId:'1',mimeType:'application/pdf',filename:'Factuur 2026-1187.pdf',body:{attachmentId:'ANGjdJ_1',size:48211}},
 {partId:'2',mimeType:'application/octet-stream',filename:'leveringsbon.PDF',body:{attachmentId:'ANGjdJ_2',size:1200}},
 {partId:'3',mimeType:'image/png',filename:'logo.png',body:{attachmentId:'ANGjdJ_3',size:900}},
]}};

test('alleen leesrechten, standaard administratie@ en het label Inkoop',()=>{
 assert.deepEqual(INVOICE_SCOPES,['https://www.googleapis.com/auth/gmail.readonly']);
 assert.equal(INVOICE_MAILBOX_DEFAULT,'administratie@example.nl');assert.equal(INVOICE_LABEL_DEFAULT,'Inkoop');
});
test('PDF-bijlagen op type of bestandsnaam; andere bijlagen en de mailtekst tellen niet mee',()=>{
 assert.deepEqual(pdfAttachments(message).map(a=>a.partId),['1','2']);
 const s=summarizeInvoiceMail(message);
 assert.equal(s.fromEmail,'facturen@boomgaard.nl');assert.equal(s.subject,'Factuur 2026-1187');assert.equal(s.received,'2026-11-03T08:15:00.000Z');
 assert.ok(!JSON.stringify(s).includes('SGFsbG8='),'geen mailtekst in de index');
 assert.deepEqual(summarizeInvoiceMail({id:'x',threadId:'x',payload:{headers:[]}}).attachments,[]);
});
test('leverancier als voorstel: afzendernaam zonder „facturatie”, anders het domein',()=>{
 assert.equal(supplierGuess('Fruitbedrijf De Boomgaard - facturatie','facturen@boomgaard.nl'),'Fruitbedrijf De Boomgaard');
 assert.equal(supplierGuess('','noreply@kaasmakerij-dejong.nl'),'Kaasmakerij-dejong');
 assert.equal(supplierGuess('Administratie','x@y'),'');
});
test('de bron van een ingelezen factuur verwijst terug naar de mail',()=>{
 const src=mailSource('18c2abc','Fruitbedrijf','2026-11-03T08:15:00.000Z');
 assert.equal(src,'Mail Fruitbedrijf 2026-11-03 (gmail:18c2abc)');assert.equal(sourceMessageId(src),'18c2abc');
 assert.equal(sourceMessageId('HANOS factuur.pdf'),null);
 assert.equal(validMessageId('18c2abc'),true);assert.equal(validMessageId('../x'),false);
});
test('migratie 0017: factuurmail-index en het doel van een koppelpoging, bestaande pogingen blijven klantgesprekken',()=>{
 const dir=new URL('../drizzle/',import.meta.url),files=fs.readdirSync(dir).filter(n=>n.endsWith('.sql')).sort();
 const db=new DatabaseSync(':memory:');for(const n of files.filter(n=>n<'0017'))db.exec(fs.readFileSync(new URL(n,dir),'utf8'));
 db.prepare("INSERT INTO mail_oauth_states(state,account,expires) VALUES('oud','eigenaar',1)").run();
 for(const n of files.filter(n=>n>='0017'))db.exec(fs.readFileSync(new URL(n,dir),'utf8'));
 assert.equal(db.prepare("SELECT purpose FROM mail_oauth_states WHERE state='oud'").get().purpose,'klantgesprekken');
 const add=db.prepare("INSERT INTO invoice_mails(mailbox,message_id,thread_id,received,updated) VALUES('administratie@example.nl',?, 't','2026-11-03','2026-11-03')");
 add.run('m1');assert.throws(()=>add.run('m1'),/UNIQUE|PRIMARY/);
 assert.equal(db.prepare('SELECT status,attachments FROM invoice_mails').get().status,'nieuw');
 const journal=JSON.parse(fs.readFileSync(new URL('meta/_journal.json',dir),'utf8'));assert.ok(journal.entries.some(e=>e.tag==='0017_facturen_uit_mail'));
});

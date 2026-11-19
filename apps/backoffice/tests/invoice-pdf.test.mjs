// Factuur-PDF en factuurmail met bijlage (wens eigenaar 11 november 2026: „geen pdf bij de factuur”).
import './helpers/ts-resolve.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const {invoiceData,invoiceMailText,plainName,invoicePayment}=await import('../lib/group-bill-core.ts');
const {invoicePdf,pdfText}=await import('../lib/invoice-pdf.ts');
const {buildMessage,decodeBase64Url}=await import('../lib/mail-core.ts');
const {companyProfile,invoiceName}=await import('../lib/company.ts');
const seller={name:'Boerderijrecreatie Coöperatie U.A.',street:'Dorpsstraat 1',postalCode:'1234 AB',city:'Rotstergaast',email:'info@example.nl',phone:'0654602041',kvk:'99962640',vatNumber:'',website:'example.nl'};
const g={name:'Jan Jansen',code:'RUD48CDC',holderName:'Jan Jansen',holderEmail:'gast@example.nl',holderPhone:'+31612345678',invoiceNumber:1,created:'2026-11-05T10:00:00Z',paidAt:'',status:'actief'};
const orders=[{id:7,created:'2026-11-05T10:00:00Z',totalCents:950,vat9Cents:78,vat21Cents:0,data:JSON.stringify({lines:[{name:'🍯🥛Honing & Melk Boerderijrecreatie Pakket',quantity:1,vat:'9',totalCents:950}]})}];

test('productnamen zonder emoji; PDF-tekst alleen met tekens die de standaardletter kent',()=>{
 assert.equal(plainName('🍯🥛Honing & Melk Boerderijrecreatie Pakket'),'Honing & Melk Boerderijrecreatie Pakket');
 assert.equal(pdfText('🍯 Coöperatie – € 9,50'),'Coöperatie – € 9,50');
});
test('juridische naam die alleen een nummer is (KvK) komt niet tussen haakjes achter de naam',()=>{
 const co=companyProfile({tradeName:'Boerderijrecreatie Coöperatie U.A.',legalName:'99962640',kvk:'99962640'});
 assert.equal(invoiceName(co),'Boerderijrecreatie Coöperatie U.A.');
 assert.equal(invoiceName(companyProfile({tradeName:'Boerderijrecreatie',legalName:'Voorbeeld VOF'})),'Boerderijrecreatie (Voorbeeld VOF)');
});
test('PDF van een voldane en een open factuur',async()=>{
 for(const paid of [true,false]){
  const shares=[{id:'d1',position:1,count:1,amountCents:950,status:paid?'betaald':'open',method:'pin',paidAt:'2026-11-05T12:00:00Z'}];
  const inv={...invoiceData({...g,paidAt:paid?'2026-11-05T12:00:00Z':''},orders,shares,seller),payment:invoicePayment(shares,{iban:'NL91ABNA0417164300',accountName:'Boerderijrecreatie'},'https://example.nl/bestellen/',paid)};
  const pdf=Buffer.from(await invoicePdf(inv));
  assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.ok(pdf.length>20000&&pdf.length<400000,'met logo, niet te groot: '+pdf.length);
 }
});
test('mailtekst: verwijst naar de PDF, zonder emoji en zonder „Betaald: Betaald”',()=>{
 const inv=invoiceData({...g,paidAt:'2026-11-05T12:00:00Z'},orders,[{position:1,count:1,amountCents:950,status:'betaald',method:'pin',paidAt:'2026-11-05T12:00:00Z'}],seller);
 const t=invoiceMailText(inv,'voldaan');
 assert.match(t.body,/als PDF in de bijlage/);assert.match(t.body,/1× Honing & Melk Boerderijrecreatie Pakket/);assert.doesNotMatch(t.body,/Betaald: Betaald/);assert.match(t.body,/Betaald: Pin/);
});
test('mail met bijlage: multipart/mixed met tekst en PDF',()=>{
 const raw=decodeBase64Url(buildMessage({from:'info@example.nl',to:'gast@example.nl',subject:'Factuur BB-00001',body:'Hallo',messageId:'<rekening-1-voldaan@example.nl>',attachments:[{filename:'Factuur BB-00001.pdf',mimeType:'application/pdf',data:Buffer.from('%PDF-1.7 test')}]}));
 const b=/boundary="([^"]+)"/.exec(raw)[1];
 assert.match(raw,/Content-Type: multipart\/mixed/);assert.match(raw,/Content-Disposition: attachment; filename="Factuur BB-00001.pdf"/);
 assert.equal(raw.split('--'+b).length,4,'tekst, bijlage en slot');assert.ok(raw.includes(Buffer.from('%PDF-1.7 test').toString('base64')));
 const plain=decodeBase64Url(buildMessage({from:'info@example.nl',to:'gast@example.nl',subject:'x',body:'Hallo',messageId:'<a@b>'}));
 assert.match(plain,/Content-Type: text\/plain/);assert.doesNotMatch(plain,/multipart/);
});

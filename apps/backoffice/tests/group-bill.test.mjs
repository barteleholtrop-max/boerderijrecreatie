import './helpers/ts-resolve.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const {parseGuestContact,parseOpenBill,checkNewLimit,fillState,limitProblem,splitAmounts,invoiceData,invoiceLabel,invoiceMailText,MAX_SHARES}=await import('../lib/group-bill-core.ts');
const {parseGuestOrder}=await import('../lib/public-orders.ts');

test('iedereen op een rekening: naam, e-mail en telefoon verplicht',()=>{
 assert.deepEqual(parseGuestContact({name:'  Anna  de Vries ',email:'Anna@Example.NL',phone:'06 12 34 56 78'}),{name:'Anna de Vries',email:'anna@example.nl',phone:'06 12 34 56 78'});
 assert.throws(()=>parseGuestContact({name:'A',email:'a@b.nl',phone:'0612345678'}),/naam/);
 assert.throws(()=>parseGuestContact({name:'Anna',email:'geen-mail',phone:'0612345678'}),/e-mailadres/);
 assert.throws(()=>parseGuestContact({name:'Anna',email:'a@b.nl',phone:'123'}),/telefoonnummer/);
});
test('rekening openen: naam en een zelfgekozen maximum binnen de grenzen',()=>{
 assert.deepEqual(parseOpenBill({name:'Familie Jansen',limitCents:10000}),{name:'Familie Jansen',limitCents:10000,kind:'groep',warnCents:null});
 assert.throws(()=>parseOpenBill({name:'',limitCents:10000}),/naam/);
 assert.throws(()=>parseOpenBill({name:'Fam',limitCents:500}),/vanaf/);
 assert.throws(()=>parseOpenBill({name:'Fam',limitCents:10_000_000}),/tot/);
 assert.throws(()=>checkNewLimit(5000,6000),/lager dan wat er al/);
 assert.equal(checkNewLimit(15000,6000),15000);
});
test('vol is vol; vanaf 80% een waarschuwing',()=>{
 assert.deepEqual(fillState(6400,10000),{spentCents:6400,limitCents:10000,percent:64,near:false,full:false,leftCents:3600});
 assert.equal(fillState(8000,10000).near,true);assert.equal(fillState(10000,10000).full,true);
 assert.equal(limitProblem(6000,4000,10000,'Bart'),null);
 assert.match(limitProblem(6000,4100,10000,'Bart'),/nog €\s40,00 bij\. Vraag Bart/);
 assert.match(limitProblem(10000,100,10000,'Bart'),/De rekening is vol\. Vraag Bart om het maximum te verhogen/);
});
test('splitsen: gelijke delen die precies optellen',()=>{
 assert.deepEqual(splitAmounts(10000,3),[3334,3333,3333]);
 assert.deepEqual(splitAmounts(999,1),[999]);
 assert.equal(splitAmounts(12345,7).reduce((a,b)=>a+b,0),12345);
 assert.throws(()=>splitAmounts(1000,0),/1 tot en met/);assert.throws(()=>splitAmounts(1000,MAX_SHARES+1),/1 tot en met/);
 assert.throws(()=>splitAmounts(0,2),/niets op de rekening/);
});
test('factuur: per persoon wat besteld is, btw per tarief, betalingen en voldaan',()=>{
 const line=(name,totalCents,vat)=>({productId:name,name,quantity:1,unitCents:totalCents,totalCents,vat,vatCents:0,station:'kok',choices:[],note:''});
 const orders=[
  {id:1,created:'2026-11-05T10:00:00Z',totalCents:1150,vat9Cents:95,vat21Cents:0,data:JSON.stringify({lines:[line('Koffie',700,'9'),line('Taart',450,'9')],guest:{name:'Anna',email:'anna@x.nl',phone:'0611111111'}})},
  {id:2,created:'2026-11-05T11:00:00Z',totalCents:1210,vat9Cents:29,vat21Cents:149,data:JSON.stringify({lines:[line('Koffie',350,'9'),line('Mok',860,'21')],guest:{name:'Bert',email:'bert@x.nl',phone:'0622222222'}})},
  {id:3,created:'2026-11-05T12:00:00Z',totalCents:350,vat9Cents:29,vat21Cents:0,data:JSON.stringify({lines:[line('Koffie',350,'9')],guest:{name:'Anna',email:'ANNA@x.nl',phone:'0611111111'}})},
 ];
 const g={name:'Familie Jansen',code:'ABCDEFGH',holderName:'Anna',holderEmail:'anna@x.nl',holderPhone:'0611111111',invoiceNumber:7,created:'2026-11-05T09:00:00Z',paidAt:'',status:'gesloten'};
 const seller={name:'Boerderijrecreatie',street:'Dorpsstraat 1',postalCode:'1234 AB',city:'Rotstergaast',email:'',phone:'',kvk:'12345678',vatNumber:'NL123456789B01'};
 const open=invoiceData(g,orders,[{position:1,count:2,amountCents:1355,status:'betaald',method:'online',paidAt:'2026-11-05T13:00:00Z'},{position:2,count:2,amountCents:1355,status:'open',method:'',paidAt:''}],seller);
 assert.equal(open.number,'BB-00007');assert.equal(invoiceLabel(null),'(nog geen nummer)');
 assert.deepEqual(open.people.map(p=>[p.name,p.lines.length,p.totalCents]),[['Anna',3,1500],['Bert',2,1210]],'per persoon, ook met een andere schrijfwijze van de e-mail');
 // Overzicht voor de factuur: wat er besteld is en wie er besteld hebben, niet wie wat nam.
 assert.deepEqual(open.products.map(p=>[p.name,p.quantity,p.totalCents]),[['Koffie',3,1400],['Mok',1,860],['Taart',1,450]]);
 assert.deepEqual(open.orderedBy,['Anna','Bert']);
 assert.equal(open.totalCents,2710);assert.deepEqual(open.vat.map(v=>[v.rate,v.vatCents,v.exclCents]),[['9',153,1697],['21',149,711]]);
 assert.equal(open.paidCents,1355);assert.equal(open.openCents,1355);assert.equal(open.paid,false);
 // Betalingen per betaalwijze opgeteld, zonder namen.
 assert.deepEqual(open.payments,[{label:'Betaald',method:'iDEAL (Mollie)',amountCents:1355,paidAt:'2026-11-05T13:00:00Z'}]);
 // Factuurmail: overzicht zonder wie wat nam; bij open de betaallink, bij voldaan geen.
 const mail=invoiceMailText(open,'open',[{label:'Deel 2 van 2',amountCents:1355,url:'http://localhost:3002/bestellen.html?deel=x'}]);
 assert.match(mail.subject,/Factuur BB-00007 · rekening Familie Jansen · nog te betalen/);
 assert.match(mail.body,/^Beste Anna,/);assert.match(mail.body,/Besteld door: Anna, Bert/);assert.match(mail.body,/3× Koffie/);
 assert.match(mail.body,/Deel 2 van 2 \(€\s13,55\): http:\/\/localhost:3002\/bestellen\.html\?deel=x/);assert.match(mail.body,/KvK 12345678/);
 assert.doesNotMatch(mail.body,/anna@x\.nl|bert@x\.nl|0622222222/,'geen gegevens van anderen in de mail');
 const done=invoiceData({...g,paidAt:'2026-11-05T14:00:00Z'},orders,[{position:1,count:1,amountCents:2710,status:'betaald',method:'contant',paidAt:'2026-11-05T14:00:00Z'}],seller);
 assert.equal(done.paid,true);
 const paidMail=invoiceMailText(done,'voldaan');assert.match(paidMail.subject,/voldaan$/);assert.match(paidMail.body,/VOLDAAN/);assert.doesNotMatch(paidMail.body,/iDEAL:/);assert.equal(done.payments[0].method,'Contant');assert.equal(done.date,'2026-11-05');
});
test('bestelling op een rekening: gegevens verplicht; nieuwe rekening met geheime beheerlink',()=>{
 const base={requestId:'0b7c4f3e-1a2b-4c3d-8e9f-0123456789ab',route:'eten-drinken',lines:[{productId:'p',version:1,quantity:1}]};
 const guest={name:'Anna',email:'anna@x.nl',phone:'0612345678'};
 assert.throws(()=>parseGuestOrder({...base,groupCode:'ABCDEFGH'}),/naam/);
 assert.deepEqual(parseGuestOrder({...base,groupCode:'ABCDEFGH',guest}).guest,guest);
 assert.equal(parseGuestOrder(base).guest,null,'gewoon iDEAL: geen gegevens nodig');
 const token='a'.repeat(43);
 const o=parseGuestOrder({...base,guest,openBill:{name:'Familie',limitCents:5000,token}});assert.deepEqual(o.openBill,{name:'Familie',limitCents:5000,kind:'groep',warnCents:null,token});
 assert.throws(()=>parseGuestOrder({...base,guest,openBill:{name:'Familie',limitCents:5000,token:'kort'}}),/Ongeldige rekening/);
 assert.throws(()=>parseGuestOrder({...base,guest,groupCode:'ABCDEFGH',openBill:{name:'Familie',limitCents:5000,token}}),/Ongeldige bestelling/);
});

test('factuur: betaallink per openstaand deel en het IBAN uit de instellingen; voldaan = geen links',async()=>{
 const {invoicePayment}=await import('../lib/group-bill-core.ts');
 const shares=[{id:'b0000000-0000-4000-8000-000000000002',position:2,count:2,amountCents:4125,status:'open'},{id:'a0000000-0000-4000-8000-000000000001',position:1,count:2,amountCents:4125,status:'betaald'},{id:'c0000000-0000-4000-8000-000000000003',position:1,count:1,amountCents:8250,status:'vervallen'}];
 const p=invoicePayment(shares,{iban:'nl91abna0417164300',accountName:' Boerderijrecreatie '},'https://www.example.nl/bestellen.html',false);
 assert.equal(p.iban,'NL91 ABNA 0417 1643 00');assert.equal(p.accountName,'Boerderijrecreatie');
 assert.deepEqual(p.links,[{position:2,count:2,amountCents:4125,url:'https://www.example.nl/bestellen.html?deel=b0000000-0000-4000-8000-000000000002'}]);
 assert.deepEqual(invoicePayment(shares,{},'https://www.example.nl/bestellen.html',true),{iban:'',accountName:'',links:[]});
});

test('meebetalen: ieder kiest zelf voor zijn deel; minder of meer betaald, toch voldaan; verschil apart',()=>{
 const line={productId:'k',name:'Koffie',quantity:4,unitCents:300,totalCents:1200,vat:'9',vatCents:99,station:'barista',choices:[],note:''};
 const orders=[{id:1,created:'2026-11-05T10:00:00Z',totalCents:1200,vat9Cents:99,vat21Cents:0,data:JSON.stringify({lines:[line],guest:{name:'Anna',email:'a@x.nl',phone:'0611111111'}})}];
 const g={name:'Fam',code:'ABCDEFGH',holderName:'Anna',holderEmail:'a@x.nl',holderPhone:'',invoiceNumber:1,created:'2026-11-05T09:00:00Z',paidAt:'2026-11-05T14:00:00Z',status:'gesloten'};
 const seller={name:'Boerderijrecreatie',street:'',postalCode:'',city:'',email:'',phone:'',kvk:'',vatNumber:''};
 const s=(position,status,paidCents,method='online')=>({position,count:3,amountCents:400,status,method,paidAt:'2026-11-05T13:00:00Z',paidCents});
 const half=invoiceData(g,orders,[s(1,'betaald',null),s(2,'betaald',250),s(3,'open',null)],seller);
 assert.equal(half.paid,false);assert.equal(half.openCents,400,'nog één deel open');
 const all=invoiceData(g,orders,[s(1,'betaald',null),s(2,'betaald',250),s(3,'betaald',700)],seller);
 assert.equal(all.paid,true,'iemand betaalde minder: zijn deel is toch afgerekend');assert.equal(all.paidCents,1350);assert.equal(all.differenceCents,150);
 const zero=invoiceData(g,orders,[s(1,'betaald',null),s(2,'betaald',0,'nul'),s(3,'betaald',null)],seller);
 assert.equal(zero.paid,true);assert.equal(zero.differenceCents,-400);assert.deepEqual(zero.payments.map(p=>p.amountCents),[800],'nul niet als betaling');
 assert.match(invoiceMailText(zero,'voldaan').body,/Geef wat goed voelt: minder betaald dan de gemiddelde waarde/);
});

import fs from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/ts-resolve.mjs';
const {parseGuestOrder,checkRoute,routeMode,guestReceipt,allowedOrigins,originAllowed,corsHeaders,createRateLimit,clientKey,MAX_QUANTITY}=await import('../lib/public-orders.ts');
const {buildLine}=await import('../lib/orders.ts');
const id='0d6f9c1e-6a2b-4c4f-9f2e-1a2b3c4d5e6f';
const order=o=>({requestId:id,route:'eten-drinken',lines:[{productId:'p1',version:2,quantity:1,selections:{g:'c'},note:' graag heet '}],...o});

test('geldige gastbestelling wordt netjes overgenomen',()=>{
 const r=parseGuestOrder(order());
 assert.deepEqual(r,{requestId:id,route:'eten-drinken',lines:[{productId:'p1',version:2,quantity:1,selections:{g:'c'},note:'graag heet'}],chosenCents:null,groupCode:null,pickup:null,guest:null,openBill:null,dividend:null});
 assert.deepEqual(parseGuestOrder(order({lines:[{productId:'p1',version:0,quantity:3}]})).lines[0],{productId:'p1',version:0,quantity:3,selections:{},note:''});
});
test('weigert alles buiten de grenzen',()=>{
 const bad=[null,[],order({requestId:'abc'}),order({requestId:id.toUpperCase()}),order({route:'yte'}),order({lines:[]}),order({lines:'x'}),
  order({lines:Array.from({length:31},()=>({productId:'p',version:1,quantity:1}))}),
  order({lines:[{productId:'p',version:1,quantity:0}]}),order({lines:[{productId:'p',version:1,quantity:MAX_QUANTITY+1}]}),order({lines:[{productId:'p',version:1,quantity:1.5}]}),
  order({lines:[{productId:'',version:1,quantity:1}]}),order({lines:[{productId:'p',version:'1',quantity:1}]}),
  order({lines:[{productId:'p',version:1,quantity:1,note:'x'.repeat(201)}]}),order({lines:[{productId:'p',version:1,quantity:1,selections:{g:5}}]}),
  order({lines:[{productId:'p',version:1,quantity:1,selections:['c']}]})];
 for(const b of bad)assert.throws(()=>parseGuestOrder(b),undefined,JSON.stringify(b));
});
test('de prijs komt altijd van de server, niet van de gast',()=>{
 const r=parseGuestOrder(order({lines:[{productId:'p1',version:2,quantity:2,selections:{},note:'',priceCents:1,totalCents:1}]}));
 assert.equal('priceCents' in r.lines[0],false);
 const line=buildLine({name:'Koffie',priceCents:350,vat:'9',station:'barista',available:true,department:'Restaurant'},r.lines[0]);
 assert.equal(line.totalCents,700);
});
test('eten en drinken en winkel blijven gescheiden',()=>{
 const l=(station,name='X')=>({station,name});
 assert.doesNotThrow(()=>checkRoute('eten-drinken',[l('kok'),l('barista')]));
 assert.doesNotThrow(()=>checkRoute('winkel',[l('winkel')]));
 assert.throws(()=>checkRoute('eten-drinken',[l('kok'),l('winkel','Eieren')]),/Eieren hoort in het winkelmandje/);
 assert.throws(()=>checkRoute('winkel',[l('barista','Koffie')]),/Koffie hoort in het mandje voor eten en drinken/);
 assert.equal(routeMode('winkel'),'winkel');assert.equal(routeMode('eten-drinken'),'zelfservice');
});
test('bon voor de gast bevat geen werkplekken of interne gegevens',()=>{
 const data=JSON.stringify({mode:'zelfservice',lines:[{productId:'p1',name:'Koffie',quantity:2,unitCents:350,totalCents:700,vat:'9',vatCents:58,station:'barista',choices:['Melk: Haver'],note:''}],totalCents:700});
 const r=guestReceipt({id:42,created:'2026-11-02T10:00:00.000Z',data});
 assert.equal(r.number,'P00042');assert.equal(r.status,'wacht-op-betaling');assert.equal(r.paid,false);
 assert.ok(!JSON.stringify(r).includes('barista'));assert.ok(!JSON.stringify(r).includes('p1'));
 assert.equal(r.winkel,false);
 assert.equal(guestReceipt({id:43,created:'2026-11-13T10:00:00.000Z',data:data.replace('"zelfservice"','"winkel"')}).winkel,true);
});
test('alleen de ingestelde website mag bestellen',()=>{
 assert.ok(originAllowed('http://localhost:3002'));assert.ok(originAllowed('http://127.0.0.1:3003'));
 for(const o of [null,'','http://localhost:3001','http://evil.example','null'])assert.equal(originAllowed(o),false,String(o));
 const list=allowedOrigins('https://www.boerbart.nl, https://boerbart.nl/ ,javascript:alert(1),ftp://x.nl,https://x.nl/pad');
 assert.deepEqual(list,['https://www.boerbart.nl','https://boerbart.nl']);
 assert.equal(originAllowed('http://localhost:3002',list),false);
 assert.equal(corsHeaders('http://evil.example')['Access-Control-Allow-Origin'],undefined);
 assert.equal(corsHeaders('http://localhost:3002')['Access-Control-Allow-Origin'],'http://localhost:3002');
});
test('begrenzing per gast en in totaal, per minuut',()=>{
 const allow=createRateLimit({perClient:2,total:3,windowMs:1000});
 assert.deepEqual([allow('a',0),allow('a',1),allow('a',2)],[true,true,false]);
 assert.deepEqual([allow('b',3),allow('c',4)],[true,false]);
 assert.equal(allow('a',1000),true);
 const h=m=>({get:n=>m[n]??null});
 assert.equal(clientKey(h({'cf-connecting-ip':'1.2.3.4','x-forwarded-for':'5.6.7.8'}),{}),'1.2.3.4');
 assert.equal(clientKey(h({'x-forwarded-for':'5.6.7.8, 9.9.9.9'}),{}),'5.6.7.8');
 assert.equal(clientKey(h({}),{}),'onbekend');
});
test('online (Cloud Run): alleen het adres dat Google achteraan zet telt; meegestuurde koppen niet (#137)',()=>{
 const h=m=>({get:n=>m[n]??null}),online={K_SERVICE:'boerbart-backoffice'};
 // De bezoeker stuurt zelf nepkoppen mee; Google voegt het echte adres (9.9.9.9) achteraan toe.
 const vals=h({'cf-connecting-ip':'1.1.1.1','x-real-ip':'2.2.2.2','x-forwarded-for':'5.6.7.8, 9.9.9.9'});
 assert.equal(clientKey(vals,online),'9.9.9.9');
 assert.equal(clientKey(h({'x-forwarded-for':'9.9.9.9'}),online),'9.9.9.9');
 // Steeds een ander nepadres vooraan geeft toch dezelfde sleutel, dus de rem blijft werken.
 const allow=createRateLimit({perClient:2,total:100});
 const tries=['a','b','c'].map(x=>allow(clientKey(h({'x-forwarded-for':x+', 9.9.9.9'}),online),0));
 assert.deepEqual(tries,[true,true,false]);
 // Met een load balancer ervoor: één plek eerder.
 assert.equal(clientKey(h({'x-forwarded-for':'5.6.7.8, 9.9.9.9, 35.1.1.1'}),{K_SERVICE:'x',TRUSTED_PROXY_HOPS:'2'}),'9.9.9.9');
 assert.equal(clientKey(h({}),online),'onbekend');
});
test('Mollie-meldingen: de rem geldt per afzender, niet voor alle meldingen samen',()=>{
 const r=fs.readFileSync(new URL('../app/api/public/payments/mollie/route.ts',import.meta.url),'utf8');
 assert.match(r,/limit\(clientKey\(req\.headers\)\)/);assert.doesNotMatch(r,/limit\('mollie'\)/);
});

test('eigen bedrag en groepscode in de bestelling',()=>{
 assert.equal(parseGuestOrder(order({chosenCents:0})).chosenCents,0);
 assert.equal(parseGuestOrder(order({chosenCents:1250})).chosenCents,1250);
 // Op een groepsrekening laat iedereen naam, e-mail en telefoon achter (wens eigenaar 5 november 2026).
 assert.equal(parseGuestOrder(order({groupCode:'abcd-efgh',guest:{name:'Anna',email:'anna@x.nl',phone:'0612345678'}})).groupCode,'abcd-efgh');
 assert.throws(()=>parseGuestOrder(order({groupCode:'abcd-efgh'})),/naam/);
 for(const b of [order({chosenCents:-1}),order({chosenCents:1.5}),order({chosenCents:'10'}),order({groupCode:5}),order({groupCode:'x'.repeat(21)}),order({chosenCents:100,groupCode:'ABCDEFGH'})])
  assert.throws(()=>parseGuestOrder(b),undefined,JSON.stringify(b));
});
test('bon toont normale waarde, eigen bedrag en groepsrekening',()=>{
 const lines=[{productId:'p1',name:'Koffie',quantity:1,unitCents:350,totalCents:350,vat:'9',vatCents:29,station:'barista',choices:[],note:''}];
 const own=guestReceipt({id:1,created:'x',data:JSON.stringify({mode:'zelfservice',lines,totalCents:350,chosenCents:500})});
 assert.equal(own.commercialCents,350);assert.equal(own.chosenCents,500);assert.equal(own.toPayCents,500);assert.equal(own.group,null);
 const normal=guestReceipt({id:2,created:'x',data:JSON.stringify({mode:'zelfservice',lines,totalCents:350,chosenCents:null})});
 assert.equal(normal.toPayCents,350);assert.equal(normal.chosenCents,null);
 const group=guestReceipt({id:3,created:'x',status:'op-groepsrekening',data:JSON.stringify({mode:'zelfservice',lines,totalCents:350,chosenCents:null,group:{id:'g',name:'Feest van opa'}})});
 assert.equal(group.toPayCents,0);assert.deepEqual(group.group,{name:'Feest van opa'});assert.equal(group.status,'op-groepsrekening');
 assert.ok(!JSON.stringify(group).includes('"id":"g"'));
});
test('link voor de groepscode wijst naar de bestelpagina',async()=>{
 const {orderPageUrl}=await import('../lib/public-orders.ts');
 assert.equal(orderPageUrl({}),'http://localhost:3002/bestellen.html');
 assert.equal(orderPageUrl({BACKOFFICE_TUNNEL_ORIGIN:'https://a-b-c.trycloudflare.com/'}),'https://a-b-c.trycloudflare.com/bestellen');
 assert.equal(orderPageUrl({PUBLIC_ORDER_ORIGINS:'https://www.boerbart.nl'}),'https://www.boerbart.nl/bestellen.html');
});
test('betalen met dividend: geldige telefoonkoppeling, niet samen met een rekening of eigen bedrag',()=>{
 const t='a'.repeat(43);
 assert.equal(parseGuestOrder(order({dividend:t})).dividend,t);
 assert.throws(()=>parseGuestOrder(order({dividend:'kort'})),/niet goed gekoppeld/);
 assert.throws(()=>parseGuestOrder(order({dividend:t,chosenCents:100})),/Ongeldige bestelling/);
 assert.throws(()=>parseGuestOrder(order({dividend:t,groupCode:'ABCDEFGH',guest:{name:'Anna',email:'a@x.nl',phone:'0612345678'}})),/Ongeldige bestelling/);
});

test('etiketprijs gaat alleen mee bij de winkel, nu in de winkel (zelfservicekassa)',()=>{
 const line={productId:'rv',version:1,quantity:1,priceCents:2345};
 assert.equal(parseGuestOrder(order({route:'winkel',lines:[line]})).lines[0].priceCents,2345);
 assert.equal('priceCents' in parseGuestOrder(order({lines:[line]})).lines[0],false,'eten en drinken: genegeerd');
 assert.equal('priceCents' in parseGuestOrder(order({route:'winkel',lines:[line],pickup:{date:'2026-11-06',time:'10:00',name:'Jan'}})).lines[0],false,'vooraf bestellen: genegeerd');
 for(const priceCents of [0,-1,1.5,'10'])assert.throws(()=>parseGuestOrder(order({route:'winkel',lines:[{...line,priceCents}]})),/geldig bedrag/);
 // Zonder etiketprijs weigert de server een etiketproduct (buildLine), dus vooraf bestellen kan dan niet.
 assert.throws(()=>buildLine({name:'Rundvlees',priceCents:1800,vat:'9',station:'winkel',available:true,department:'Winkel',customerPrice:true},{...line,selections:{},note:'',priceCents:undefined}),/etiket/);
});

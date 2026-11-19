import './helpers/ts-resolve.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const H=await import('../lib/harvest-core.ts'),C=await import('../lib/coop-core.ts');
const family={adults:2,child05:1,child69:1,child1014:0,child15:0},prices={adults:200,child05:0,child69:100,child1014:150,child15:200};
const config=()=>H.parseHarvestConfig({enabled:true,terms:'Voorwaarden besproken.',items:[{id:'groente',productId:'g',kind:'family',rhythm:'follow',dayCents:prices,biweeklyDayCents:prices,weeklyCents:0,biweeklyCents:0,description:'Groente',active:true},{id:'bloem',productId:'b',kind:'extra',rhythm:'weekly',dayCents:prices,biweeklyDayCents:prices,weeklyCents:200,biweeklyCents:200,description:'Bloemen',active:true}],offers:[]});
const products=[{id:'g',name:'Oogstaandeel',ownerId:'tuinder',vat:'9',version:1},{id:'b',name:'Bloemen',ownerId:'bindert',vat:'9',version:1}];
const selection=()=>H.parseSelection({family,interval:1,extras:['bloem'],offerId:null,pickup:{date:'2026-11-06',time:'10:00'}});
const offer=()=>({id:'welkom',name:'Welkom',itemId:'bloem',funding:'cooperative',percent:100,from:'2026-11-01',until:'2026-11-30',active:true});
test('gezinstarieven, gratis kleintjes en onafhankelijk bloemritme',()=>{const s=selection(),c=config();assert.equal(H.harvestQuote(c,s,products,'2026-11-05').totalCents,7400);s.interval=2;const q=H.harvestQuote(c,s,products,'2026-11-05');assert.equal(q.totalCents,3900);assert.deepEqual(H.harvestPickups(q,s.pickup.date).map(p=>p.items.map(i=>i.itemId)),[['groente','bloem'],['bloem']]);c.items[0].biweeklyDayCents.adults=150;assert.equal(H.harvestQuote(c,s,products,'2026-11-05').totalCents,3200)});
test('actie alleen eerste periode, geldig en voor geselecteerd onderdeel',()=>{const c=config(),s=selection();c.offers=[offer()];s.offerId='welkom';assert.equal(H.harvestQuote(c,s,products,'2026-11-05').totalCents,7000);assert.equal(H.harvestQuote(c,s,products,'2026-11-05',false).totalCents,7400);assert.throws(()=>H.harvestQuote(c,s,products,'2026-12-01'),/geldig/);s.extras=[];assert.throws(()=>H.harvestQuote(c,s,products,'2026-11-05'),/onderdeel/)});
test('coöperatie betaalt: deelnemer behoudt basis; totaal en btw sluiten exact aan',()=>{const c=config(),s=selection();c.offers=[offer()];s.offerId='welkom';const q=H.harvestQuote(c,s,products,'2026-11-05'),lines=H.harvestAccounting(q);assert.equal(lines.reduce((s,l)=>s+l.totalCents,0),q.totalCents);assert.equal(lines.reduce((s,l)=>s+l.vatCents,0),q.vat9Cents);const result=C.settle(lines.map(l=>({orderId:1,number:'1',day:'2026-11-05',productName:l.name,quantity:1,ownerId:l.ownerId,paidCents:l.totalCents,paidVatCents:l.vatCents,sign:1,test:false})),[{id:'tuinder',name:'Tuinder',vatInclusive:false},{id:'bindert',name:'Bindert',vatInclusive:false}],[{participantId:'tuinder',validFrom:'2026-01-01',percentBp:1500},{participantId:'bindert',validFrom:'2026-01-01',percentBp:1500}]);assert.equal(result.participants.find(p=>p.id==='bindert').revenueInclCents,400);assert.equal(result.coop.revenueExclCents,-367);c.offers[0].funding='shared';assert.equal(H.harvestAccounting(H.harvestQuote(c,s,products,'2026-11-05')).find(l=>l.productId==='b').totalCents,0)});
test('ongeldige aantallen, dubbele extra’s, datum en voorwaarden worden geweigerd',()=>{assert.throws(()=>H.parseSelection({...selection(),family:{...family,adults:-1}}));assert.throws(()=>H.parseSelection({...selection(),family:{...family,adults:1.5}}));assert.throws(()=>H.parseSelection({...selection(),extras:['bloem','bloem']}));assert.throws(()=>H.parseSelection({...selection(),pickup:{date:'2026-02-30',time:'10:00'}}));assert.throws(()=>H.parseHarvestConfig({...config(),terms:''}));const c=config();c.items[0].dayCents.adults=-2;assert.throws(()=>H.parseHarvestConfig(c));assert.throws(()=>H.harvestQuote({...config(),enabled:false},selection(),products,'2026-11-05'));assert.throws(()=>H.harvestQuote(config(),selection(),products.slice(0,1),'2026-11-05'))});

test('pakketten (Bloemplus, Pieperplus) en foto’s uit de beeldbank voor de gastpagina',()=>{
 const raw=JSON.parse(JSON.stringify(config())),photo='/api/media/0123abcd-0123-4567-89ab-0123456789ab';
 raw.items[1].photo=photo;raw.packages=[{id:'bloemplus',name:'Bloemplus',tagline:'Groente met een bos bloemen',extras:['bloem'],photo,active:true}];
 const c=H.parseHarvestConfig(raw);assert.equal(c.packages[0].name,'Bloemplus');assert.equal(c.items[1].photo,photo);
 assert.deepEqual([...H.harvestMediaIds(c)],['0123abcd-0123-4567-89ab-0123456789ab']);
 assert.equal(H.harvestMediaIds({...c,enabled:false}).size,0,'ongepubliceerd: geen openbare foto’s');
 assert.equal(H.publicHarvestPhoto(photo),'/api/public/media/0123abcd-0123-4567-89ab-0123456789ab');
 assert.equal(H.publicHarvestPhoto('javascript:alert(1)'),'');
 // Een pakket heeft geen eigen prijs: de offerte rekent met de onderdelen.
 assert.equal(H.harvestQuote(c,selection(),products,'2026-11-05').totalCents,H.harvestQuote(config(),selection(),products,'2026-11-05').totalCents);
 assert.throws(()=>H.parseHarvestConfig({...raw,packages:[{...raw.packages[0],extras:['bestaat-niet']}]}),/pakketten/);
 assert.throws(()=>H.parseHarvestConfig({...raw,packages:[{...raw.packages[0],photo:'javascript:x'}]}),/pakketten/);
 assert.throws(()=>H.parseHarvestConfig({...raw,items:[raw.items[0],{...raw.items[1],photo:'http://onveilig.nl/a.jpg'}]}),/foto/);
 assert.equal(H.parseHarvestConfig({...raw,packages:undefined}).packages,undefined,'oude instellingen zonder pakketten blijven geldig');
});

test('alleen bloemen: elk extra mag standaard los, zonder oogstaandeel groente',()=>{
 const c=config(),leeg={adults:0,child05:0,child69:0,child1014:0,child15:0},pickup={date:'2026-11-06',time:'10:00'};
 const los=H.parseSelection({family:leeg,interval:1,extras:['bloem'],offerId:null,pickup,base:false});
 assert.equal(los.base,false);
 const q=H.harvestQuote(c,los,products,'2026-11-05');assert.deepEqual(q.lines.map(l=>l.itemId),['bloem']);assert.equal(q.totalCents,400,'twee weken bloemen');
 assert.throws(()=>H.parseSelection({family:leeg,interval:1,extras:[],offerId:null,pickup,base:false}),/minstens één extra/);
 assert.throws(()=>H.parseSelection({family:leeg,interval:1,extras:['bloem'],offerId:null,pickup}),/gezinslid/,'met oogstaandeel blijft een gezinslid nodig');
 // Pakket „Bloemenabonnement”: zonder oogstaandeel, met minstens één extra.
 assert.equal(H.parseHarvestConfig({...c,packages:[{id:'bloemen',name:'Bloemenabonnement',tagline:'',extras:['bloem'],photo:'',active:true,base:false}]}).packages[0].base,false);
 assert.throws(()=>H.parseHarvestConfig({...c,packages:[{id:'bloemen',name:'Bloemen',tagline:'',extras:[],photo:'',active:true,base:false}]}),/minstens één extra/);
 // Een oude keuze zonder base-veld blijft het oogstaandeel bevatten.
 assert.equal(H.harvestQuote(c,selection(),products,'2026-11-05').lines[0].itemId,'groente');
});

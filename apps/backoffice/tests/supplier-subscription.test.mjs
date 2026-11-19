// Abonnement van een leverancier (wens eigenaar 6 november 2026): een extra in het bestaande oogstabonnement.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/ts-resolve.mjs';
const {parseSupplierOffer,withSupplierOffer,offerOf}=await import('../lib/supplier-subscription-core.ts');
const {parseHarvestConfig,emptyHarvestConfig}=await import('../lib/harvest-core.ts');
const base=()=>({...emptyHarvestConfig(),items:[{id:'basis',productId:'p-groente',kind:'family',rhythm:'follow',weeklyCents:0,biweeklyCents:0,dayCents:{adults:100,child05:0,child69:50,child1014:70,child15:100},biweeklyDayCents:{adults:110,child05:0,child69:55,child1014:77,child15:110},description:'Groente',active:true}]});

test('leverancier zet een abonnement aan: een extra voor zijn product, prijs per levering',()=>{
 const o=parseSupplierOffer({active:true,rhythm:'weekly',priceCents:1250,description:' Een bos   seizoensbloemen '});
 const c=withSupplierOffer(base(),'p-bloemen',o);
 const i=offerOf(c,'p-bloemen');
 assert.deepEqual([i.kind,i.rhythm,i.weeklyCents,i.biweeklyCents,i.description,i.active],['extra','weekly',1250,1250,'Een bos seizoensbloemen',true]);
 assert.equal(c.items.length,2);assert.doesNotThrow(()=>parseHarvestConfig(c),'blijft geldige instellingen');
 const again=withSupplierOffer(c,'p-bloemen',parseSupplierOffer({active:true,rhythm:'follow',priceCents:1400,description:'Bos bloemen'}));
 assert.equal(again.items.length,2,'bijwerken, geen tweede onderdeel');assert.equal(offerOf(again,'p-bloemen').weeklyCents,1400);
});
test('uitzetten houdt het onderdeel maar zet het op niet actief; het basisabonnement kan een leverancier niet aanpassen',()=>{
 const c=withSupplierOffer(base(),'p-bloemen',parseSupplierOffer({active:true,rhythm:'weekly',priceCents:1250,description:'Bloemen'}));
 const off=withSupplierOffer(c,'p-bloemen',parseSupplierOffer({active:false}));
 assert.equal(offerOf(off,'p-bloemen').active,false);assert.equal(offerOf(off,'p-bloemen').weeklyCents,1250);
 assert.equal(withSupplierOffer(base(),'p-x',parseSupplierOffer({active:false})).items.length,1,'niets aanmaken bij uit');
 assert.throws(()=>withSupplierOffer(base(),'p-groente',parseSupplierOffer({active:true,rhythm:'weekly',priceCents:1000,description:'Groente'})),/basisabonnement/);
});
test('controle: prijs en omschrijving verplicht als het aanstaat',()=>{
 for(const v of [{active:true,priceCents:10,description:'Bloemen'},{active:true,priceCents:1000,description:''},{active:true,priceCents:'10',description:'Bloemen'}])assert.throws(()=>parseSupplierOffer(v));
 assert.equal(parseSupplierOffer({active:false}).active,false);
});
test('prijs per dag (wens eigenaar 7 november 2026): een levering is 7 dagen; maximum aantal klanten gaat mee',()=>{
 const o=parseSupplierOffer({active:true,rhythm:'follow',dayCents:300,maxSubscribers:12,description:'Een bos seizoensbloemen'});
 assert.deepEqual([o.dayCents,o.priceCents,o.maxSubscribers],[300,2100,12]);
 const c=withSupplierOffer(base(),'p-bloemen',o),i=offerOf(c,'p-bloemen');
 assert.deepEqual([i.weeklyCents,i.biweeklyCents,i.maxSubscribers],[2100,2100,12]);
 assert.equal(parseHarvestConfig(c).items.find(x=>x.id===i.id).maxSubscribers,12,'blijft bewaard in de instellingen');
 assert.equal(offerOf(withSupplierOffer(c,'p-bloemen',parseSupplierOffer({active:true,dayCents:300,description:'Bos'})),'p-bloemen').maxSubscribers,undefined,'leeg = onbeperkt');
 for(const v of [{active:true,dayCents:5,description:'Bos'},{active:true,dayCents:300,maxSubscribers:-1,description:'Bos'},{active:true,dayCents:300,maxSubscribers:1.5,description:'Bos'}])assert.throws(()=>parseSupplierOffer(v));
 assert.throws(()=>parseHarvestConfig({...c,items:c.items.map(x=>x.id===i.id?{...x,maxSubscribers:'veel'}:x)}),/maximum/);
});
test('je krijgt: prijs min btw min het coöperatiedeel; bij uitbetalen incl. btw ook je deel van de btw',async()=>{
 const {supplierShare}=await import('../lib/coop-core.ts');
 assert.equal(supplierShare(2000,'9',1500,false),1560,'€ 20 incl. 9% = 18,35 excl.; na 15% = 15,60');
 assert.equal(supplierShare(2000,'9',1500,true),1700,'incl. btw: 15,60 + 85% van 1,65');
 assert.equal(supplierShare(2000,'9',0,false),1835);
});
test('product aanpassen: zelfde controles als nieuw; omschrijving zonder herkomstregels, herkomst blijft',async()=>{
 const {parseProductEdit,descriptionOf,editedNote}=await import('../lib/coop-portal-core.ts');
 assert.deepEqual(parseProductEdit({name:' Bos  tulpen ',description:'Rood',vat:'9',allergens:[],allergensChecked:true}),{name:'Bos tulpen',description:'Rood',vat:'9',allergens:[],allergensChecked:true,organic:false,skal:false});
 assert.equal(typeof parseProductEdit({name:'B'}),'string');assert.equal(typeof parseProductEdit({name:'Brood',allergens:['Gluten']}),'string','allergenen bevestigen');
 const note='Rode tulpen\n\nToegevoegd door Bindert via de deelnemerspagina (2026-11-01).';
 assert.equal(descriptionOf(note),'Rode tulpen');
 const next=editedNote(note,'Gele tulpen','Bindert','2026-11-07');
 assert.equal(next,'Gele tulpen\n\nToegevoegd door Bindert via de deelnemerspagina (2026-11-01).\n\nAangepast door Bindert via de deelnemerspagina (2026-11-07).');
 assert.equal(descriptionOf(next),'Gele tulpen');assert.equal(editedNote(next,'','Bindert','2026-11-08').split('Aangepast').length,2,'één regel „aangepast”');
});

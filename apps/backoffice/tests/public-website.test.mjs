import {test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/ts-resolve.mjs';
const {publicProducts,publicMediaIds,publicPhoto,mediaId}=await import('../lib/public-products.ts');
import {publicWeekMenus} from '../lib/public-weekmenu.ts';
const ID='0d6f9c1e-6a2b-4c4f-9f2e-1a2b3c4d5e6f',ID2='1d010471-9856-4b3f-b84b-b460a67463da';
const row=(id,p,published=true)=>({id,version:1,published:published?JSON.stringify({name:'Soep',department:'Restaurant',priceCents:850,vat:'9',station:'kok',available:true,photo:'',note:'intern',check:'',allergens:[],allergensChecked:false,optionGroups:[],...p}):null,draft:'{}'});

test('foto: alleen een beeldbankfoto van een gepubliceerd product mag openbaar',()=>{
 const rows=[row('a',{photo:'/api/media/'+ID}),{...row('b',{}),published:null,draft:JSON.stringify({photo:'/api/media/'+ID2})},row('c',{photo:'https://example.org/x.jpg'})];
 assert.deepEqual([...publicMediaIds(rows)],[ID]);
 assert.equal(publicPhoto('/api/media/'+ID),'/api/public/media/'+ID);
 assert.equal(publicPhoto('/api/media/../../x'),null);assert.equal(publicPhoto('javascript:alert(1)'),null);assert.equal(publicPhoto('http://example.org/x.jpg'),null);
 assert.equal(mediaId('/api/media/'+ID+'/extra'),null);
});

test('weekmenu: alleen bevestigd, vanaf deze week, alleen gepubliceerde gerechten, zonder interne porties',()=>{
 const products=publicProducts([row('soep',{photo:'/api/media/'+ID}),row('kool',{name:'Boerenkool',priceCents:1650})]);
 const menus=[
  {week:'2026-10-26',items:[{productId:'soep',day:'donderdag',note:''}]},
  {week:'2026-11-02',items:[{productId:'soep',day:'donderdag',note:'met brood',portions:40},{productId:'concept-gerecht',day:'',note:''},{productId:'kool',day:'feestdag',note:''}]},
  {week:'2026-11-09',items:[{productId:'kool',day:'',note:''}]},
  {week:'2026-11-16',items:[{productId:'kool',day:'',note:''}]},
 ];
 const r=publicWeekMenus(menus,products,'2026-11-02');
 assert.deepEqual(r.map(w=>w.week),['2026-11-02','2026-11-09'],'deze en volgende week, oude weken niet');
 assert.deepEqual(r[0].items.map(i=>i.productId),['soep','kool'],'niet-gepubliceerd gerecht valt weg');
 assert.equal(r[0].items[0].priceCents,850);assert.equal(r[0].items[0].photo,'/api/public/media/'+ID);assert.equal(r[0].items[0].note,'met brood');
 assert.equal(r[0].items[1].day,'','onbekende dag wordt leeg');
 assert.ok(!JSON.stringify(r).includes('portions')&&!JSON.stringify(r).includes('intern'));
 assert.deepEqual(publicWeekMenus([{week:'2026-11-02',items:[{productId:'concept-gerecht',day:'',note:''}]}],products,'2026-11-02'),[],'een week zonder zichtbare gerechten verdwijnt');
});

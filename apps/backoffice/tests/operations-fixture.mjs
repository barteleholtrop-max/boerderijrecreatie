import {emptyOps} from '../lib/operations-core.ts';
export function sample(){const s=emptyOps();
 s.ingredients=[{id:'flour',name:'Bloem',unit:'kg',supplier:'Lokaal',article:'1',stock:2,known:true,countedAt:'2026-10-28',pack:5,min:1,leadDays:1,shelfDays:180,allergens:['Gluten'],checked:true,notes:'',origin:'inkoop',ownCents:null},{id:'milk',name:'Melk',unit:'l',supplier:'',article:'',stock:0,known:false,countedAt:'',pack:1,min:0,leadDays:0,shelfDays:7,allergens:['Melk'],checked:false,notes:'eigen',origin:'inkoop',ownCents:null}];
 s.invoices=[{id:'v1',supplier:'Lokaal',number:'F1',date:'2026-10-20',source:'pdf',reviewed:true,lines:[{id:'l1',article:'1',description:'Bloem',quantity:10,unit:'kg',netCents:2000,ingredientId:'flour',kind:'product',received:true},{id:'l2',article:'',description:'Statiegeld',quantity:1,unit:'st',netCents:50,ingredientId:'',kind:'deposit',received:false,orderId:'o1'}]}];
 s.recipes=[{productId:'p1',name:'Brood',yield:10,lines:[{ingredientId:'flour',quantity:2},{ingredientId:'milk',quantity:0.5}],method:'Bakken',lossPct:5,packagingCents:25,version:2,reviewed:true}];
 s.moves=[{id:'m1',ingredientId:'flour',quantity:2,date:'2026-10-28',reason:'Beginvoorraad',reference:'Telling'}];
 s.incoming=[{id:'o1',ingredientId:'flour',quantity:5,remaining:5,due:'2026-11-02',status:'confirmed',supplier:'Lokaal'}];
 return s;}

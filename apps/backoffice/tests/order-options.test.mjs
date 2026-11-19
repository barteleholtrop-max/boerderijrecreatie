import {test} from 'node:test';
import assert from 'node:assert/strict';
import {allocate,valuation,checkChosen,maxChosen,DEFAULT_SETTING,validSetting,newGroupCode,normalizeCode,CODE_PATTERN,groupProblem,budgetProblem,validGroupInput} from '../lib/order-options.ts';
const line=(totalCents,vat='9')=>({productId:'p',name:'x',quantity:1,unitCents:totalCents,totalCents,vat,vatCents:0,station:'kok',choices:[],note:''});
const on={...DEFAULT_SETTING('website'),enabled:true};

test('verdeling telt altijd exact op, naar verhouding, ook bij afronding',()=>{
 assert.deepEqual(allocate([1000,500],1200),[800,400]);
 assert.deepEqual(allocate([1,1,1],100),[34,33,33],'rest gaat op volgorde naar de grootste resten');
 assert.deepEqual(allocate([350,450],0),[0,0]);
 for(const [w,a] of [[[333,333,334],1000],[[1,2,3,4],997],[[999999,1],12345]])assert.equal(allocate(w,a).reduce((s,x)=>s+x,0),a);
 assert.throws(()=>allocate([0,0],5));assert.throws(()=>allocate([10],-1));
});

test('btw over wat werkelijk betaald wordt, per tarief; normale waarde blijft bewaard',()=>{
 const v=valuation([line(1090,'9'),line(1210,'21')],1150);
 assert.equal(v.commercialCents,2300);assert.equal(v.chosenCents,1150);assert.equal(v.differenceCents,-1150);
 assert.deepEqual(v.lines.map(l=>l.paidCents),[545,605]);
 assert.equal(v.vat9Cents,45);assert.equal(v.vat21Cents,105);
 const normaal=valuation([line(1090,'9')],null);assert.equal(normaal.chosenCents,1090);assert.equal(normaal.differenceCents,0);
 assert.equal(valuation([line(500)],0).zero,true);
});

test('eigen bedrag: alleen als het aanstaat, vanaf nul, tot het maximum',()=>{
 assert.equal(checkChosen(null,1000,null),null,'zonder eigen bedrag: normale prijs');
 assert.throws(()=>checkChosen(500,1000,DEFAULT_SETTING('website')),/kan hier nu niet/);
 assert.equal(checkChosen(0,1000,on),0);
 assert.throws(()=>checkChosen(0,1000,{...on,allowZero:false}),/hoger dan/);
 assert.equal(maxChosen(1000,on),3000);assert.equal(checkChosen(3000,1000,on),3000);
 assert.throws(()=>checkChosen(3001,1000,on),/hoger dan we online aannemen/);
 for(const bad of [-1,1.5,'500',NaN])assert.throws(()=>checkChosen(bad,1000,on));
 assert.equal(validSetting(on),true);assert.equal(validSetting({...on,maxPercent:50}),false);assert.equal(validSetting({...on,context:'kassa'}),false);
});

test('groepscode: 8 tekens zonder verwarrende letters, invoer met spaties of kleine letters werkt',()=>{
 for(let i=0;i<50;i++)assert.match(newGroupCode(),CODE_PATTERN);
 assert.equal(normalizeCode(' abcd-efgh '),'ABCDEFGH');
 assert.equal(normalizeCode('ABCD0FGH'),null,'geen 0');assert.equal(normalizeCode('ABC'),null);assert.equal(normalizeCode(5),null);
});

test('groepscode: geldigheid, gesloten en budget van de gastheer',()=>{
 const g={id:'g',code:'ABCDEFGH',name:'Feest van opa',host:'Opa Jan',budgetCents:20000,validFrom:'2026-11-07',validUntil:'2026-11-08',status:'actief',version:1};
 assert.equal(groupProblem(g,'2026-11-07'),null);
 assert.match(groupProblem(g,'2026-11-06'),/pas geldig vanaf 07-11-2026/);
 assert.match(groupProblem(g,'2026-11-09'),/verlopen/);
 assert.match(groupProblem({...g,status:'gesloten'},'2026-11-07'),/gesloten/);
 assert.match(groupProblem(null,'2026-11-07'),/kennen we niet/);
 assert.equal(budgetProblem(15000,5000,20000),null);assert.match(budgetProblem(15001,5000,20000),/budget van deze groep is bereikt/);
 assert.equal(validGroupInput({name:'Feest',host:'Opa',budgetCents:20000,validFrom:'2026-11-07',validUntil:'2026-11-07'}),true);
 assert.equal(validGroupInput({name:'Feest',host:'Opa',budgetCents:0,validFrom:'2026-11-07',validUntil:'2026-11-07'}),false);
 assert.equal(validGroupInput({name:'Feest',host:'Opa',budgetCents:100,validFrom:'2026-11-08',validUntil:'2026-11-07'}),false);
});

test('groepsbudget: de database weigert een bestelling boven het maximum, ook met de echte databaseopbouw',async t=>{
 const {pgDb}=await import('./helpers/pg-db.mjs');
 const {GROUP_ORDER_INSERT_SQL,LINES_FOR_ORDER_SQL}=await import('../lib/order-options-sql.ts');
 const db=await pgDb();t.after(()=>db.close());
 await db.run(`INSERT INTO group_codes(id,code,name,host,budget_cents,valid_from,valid_until,status,version,created,created_by,updated) VALUES('g1','ABCDEFGH','Feest van opa','Opa',1000,'2026-11-01','2026-11-30','actief',1,'x','x','x')`);
 const order=async(rid,cents,day='2026-11-03')=>{await db.run(GROUP_ORDER_INSERT_SQL,rid,'{}','{}','x','zelfservice','Groep','op-groepsrekening','op-rekening',cents,0,0,'website','g1',day);
  await db.run(LINES_FOR_ORDER_SQL,rid,0,'p','Koffie','barista',1,cents,cents,'9',0,null,null,null);};
 await order('r1',600);await order('r2',500);await order('r3',400);await order('r4',100,'2026-12-01');
 assert.deepEqual(await db.all('SELECT request_id AS r,total_cents AS t,group_code_id AS g,test FROM orders ORDER BY id'),[{r:'r1',t:600,g:'g1',test:1},{r:'r3',t:400,g:'g1',test:1}]);
 assert.equal((await db.get('SELECT COUNT(*) AS n FROM order_lines')).n,2); // refused orders leave no lines behind
 await db.run(`UPDATE group_codes SET status='gesloten',budget_cents=5000`);await order('r5',100);
 assert.equal((await db.get('SELECT COUNT(*) AS n FROM orders')).n,2);
});

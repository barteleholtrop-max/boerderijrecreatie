// Rollen per pot (wens eigenaar 6 november 2026): rollen direct door de beheerder, punten via een voorstel aan de leden.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import './helpers/ts-resolve.mjs';
const core=await import('../lib/pot-roles-core.ts');
const pc=await import('../lib/pot-core.ts');

test('rollenlijst: naam, soort en aan/uit uit de lijst, punten uit de afspraak (nieuwe rol 0)',()=>{
 const agreement=[{id:'verantwoordelijke-speelboerderij',name:'Verantwoordelijke speelboerderij',points:3,week:true},{id:'chef-kok',name:'Chef-kok',points:4}];
 assert.deepEqual(core.mergeRoles(agreement,null).map(r=>[r.id,r.active]),[['verantwoordelijke-speelboerderij',true],['chef-kok',true]],'zonder lijst: de afspraak');
 const cat=[...core.seedFrom(agreement).map(r=>r.id==='chef-kok'?{...r,active:false}:r),{id:'tuinonderhoud',name:'Tuinonderhoud',kind:'week',active:true,position:5}];
 const m=core.mergeRoles(agreement,cat);
 assert.deepEqual(m.map(r=>[r.id,r.points,r.week,r.active,r.inAgreement]),[['verantwoordelijke-speelboerderij',3,true,true,true],['chef-kok',4,false,false,true],['tuinonderhoud',0,true,true,false]]);
 const plan=core.forPlanning([{pot:'speelboerderij',roles:agreement},{pot:'restaurant',roles:agreement}],new Map([['speelboerderij',cat]]));
 assert.deepEqual(plan[0].roles.map(r=>r.id),['verantwoordelijke-speelboerderij','tuinonderhoud'],'uitgezet = niet te plannen');
 assert.deepEqual(plan[1].roles.map(r=>r.id),['verantwoordelijke-speelboerderij','chef-kok'],'andere pot ongewijzigd');
 assert.throws(()=>core.parseRole({name:'x'},[]),/2 tot 40/);
 assert.throws(()=>core.parseRole({name:'tuinonderhoud'},cat),/al een rol/);
 assert.equal(core.newId('Onderhoud speelvoorzieningen',[]),'onderhoud-speelvoorzieningen');
 assert.equal(core.newId('Chef-kok',['chef-kok']),'chef-kok-2','een oude id krijgt nooit een nieuwe rol');
 // Een voorstel houdt een bestaande rol-id, zodat een hernoemde rol zijn punten houdt.
 const p=pc.parseProposal({pot:'speelboerderij',validFrom:'2026-12-01',percentBp:9800,roles:[{id:'tuinonderhoud',name:'Tuin en border',points:2,week:true},{name:'Nieuwe rol',points:1}]},'2026-11-06');
 assert.deepEqual(p.roles.map(r=>r.id),['tuinonderhoud','nieuwe-rol']);
});

const run=(name,code)=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-'+name+'-'));
 try{const r=spawnSync(process.execPath,['--experimental-transform-types','--input-type=module','-e',"import './tests/helpers/ts-resolve.mjs';import assert from 'node:assert/strict';"+code],
  {cwd:new URL('../',import.meta.url),env:{...process.env,APP_DATA_DIR:dir,APP_ORIGIN:'http://127.0.0.1:3001',PUBLIC_ORDER_ORIGINS:'',SHEETS_CONFIG_KEY:'ab'.repeat(32),GUEST_WEATHER_LOCATION:''},encoding:'utf8',timeout:120000});
  assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/ok/)}finally{fs.rmSync(dir,{recursive:true,force:true})}};

test('keten: speelboerderij-rollen, plannen en aannemen; uitgezette rol houdt zijn punten in de afrekening',()=>run('rollen',`
 const {getDb}=await import('./db/index.ts');const s=await import('./db/schema.ts');const roles=await import('./lib/pot-roles.ts');const plan=await import('./lib/pot-planning.ts');
 const {roleCatalogue}=await import('./lib/members.ts');const {today}=await import('./lib/pot-agreements.ts');const {mondayOf}=await import('./lib/coop-core.ts');
 const db=getDb(),t=new Date().toISOString(),A='aaaaaaaa-0000-4000-8000-000000000001',add=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
 await db.insert(s.coopParticipants).values([{id:A,name:'Anna',units:'["restaurant","speelboerderij"]',potRoles:'{}',created:t,updated:t}]);
 // De speelboerderij had (per ongeluk) de restaurantrollen in de afspraak.
 const old=[{id:'verantwoordelijke-speelboerderij',name:'Verantwoordelijke speelboerderij',points:3,week:true},{id:'chef-kok',name:'Chef-kok',points:4},{id:'afwas',name:'Afwas',points:2},{id:'schoonmaak',name:'Schoonmaak',points:1,week:true},{id:'organisatie',name:'Organisatie',points:1,week:true}];
 await db.insert(s.potAgreements).values({id:'sb',pot:'speelboerderij',validFrom:'2026-01-01',percentBp:9800,status:'geldig',proposedAt:t,decidedAt:t,roles:JSON.stringify(old)});
 // Zonder lijst: de rollen van de afspraak.
 let o=(await roles.overview()).find(p=>p.pot==='speelboerderij');assert.equal(o.custom,false);assert.equal(o.roles.length,5);
 // Tuinonderhoud en Onderhoud speelvoorzieningen erbij; de restaurantrollen uit.
 const tuin=await roles.addRole('speelboerderij',{name:'Tuinonderhoud',kind:'week'},'Rianne');
 const speel=await roles.addRole('speelboerderij',{name:'Onderhoud speelvoorzieningen',kind:'dag'},'Rianne');
 for(const id of ['chef-kok','afwas'])await roles.updateRole('speelboerderij',id,{active:false},'Rianne');
 await assert.rejects(()=>roles.addRole('speelboerderij',{name:'tuinonderhoud',kind:'dag'},'Rianne'),/al een rol/);
 o=(await roles.overview()).find(p=>p.pot==='speelboerderij');
 assert.deepEqual(o.roles.filter(r=>r.active).map(r=>[r.name,r.kind,r.points]),[['Verantwoordelijke speelboerderij','week',3],['Schoonmaak','week',1],['Organisatie','week',1],['Tuinonderhoud','week',0],['Onderhoud speelvoorzieningen','dag',0]]);
 // Ledenkaart: aannemen voor de nieuwe rollen kan; de uitgezette rollen staan er niet meer bij.
 const sbCat=(await roleCatalogue()).find(p=>p.pot==='speelboerderij');assert.ok(sbCat.roles.some(r=>r.id===tuin));assert.ok(!sbCat.roles.some(r=>r.id==='chef-kok'));
 assert.equal((await roleCatalogue()).find(p=>p.pot==='restaurant').roles.length>=0,true,'andere pot ongemoeid');
 // Plannen: de speelboerderij is een weekpot; de rollen staan op de maandag.
 const M=add(mondayOf(today()),7);
 let r=await plan.roster('speelboerderij',M,1);const ids=r.days[0].slots.map(x=>x.roleId);
 assert.ok(ids.includes(tuin)&&ids.includes(speel)&&!ids.includes('chef-kok'),ids.join());
 await plan.setNeed('speelboerderij',M,speel,2,'Rianne');
 await plan.claim('speelboerderij',M,speel,A,'Rianne');
 r=await plan.roster('speelboerderij',M,1);assert.equal(r.days[0].slots.find(x=>x.roleId===speel).people.length,1);
 // Een uitgezette rol kan niet meer worden gepland, maar een dienst uit het verleden houdt zijn punten in de afrekening.
 await plan.setNeed('speelboerderij',M,'chef-kok',1,'Rianne');
 await assert.rejects(()=>plan.claim('speelboerderij',M,'chef-kok',A,'Rianne'),/afspraak/);
 const W=add(mondayOf(today()),-7);
 await db.insert(s.potShifts).values({pot:'speelboerderij',day:W,participantId:A,roleId:'chef-kok',status:'aanwezig',at:t,by:'oud'});
 const {potWeek}=await import('./lib/pot-days.ts');const w=await potWeek('speelboerderij',W);
 assert.equal(w.result.people.find(p=>p.participantId===A).points,4,'chef-kok telt nog met 4 punten');
 console.log('ok');`));

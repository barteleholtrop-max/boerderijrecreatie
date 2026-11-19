import './helpers/ts-resolve.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {sample} from './operations-fixture.mjs';
const {runTool,TOOL_DEFINITIONS}=await import('../lib/assistant-tools.ts');
const {runTurn,toParams}=await import('../lib/assistant-engine.ts');
const {upcomingWeek,GUARD_SQL}=await import('../lib/assistant-core.ts');
const W=await import('../lib/weekmenu-sql.ts');

const products=[{id:'p1',name:'Brood',department:'Winkel',priceCents:450,published:true,available:true},{id:'soep',name:'Pompoensoep',department:'Restaurant',priceCents:850,published:true,available:true},{id:'kool',name:'Boerenkoolstamppot',department:'Restaurant',priceCents:1650,published:false,available:true}];
function context(over={}){
 const proposals=[];
 return {proposals,ctx:{today:'2026-10-31',week:'2026-11-02',products:async()=>products,ops:async()=>sample(),
  weekMenus:async()=>({concept:null,confirmed:null}),
  proposeWeekMenu:async(week,items,summary)=>{proposals.push({week,items,summary});return {proposalId:'v1',menuId:'m1'}},...over}};
}

test('hulpmiddelen hebben een strikt schema en een Nederlandse omschrijving',()=>{
 for(const t of TOOL_DEFINITIONS){assert.equal(t.strict,true,t.name);assert.equal(t.input_schema.additionalProperties,false,t.name);assert.deepEqual([...t.input_schema.required].sort(),Object.keys(t.input_schema.properties).sort(),t.name+': alle velden verplicht')}
});

test('producten zoeken leest de centrale lijst, met recept en kostprijs',async()=>{
 const r=await runTool('producten_zoeken',{zoekterm:'Brood',afdeling:''},context().ctx);
 assert.equal(r.isError,false);const v=JSON.parse(r.content);
 assert.equal(v.aantal_gevonden,1);assert.equal(v.producten[0].product_id,'p1');assert.equal(v.producten[0].recept,'gecontroleerd');assert.match(v.producten[0].kostprijs_per_portie,/€|onbekend/);
 assert.equal(JSON.parse((await runTool('producten_zoeken',{zoekterm:'',afdeling:'restaurant'},context().ctx)).content).aantal_gevonden,2);
});

test('voorraad: ongetelde voorraad is onbekend, niet nul, en onderweg telt mee',async()=>{
 const v=JSON.parse((await runTool('voorraad_bekijken',{alleen_tekorten:false},context().ctx)).content);
 const melk=v.ingredienten.find(i=>i.naam==='Melk'),bloem=v.ingredienten.find(i=>i.naam==='Bloem');
 assert.equal(melk.voorraad,null);assert.equal(melk.tekort,true);assert.equal(bloem.voorraad,2);assert.equal(bloem.onderweg,5);
});

test('bestellijst gebruikt de vaste rekenregel en bestelt niets',async()=>{
 const r=await runTool('bestellijst_berekenen',{nodig_op:'2026-11-03',porties:[{product_id:'p1',aantal:20}]},context().ctx);
 const v=JSON.parse(r.content);assert.equal(r.isError,false);assert.match(v.let_op,/niets besteld/);assert.ok(v.regels.length>0);
 assert.equal((await runTool('bestellijst_berekenen',{nodig_op:'2026-10-01',porties:[{product_id:'p1',aantal:2}]},context().ctx)).isError,true,'datum in het verleden');
});

test('weekmenu: alleen bestaande producten, als concept; ongeldige invoer wordt geweigerd',async()=>{
 const c=context();
 const bad=await runTool('weekmenu_voorstellen',{gerechten:[{product_id:'zuurkool',dag:'',porties:null,opmerking:''}],samenvatting:'x'},c.ctx);
 assert.equal(bad.isError,true);assert.match(bad.content,/bestaan niet/);assert.equal(c.proposals.length,0);
 const ok=await runTool('weekmenu_voorstellen',{gerechten:[{product_id:'soep',dag:'donderdag',porties:40,opmerking:'met roggebrood'},{product_id:'kool',dag:'',porties:null,opmerking:''}],samenvatting:'Soep en stamppot'},c.ctx);
 assert.equal(ok.isError,false);assert.equal(JSON.parse(ok.content).vastgelegd_als,'concept');
 assert.deepEqual(c.proposals[0].items[0],{productId:'soep',day:'donderdag',portions:40,note:'met roggebrood'});assert.equal(c.proposals[0].week,'2026-11-02');
 for(const input of [{gerechten:[],samenvatting:'x'},{gerechten:[{product_id:'soep',dag:'feestdag',porties:1,opmerking:''}],samenvatting:'x'},{gerechten:[{product_id:'soep',dag:'',porties:-1,opmerking:''}],samenvatting:'x'}])
  assert.equal((await runTool('weekmenu_voorstellen',input,c.ctx)).isError,true);
 assert.equal((await runTool('bestellen',{},c.ctx)).isError,true,'er bestaat geen hulpmiddel om te bestellen');
});

test('een fout bij het ophalen wordt eerlijk gemeld in plaats van verzonnen',async()=>{
 const r=await runTool('voorraad_bekijken',{alleen_tekorten:true},context({ops:async()=>{throw Error('database bezet')}}).ctx);
 assert.equal(r.isError,true);assert.match(r.content,/eerlijk/);
});

// ---- Engine with a fake Claude API
function memoryStore(initial,calls=0){
 const rows=initial.map((m,i)=>({seq:i+1,...m}));
 return {rows,messages:async()=>rows.map(r=>({seq:r.seq,role:r.role,content:r.content})),append:async m=>{rows.push({seq:rows.length+1,...m})},callsToday:async()=>calls};
}
const user=t=>({role:'user',content:[{type:'text',text:t}]});
const reply=(content,stop='end_turn')=>({content,stop_reason:stop,model:'claude-opus-5-5',usage:{input_tokens:10,output_tokens:5,cache_read_input_tokens:0}});

test('motor: hulpmiddel, dan antwoord; geschiedenis wordt alleen aangevuld, nooit gewijzigd',async()=>{
 const store=memoryStore([user('Wat hebben we nog aan voorraad?')]),seen=[];
 const thinking={type:'thinking',thinking:'',signature:'sig-1'};
 const responses=[reply([thinking,{type:'tool_use',id:'t1',name:'voorraad_bekijken',input:{alleen_tekorten:true}}],'tool_use'),reply([{type:'text',text:'Melk is nog niet geteld.'}])];
 const result=await runTurn(store,context().ctx,async p=>{seen.push(structuredClone(p));return responses.shift()});
 assert.equal(result,'beantwoord');
 assert.deepEqual(store.rows.map(r=>r.role),['user','assistant','tool','assistant']);
 assert.deepEqual(store.rows[1].content[0],thinking,'denkblok ongewijzigd bewaard');
 assert.equal(store.rows[2].content[0].tool_use_id,'t1');
 assert.deepEqual(seen[1].messages.slice(0,seen[0].messages.length),seen[0].messages,'tweede aanroep begint met exact de eerste geschiedenis');
 assert.equal(seen[0].system,seen[1].system,'vaste instructies');
 assert.equal(seen[0].fallbacks,'default');assert.deepEqual(seen[0].betas,['server-side-fallback-2026-07-01']);
 assert.equal(store.rows[3].text,'Melk is nog niet geteld.');assert.deepEqual(store.rows[3].sources.tools,['voorraad']);
 assert.equal(await runTurn(store,context().ctx,async()=>{throw Error('mag niet worden aangeroepen')}),'niets-te-doen');
});

test('motor: na een onderbreking eerst de openstaande hulpmiddelen uitvoeren',async()=>{
 const store=memoryStore([user('Menu?'),{role:'assistant',content:[{type:'tool_use',id:'t9',name:'weekmenu_bekijken',input:{}}]}]);
 let first;await runTurn(store,context().ctx,async p=>{first??=p;return reply([{type:'text',text:'Er is nog geen menu.'}])});
 assert.equal(first.messages.at(-1).content[0].tool_use_id,'t9');assert.equal(store.rows.at(-1).role,'assistant');
});

test('motor: weigering, dagelijkse limiet en meldingen gaan niet naar de API',async()=>{
 const store=memoryStore([user('x')]);
 assert.equal(await runTurn(store,context().ctx,async()=>reply([],'refusal')),'geweigerd');assert.equal(store.rows.at(-1).role,'notitie');
 assert.ok(toParams(store.rows).every(m=>m.role==='user'||m.role==='assistant'));assert.equal(toParams(store.rows).length,2);
 const limited=memoryStore([user('x')],300);
 assert.equal(await runTurn(limited,context().ctx,async()=>{throw Error('niet aanroepen')}),'limiet');
});

test('motor: stopt na het maximale aantal stappen met een melding',async()=>{
 const store=memoryStore([user('x')]);let n=0;
 const r=await runTurn(store,context().ctx,async()=>reply([{type:'tool_use',id:'t'+(++n),name:'weekmenu_bekijken',input:{}}],'tool_use'),{model:'m',effort:'low',dailyLimit:100,maxSteps:3});
 assert.equal(r,'te-veel-stappen');assert.equal(n,3);assert.equal(store.rows.at(-1).role,'notitie');
});

// ---- Weekmenu in the database (echte databaselaag op een verse PGlite-database, met de bewaking zoals bij goedkeuren)
async function migrated(t){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'bb-weekmenu-'));process.env.APP_DATA_DIR=tmp;
 const {env,closeDatabase}=await import('../lib/portable/env.ts');t.after(async()=>{process.env.APP_DATA_DIR=tmp;await closeDatabase();fs.rmSync(tmp,{recursive:true,force:true})});
 return env.DB;
}
async function propose(db,menuId,week,t){
 await db.prepare(W.SUPERSEDE_PROPOSALS_SQL).bind(week).run();await db.prepare(W.SUPERSEDE_MENUS_SQL).bind(week,t).run();await db.prepare(W.INSERT_MENU_SQL).bind(menuId,week,'thread',t).run();
 await db.prepare(W.INSERT_ITEM_SQL).bind(menuId,0,'soep','donderdag',40,'').run();
 await db.prepare(W.INSERT_PROPOSAL_SQL).bind('v-'+menuId,'r-'+menuId,'Weekmenu','samenvatting',JSON.stringify({menuId,week}),'thread',t).run();
}
const confirm=(db,menuId,week)=>db.batch([db.prepare(W.LAPSE_CONFIRMED_SQL).bind(week,menuId,'t'),db.prepare(W.CONFIRM_MENU_SQL).bind(menuId,'rianne','t'),db.prepare(GUARD_SQL)]);
const statuses=async(db,table)=>Object.fromEntries((await db.prepare(`SELECT id, status FROM ${table}`).all()).results.map(r=>[r.id,r.status]));

test('weekmenu: nieuw concept vervangt het vorige; bevestigen vervangt het vorige bevestigde menu',async t=>{
 const db=await migrated(t),week='2026-11-02';
 await propose(db,'a',week,'1');await propose(db,'b',week,'2');
 assert.deepEqual(await statuses(db,'week_menus'),{a:'vervallen',b:'concept'});assert.deepEqual(await statuses(db,'proposals'),{'v-a':'vervallen','v-b':'concept'});
 await confirm(db,'b',week);assert.equal((await statuses(db,'week_menus')).b,'bevestigd');
 await propose(db,'c',week,'3');assert.equal((await statuses(db,'week_menus')).b,'bevestigd','concept na bevestiging laat bevestigd menu staan');
 await confirm(db,'c',week);assert.deepEqual(await statuses(db,'week_menus'),{a:'vervallen',b:'vervallen',c:'bevestigd'});
 await assert.rejects(confirm(db,'c',week),/besluit-conflict/,'een al bevestigd of vervallen concept kan niet nog eens');
 assert.equal((await statuses(db,'week_menus')).c,'bevestigd');
 await propose(db,'d',week+'x','4');assert.equal((await statuses(db,'week_menus')).c,'bevestigd','andere week blijft ongemoeid');
});

test('weekgesprek gaat op maandag en dinsdag over deze week, daarna over de volgende',()=>{
 assert.equal(upcomingWeek('2026-11-02'),'2026-11-02');assert.equal(upcomingWeek('2026-11-03'),'2026-11-02');
 assert.equal(upcomingWeek('2026-11-04'),'2026-11-09');assert.equal(upcomingWeek('2026-10-31'),'2026-11-02');assert.equal(upcomingWeek('2026-11-08'),'2026-11-09');
});

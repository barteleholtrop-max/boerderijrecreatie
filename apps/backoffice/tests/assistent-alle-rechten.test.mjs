// Wens eigenaar 13 november 2026: „De week assistent moet Sanne volledig helpen en heeft alle rechten, zoals dingen in de agenda zetten,
// producten aanmaken enz. Ze moet Sanne volledig en in alles (behalve coderen) helpen. Er moet ook een foto kunnen uploaden om
// informatie uit te halen. Dit geldt ook voor de assistent in de backoffice.”
import './helpers/ts-resolve.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const hulp=await import('../lib/hulp-tools.ts');
const {executeAction}=await import('../lib/hulp-actions.ts');
const week=await import('../lib/assistant-tools.ts');
const full=await import('../lib/assistant-full.ts');
const core=await import('../lib/assistant-core.ts');

const products=[{id:'p1',name:'Pompoensoep',department:'Restaurant',priceCents:850,vat:'9',published:true,available:true,note:'',deleted:false},
 {id:'p2',name:'Appeltaart',department:'Restaurant',priceCents:450,vat:'',published:false,available:true,note:'',deleted:false}];
function hulpCtx(outcome){
 const proposed=[];
 return {proposed,ctx:{today:'2026-11-13',products:async()=>products,members:async()=>[],roles:async()=>[],customers:async()=>[],
  propose:async a=>{proposed.push(a);return {id:'a'+proposed.length,...outcome}}}};
}

test('een schrijfhulpmiddel voert direct uit en geeft de uitkomst terug',async()=>{
 const {ctx,proposed}=hulpCtx({status:'uitgevoerd',result:'Product gewijzigd en meteen gepubliceerd.'});
 const r=await hulp.runTool('product_wijzigen',{product_id:'p1',prijs_cent:950,btw:null,beschikbaar:null},ctx);
 assert.equal(r.isError,false);const v=JSON.parse(r.content);
 assert.equal(v.uitgevoerd,true);assert.match(v.uitkomst,/meteen gepubliceerd/);assert.doesNotMatch(r.content,/NIETS gewijzigd/);
 assert.deepEqual(proposed[0].input,{productId:'p1',priceCents:950,vat:null,available:null});
});

test('een weigering van de backoffice komt terug als fout met de reden',async()=>{
 const {ctx}=hulpCtx({status:'mislukt',result:'Dit product is intussen gewijzigd.'});
 const r=await hulp.runTool('product_publiceren',{product_id:'p1',publiceren:false},ctx);
 assert.equal(r.isError,true);assert.match(r.content,/intussen gewijzigd/);assert.match(r.content,/NIETS gewijzigd/);
});

test('publiceren zonder btw wordt geweigerd; meteen gepubliceerd aanmaken kan met btw',async()=>{
 const {ctx,proposed}=hulpCtx({status:'uitgevoerd',result:'ok'});
 assert.match((await hulp.runTool('product_publiceren',{product_id:'p2',publiceren:true},ctx)).content,/btw/);
 assert.match((await hulp.runTool('product_aanmaken',{naam:'Stamppot',afdeling:'Restaurant',prijs_cent:1250,btw:'',notitie:'',publiceren:true},ctx)).content,/btw/);
 const r=await hulp.runTool('product_aanmaken',{naam:'Stamppot',afdeling:'Restaurant',prijs_cent:1250,btw:'9',notitie:'',publiceren:true},ctx);
 assert.equal(r.isError,false);assert.equal(proposed.at(-1).input.publish,true);
});

test('uitvoering van productacties gaat via de productroute',async()=>{
 const calls=[];
 const deps={post:async(route,body)=>{calls.push([route,body]);return {ok:true,status:200,data:{ok:true}}},
  product:async id=>id==='p1'?{version:3,draft:{name:'Pompoensoep',priceCents:850,vat:'9',available:true},published:true}:{version:1,draft:{name:'Appeltaart',priceCents:450,vat:'9',available:true},published:false}};
 assert.match(await executeAction({type:'product_wijzigen',input:{productId:'p1',priceCents:950,vat:null,available:false}},deps),/gepubliceerd/);
 assert.deepEqual(calls.at(-1),['products',{action:'publish',id:'p1',version:3,product:{name:'Pompoensoep',priceCents:950,vat:'9',available:false}}]);
 assert.match(await executeAction({type:'product_wijzigen',input:{productId:'p2',priceCents:500,vat:null,available:null}},deps),/concept/);
 assert.equal(calls.at(-1)[1].action,'save');
 await executeAction({type:'product_publiceren',input:{productId:'p1',publish:false}},deps);
 assert.deepEqual(calls.at(-1),['products',{action:'unpublish',id:'p1',version:3}]);
 await executeAction({type:'product_aanmaken',input:{name:'Stamppot',department:'Restaurant',priceCents:1250,vat:'9',note:'',publish:true}},deps);
 assert.equal(calls.at(-1)[1].action,'create-publish');
});

test('de Weekassistent heeft alle hulpmiddelen van de backoffice erbij',async()=>{
 const names=full.FULL_TOOLS.map(t=>t.name);
 assert.equal(new Set(names).size,names.length,'geen dubbele namen');
 for(const n of ['weekmenu_voorstellen','weekmenu_bevestigen','boodschap_toevoegen','klantgesprek_inplannen','agenda_bekijken','product_aanmaken','product_wijzigen','product_publiceren','afwijkende_dag'])assert.ok(names.includes(n),n);
 assert.match(full.FULL_SYSTEM_PROMPT,/alle rechten/);assert.match(full.FULL_SYSTEM_PROMPT,/Waar hieronder "de beheerder" staat, is dat Sanne/);
 assert.match(full.FULL_SYSTEM_PROMPT,/^Je bent de Weekassistent/);assert.doesNotMatch(full.FULL_SYSTEM_PROMPT,/Je bent de Backoffice-assistent/);
 // De keukenversie van producten_zoeken wint; een backofficehulpmiddel krijgt de backofficegegevens.
 let used='';
 const ctx={week:{today:'2026-11-13',week:'2026-11-16',products:async()=>{used='week';return []},ops:async()=>({recipes:[],ingredients:[],incoming:[]})},
  hulp:{today:'2026-11-13',products:async()=>{used='hulp';return []},customers:async()=>[]}};
 await full.FULL_KIT.runTool('producten_zoeken',{zoekterm:'',afdeling:''},ctx);assert.equal(used,'week');
 await full.FULL_KIT.runTool('product_publiceren',{product_id:'x',publiceren:true},ctx);assert.equal(used,'hulp');
});

test('weekmenu bevestigen door de assistent, alleen als er een concept is',async()=>{
 let n=0;const ctx={today:'2026-11-13',week:'2026-11-16',confirmWeekMenu:async()=>n++?null:{confirmed:true}};
 const r=await week.runTool('weekmenu_bevestigen',{},ctx);assert.equal(r.isError,false);assert.match(r.content,/bevestigd/);
 assert.equal((await week.runTool('weekmenu_bevestigen',{},ctx)).isError,true);
});

test('foto: alleen een beeld van redelijke grootte; zonder tekst vraagt de foto om uitleg',()=>{
 const data='A'.repeat(400);
 assert.deepEqual(core.validPhoto({mediaType:'image/jpeg',data}),{mediaType:'image/jpeg',data});
 assert.equal(core.validPhoto({mediaType:'application/pdf',data}),null);
 assert.equal(core.validPhoto({mediaType:'image/png',data:'<script>'}),null);
 assert.equal(core.validPhoto({mediaType:'image/png',data:'A'.repeat(core.PHOTO_MAX_CHARS+4)}),null);
 assert.match(core.photoText('',{mediaType:'image/jpeg',data}),/Wat zie je op deze foto/);
 assert.equal(core.photoText(' Zet dit op de lijst ',null),'Zet dit op de lijst');
 assert.deepEqual(core.photoBlock({mediaType:'image/jpeg',data}),{type:'image',source:{type:'base64',media_type:'image/jpeg',data}});
 assert.equal(core.hasPhoto(JSON.stringify([core.photoBlock({mediaType:'image/jpeg',data}),{type:'text',text:'x'}])),true);
});

test('in de database: een foto gaat als beeld naar Claude, en een actie wordt meteen uitgevoerd zonder klik',async t=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'bb-alle-rechten-'));process.env.APP_DATA_DIR=tmp;
 const {env,closeDatabase}=await import('../lib/portable/env.ts');t.after(async()=>{process.env.APP_DATA_DIR=tmp;await closeDatabase();fs.rmSync(tmp,{recursive:true,force:true})});
 const S=await import('../lib/hulp-store.ts'),A=await import('../lib/assistant-store.ts');
 const now=new Date('2026-11-13T10:00:00Z'),photo={mediaType:'image/jpeg',data:'A'.repeat(400)};
 await S.startHulpThread('gesprek-foto1','Sanne','/inkoop','Wat staat er op deze pakbon?',now,photo);
 const [m]=await A.threadMessages('gesprek-foto1');const content=JSON.parse(m.content);
 assert.deepEqual(content.map(b=>b.type),['text','image','text']);assert.match(content[0].text,/met een foto/);
 // Direct uitvoeren: een product dat niet bestaat wordt geweigerd, en dat komt terug als uitkomst.
 const tomorrow=new Date(Date.parse(new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date())+'T12:00:00Z')+86400000).toISOString().slice(0,10);
 const action={type:'product_tekst_wijzigen',input:{productId:'bestaat-niet-'+tomorrow,name:'Soep',note:null},title:'Soep hernoemen',details:['Gerechten & prijzen']};
 const thread=await S.hulpThread('gesprek-foto1','Sanne');
 const ctx=await S.hulpContext(thread,now);
 const r=await ctx.propose(action);
 assert.equal(r.status,'mislukt');assert.ok(r.result.length>5);
 const actions=await S.threadActions('gesprek-foto1',now);assert.deepEqual(actions.map(a=>[a.title,a.status]),[['Soep hernoemen','mislukt']]);
 const notes=(await env.DB.prepare(`SELECT text FROM assistant_messages WHERE account='systeem'`).all()).results;
 assert.equal(notes.length,0,'geen melding midden in een beurt van de assistent');
});

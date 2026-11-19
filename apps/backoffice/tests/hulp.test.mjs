import './helpers/ts-resolve.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const {runTool,TOOL_DEFINITIONS,ACTION_TYPES}=await import('../lib/hulp-tools.ts');
const {executeAction,ALLOWED_ROUTES,ActionError}=await import('../lib/hulp-actions.ts');
const {HULP_SYSTEM_PROMPT}=await import('../lib/hulp-prompt.ts');
const {runTurn}=await import('../lib/assistant-engine.ts');

const products=[{id:'p1',name:'Pompoensoep',department:'Restaurant',priceCents:850,vat:'9',published:true,available:true,note:'',deleted:false}];
function context(){
 const proposed=[];
 return {proposed,ctx:{today:'2026-11-06',products:async()=>products,
  hours:async()=>({weekly:[],exceptions:[{datum:'2026-01-01',open:false,van:'10:00',tot:'18:00',notitie:'oud'},{datum:'2026-12-24',open:false,van:'10:00',tot:'18:00',notitie:'Kerst'}]}),
  propose:async a=>{proposed.push(a);return {id:'a'+proposed.length}}}};
}

test('hulpmiddelen hebben een gesloten schema; alle velden verplicht',()=>{
 for(const t of TOOL_DEFINITIONS){assert.equal(t.input_schema.additionalProperties,false,t.name);assert.deepEqual([...t.input_schema.required].sort(),Object.keys(t.input_schema.properties).sort(),t.name)}
});

test('afgebakend: geen kassa, saldo, IBAN, percentages of weekafsluiting; geen leden of Bloei',()=>{
 const names=TOOL_DEFINITIONS.map(t=>t.name).join(' ');
 assert.doesNotMatch(names,/saldo|particip|kassa|bestel|afsluit|iban|percent|bloei|lid_|leden|dienst|rol_|overleg|uitbetal/i);
 // Elke schrijfactie heeft precies één hulpmiddel; meer schrijfhulpmiddelen bestaan niet.
 const write=TOOL_DEFINITIONS.filter(t=>!/_(bekijken|zoeken|signalen)$/.test(t.name)).map(t=>t.name).sort();
 assert.deepEqual(write,[...ACTION_TYPES].sort());
 assert.deepEqual([...ALLOWED_ROUTES].sort(),['gasten','products','rekeningen']);
 const src=fs.readFileSync(new URL('../lib/hulp-actions.ts',import.meta.url),'utf8');
 assert.deepEqual([...new Set([...src.matchAll(/action:'([a-z-]+)'/g)].map(m=>m[1]))].sort(),['appointment','create','create-publish','customer','exception','group-day','hours','mail','publish','reservation','save','unpublish'].sort());
 assert.match(src,/action:'reservation',reservation:\{[^}]*status:confirmed\?'bevestigd':'optie'/);
 assert.doesNotMatch(src,/action:'(quote|quote-send|signup-paid)'/,'geen offertes of betalingen');
 assert.doesNotMatch(src,/\biban\s*:|api\/bloei|from '\.\/bloei/i);
});

function deps(over={}){
 const posts=[];
 return {posts,deps:{post:async(route,body)=>{posts.push({route,body});return {ok:true,status:200,data:{ok:true}}},
  product:async()=>({version:4,draft:{name:'Pompoensoep',department:'Restaurant',priceCents:850,vat:'9',station:'kok',available:true,photo:'',note:'',check:'',sourceId:'src-1'}}),
  guest:async()=>({version:9,hours:Array.from({length:7},()=>({open:true,from:'10:00',to:'18:00'})),exceptions:[]}),
  uuid:()=>'00000000-0000-4000-8000-000000000000',...over}};
}

test('geen strikte hulpmiddelen: anders wordt de grammatica te groot en weigert Claude elk verzoek',()=>{
 // 8 november 2026: "The compiled grammar is too large". De invoer wordt in runTool met zod gecontroleerd.
 assert.deepEqual(TOOL_DEFINITIONS.filter(t=>t.strict).map(t=>t.name),[]);
});

test('de assistent helpt in alles behalve programmeren en voert direct uit',()=>{
 assert.match(HULP_SYSTEM_PROMPT,/Het enige wat je niet doet is programmeren/);
 assert.match(HULP_SYSTEM_PROMPT,/voert de wijziging METEEN uit/);
 assert.match(HULP_SYSTEM_PROMPT,/Foto's: stuurt iemand een foto/);
 assert.doesNotMatch(HULP_SYSTEM_PROMPT,/bloei_bekijken|leden_zoeken|dienst_inplannen|rooster_bekijken|overleg_voorstel/);
 assert.doesNotMatch(HULP_SYSTEM_PROMPT,/klikt zelf op Uitvoeren/);
});

test('openingstijden tonen alleen afwijkende dagen vanaf vandaag',async()=>{
 const {ctx}=context(),v=JSON.parse((await runTool('openingstijden_bekijken',{},ctx)).content);
 assert.deepEqual(v.afwijkend.map(e=>e.datum),['2026-12-24']);
});

test('een schrijfhulpmiddel legt een actie vast; zonder uitkomst zegt het dat er nog niets is gewijzigd',async()=>{
 const {ctx,proposed}=context();
 const r=await runTool('product_tekst_wijzigen',{product_id:'p1',naam:'Romige pompoensoep',notitie:null},ctx);
 assert.equal(r.isError,false);assert.match(r.content,/NIETS gewijzigd/);
 assert.equal(proposed.length,1);assert.equal(proposed[0].type,'product_tekst_wijzigen');
 assert.deepEqual(proposed[0].input,{productId:'p1',name:'Romige pompoensoep',note:null});
 assert.match(proposed[0].title,/Product Pompoensoep aanpassen/);
 assert.equal((await runTool('product_tekst_wijzigen',{product_id:'onbekend',naam:'X',notitie:null},ctx)).isError,true,'onbekend product: geen actie');
});

test('uitvoeren gaat via de bestaande route met dezelfde aanvraag als de knop',async()=>{
 const {posts,deps:d}=deps();
 await executeAction({type:'product_publiceren',input:{productId:'p1',publish:false}},d);
 assert.equal(posts.length,1);assert.equal(posts[0].route,'products');
});

test('product: nieuw alleen als concept; tekst wijzigen laat prijs, btw en bron-ID staan',async()=>{
 const {posts,deps:d}=deps();
 await executeAction({type:'product_aanmaken',input:{name:'Appeltaart',department:'Restaurant',priceCents:450,vat:'9',note:''}},d);
 assert.equal(posts[0].body.action,'create');
 await executeAction({type:'product_tekst_wijzigen',input:{productId:'p1',name:'Romige pompoensoep',note:null}},d);
 const save=posts[1].body;assert.equal(save.action,'save');assert.equal(save.version,4);
 assert.equal(save.product.name,'Romige pompoensoep');assert.equal(save.product.priceCents,850);assert.equal(save.product.vat,'9');assert.equal(save.product.sourceId,'src-1');
});

test('openingstijden: alleen de gekozen weekdag verandert (zondag = 0)',async()=>{
 const {posts,deps:d}=deps();
 await executeAction({type:'openingstijden_wijzigen',input:{weekday:'maandag',open:false,from:'10:00',to:'18:00'}},d);
 const b=posts[0].body;assert.equal(b.action,'hours');assert.equal(b.version,9);
 assert.equal(b.hours[1].open,false);assert.equal(b.hours.filter(h=>!h.open).length,1);
});

test('een weigering van de backoffice komt terug als reden, niet als succes',async()=>{
 const {deps:d}=deps({post:async()=>({ok:false,status:409,data:{error:'Iemand anders heeft dit product net gewijzigd.'}})});
 await assert.rejects(()=>executeAction({type:'product_tekst_wijzigen',input:{productId:'p1',name:'Soep',note:null}},d),e=>e instanceof ActionError&&/net gewijzigd/.test(e.message));
 await assert.rejects(()=>executeAction({type:'saldo_wijzigen',input:{}},d),ActionError);
});

test('het gesprek gebruikt de eigen instructies en hulpmiddelen',async()=>{
 const {ctx,proposed}=context();const messages=[{seq:1,role:'user',content:[{type:'text',text:'Noem de pompoensoep romige pompoensoep'}]}];let n=0;const seen=[];
 const store={messages:async()=>messages,append:async m=>{messages.push({seq:messages.length+1,role:m.role,content:m.content})},callsToday:async()=>0};
 const create=async p=>{seen.push(p);n++;return n===1
  ?{content:[{type:'tool_use',id:'t1',name:'product_tekst_wijzigen',input:{product_id:'p1',naam:'Romige pompoensoep',notitie:null}}],stop_reason:'tool_use',usage:{input_tokens:1,output_tokens:1},model:'m'}
  :{content:[{type:'text',text:'Klaargezet. Klik op Uitvoeren.'}],stop_reason:'end_turn',usage:{input_tokens:1,output_tokens:1},model:'m'}};
 const r=await runTurn(store,ctx,create,{model:'m',effort:'medium',dailyLimit:10,maxSteps:4},{system:HULP_SYSTEM_PROMPT,tools:TOOL_DEFINITIONS,runTool});
 assert.equal(r,'beantwoord');assert.equal(seen[0].system,HULP_SYSTEM_PROMPT);assert.equal(seen[0].tools,TOOL_DEFINITIONS);assert.equal(proposed.length,1);
});

test('in de database: uitvoeren één keer, annuleren, vervallen, en een weigering van de echte route',async t=>{
 // Echte databaselaag (PGlite): een product dat niet bestaat, wordt geweigerd.
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'bb-hulp-'));process.env.APP_DATA_DIR=tmp;
 const {env,closeDatabase}=await import('../lib/portable/env.ts');t.after(async()=>{process.env.APP_DATA_DIR=tmp;await closeDatabase();fs.rmSync(tmp,{recursive:true,force:true})});
 const S=await import('../lib/hulp-store.ts');
 const now=new Date('2026-11-06T10:00:00Z');
 await S.startHulpThread('gesprek-0001','Jan','/producten','Noem de soep anders',now);
 assert.equal(await S.hulpThread('gesprek-0001','Sanne'),null,'een gesprek is van wie het begon');
 assert.ok(await S.hulpThread('gesprek-0001','Jan'));
 // Een dag die nog komt (vast 7 november 2026 werd vanaf 8 november „Deze dag is al voorbij”).
 const tomorrow=new Date(Date.parse(new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date())+'T12:00:00Z')+86400000).toISOString().slice(0,10);
 const action=t=>({type:'product_tekst_wijzigen',input:{productId:'bestaat-niet-'+tomorrow,name:'Soep',note:null},title:t,details:['Gerechten & prijzen']});
 const a1=await S.saveAction('gesprek-0001',action('Soep hernoemen'),now);
 const a2=await S.saveAction('gesprek-0001',action('Soep opnieuw hernoemen'),now);
 const a3=await S.saveAction('gesprek-0001',action('Oud'),new Date('2026-11-04T10:00:00Z'));
 // Goedkeuringen toont deze acties niet.
 const {listProposals}=await import('../lib/proposals-store.ts');
 assert.equal((await listProposals()).open.length,0);
 const decide=(id,decision,requestId)=>S.decideAction({id,threadId:'gesprek-0001',requestId,account:'Jan',decision,origin:'http://localhost:3001',now});
 const r1=await decide(a1.id,'uitvoeren','req-00000001');
 assert.equal(r1.status,'mislukt');assert.match(r1.result,/niet gevonden/);assert.ok(r1.result.length>5,'de reden van de backoffice komt terug');
 assert.equal((await decide(a1.id,'uitvoeren','req-00000001')).duplicate,true,'dezelfde klik telt één keer');
 await assert.rejects(decide(a1.id,'uitvoeren','req-00000002'),/al beslist/);
 assert.equal((await decide(a2.id,'annuleren','req-00000003')).status,'geannuleerd');
 await assert.rejects(decide(a3.id,'uitvoeren','req-00000004'),/vervallen/);
 const actions=await S.threadActions('gesprek-0001',now);
 assert.deepEqual(actions.map(a=>[a.title,a.status]),[['Oud','vervallen'],['Soep hernoemen','mislukt'],['Soep opnieuw hernoemen','geannuleerd']]);
 const notes=(await env.DB.prepare(`SELECT text FROM assistant_messages WHERE account='systeem' ORDER BY seq`).all()).results.map(r=>r.text);
 assert.equal(notes.length,2);assert.match(notes[0],/NIET uitgevoerd/);assert.match(notes[1],/geannuleerd/);
});

test('foto\'s laten zien (wens eigenaar 15 november 2026): zoeken en een regel „toon” die het gesprek als foto laat zien',async()=>{
 const {ctx}=context(),id='0b9f6c1e-2d3a-4b5c-8d7e-1f2a3b4c5d6e',id2='1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
 const withPhotos={...ctx,products:async()=>[{...products[0],photo:'/api/media/'+id},{id:'p2',name:'Boerenkool',department:'Winkel',priceCents:300,vat:'9',published:true,available:true,note:'',deleted:false,photo:'javascript:alert(1)'}],
  media:async()=>[{id,name:'Pompoensoep.jpg'},{id:id2,name:'Kippen in de wei.jpg'}]};
 const r=JSON.parse((await runTool('fotos_zoeken',{zoekterm:''},withPhotos)).content);
 assert.deepEqual(r.fotos.map(f=>f.toon),[`![Pompoensoep](/api/media/${id})`,`![Kippen in de wei.jpg](/api/media/${id2})`],'productfoto, dan beeldbibliotheek; geen dubbele; geen onveilig adres');
 assert.equal(JSON.parse((await runTool('fotos_zoeken',{zoekterm:'kip'},withPhotos)).content).aantal_gevonden,1);
 const p=JSON.parse((await runTool('producten_zoeken',{zoekterm:'',afdeling:''},withPhotos)).content).producten;
 assert.equal(p[0].toon,`![Pompoensoep](/api/media/${id})`);assert.equal(p[1].foto,'geen');
 assert.equal(JSON.parse((await runTool('fotos_zoeken',{zoekterm:''},ctx)).content).aantal_gevonden,0,'zonder beeldbibliotheek geen fout');
 assert.match(HULP_SYSTEM_PROMPT,/fotos_zoeken/);assert.match(HULP_SYSTEM_PROMPT,/het enige wat je niet doet is programmeren/);
});

test('foto in een bericht: alleen eigen beeldbibliotheek en Wix, nooit een ander adres',async()=>{
 const {blocks}=await import('../lib/chat-format.ts'),id='0b9f6c1e-2d3a-4b5c-8d7e-1f2a3b4c5d6e';
 assert.deepEqual(blocks(`Kijk:\n![Soep](/api/media/${id})\nMooi he?`).map(b=>b.kind),['p','img','p']);
 assert.equal(blocks(`![Oud](/api/public/media/${id})`)[0].src,'/api/media/'+id);
 assert.equal(blocks('![Wix](https://static.wixstatic.com/media/abc.jpg)')[0].kind,'img');
 for(const bad of ['![x](https://evil.example/p.png)','![x](javascript:alert(1))','![x](/api/media/../../etc)'])assert.equal(blocks(bad)[0].kind,'p',bad);
});

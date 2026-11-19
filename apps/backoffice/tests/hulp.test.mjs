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

const members=[
 {id:'m-anna',name:'Anna de Vries',email:'anna@example.nl',active:true,phone:'0612345678',address:'Dorpsstraat 1',memberSince:'2024-01-01',memberClass:'B',units:['restaurant'],potRoles:{restaurant:['barista']}},
 {id:'m-piet',name:'Piet Bakker',email:'',active:true,phone:'',address:'',memberSince:'',memberClass:'',units:[],potRoles:{}},
];
const roles=[{pot:'restaurant',name:'Restaurant',roles:[{id:'kok',name:'Kok'},{id:'barista',name:'Barista'}]}];
const products=[{id:'p1',name:'Pompoensoep',department:'Restaurant',priceCents:850,vat:'9',published:true,available:true,note:'',deleted:false}];
function context(){
 const proposed=[];
 return {proposed,ctx:{today:'2026-11-06',roster:async(pot,from,days)=>({pot,from,days}),members:async()=>members,roles:async()=>roles,products:async()=>products,
  signals:async()=>[{pot:'restaurant',potName:'Restaurant',day:'2026-11-09',reason:'activiteit',text:'Geboekt op een dag zonder diensten.',items:['groep Jansen']}],
  hours:async()=>({weekly:[],exceptions:[{datum:'2026-01-01',open:false,van:'10:00',tot:'18:00',notitie:'oud'},{datum:'2026-12-24',open:false,van:'10:00',tot:'18:00',notitie:'Kerst'}]}),
  propose:async a=>{proposed.push(a);return {id:'a'+proposed.length}}}};
}

test('hulpmiddelen hebben een gesloten schema; alle velden verplicht',()=>{
 for(const t of TOOL_DEFINITIONS){assert.equal(t.input_schema.additionalProperties,false,t.name);assert.deepEqual([...t.input_schema.required].sort(),Object.keys(t.input_schema.properties).sort(),t.name)}
});

test('afgebakend: Bloei alleen lezen, betalingen via Bank en Rekeningen; geen kassa, IBAN, percentages of weekafsluiting',()=>{
 // Sinds 18 november 2026 (wens eigenaar: „Bloei en betalingen ook voor de assistent”) mag Bloei inzien en Bank/Rekeningen bedienen.
 const names=TOOL_DEFINITIONS.map(t=>t.name).join(' ');
 assert.doesNotMatch(names,/saldo|particip|kassa|bestel|afsluit|iban|percent/i);
 assert.deepEqual(TOOL_DEFINITIONS.filter(t=>/bloei/.test(t.name)).map(t=>t.name),['bloei_bekijken'],'Bloei alleen inzien');
 // Elke schrijfactie heeft precies één hulpmiddel; meer schrijfhulpmiddelen bestaan niet.
 const write=TOOL_DEFINITIONS.filter(t=>!/_(bekijken|zoeken|signalen)$/.test(t.name)).map(t=>t.name).sort();
 assert.deepEqual(write,[...ACTION_TYPES].sort());
 // Overleg (6 november 2026): alleen een concept-voorstel; versturen en vaststellen doet de beheerder zelf.
 assert.deepEqual([...ALLOWED_ROUTES].sort(),['bank','cooperatie','gasten','leden','leden/afspraken','overleg','pot-planning','products','rekeningen','rollen']);
 // De uitvoering kent alleen deze acties per route: nooit weekafsluiting, uitbetaling, percentages of een IBAN.
 const src=fs.readFileSync(new URL('../lib/hulp-actions.ts',import.meta.url),'utf8');
 assert.deepEqual([...new Set([...src.matchAll(/action:'([a-z-]+)'/g)].map(m=>m[1]))].sort(),[
  // Producten (wens eigenaar 13 november 2026: alle rechten): meteen publiceren, opnieuw publiceren na een wijziging, offline halen.
  'create-publish','publish','unpublish','create','deelnemer','exception','hours','inplannen','lid','melden','nodig','save','voorstel','vrijgeven','wijzigen','basistekst-rolvoorstel','nieuw','wijzig','rolcontract-bewaren',
  // Gasten (wens eigenaar 9 november 2026): klantenkaart, afspraak en optie; een reservering alleen als optie.
  'customer','appointment','reservation',
  // Groepsdag (wens eigenaar 13 november 2026): groepen op een gesloten dag, daggasten blijven dicht.
  'group-day',
  // Bank en Rekeningen (wens eigenaar 18 november 2026): klaarzetten en factuurmail; goedkeuren/afwijzen via uitbetaling- of rente-.
  'maandagvraag','rente-klaarzetten','mail'].sort());
 assert.match(src,/action:\(rente\?'rente-':'uitbetaling-'\)\+\(ok\?'goedkeuren':'afwijzen'\)/);
 // Bevestigen mag sinds 13 november 2026 (wens eigenaar), via dezelfde route en controles als de knop in Planning.
 assert.match(src,/action:'reservation',reservation:\{[^}]*status:confirmed\?'bevestigd':'optie'/);
 assert.doesNotMatch(src,/action:'(quote|quote-send|signup-paid)'/,'geen offertes, betalingen of facturen');
 assert.match(src,/action:'voorstel',proposal:\{[^}]*\},send:null\}/,'alleen als concept');
 assert.doesNotMatch(src,/action:'(versturen|vaststellen|intrekken)'/);
 assert.doesNotMatch(src,/\biban\s*:|api\/bloei|from '\.\/bloei/i);
});

test('geen strikte hulpmiddelen: anders wordt de grammatica te groot en weigert Claude elk verzoek',()=>{
 // 8 november 2026: "The compiled grammar is too large". De invoer wordt in runTool met zod gecontroleerd.
 assert.deepEqual(TOOL_DEFINITIONS.filter(t=>t.strict).map(t=>t.name),[]);
});

test('de assistent helpt in alles behalve programmeren, voert direct uit, Bloei alleen lezen',()=>{
 // Wens eigenaar 13 november 2026: „volledig en in alles (behalve coderen) helpen”, „heeft alle rechten”.
 assert.match(HULP_SYSTEM_PROMPT,/Het enige wat je niet doet is programmeren/);
 assert.match(HULP_SYSTEM_PROMPT,/voert de wijziging METEEN uit/);
 assert.match(HULP_SYSTEM_PROMPT,/Foto's: stuurt iemand een foto/);
 assert.match(HULP_SYSTEM_PROMPT,/bloei_bekijken/);assert.match(HULP_SYSTEM_PROMPT,/Bloei is alleen-lezen/);assert.match(HULP_SYSTEM_PROMPT,/bevestigt in de bunq-app/);
 assert.doesNotMatch(HULP_SYSTEM_PROMPT,/klikt zelf op Uitvoeren/);
});

test('leden zoeken toont geen bankgegevens',async()=>{
 const {ctx}=context(),r=await runTool('leden_zoeken',{zoekterm:'anna'},ctx),v=JSON.parse(r.content);
 assert.equal(v.aantal_gevonden,1);assert.equal(v.leden[0].lid_id,'m-anna');assert.doesNotMatch(r.content,/iban/i);
});

test('openingstijden tonen alleen afwijkende dagen vanaf vandaag',async()=>{
 const {ctx}=context(),v=JSON.parse((await runTool('openingstijden_bekijken',{},ctx)).content);
 assert.deepEqual(v.afwijkend.map(e=>e.datum),['2026-12-24']);
});

test('een schrijfhulpmiddel zet alleen een actie klaar en zegt dat er nog niets is gewijzigd',async()=>{
 const {ctx,proposed}=context();
 const r=await runTool('dienst_inplannen',{pot:'restaurant',dag:'2026-11-07',rol_id:'barista',lid_id:'m-anna'},ctx);
 assert.equal(r.isError,false);assert.match(r.content,/NIETS gewijzigd/);
 assert.equal(proposed.length,1);assert.equal(proposed[0].type,'dienst_inplannen');
 assert.deepEqual(proposed[0].input,{pot:'restaurant',day:'2026-11-07',roleId:'barista',participantId:'m-anna'});
 assert.match(proposed[0].title,/Anna de Vries inplannen als Barista/);
});

test('onbekend lid, onbekende rol, verleden dag of dubbel lid: geen actie',async()=>{
 const {ctx,proposed}=context();
 assert.match((await runTool('dienst_inplannen',{pot:'restaurant',dag:'2026-11-07',rol_id:'barista',lid_id:'m-onbekend'},ctx)).content,/bestaat niet/);
 assert.match((await runTool('dienst_inplannen',{pot:'restaurant',dag:'2026-11-07',rol_id:'piloot',lid_id:'m-anna'},ctx)).content,/bestaat niet/);
 assert.match((await runTool('dienst_inplannen',{pot:'restaurant',dag:'2026-11-01',rol_id:'barista',lid_id:'m-anna'},ctx)).content,/voorbij/);
 assert.match((await runTool('lid_aanmaken',{naam:'anna de vries',email:'',telefoon:'',adres:'',lid_sinds:'',afdelingen:[]},ctx)).content,/bestaat al/);
 assert.match((await runTool('ledenkaart_wijzigen',{lid_id:'m-anna',email:null,telefoon:null,adres:null,afdelingen:null,rollen:null},ctx)).content,/geen wijziging/);
 assert.equal((await runTool('saldo_wijzigen',{},ctx)).isError,true);
 assert.equal(proposed.length,0);
});

test('bezetting: een extra plek op één dag of als standaard',async()=>{
 const {ctx,proposed}=context();
 await runTool('bezetting_instellen',{pot:'restaurant',dag:'2026-11-07',rol_id:'kok',aantal:2,omschrijving:'groep 40 pers.'},ctx);
 await runTool('bezetting_instellen',{pot:'restaurant',dag:'',rol_id:'kok',aantal:1,omschrijving:null},ctx);
 assert.equal(proposed[0].input.note,'groep 40 pers.');assert.equal(proposed[1].input.note,null);
 assert.deepEqual(proposed.map(p=>p.input.day),['2026-11-07','']);assert.match(proposed[1].details[0],/standaard/);
});

function deps(over={}){
 const posts=[];
 return {posts,deps:{post:async(route,body)=>{posts.push({route,body});return {ok:true,status:200,data:route==='cooperatie'&&!body.participant?.id?{ok:true,id:'new-id'}:{ok:true}}},
  participant:async id=>({id,name:'Anna de Vries',holder:'A. de Vries',email:'oud@example.nl',vatInclusive:false,active:true,version:3}),
  card:async()=>({version:5,memberClass:'B',memberSince:'2024-01-01',voting:'auto',phone:'0612345678',address:'Dorpsstraat 1',units:['restaurant'],bloeiMemberId:'BL-7',potRoles:{restaurant:['barista']}}),
  product:async()=>({version:4,draft:{name:'Pompoensoep',department:'Restaurant',priceCents:850,vat:'9',station:'kok',available:true,photo:'',note:'',check:'',sourceId:'src-1'}}),
  guest:async()=>({version:9,hours:Array.from({length:7},()=>({open:true,from:'10:00',to:'18:00'})),exceptions:[]}),
  uuid:()=>'00000000-0000-4000-8000-000000000000',...over}};
}

test('uitvoeren gaat via de bestaande route met dezelfde aanvraag als de knop',async()=>{
 const {posts,deps:d}=deps();
 await executeAction({type:'dienst_inplannen',input:{pot:'restaurant',day:'2026-11-07',roleId:'barista',participantId:'m-anna'}},d);
 await executeAction({type:'bezetting_instellen',input:{pot:'restaurant',day:'',roleId:'kok',count:2}},d);
 assert.deepEqual(posts,[{route:'pot-planning',body:{action:'inplannen',pot:'restaurant',day:'2026-11-07',roleId:'barista',participantId:'m-anna'}},{route:'pot-planning',body:{action:'nodig',pot:'restaurant',day:'',roleId:'kok',count:2}}]);
});

test('ledenkaart: ledenklasse, stemrecht, Bloei-koppeling en IBAN blijven onaangeroerd',async()=>{
 const {posts,deps:d}=deps();
 await executeAction({type:'ledenkaart_wijzigen',input:{participantId:'m-anna',email:'nieuw@example.nl',phone:'0698765432',address:null,units:null,potRoles:{restaurant:['barista','kok']}}},d);
 const coop=posts.find(p=>p.route==='cooperatie').body.participant;
 assert.equal(coop.email,'nieuw@example.nl');assert.equal(coop.version,3);assert.equal('iban' in coop,false);
 const m=posts.find(p=>p.route==='leden').body;
 assert.equal(m.version,5);assert.equal(m.member.memberClass,'B');assert.equal(m.member.voting,'auto');assert.equal(m.member.bloeiMemberId,'BL-7');
 assert.equal(m.member.phone,'0698765432');assert.equal(m.member.address,'Dorpsstraat 1');assert.deepEqual(m.member.potRoles,{restaurant:['barista','kok']});
});

test('nieuw lid: zonder IBAN, daarna de ledenkaart aangevuld',async()=>{
 const {posts,deps:d}=deps();
 const r=await executeAction({type:'lid_aanmaken',input:{name:'Piet de Vries',email:'',phone:'0611111111',address:'',memberSince:'',units:['winkel']}},d);
 assert.match(r,/Lid aangemaakt/);
 assert.deepEqual(posts[0],{route:'cooperatie',body:{action:'deelnemer',participant:{name:'Piet de Vries',holder:'Piet de Vries',email:'',vatInclusive:false,active:true}}});
 assert.equal(posts[1].route,'leden');assert.equal(posts[1].body.id,'new-id');assert.deepEqual(posts[1].body.member.units,['winkel']);
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
 const {deps:d}=deps({post:async()=>({ok:false,status:409,data:{error:'Deze week is al goedgekeurd en ligt vast.'}})});
 await assert.rejects(()=>executeAction({type:'dienst_vrijgeven',input:{pot:'restaurant',day:'2026-11-02',roleId:'kok',participantId:'m-anna'}},d),e=>e instanceof ActionError&&/ligt vast/.test(e.message));
 await assert.rejects(()=>executeAction({type:'saldo_wijzigen',input:{}},d),ActionError);
});

test('het gesprek gebruikt de eigen instructies en hulpmiddelen',async()=>{
 const {ctx,proposed}=context();const messages=[{seq:1,role:'user',content:[{type:'text',text:'Zet Anna zaterdag in als barista'}]}];let n=0;const seen=[];
 const store={messages:async()=>messages,append:async m=>{messages.push({seq:messages.length+1,role:m.role,content:m.content})},callsToday:async()=>0};
 const create=async p=>{seen.push(p);n++;return n===1
  ?{content:[{type:'tool_use',id:'t1',name:'dienst_inplannen',input:{pot:'restaurant',dag:'2026-11-07',rol_id:'barista',lid_id:'m-anna'}}],stop_reason:'tool_use',usage:{input_tokens:1,output_tokens:1},model:'m'}
  :{content:[{type:'text',text:'Klaargezet. Klik op Uitvoeren.'}],stop_reason:'end_turn',usage:{input_tokens:1,output_tokens:1},model:'m'}};
 const r=await runTurn(store,ctx,create,{model:'m',effort:'medium',dailyLimit:10,maxSteps:4},{system:HULP_SYSTEM_PROMPT,tools:TOOL_DEFINITIONS,runTool});
 assert.equal(r,'beantwoord');assert.equal(seen[0].system,HULP_SYSTEM_PROMPT);assert.equal(seen[0].tools,TOOL_DEFINITIONS);assert.equal(proposed.length,1);
});

test('in de database: uitvoeren één keer, annuleren, vervallen, en een weigering van de echte route',async t=>{
 // Echte databaselaag (PGlite) en de echte route Personeelsplanning: zonder pot-afspraak weigert die het inplannen.
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'bb-hulp-'));process.env.APP_DATA_DIR=tmp;
 const {env,closeDatabase}=await import('../lib/portable/env.ts');t.after(async()=>{process.env.APP_DATA_DIR=tmp;await closeDatabase();fs.rmSync(tmp,{recursive:true,force:true})});
 const S=await import('../lib/hulp-store.ts');
 const now=new Date('2026-11-06T10:00:00Z');
 await S.startHulpThread('gesprek-0001','Bartele','/leden','Zet Anna zaterdag in',now);
 assert.equal(await S.hulpThread('gesprek-0001','Rianne'),null,'een gesprek is van wie het begon');
 assert.ok(await S.hulpThread('gesprek-0001','Bartele'));
 // Een dag die nog komt (vast 7 november 2026 werd vanaf 8 november „Deze dag is al voorbij”).
 const tomorrow=new Date(Date.parse(new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date())+'T12:00:00Z')+86400000).toISOString().slice(0,10);
 const action=t=>({type:'dienst_inplannen',input:{pot:'restaurant',day:tomorrow,roleId:'barista',participantId:'11111111-1111-4111-8111-111111111111'},title:t,details:['Restaurant']});
 const a1=await S.saveAction('gesprek-0001',action('Anna inplannen'),now);
 const a2=await S.saveAction('gesprek-0001',action('Piet inplannen'),now);
 const a3=await S.saveAction('gesprek-0001',action('Oud'),new Date('2026-11-04T10:00:00Z'));
 // Goedkeuringen toont deze acties niet.
 const {listProposals}=await import('../lib/proposals-store.ts');
 assert.equal((await listProposals()).open.length,0);
 const decide=(id,decision,requestId)=>S.decideAction({id,threadId:'gesprek-0001',requestId,account:'Bartele',decision,origin:'http://localhost:3001',now});
 const r1=await decide(a1.id,'uitvoeren','req-00000001');
 assert.equal(r1.status,'mislukt');assert.match(r1.result,/pot/);assert.ok(r1.result.length>5,'de reden van de backoffice komt terug');
 assert.equal((await decide(a1.id,'uitvoeren','req-00000001')).duplicate,true,'dezelfde klik telt één keer');
 await assert.rejects(decide(a1.id,'uitvoeren','req-00000002'),/al beslist/);
 assert.equal((await decide(a2.id,'annuleren','req-00000003')).status,'geannuleerd');
 await assert.rejects(decide(a3.id,'uitvoeren','req-00000004'),/vervallen/);
 const actions=await S.threadActions('gesprek-0001',now);
 assert.deepEqual(actions.map(a=>[a.title,a.status]),[['Oud','vervallen'],['Anna inplannen','mislukt'],['Piet inplannen','geannuleerd']]);
 const notes=(await env.DB.prepare(`SELECT text FROM assistant_messages WHERE account='systeem' ORDER BY seq`).all()).results.map(r=>r.text);
 assert.equal(notes.length,2);assert.match(notes[0],/NIET uitgevoerd/);assert.match(notes[1],/geannuleerd/);
});

test('signalen ophalen en nieuwe diensten melden: alleen klaarzetten, uitvoeren via de route',async()=>{
 const {ctx,proposed}=context();
 const v=JSON.parse((await runTool('personeel_signalen',{},ctx)).content);
 assert.equal(v.aantal,1);assert.equal(v.signalen[0].dag,'2026-11-09');assert.deepEqual(v.signalen[0].geboekt,['groep Jansen']);
 const r=await runTool('diensten_melden',{pot:'restaurant',dag:'2026-11-09',rol_ids:['kok']},ctx);
 assert.equal(r.isError,false);assert.match(r.content,/NIETS gewijzigd/);assert.equal(proposed[0].type,'diensten_melden');assert.match(proposed[0].title,/direct/);
 assert.match((await runTool('diensten_melden',{pot:'restaurant',dag:'2026-11-01',rol_ids:['kok']},ctx)).content,/voorbij/);
 const {posts,deps:d}=deps({post:async(route,body)=>{posts.push({route,body});return {ok:true,status:200,data:{melding:{members:3,sent:2}}}}});
 const out=await executeAction({type:'diensten_melden',input:{pot:'restaurant',day:'2026-11-09',roleIds:['kok']}},d);
 assert.deepEqual(posts[0],{route:'pot-planning',body:{action:'melden',pot:'restaurant',day:'2026-11-09',roleIds:['kok']}});assert.match(out,/3 leden \(2 telefoons\)/);
 await executeAction({type:'bezetting_instellen',input:{pot:'restaurant',day:'2026-11-09',roleId:'kok',count:2,note:'groep'}},d);
 assert.equal(posts[1].body.note,'groep');
});
test('de assistent vraagt na nieuwe diensten: direct of in het weekbericht',()=>{
 assert.match(HULP_SYSTEM_PROMPT,/direct versturen of meenemen in het weekbericht/);assert.match(HULP_SYSTEM_PROMPT,/personeel_signalen/);
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

test('Bloei en betalingen (wens eigenaar 18 november 2026): inzien, klaarzetten, goedkeuren en factuur mailen',async()=>{
 const {ctx,proposed}=context(),calls=[];
 const full={...ctx,
  bloei:async id=>({importedAt:'2026-11-10',members:[{id:'b1',name:'Anna de Vries'},{id:'b2',name:'Bauke Bos'}],memberSummaries:[{memberId:'b1',bonds:500000,spendable:12345},{memberId:'b2',bonds:100000,spendable:0}],
   holdings:id==='b1'?[{nominal:500000,quantity:5,rate:6,anniversary:'2024-05-15',matures:'2029-05-15'}]:[],sourceHistory:[],sourceCredit:[],linkedCards:[],warnings:[]}),
  finance:async(part,week,year)=>{calls.push([part,week,year]);return {part,week,year}}};
 const all=JSON.parse((await runTool('bloei_bekijken',{houder:''},full)).content);
 assert.equal(all.aantal_gevonden,2);assert.equal(all.alleen_lezen,true);
 const one=JSON.parse((await runTool('bloei_bekijken',{houder:'anna'},full)).content);
 assert.equal(one.houder_id,'b1');assert.match(one.obligaties,/5\.000/);assert.equal(one.obligaties_detail[0].rente_procent,6);
 assert.match((await runTool('bloei_bekijken',{houder:''},{...full,bloei:async()=>null})).content,/nog geen echte Bloei-administratie/);
 await runTool('betalingen_bekijken',{onderdeel:'rente',week:'',jaar:0},full);assert.deepEqual(calls[0],['rente','',2026],'jaar valt terug op dit jaar');
 assert.equal((await runTool('betalingen_bekijken',{onderdeel:'bankverdeling',week:'',jaar:0},full)).isError,true,'week verplicht');
 assert.equal((await runTool('uitbetaling_beslissen',{soort:'bb',id:'u1',versie:2,besluit:'afwijzen',reden:'',jaar:0},full)).isError,true,'afwijzen vraagt een reden');
 await runTool('uitbetaling_beslissen',{soort:'bb',id:'u1',versie:2,besluit:'goedkeuren',reden:'',jaar:0},full);
 await runTool('uitbetalingen_klaarzetten',{soort:'rente',week:'',jaar:2026},full);
 await runTool('factuur_mailen',{rekening_id:'g1'},full);
 assert.deepEqual(proposed.map(a=>a.type),['uitbetaling_beslissen','uitbetalingen_klaarzetten','factuur_mailen']);
 assert.match(proposed[0].details[0],/bunq-app/);
 // Uitvoeren gaat via dezelfde routes als de knoppen.
 const posts=[],deps={post:async(route,body)=>{posts.push([route,body]);return {ok:true,status:200,data:{message:'ok',kind:'open'}}}};
 for(const a of proposed)await executeAction(a,deps);
 assert.deepEqual(posts.map(([r,b])=>[r,b.action]),[['bank','uitbetaling-goedkeuren'],['bank','rente-klaarzetten'],['rekeningen','mail']]);
 assert.equal(posts[0][1].version,2);
});

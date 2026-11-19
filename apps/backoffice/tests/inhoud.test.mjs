// Inhoud voor het dorp (wens eigenaar 13 november 2026): blogs, nieuws en filmpjes één keer schrijven en op de aangevinkte
// sites tonen via de vaste poort /api/public/v1/inhoud. Bewaakt: wat wel en niet naar buiten gaat, dat het antwoord van de
// poort (versie 1) niet stilletjes verandert, filmpjes alleen van YouTube en Vimeo, en opslaan tegen een echte database.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {register} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import './helpers/ts-resolve.mjs';
const I=await import('../lib/inhoud.ts');
const {allowed}=await import('../lib/onderdelen.ts');

const PHOTO='/api/media/0d6f9c1e-6a2b-4c4f-9f2e-1a2b3c4d5e6f';
const row=(o={})=>({id:'i1',kind:'blog',slug:'lammetjes',title:'Lammetjes',summary:'Kort',body:'Eerste alinea.\n\n## Kop\nTweede alinea.',photo:PHOTO,video:'',
 sites:'["boerbart","ite"]',status:'gepubliceerd',publishedAt:'2026-11-10',version:3,createdBy:'rianne',created:'2026-11-10T10:00:00Z',updatedBy:'bartele',updated:'2026-11-11T10:00:00Z',...o});

test('filmpjes: alleen YouTube en Vimeo, altijd een vaste speler',()=>{
 for(const u of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ','youtu.be/dQw4w9WgXcQ','https://m.youtube.com/shorts/dQw4w9WgXcQ','https://www.youtube.com/embed/dQw4w9WgXcQ?start=3'])
  assert.equal(I.parseVideo(u)?.embed,'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',u);
 assert.equal(I.parseVideo('https://vimeo.com/76979871')?.embed,'https://player.vimeo.com/video/76979871');
 assert.equal(I.parseVideo('https://player.vimeo.com/video/76979871')?.provider,'vimeo');
 for(const u of ['https://evil.example/watch?v=dQw4w9WgXcQ','https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ','javascript:alert(1)','https://www.youtube.com/watch?v=kort',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ"><script>','https://vimeo.com/abc','','https://notyoutube.com/watch?v=dQw4w9WgXcQ'])
  assert.equal(I.parseVideo(u),null,u);
});

test('adres en tekstblokken',()=>{
 assert.equal(I.slugify('Één dag op het erf & de koeien!'),'een-dag-op-het-erf-en-de-koeien');
 assert.equal(I.slugify('   '),'');
 assert.deepEqual(I.blocks('Eerste\nregel twee\n\n## Kop\nNa de kop\n\n\n<b>geen html</b>'),
  [{type:'alinea',text:'Eerste\nregel twee'},{type:'kop',text:'Kop'},{type:'alinea',text:'Na de kop'},{type:'alinea',text:'<b>geen html</b>'}]);
});

test('invoer controleren: titel, soort, filmpje, site bij publiceren, datum',()=>{
 assert.throws(()=>I.normalize({kind:'reclame',title:'x'}),/soort/);
 assert.throws(()=>I.normalize({kind:'blog',title:'  '}),/titel/);
 assert.throws(()=>I.normalize({kind:'video',title:'Film'}),/YouTube of Vimeo/);
 assert.throws(()=>I.normalize({kind:'blog',title:'x',video:'https://evil.example/x'}),/niet herkend/);
 assert.throws(()=>I.normalize({kind:'blog',title:'x',body:'tekst',status:'gepubliceerd',sites:[]}),/site/);
 assert.throws(()=>I.normalize({kind:'blog',title:'x',status:'gepubliceerd',sites:['boerbart']}),/tekst of/);
 assert.throws(()=>I.normalize({kind:'blog',title:'x',photo:'/etc/passwd'}),/beeldbank/);
 assert.throws(()=>I.normalize({kind:'blog',title:'x',publishedAt:'13-11-2026'}),/datum/);
 const v=I.normalize({kind:'video',title:'  Melken   in de stal ',video:'youtu.be/dQw4w9WgXcQ',status:'gepubliceerd',sites:['boerbart','onbekend','boerbart']});
 assert.equal(v.title,'Melken in de stal');assert.equal(v.slug,'melken-in-de-stal');assert.deepEqual(v.sites,['boerbart']);
 assert.equal(v.video,'https://www.youtube.com/watch?v=dQw4w9WgXcQ');assert.match(v.publishedAt,/^\d{4}-\d{2}-\d{2}$/,'publiceren zonder datum = vandaag');
 assert.equal(I.normalize({kind:'blog',title:'x'}).status,'concept');
});

test('poort v1: alleen gepubliceerd, al verschenen en op deze site; vaste velden, niets intern',()=>{
 const rows=[row(),row({id:'i2',slug:'concept',status:'concept'}),row({id:'i3',slug:'archief',status:'archief'}),row({id:'i4',slug:'later',publishedAt:'2026-12-01'}),
  row({id:'i5',slug:'alleen-winkel',sites:'["winkel"]'}),row({id:'i6',slug:'nieuwer',kind:'nieuws',publishedAt:'2026-11-12'}),row({id:'i7',slug:'kapot',sites:'geen json'})];
 const list=I.publicInhoud(rows,{site:'boerbart'},'2026-11-13');
 assert.deepEqual(list.map(i=>i.slug),['nieuwer','lammetjes'],'nieuwste eerst; concept, archief, toekomst, andere site en kapotte sites niet');
 // Het contract van versie 1: precies deze velden. Komt er een veld bij, pas dan bewust deze lijst aan; weghalen mag niet (dan v2).
 assert.deepEqual(Object.keys(list[1]).sort(),['blocks','kind','photo','publishedAt','sites','slug','summary','title','video']);
 for(const secret of ['rianne','bartele','i1','2026-11-11T10'])assert.ok(!JSON.stringify(list).includes(secret),secret);
 assert.equal(list[1].photo,'/api/public/media/0d6f9c1e-6a2b-4c4f-9f2e-1a2b3c4d5e6f','beeldbankfoto via het openbare foto-adres');
 assert.deepEqual(list[1].blocks[1],{type:'kop',text:'Kop'});
 assert.deepEqual(I.publicInhoud(rows,{site:'boerbart',kind:'nieuws'},'2026-11-13').map(i=>i.slug),['nieuwer']);
 assert.deepEqual(I.publicInhoud(rows,{site:'boerbart',slug:'concept'},'2026-11-13'),[]);
 assert.deepEqual(I.publicInhoud(rows,{site:'winkel'},'2026-11-13').map(i=>i.slug),['alleen-winkel']);
 assert.equal(I.publicInhoud(rows,{site:'boerbart',limit:1},'2026-11-13').length,1);
 assert.equal(I.publicInhoud([row({video:'https://youtu.be/dQw4w9WgXcQ'})],{site:'ite'},'2026-11-13')[0].video.embed,'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
 // Foto's: alleen die van openbare stukken mag het openbare foto-adres laten zien.
 assert.deepEqual([...I.contentMediaIds(rows.filter(r=>r.id!=='i1'&&r.id!=='i6'&&r.id!=='i5'&&r.id!=='i7'),'2026-11-13')],[],'concept, archief en toekomst geven hun foto niet vrij');
 assert.deepEqual([...I.contentMediaIds([row()],'2026-11-13')],['0d6f9c1e-6a2b-4c4f-9f2e-1a2b3c4d5e6f']);
});

test('de poort is openbaar en alleen lezen; beheer blijft achter de login',async()=>{
 const stub=new URL('./helpers/next-server-stub.mjs',import.meta.url).href;
 register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){return s==='next/server'?n(${JSON.stringify(stub)},c):n(s,c)}`));
 const {proxy}=await import('../proxy.ts');
 const env={SUPABASE_URL:'https://x.supabase.co',SUPABASE_ANON_KEY:'k',AUTH_SECRET:'s'.repeat(40),APP_ORIGIN:'https://bo.example'};
 const old={...process.env};Object.assign(process.env,env);
 try{
  const req=(p,method='GET')=>{const url=new URL(p,'https://bo.example');return {method,url:url.href,nextUrl:url,headers:new Headers({host:'bo.example','x-boer-bart-verified-user':'owner'}),cookies:{get:()=>undefined}}};
  const open=proxy(req('/api/public/v1/inhoud?site=boerbart'));
  assert.equal(open.kind,'next');assert.equal(open.forwarded?.get('x-boer-bart-verified-user'),null,'geen vervalste eigenaar via de poort');
  for(const [p,m] of [['/api/public/v1/inhoud','POST'],['/api/inhoud','GET'],['/api/inhoud','POST'],['/inhoud','GET'],['/api/public/v1/inhoud/../../inhoud','GET']]){
   const r=proxy(req(p,m));assert.ok(!(r.kind==='next'&&r.forwarded?.get('x-boer-bart-verified-user')==='owner'),`${m} ${p} kwam binnen`);
  }
 }finally{for(const k of Object.keys(env))if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k]}
 // Rechten: een medewerker met Marketing & website mag Inhoud beheren, zonder dat vinkje niet.
 assert.equal(allowed('medewerker',['marketing'],'/inhoud','GET'),true);
 assert.equal(allowed('medewerker',['marketing'],'/api/inhoud','POST'),true);
 assert.equal(allowed('medewerker',['planning'],'/api/inhoud','POST'),false);
 assert.equal(allowed('medewerker',['planning'],'/inhoud','GET'),false);
});

test('opslaan tegen een echte database: nieuw, uniek adres, gelijktijdig wijzigen, publiceren, weghalen',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-inhoud-'));
 try{const code=`
 import './tests/helpers/ts-resolve.mjs';import assert from 'node:assert/strict';
 const I=await import('./lib/inhoud.ts');
 const a=await I.saveInhoud({kind:'blog',title:'De eerste lammetjes',body:'Ze zijn er!'},'rianne');
 assert.equal(a.status,'concept');assert.equal(a.slug,'de-eerste-lammetjes');assert.equal(a.version,1);assert.equal(a.createdBy,'rianne');
 const b=await I.saveInhoud({kind:'nieuws',title:'De eerste lammetjes',body:'Nog meer'},'rianne');
 assert.equal(b.slug,'de-eerste-lammetjes-2','zelfde titel: vanzelf een vrij adres');
 await assert.rejects(()=>I.saveInhoud({kind:'blog',title:'x',slug:'de-eerste-lammetjes',body:'y'},'r'),e=>e.status===409,'zelf gekozen bezet adres');
 // Publiceren.
 const p=await I.saveInhoud({...a,status:'gepubliceerd',sites:['boerbart']},'bartele');
 assert.equal(p.version,2);assert.equal(p.updatedBy,'bartele');assert.match(p.publishedAt,/^\\d{4}-\\d{2}-\\d{2}$/);
 assert.deepEqual(I.publicInhoud(await I.publishedRows(),{site:'boerbart'}).map(x=>x.slug),['de-eerste-lammetjes']);
 // Een tweede scherm met de oude versie overschrijft niet stilzwijgend.
 await assert.rejects(()=>I.saveInhoud({...a,title:'Oud scherm'},'rianne'),e=>e.status===409&&/intussen/.test(e.message));
 // Opnieuw opslaan houdt de oorspronkelijke publicatiedatum.
 const again=await I.saveInhoud({...p,publishedAt:'',summary:'Kort'},'bartele');assert.equal(again.publishedAt,p.publishedAt);
 // Weghalen alleen bij een concept.
 await assert.rejects(()=>I.removeInhoud(p.id,again.version),e=>e.status===409&&/archief/.test(e.message));
 await I.removeInhoud(b.id,b.version);
 const list=await I.listInhoud();assert.deepEqual(list.map(x=>x.id),[p.id]);
 // Archief: van de site af, wel bewaard.
 await I.saveInhoud({...again,status:'archief'},'bartele');
 assert.deepEqual(I.publicInhoud(await I.publishedRows(),{site:'boerbart'}),[]);assert.equal((await I.listInhoud()).length,1);
 console.log('inhoud ok');
 `;const r=spawnSync(process.execPath,['--experimental-transform-types','--input-type=module','-e',code],{cwd:new URL('../',import.meta.url),env:{...process.env,APP_DATA_DIR:dir,DATABASE_URL:''},encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stderr+'\n'+r.stdout);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

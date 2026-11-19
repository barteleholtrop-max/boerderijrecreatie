// Ledenpagina sneller (wens eigenaar 9 november 2026: „de leden-app is langzaam”): de weekafrekening wordt voor de ledenpagina
// gedeeld (30 seconden), het BB-saldo niet dubbel opgehaald; de Weekafsluiting in de backoffice rekent altijd vers.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import './helpers/ts-resolve.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('weekberekening voor de ledenpagina wordt 30 seconden gedeeld; daarna opnieuw; dezelfde uitkomst als vers',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-snel-'));process.env.APP_DATA_DIR=dir;process.env.DATABASE_URL='';process.env.SHEETS_CONFIG_KEY='ab'.repeat(32);
 const {closeDatabase}=await import('../lib/portable/env.ts'),s=await import('../lib/coop-store.ts'),{mondayOf,amsterdamDay}=await import('../lib/coop-core.ts');
 t.after(async()=>{await closeDatabase();fs.rmSync(dir,{recursive:true,force:true})});
 const monday=mondayOf(amsterdamDay(new Date())),now=Date.now();
 const a=s.weekViewShared(monday,false,now),b=s.weekViewShared(monday,false,now+1000);
 assert.equal(a,b,'binnen 30 seconden: dezelfde berekening');
 assert.notEqual(s.weekViewShared(monday,true,now),a,'proefweek apart');
 const c=s.weekViewShared(monday,false,now+s.SHARED_WEEK_MS+1);assert.notEqual(c,a,'na 30 seconden: opnieuw berekend');
 const strip=({computedAt,...v})=>v;assert.deepEqual(strip(await a),strip(await s.weekView(monday)),'zelfde uitkomst als een verse berekening (op het rekentijdstip na)');
 assert.equal(s.SHARED_WEEK_MS,30000);
});

test('ledenpagina gebruikt de gedeelde berekening; backoffice en financiën rekenen vers; geen dubbel BB-saldo',()=>{
 const portal=read('lib/coop-portal.ts'),bb=read('app/api/deelnemer/[token]/bb/route.ts'),inleg=read('app/deelnemer/[token]/inleg.tsx');
 assert.doesNotMatch(portal.slice(portal.indexOf('export async function portalView'),portal.indexOf('async function managesFundOf')),/weekView/,'het overzicht toonde de weekafrekening niet: niet meer berekend');assert.match(bb,/weekViewShared\(monday\)/);assert.match(bb,/weekViewShared\(monday,true\)/);
 assert.doesNotMatch(bb,/\bweekView\(/,'BB-saldo: geen verse weekberekening per lid');
 assert.match(inleg,/useEffect\(\(\)=>\{if\(!overview\)return;fetch\(api\+'\/bb'/);
 assert.doesNotMatch(read('app/api/cooperatie/route.ts'),/weekViewShared/,'Weekafsluiting in de backoffice rekent altijd vers');
});

test('één startverzoek: link één keer gecontroleerd, alles tegelijk; tabbladen niet dubbel ophalen',()=>{
 // Sinds 12 november 2026 staat de berekening in lib/member-start.ts, gedeeld door de route en de pagina (die de gegevens meestuurt).
 const start=read('lib/member-start.ts'),route=read('app/api/deelnemer/[token]/start/route.ts'),page=read('app/deelnemer/[token]/lid-pagina.tsx'),proxy=read('proxy.ts'),demo=read('app/deelnemer/[token]/demo.ts');
 assert.equal((start.match(/participantByToken\(/g)||[]).length,1,'één controle van de link');
 assert.match(start,/Promise\.all\(\[timed\('overzicht',portalView\(p\)\),timed\('kaart',ownCard\(p\)\)/,'alles tegelijk (met tijdmeting, 12 november 2026)');
 assert.match(route,/memberStart\(token\)/);assert.match(route,/Server-Timing/);assert.match(start,/console\.warn\('\[traag\]'/);
 assert.doesNotMatch(route,/export async function POST/,'alleen lezen');
 assert.match(fs.readFileSync(new URL('../lib/member-routes.ts',import.meta.url),'utf8'),/'start'/);
 assert.match(page,/fetch\(api\+'\/start'/);
 assert.doesNotMatch(page,/fetch\(api\+'\/(lid|afspraken)',\{cache/,'ledenkaart en stemmen komen uit het startverzoek');
 for(const [f,hook] of [['inbox.tsx','useInbox'],['hooks.ts','useInleg'],['hooks.ts','useOverleg'],['hooks.ts','useEvenementen'],['hooks.ts','useFunds']]){
  const src=read('app/deelnemer/[token]/'+f);assert.match(src,new RegExp('export function '+hook+'\\([^)]*seed\\?'),hook+' neemt de gegevens uit het startverzoek');assert.match(src,/seed===undefined\)return/,hook+' wacht op het startverzoek');
 }
 assert.match(demo,/case 'start':return \[200,\{view:view\(\),card:LID/,'demo kent het startverzoek');
});

test('live voorraad alleen elke 30 seconden zolang Producten openstaat',()=>{
 const page=read('app/deelnemer/[token]/lid-pagina.tsx');
 assert.match(page,/live\.current=current==='producten'/);
 assert.match(page,/setInterval\(\(\)=>\{if\(live\.current&&!document\.hidden\)void load\(\)\},30000\)/);
});

test('tabbladen en demo worden pas geladen als ze nodig zijn',()=>{
 const page=read('app/deelnemer/[token]/lid-pagina.tsx'),hooks=read('app/deelnemer/[token]/hooks.ts');
 for(const [file,name] of [['lidmaatschap','Lidmaatschap'],['inleg','Inleg'],['vraag','Ask'],['rooster','Rooster'],['verdiensten','Verdiensten'],['financien','Financien'],['afspraken','Afspraken'],['overleg','Voorstellen'],['berichten','Berichten'],['document','Document'],['potbeheer','Potbeheer'],['bb','BbTegoed'],['tegoed','Uitbetalen'],['verdeling','Verdeling'],['evenementen','Evenementen']]){
  assert.match(page,new RegExp('const '+name+'=dynamic\\(\\(\\)=>import\\(\'\\./'+file+'\'\\)'),name+' apart geladen');
  if(file!=='vraag')assert.doesNotMatch(page,new RegExp("^import \\{[^}]*\\} from '\\./"+file+"';",'m'),file+' niet vast meegeladen (alleen typen); de vraagknop is klein en staat altijd in de kop');
 }
 assert.doesNotMatch(page,/^import [^;]*from '\.\/demo';/m,'demo niet voor elk lid');
 assert.match(page,/if\(token===DEMO_TOKEN\)await import\('\.\/demo'\);[\s\S]{0,400}fetch\(api\+'\/start'/,'demo vóór het startverzoek');
 assert.match(page,/c\.abort\(\),20000/,'startverzoek nooit eindeloos (12 november 2026)');assert.match(page,/className="m-slow"/,'link Opnieuw laden, ook zonder JavaScript');
 assert.doesNotMatch(hooks,/^import \{[^}]*\} from '\.\/(inleg|overleg|evenementen|potbeheer)'/m);
});

test('geraamte: kop, voornaam en tabbladen staan meteen; alleen voornaam en tabbladen op het toestel',()=>{
 const page=read('app/deelnemer/[token]/lid-pagina.tsx');
 assert.match(page,/if\(!view\|\|!card\)return <main className="m-app" aria-busy="true">/);
 assert.match(page,/className="m-card m-skeleton/);
 assert.match(page,/localStorage\.setItem\(SHELL,JSON\.stringify\(\{k:token\.slice\(0,8\),name:view\.participant\.name\.split\(' '\)\[0\],tabs:/);
 assert.match(page,/token===DEMO_TOKEN\)return;const l=layout/,'de demo schrijft geen geraamte weg');
 assert.match(read('app/globals.css'),/@media \(prefers-reduced-motion:reduce\)\{\.m-skeleton\{animation:none\}\}/);
});

test('assistent goed te zien: knop met tekst in de kop en een vraagbalk op het eerste scherm',()=>{
 const page=read('app/deelnemer/[token]/lid-pagina.tsx'),vraag=read('app/deelnemer/[token]/vraag.tsx');
 assert.match(vraag,/<span>Vraag<\/span><\/button>/);
 assert.match(vraag,/export function AskBar\(/);
 assert.match(page,/\{current===tabs\[0\]&&!ask&&<AskBar onOpen=\{openAsk\}\/>\}/);
 assert.match(page,/const openAsk=\(\)=>\{setAsk\(true\);window\.scrollTo\(\{top:0/);
});

test('assistent: knop in de tabbalk, WhatsApp-uitstraling, inspreken en voorlezen',()=>{
 const page=read('app/deelnemer/[token]/lid-pagina.tsx'),vraag=read('app/deelnemer/[token]/vraag.tsx');
 assert.match(page,/<button type="button" className="m-tab-ask" aria-pressed=\{ask\} onClick=\{openAsk\}>/);
 assert.match(vraag,/className="m-card m-ask m-wa"/);
 assert.match(vraag,/<ChatText text=\{t\.text\}\/>/,'opmaak zoals in de backoffice, geen losse sterretjes');
 assert.match(vraag,/r\.lang='nl-NL'/);assert.match(vraag,/if\(heard\.trim\(\)\)void ask\(heard,true\)/,'ingesproken vraag meteen stellen');
 assert.match(vraag,/if\(spoken\)speak\(answer\)/,'antwoord op een ingesproken vraag wordt voorgelezen');
 assert.match(vraag,/const showMic=canTalk&&/,'zonder spraakherkenning geen microfoonknop');
});

test('Mijn afspraken: na het kiezen scrolt de pagina naar de afspraak (stond op de telefoon buiten beeld)',()=>{
 const v=read('app/leden/afspraken/contract-view.tsx');
 assert.match(v,/onClick=\{\(\)=>\{setSelected\(c\.key\);setPicked\(n=>n\+1\)\}\}/);
 assert.match(v,/if\(picked\)detail\.current\?\.scrollIntoView/);
 assert.match(v,/'Staat hieronder ↓':'Bekijken ›'/);
});

// Wens eigenaar 12 november 2026: „de ledenpagina is nog heel traag, moet je het anders organiseren?”
test('de pagina stuurt de startgegevens meteen mee (streamen), zonder apart startverzoek; de demo haalt zelf op',()=>{
 const page=read('app/deelnemer/[token]/page.tsx'),client=read('app/deelnemer/[token]/lid-pagina.tsx');
 assert.match(page,/<Suspense fallback=\{<Laden\/>\}><MetGegevens token=\{token\}\/><\/Suspense>/,'eerst het kader, dan de gegevens in hetzelfde antwoord');
 assert.match(page,/await memberStart\(token\)/);assert.match(page,/if\(token==='demo'\)return <LidPagina token=\{token\} initial=\{null\}\/>/);
 assert.match(page,/className="m-slow"/,'ook in het kader de link Opnieuw laden');
 assert.ok(client.indexOf("if(initial&&typeof initial==='object')")<client.indexOf("fetch(api+'/start'"),'meegestuurde gegevens eerst; alleen zonder gegevens zelf ophalen');
 assert.doesNotMatch(page,/'use client'/,'de pagina zelf rekent op de server');
});

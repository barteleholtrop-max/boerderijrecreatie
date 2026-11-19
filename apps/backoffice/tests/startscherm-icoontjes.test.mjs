// Startscherm (wens eigenaar 8 november 2026): ledenpagina, kassa en bestelpagina elk met een eigen naam en icoon.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as onderdelen from '../lib/onderdelen.ts';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('drie apps met eigen naam en icoon; iconen zonder login bereikbaar, kassa zelf niet',()=>{
 assert.match(read('app/api/deelnemer/[token]/manifest/route.ts'),/short_name:'Ledenpagina'.*\/icons\/leden-512\.png/s);
 const k=JSON.parse(read('public/kassa.webmanifest'));assert.equal(k.short_name,'Kassa');assert.equal(k.start_url,'/kassa');assert.ok(k.icons.some(i=>i.src==='/icons/kassa-512.png'));
 const b=JSON.parse(fs.readFileSync(new URL('../../website/bestellen-app.json',import.meta.url),'utf8'));assert.equal(b.short_name,'Bestellen');assert.ok(b.icons.some(i=>i.src==='beeld/bestellen-512.png'));
 for(const f of ['public/icons/leden-192.png','public/icons/leden-512.png','public/icons/kassa-192.png','public/icons/kassa-512.png'])assert.ok(fs.statSync(new URL('../'+f,import.meta.url)).size>1000,f);
 const p=read('proxy.ts');assert.ok(p.includes("'/kassa.webmanifest'"),'kassa-manifest zonder login');assert.doesNotMatch(p,/p==='\/kassa'\|\|/,'de kassa zelf blijft achter de login');
});

test('backoffice, werkplek en opnemen hebben elk een eigen naam en icoon met het onderdeel erop (wens eigenaar 9 november 2026)',()=>{
 const p=read('proxy.ts');
 for(const [k,naam,layout] of [['backoffice','Backoffice','app/layout.tsx'],['werkplek','Werkplek','app/werkplek/layout.tsx'],['opnemen','Opnemen','app/opnemen/layout.tsx']]){
  const m=JSON.parse(read('public/'+k+'.webmanifest'));assert.equal(m.short_name,naam);assert.equal(m.start_url,undefined,'geen vaste startpagina: opent het toegevoegde scherm');
  assert.deepEqual(m.icons.map(i=>i.src),['/icons/'+k+'-192.png','/icons/'+k+'-512.png']);
  for(const s of ['192','512'])assert.ok(fs.statSync(new URL('../public/icons/'+k+'-'+s+'.png',import.meta.url)).size>1000,k+s);
  const l=read(layout);assert.ok(l.includes("manifest:'/"+k+".webmanifest'"),layout);assert.ok(l.includes("apple:'/icons/"+k+"-192.png'"),layout);
  assert.ok(p.includes("'/"+k+".webmanifest'"),'manifest zonder login bereikbaar: '+k);
 }
 assert.match(p,/\(leden\|kassa\|backoffice\|werkplek\|opnemen\|gesprekken\)-\(192\|512\)\\\.png/);
});

test('managementapp: eigen icoon, eigen werkgebied /management/, opent Gesprekken, Vandaag, Assistent, Boodschappen en Agenda (wens eigenaar 10 en 12 november 2026)',()=>{
 // 12 november 2026 (wens eigenaar: „meerdere apps, allemaal met losse iconen”): een eigen id en werkgebied, zodat andere pagina's
 // (zoals de ledenpagina) niet in de managementapp blijven hangen. Daardoor is het een nieuwe app: één keer opnieuw op het startscherm zetten.
 const p=read('proxy.ts'),m=JSON.parse(read('public/gesprekken.webmanifest'));
 assert.equal(m.short_name,'Management');assert.equal(m.id,'/management/');assert.equal(m.start_url,'/management/gesprekken');assert.equal(m.scope,'/management/');assert.equal(m.display,'standalone');
 assert.ok(m.start_url.startsWith(m.scope),'start binnen het werkgebied');
 assert.deepEqual(m.icons.map(i=>i.src),['/icons/gesprekken-192.png','/icons/gesprekken-512.png']);
 for(const s of ['192','512'])assert.ok(fs.statSync(new URL('../public/icons/gesprekken-'+s+'.png',import.meta.url)).size>1000,s);
 const l=read('app/management/layout.tsx');assert.ok(l.includes("manifest:'/gesprekken.webmanifest'"));assert.ok(l.includes('<TelefoonApp>'));
 assert.ok(p.includes("'/gesprekken.webmanifest'"),'manifest zonder login bereikbaar');
 const NEW=['/management/gesprekken','/management/taken','/management/assistent','/management/assistent/boodschappen','/management/planning'],OLD=['/gesprekken/telefoon','/taken/telefoon','/assistent/telefoon','/assistent/telefoon/boodschappen','/planning/telefoon'];
 const a=read('app/telefoon-app.tsx');for(const href of NEW)assert.ok(a.includes("'"+href+"'"),href);
 for(const href of NEW)assert.ok(fs.existsSync(new URL('../app'+href+'/page.tsx',import.meta.url)),'pagina '+href);
 // Oude adressen blijven bestaan en sturen door, met dezelfde vraag (bijvoorbeeld ?gesprek=… uit een melding).
 OLD.forEach((o,i)=>{const r=read('app'+o+'/page.tsx');assert.ok(r.includes("redirect('"+NEW[i]+"'"),o)});
 assert.match(read('app/shell.tsx'),/path\.startsWith\('\/management\/'\)/,'zonder backofficemenu');
 // Alleen voor managers (wens eigenaar 10 november 2026): een werkplekaccount (alleen Verkoop: barista, kok, winkel) komt er niet in.
 const {allowed}=onderdelen;for(const href of [...NEW,...OLD,'/api/meta','/api/assistent/boodschappen'])assert.equal(allowed('medewerker',['verkoop'],href,'GET'),false,href);
 // Alleen met het vinkje Managerapp bij Toegang, niet via Gasten, Overzicht of Planning (wens eigenaar 10 november 2026).
 for(const href of [...NEW,...OLD,'/apps']){
  assert.equal(allowed('medewerker',['gasten','overzicht','planning'],href,'GET'),false,'zonder vinkje: '+href);
  assert.equal(allowed('medewerker',['managerapp'],href,'GET'),true,'met vinkje: '+href);assert.equal(allowed('eigenaar',[],href,'GET'),true);}
 for(const api of ['/api/overleg','/api/pot-planning'])assert.equal(allowed('medewerker',['managerapp'],api,'GET'),true,api);
 for(const api of ['/api/meta','/api/mail','/api/gasten','/api/assistent','/api/assistent/boodschappen','/api/meldingen'])assert.equal(allowed('medewerker',['managerapp'],api,'POST'),true,api);
 assert.equal(allowed('medewerker',['gasten'],'/gesprekken','GET'),true,'Gesprekken op de computer blijft bij Gasten');
 assert.equal(allowed('medewerker',['managerapp'],'/deelnemer/'+'A'.repeat(43),'GET'),false,'de ledenpagina hoort niet bij de managementapp');
 // De werkplekschermen linken niet naar de managerapp.
 assert.doesNotMatch(read('lib/kiosk-core.ts'),/telefoon|management/);
 // Terugknop van de telefoon gaat van een gesprek terug naar de lijst.
 const g=read('app/gesprekken/telefoon/scherm.tsx');assert.match(g,/history\.pushState/);assert.match(g,/'popstate'/);assert.match(g,/'\/management\/gesprekken\?gesprek='/);
});

// Losse apps (wens eigenaar 12 november 2026: „zelfscan voor gasten, management, ledenapp, werkplekken, allemaal met losse iconen”):
// elk een eigen werkgebied (scope), zodat ze elkaar niet overnemen.
test('elke app een eigen werkgebied: management, ledenapp, kassa, werkplek, opnemen, zelfscan, bestellen en zelfkassa overlappen niet',()=>{
 const scope=f=>JSON.parse(read('public/'+f)).scope;
 assert.equal(scope('gesprekken.webmanifest'),'/management/');assert.equal(scope('kassa.webmanifest'),'/kassa');assert.equal(scope('werkplek.webmanifest'),'/werkplek/');assert.equal(scope('opnemen.webmanifest'),'/opnemen');
 assert.match(read('app/api/deelnemer/[token]/manifest/route.ts'),/id:portalPath\(token\),[^}]*start_url:portalPath\(token\)\+'\?app=leden',scope:portalPath\(token\)/,'ledenapp: eigen id en werkgebied per lid');
 const web=f=>JSON.parse(fs.readFileSync(new URL('../../website/'+f,import.meta.url),'utf8'));
 const z=web('zelfscan-app.json');assert.equal(z.id,'zelfscan');assert.equal(z.scope,'zelfscan.html');assert.equal(z.start_url,'zelfscan.html');assert.equal(z.display,'standalone','eigen telefoon: geen volledig scherm');
 assert.equal(web('bestellen-app.json').id,'bestellen');
 const k=web('zelfkassa-app.json');assert.equal(k.id,'zelfkassa');assert.equal(k.scope,'zelfkassa.html');assert.equal(k.start_url,'zelfkassa.html');assert.equal(k.display,'fullscreen','tablet: volledig scherm');
 assert.match(fs.readFileSync(new URL('../../website/zelfkassa.html',import.meta.url),'utf8'),/<link rel="manifest" href="zelfkassa-app.json">/);
 assert.match(read('app/winkel/zelfkassa/zelfkassa.tsx'),/site\+'\/zelfkassa\.html'/,'tabletlink naar de eigen pagina');
 assert.match(fs.readFileSync(new URL('../../website/zelfscan.html',import.meta.url),'utf8'),/<link rel="manifest" href="zelfscan-app.json">/);
 // De Zelfkassa-knop op de ledenpagina en de QR-stickers openen de Zelfscan-app, niet de tablet-zelfkassa.
 assert.match(read('app/api/deelnemer/[token]/lid/route.ts'),/zelfscanUrl\(\)/);assert.match(read('app/winkel/zelfkassa/zelfkassa.tsx'),/\/zelfscan\.html\?product=/);
});

test('vraag „Mogen we … aan je startscherm toevoegen?” op ledenpagina, kassa en bestelpagina; niet als hij er al op staat',()=>{
 const v=read('app/startscherm-vraag.tsx');assert.match(v,/display-mode: standalone/);assert.match(v,/beforeinstallprompt/);assert.match(v,/Zet op beginscherm/);assert.match(v,/Niet nu/);assert.match(v,/Ja, prima/);assert.match(v,/DAY_MS=24\*60\*60\*1000/);assert.match(v,/Date\.now\(\)-Number\(localStorage/);
 assert.match(read('app/deelnemer/[token]/lid-pagina.tsx'),/<StartschermVraag naam="Ledenpagina"( altijd)?\/>/);assert.match(read('app/kassa/page.tsx'),/<StartschermVraag naam="Kassa"\/>/);
 const b=fs.readFileSync(new URL('../../website/bestellen.js',import.meta.url),'utf8');assert.match(b,/Mogen we „Bestellen” aan je startscherm toevoegen\?/);assert.match(b,/if \(kiosk\) return;/);
});

test('bestellen: na „Ja, prima” de keuze hoe lang (één dag, een week, blijvend); verlopen = alles op de telefoon gewist en uitleg',()=>{
 const b=fs.readFileSync(new URL('../../website/bestellen.js',import.meta.url),'utf8');
 assert.match(b,/Hoe lang wil je hem houden\?/);for(const t of ["'Eén dag', onclick: \\(\\) => keep\\(1\\)","'Een week', onclick: \\(\\) => keep\\(7\\)","'Blijvend', onclick: \\(\\) => keep\\(0\\)"])assert.match(b,new RegExp(t));
 assert.match(b,/Deze app is verlopen/);assert.match(b,/if \(k\.startsWith\('bb-'\)\) localStorage\.removeItem\(k\)/);
 assert.ok(b.indexOf('const expiredApp')<b.indexOf("const STORAGE_KEY = 'bb-bestelling-v2'"),'eerst wissen, dan pas lezen');
});

test('agenda in de app: een tik opent het agenda-item zelf, niet de totale planning (melding eigenaar 12 november 2026)',()=>{
 const a=read('app/planning/telefoon/scherm.tsx'),v=read('app/taken/telefoon/scherm.tsx'),i=read('app/planning/telefoon/item.tsx');
 assert.match(a,/'\/management\/planning\?item='\+encodeURIComponent\(b\.key\)/);assert.doesNotMatch(a,/href=\{agendaHref/);
 assert.match(a,/history\.pushState/);assert.match(a,/'popstate'/);
 assert.match(v,/'\/management\/planning\?item='\+encodeURIComponent\(b\.key\)/);assert.doesNotMatch(v,/\/planning\?reservering=/);
 for(const t of ['appointments','reservations','events','pickups'])assert.ok(i.includes('state.'+t),t);
});

test('managementapp: knop „Op startscherm” blijft staan in de browser; /apps opent de app met de vraag (besluit eigenaar 12 november 2026)',()=>{
 assert.match(read('app/telefoon-app.tsx'),/<StartschermVraag naam="Management" altijd\/>/); assert.match(read("app/page.tsx"),/<StartschermVraag naam="Backoffice" altijd\/>/); // backoffice vraagt ook (13 november 2026)
 const v=read('app/startscherm-vraag.tsx');assert.match(v,/altijd&&browser\?<button/);assert.match(v,/get\('installeren'\)==='1'/);
 assert.match(read('app/apps/page.tsx'),/redirect\('\/management\/gesprekken\?installeren=1'\)/);
 for(const f of ['public/assistent.webmanifest','public/management.webmanifest'])assert.ok(!fs.existsSync(new URL('../'+f,import.meta.url)),'geen losse apps meer: '+f);
});

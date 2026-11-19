// Website in StudioFab-look met de functies van onze site (wens eigenaar 5 november 2026). Stap 1: webshop en bestelapp.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('bestelapp op /bestellen/: één bestelapp (apps/website), met het thema en niet in zoekmachines',async()=>{
 const plugin=read('apps/website-fab/bestelapp/plugin.ts');
 assert.match(plugin,/path\.resolve\(here, "\.\.\/\.\.\/website"\)/,'de code komt uit apps/website, geen kopie');
 for(const f of ['bestellen.js','bestellen.css','bestellen-sw.js','bestellen-app.json'])assert.ok(plugin.includes(`"${f}"`),f);
 const thema=read('apps/website-fab/bestelapp/thema.css');
 assert.match(thema,/Young Serif/);assert.match(thema,/Figtree/);assert.match(thema,/html\.thema-site\{/);
 assert.match(plugin,/thema\.css/);assert.match(plugin,/name="robots" content="noindex"/);
});
test('webshop op de winkelpagina: live aanbod, hetzelfde mandje als de bestelapp, geen eigen prijzen',()=>{
 const shop=read('apps/website-fab/src/components/Webshop.tsx'),app=read('apps/website/bestellen.js');
 const key=/const STORAGE_KEY = '([^']+)'/.exec(app)[1];
 assert.ok(shop.includes(`const KEY = "${key}"`),'zelfde opslagsleutel als bestellen.js');
 assert.match(shop,/fetch\("\/api\/public\/products"/);assert.match(shop,/p\.route === "winkel"/);
 assert.match(shop,/href="\/bestellen\/#winkel"/);
 assert.doesNotMatch(shop,/priceCents:\s*\d/,'geen vaste prijzen in de code');
 assert.match(read('apps/website-fab/src/pages/Winkel.tsx'),/<Webshop \/>/);
});
test('winkel via zelfscannen: vooraf bestellen en afhalen staat uit, de code blijft (besluit eigenaar 11 november 2026)',()=>{
 const w=read('apps/website-fab/src/pages/Winkel.tsx'),app=read('apps/website/bestellen.js');
 assert.match(w,/const SHOP_ONLINE = false;/);assert.match(w,/Pak, scan en reken zelf af/);
 assert.match(app,/const SHOP_ONLINE = window\.BB_SHOP_ONLINE === true;/);assert.match(app,/const shopHere = SHOP_ONLINE \|\| inShop;/);
 // Zelfscan (12 november 2026): op zelfscan.html alleen de winkel; elders dezelfde regel als hiervoor.
 assert.match(app,/filter\(p => zelfscan \? routeOf\(p\) === 'winkel' : shopHere \|\| routeOf\(p\) !== 'winkel'\)/);
});
test('„Bestellen” staat in het menu en is een gewone link naar de bestelapp',()=>{
 assert.match(read('apps/website-fab/src/content/site.ts'),/\["bestellen", "Bestellen", "\/bestellen\/"\]/);
 assert.match(read('apps/website-fab/src/components/Layout.tsx'),/href\.startsWith\("\/bestellen\/"\)/);
});
// Stap 2: agenda met aanmelden en betalen.
test('agenda: live uit de backoffice, aanmelden en online betalen via de bestaande deuren, geen vaste data',()=>{
 const a=read('apps/website-fab/src/pages/Agenda.tsx');
 assert.match(a,/\/api\/public\/availability/);assert.match(a,/\/api\/public\/event-signups/);assert.match(a,/\/api\/public\/payments/);
 assert.match(a,/aanmelding/,'terugkomst van Mollie wordt gecontroleerd');
 assert.doesNotMatch(a,/priceCents:\s*\d/,'geen vaste prijzen in de code');
 assert.match(read('apps/website-fab/src/routes.ts'),/agenda: "\/agenda\/"/);
 assert.match(read('apps/website-fab/src/App.tsx'),/agenda: Agenda/);
 assert.match(read('apps/website-fab/src/content/site.ts'),/\["agenda", "Agenda", "\/agenda\/"\]/);
 assert.match(read('apps/website-fab/src/pages/Home.tsx'),/<Upcoming \/>/);
 assert.match(read('apps/website-fab/src/components/Upcoming.tsx'),/\/api\/public\/availability/);
});
test('terug van Mollie: /bestellen.html gaat naar de bestelapp op /bestellen/ en de backoffice staat /bestellen/ toe',()=>{
 assert.match(read('apps/website-fab/bestelapp/plugin.ts'),/\/bestellen\.html/);
 // Sinds 13 november 2026 ook de zelfscan: (?:bestellen|zelfscan)(?:\.html|\/)?
 assert.match(read('apps/backoffice/lib/public-orders.ts'),/\(\?:bestellen\|zelfscan\)\(\?:\\\.html\|\\\/\)\?/);
});
// Stap 3: speelboerderij plannen.
test('speelboerderij plannen: dagen en tijdblokken uit de backoffice, in je agenda of delen, niets gereserveerd',()=>{
 const v=read('apps/website-fab/src/components/VisitPlanner.tsx')+read('apps/website-fab/src/lib/visit.ts'),page=read('apps/website-fab/src/pages/Speelboerderij.tsx');
 assert.match(v,/\/api\/public\/availability/);assert.match(v,/a\.visit/);
 assert.match(v,/TZID:Europe\/Amsterdam/);assert.match(v,/calendar\.google\.com/);assert.match(v,/navigator\.share/);assert.match(v,/wa\.me/);
 assert.doesNotMatch(v,/method: "POST"/,'de planner verstuurt niets');
 assert.match(page,/id="plannen"/);assert.match(page,/<VisitPlanner \/>/);assert.match(page,/href="#plannen"/);
});
test('bezoek als agenda-item: tijden, middernacht, tijdzone en escaping',async()=>{
 const {visitEvent,visitIcs,visitGoogleUrl}=await import('../apps/website-fab/src/lib/visit.ts');
 const b=(start,end)=>({id:'x',name:'Ochtend',start,end});
 assert.deepEqual([visitEvent('2026-11-07',b('10:00','13:00'),'w','u').end,visitEvent('2026-11-07',b('14:00',''),'w','u').end,visitEvent('2026-11-07',b('',''),'w','u').start+'-'+visitEvent('2026-11-07',b('',''),'w','u').end],['13:00','16:00','10:00-12:00']);
 for(const s of ['22:00','23:00'])assert.equal(visitEvent('2026-11-07',b(s,''),'w','u').end,'23:59',s+': niet over middernacht en niet 0 of 60 minuten');
 assert.equal(visitEvent('2026-11-07',b('15:00','14:00'),'w','u').end,'23:59','eindtijd vóór de start');
 const e=visitEvent('2026-11-07',b('10:00','13:00'),'Boer Bart, Schoterweg 26; Rotstergaast','https://boerbart.nl/');
 const ics=visitIcs(e,'test',new Date('2026-11-05T08:00:00Z'));
 assert.match(ics,/\r\nTZID:Europe\/Amsterdam\r\n/);
 assert.match(ics,/\r\nDTSTART;TZID=Europe\/Amsterdam:20261107T100000\r\nDTEND;TZID=Europe\/Amsterdam:20261107T130000\r\n/);
 assert.match(ics,/\r\nLOCATION:Boer Bart\\, Schoterweg 26\\; Rotstergaast\r\n/,'komma en puntkomma ge-escaped');
 assert.match(ics,/\r\nUID:test@boerbart\r\nDTSTAMP:20261105T080000Z\r\n/);
 const g=new URL(visitGoogleUrl(e));
 assert.equal(g.searchParams.get('dates'),'20261107T100000/20261107T130000','lokale tijden zonder Z');assert.equal(g.searchParams.get('ctz'),'Europe/Amsterdam');
});
// Stap 4: Ite aanvragen.
test('Ite aanvragen: avonden live uit de backoffice, aanvraag naar dezelfde deur als onze website, met agenda',()=>{
 const y=read('apps/website-fab/src/components/YteRequest.tsx'),page=read('apps/website-fab/src/pages/Yte.tsx');
 assert.match(y,/\/api\/public\/availability/);assert.match(y,/yte\?\.moments/);assert.match(y,/\/api\/public\/yte-requests/);
 for(const k of ['requestId','date','time','people','name','email','phone','wishes','sharing','consent','website'])assert.match(y,new RegExp('\\b'+k+'\\b'),k);
 assert.match(y,/visitIcs/);assert.match(y,/visitGoogleUrl/);
 assert.doesNotMatch(y,/"\d{4}-\d{2}-\d{2}"/,'geen vaste datums in de code');
 assert.match(page,/id="reserveren"/);assert.match(page,/<YteRequest \/>/);assert.match(page,/href="#reserveren"/);
});
// Stap 5: Mijn Bloei.
test('Mijn Bloei: het gedeelde ledenonderdeel uit de backoffice, niet in zoekmachines, geen eigen register',()=>{
 const p=read('apps/website-fab/src/pages/MijnBloei.tsx'),vite=read('apps/website-fab/vite.config.ts');
 assert.match(p,/"\/bloei-proef\.js"/);assert.match(p,/"\/bloei-proef\.css"/);assert.match(p,/createElement\("bloei-proef", \{ endpoint: "\/api\/public\/bloei" \}\)/);
 assert.match(p,/noindex/);assert.match(read('apps/website-fab/src/routes.ts'),/bloei: "\/mijn-bloei\/"/);
 for(const f of ['/api','/bloei-proef.js','/bloei-proef.css','/brand.css'])assert.ok(vite.includes(`"${f}"`),f+' gaat naar de backoffice');
 assert.doesNotMatch(p,/fetch\(/,'geen eigen gegevens ophalen; alles via het gedeelde onderdeel');
 // Mijn Bloei blijft vindbaar via de voettekst; de coöperatiepagina is vervallen (besluit eigenaar 15 november 2026).
 assert.match(read('apps/website-fab/src/components/Layout.tsx'),/paths\.bloei/);
});
test('liggend in een app: de Zelfkassa-app vangt alleen de kassapagina; website en bestelpagina geven de stand vrij (11 november 2026)',()=>{
 const app=JSON.parse(read('apps/website/zelfkassa-app.json'));
 assert.equal(app.scope,'zelfkassa.html','eigen pagina sinds 12 november 2026');assert.equal(app.orientation,'any');assert.ok(app.start_url.startsWith(app.scope),'start_url valt binnen scope');
 assert.match(read('apps/website/index.html'),/display-mode: standalone\), \(display-mode: fullscreen\)"\)\.matches\)screen\.orientation&&screen\.orientation\.lock&&screen\.orientation\.lock\("any"\)/);
 assert.match(read('apps/website/bestellen.js'),/if \(kiosk \|\| asApp\(\)\) \{ freeOrientation\(\);/);
});

test('opbouwstand (15 november 2026): winterbeeld, geen opening, prijzen of contactblok, negen foto\'s en een balk op elke pagina',()=>{
 const site=read('apps/website-fab/src/content/site.ts'),home=read('apps/website-fab/src/pages/Home.tsx'),layout=read('apps/website-fab/src/components/Layout.tsx');
 assert.match(site,/export const opbouw = (true|false);/);
 assert.match(home,/inOntwikkeling\("start"\) \? <OpbouwHome \/> : <GewoneHome \/>/);
 const opbouwDeel=home.slice(home.indexOf('// Opbouwstand')).split('\n').filter(l=>!l.trim().startsWith('//')).join('\n');
 // De gemeente beslist nog: nog geen opening noemen, geen prijzen, geen open/dicht en geen contactblok.
 assert.doesNotMatch(opbouwDeel,/prices\.|2027|maart|opening|opengaat|weer open|<TodayBoard|className="wrap visit"|Alvast meedoen|alvast weten/i);
 assert.match(opbouwDeel,/We werken aan het nieuwe Boer\{"\\u00a0"\}Bart\./);
 assert.match(layout,/inOntwikkeling\("winkel"\) \? <h2 className="footer__h">Meer<\/h2>/); // geen openingstijden zolang de winkel in ontwikkeling is
 // In kleur (wens eigenaar 16 november 2026: zwart-wit „lijkt op een rouwkaart”): de echte foto bij zonsopkomst, zonder grijsfilter.
 assert.match(opbouwDeel,/slug="zonsopkomst"/);
 assert.doesNotMatch(read('apps/website-fab/src/styles/global.css'),/saturate\(\.28\)|\.hero--stil \.hero__photo img \{ filter/);
 assert.equal((opbouwDeel.match(/\{ slug: "/g)||[]).length,9);
 assert.match(layout,/className="opbouwbalk"/);
 assert.match(layout,/const showBar = contactOpen &&/); // geen vaste contactbalk zolang contact in ontwikkeling is
 // Echte foto, alleen ingekleurd; het afleiden staat in het fotoscript.
 assert.equal(JSON.parse(read('apps/website-fab/src/lib/images.json'))['winter-erf'],undefined,'het grijze winterbeeld is weg');
});

test('opbouwstand: alleen de startpagina; elke andere pagina toont „in ontwikkeling” op haar eigen adres',()=>{
 const app=read('apps/website-fab/src/App.tsx'),layout=read('apps/website-fab/src/components/Layout.tsx'),p=read('apps/website-fab/src/pages/InOntwikkeling.tsx'),home=read('apps/website-fab/src/pages/Home.tsx');
 assert.match(app,/route && route\.page !== "home" && pageInOntwikkeling\(route\.page\) \? <InOntwikkeling page=\{route\.page\} \/> : <Page \/>/);
 // Bestaande leden en de wet: deze blijven werken.
 // Bestaande leden en de wet: pagina's zonder onderdeel blijven altijd werken.
 const liveSrc=read('apps/website-fab/src/content/live.ts');
 for(const k of ['privacy','bloei','markt','verstuurd']) assert.doesNotMatch(liveSrc.slice(liveSrc.indexOf('export const onderdeelVan')).split('\n')[0],new RegExp(`\\b${k}:`),k);
 // Zonder backoffice (vooraf opbouwen, storing): alles in ontwikkeling.
 assert.match(liveSrc,/live\.inOntwikkeling \? live\.inOntwikkeling\.has\(o\) : opbouw/);
 assert.match(read('apps/website-fab/src/content/site.ts'),/export const opbouw = true;/);
 // Elke andere pagina heeft een eigen titel en tekst (geen dubbele titels voor Google).
 for(const k of ['speelboerderij','yte','groepen','agenda','winkel','over','vragen','contact','nieuws']) assert.match(p,new RegExp(`\\n  ${k}: \\{`),k);
 // Geen kamer slopen: de adressen blijven in de routes staan.
 const routes=read('apps/website-fab/src/routes.ts');
 for(const r of ['speelboerderij: "/speelboerderij/"','yte: "/yte/"','groepen: "/groepen/"','agenda: "/agenda/"','winkel: "/boerderijwinkel/"']) assert.ok(routes.includes(r),r);
 assert.match(layout,/nav\.filter\(\(\[k\]\) => !inOntwikkeling\(navOnderdeel\[k\] \?\? "start"\)\)/);
 // Nog geen opening, prijzen, boekingen of lid worden.
 assert.doesNotMatch(p.split('\n').filter(l=>!l.trim().startsWith('//')).join('\n'),/prices\.|2027|maart|weer open|YteRequest|VisitPlanner|reserveer|word lid|lid worden/i);
 assert.match(p,/hero hero--winter hero--stil/);
 // Nieuws heeft nog geen gepubliceerde stukken: „Volg de bouw” gaat naar Instagram.
 assert.match(home.slice(home.indexOf('function OpbouwHome')),/href=\{site\.instagram\}[^>]*>Volg ons op Instagram/);
 // Het coöperatieve verhaal staat op de startpagina, zonder lid worden (15 november 2026).
 assert.match(home.slice(home.indexOf('function OpbouwHome')),/De boerderij die ons samen draagt[\s\S]*je hoeft geen lid te worden/);
 // Bestaande leden: op Mijn Bloei en de Bloeimarkt een klein menu met die twee.
 assert.match(layout,/inOntwikkeling\("start"\) && \(page === "bloei" \|\| page === "markt"\) \? ledenMenu : open/);
 // Wens eigenaar: geen „Webdesign door StudioFab.nl” meer onderaan.
 assert.doesNotMatch(layout,/Webdesign door|studiofab\.nl/i);
});

test('indeling (15 november 2026): één overzicht in docs/SITES.md; hoofdsite en gast-apps heten zo in de backoffice',()=>{
 const sites=read('docs/SITES.md'),links=read('apps/backoffice/lib/website-links.ts');
 for(const r of ['**Hoofdsite**','**Gast-apps**','**Backoffice**','`boerbart-website-fab`','`boerbart-website`','`boerbart.nl/bestellen/`','## Opgeruimd (15 november 2026)','`includedFiles`']) assert.ok(sites.includes(r),r);
 assert.match(links,/name:'Hoofdsite \(boerbart\.nl\)'/);
 assert.match(links,/name:'Gast-apps \(zelfscankassa\.boerbart\.nl\)'/);
 assert.doesNotMatch(links,/'Nieuwe website'|'Huidige website'/);
 // De andere documenten spreken de indeling niet tegen.
 assert.doesNotMatch(read('docs/CLOUD-RUN.md'),/boerbart\.nl blijft op Wix\*\* tot/);
 assert.doesNotMatch(read('docs/VOORDEUR.md'),/landingspagina's[^|\n]*\| `boerbart-website` \|/);
});

test('Nijemoed Bloemen: prijzen alleen live uit het profiel van Bindert (17 november 2026)',()=>{
 const blok=read('apps/website-fab/src/components/BindertAanbod.tsx'),pagina=read('apps/website-fab/src/pages/Nijemoed.tsx');
 assert.match(blok,/\/api\/public\/products/);assert.match(blok,/supplierCompany/);
 assert.ok(!/€\s?\d/.test(blok+pagina),'Geen vaste bedragen op de pagina van Nijemoed Bloemen.');
 assert.match(read('apps/backoffice/lib/public-products.ts'),/supplierCompany:companies\.get/);
});

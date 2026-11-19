// Leden & winstdeling in één menu en één link per lid (besluit eigenaar 5 november 2026).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('één menu-onderdeel Leden; de weekafsluitingen (winkel en potten) staan onder Geld (16 november 2026)',()=>{
 const shell=read('app/shell.tsx');
 assert.match(shell,/\['\/leden','☺','Leden',\['\/bloei\/inkomensleningen'\]\]/);
 assert.match(shell,/\['\/financien\/weekafsluiting','✓','Weekafsluitingen',\['\/beloning','\/leden\/deelnemers','\/winkel\/afrekening','\/financien\/deelnemers'\]\]/);
 assert.doesNotMatch(shell,/\['\/beloning','◎'/,'Beloning heeft geen eigen menu-onderdeel meer');
 const tabs=read('app/leden/tabs.ts');assert.ok(tabs.includes("'/leden'"));for(const r of ['/beloning','/leden/deelnemers'])assert.ok(!tabs.includes(`['${r}'`),r);
 assert.match(read('app/financien/tabs.ts'),/'\/financien\/weekafsluiting','Weekafsluitingen'/);
 for(const p of ['financien/deelnemers','leden/deelnemers','winkel/afrekening'])assert.match(read(`app/${p}/page.tsx`),/redirect\('\/financien\/weekafsluiting'\)/,p);
 assert.match(read('app/beloning/page.tsx'),/redirect\('\/financien\/weekafsluiting#potten'\)/);
 const page=read('app/financien/weekafsluiting/page.tsx');assert.match(page,/<Deelnemers place="financien"\/>/);assert.match(page,/<PotWeek pot="speelboerderij"/);
});

test('de persoonlijke link en nieuwe leden staan op de ledenkaart',()=>{
 const p=read('app/leden/page.tsx');
 for(const a of ['link-maken','link-intrekken',"action:'deelnemer'"])assert.ok(p.includes(a),a);
});

test('wat het lid op de link ziet, volgt uit de ledenkaart (soort lid en onderdelen)',()=>{
 const p=read('app/deelnemer/[token]/lid-pagina.tsx');
 assert.match(p,/card\.unitKeys\.includes\('levert'\)/);assert.match(p,/ROSTER_UNITS/);assert.match(p,/card\.memberClass/);
 assert.match(read('lib/members.ts'),/unitKeys:c\.units/);
});

test('ledenpagina: eigen kop per onderwerp, coöperatieve leverancier met winkelrooster en zonder werkbeloning, documenten om te downloaden',()=>{
 const p=read('app/deelnemer/[token]/lid-pagina.tsx');
 // Vrijwilliger (8 november 2026): ook rooster en saldo, maar geen deel in een pot (team zonder vrijwilligers).
 assert.match(p,/volunteer=!!card\.volunteer,holder=.*,team=card\.unitKeys\.some\(u=>POT_UNITS\.includes\(u\)\)&&!volunteer/);
 assert.match(p,/rooster:roster\|\|\(volunteer&&card\.unitKeys\.some\(u=>POT_UNITS\.includes\(u\)\)\),beloning:team\|\|volunteer\|\|holder,producten:supplier\|\|!!funds\?\.length,financien:supplier&&!team&&!volunteer&&!holder,pot:!!funds\?\.length,overleg:team\|\|!!\(overleg&&\(overleg\.open\.length\|\|overleg\.decided\.length\)\),gegevens:true/,'Pot alleen voor wie een onderdeelpot beheert (5 november 2026); Overleg ook voor wie een voorstel krijgt (6 november 2026)');
 // Eén tabblad voor geld (9 november 2026): wie nog op Financiën stond, komt op Mijn saldo.
 assert.match(p,/wanted=tab==='financien'&&!show\.financien&&show\.beloning\?'beloning':tab/);
 for(const t of ['Overleg & besluiten','Mijn gegevens','Financiën','Mijn deel'])assert.ok(p.includes(t),t);
 const d=read('app/deelnemer/[token]/document.tsx');for(const k of ['beloning-week','beloning-jaar','winkel-week','winkel-jaar','lidmaatschap'])assert.ok(d.includes(`'${k}'`),k);
 assert.match(read('app/deelnemer/[token]/lidmaatschap.tsx'),/kind:'lidmaatschap'/);assert.doesNotMatch(read('app/deelnemer/[token]/lidmaatschap.tsx'),/<Afspraken/);
 assert.match(read('app/deelnemer/[token]/rooster.tsx'),/function Maand/);assert.match(read('app/globals.css'),/@media \(min-width:960px\)\{\n \.m-app\{max-width:1180px/,'ook op de computer');
 assert.match(read('app/leden/page.tsx'),/Aangenomen voor/);assert.match(read('lib/members.ts'),/JSON\.stringify\(f\.potRoles\)/);
 for(const n of ['financien','push','potbeheer','bb','tegoed','overleg','agenda','inleg','berichten','omwisselen','vraag'])assert.match(fs.readFileSync(new URL('../lib/member-routes.ts',import.meta.url),'utf8'),new RegExp(`'${n}'`)); // inleg: rentesaldo en obligaties (8 november 2026); BB-tegoed en uitbetalen (6 november 2026); agendalink (7 november 2026)
});

test('de pot-week toont gesloten dagen niet, tenzij er omzet of een rol op staat',()=>{
 assert.match(read('lib/pot-days.ts'),/open:openDays\.has\(day\)/);assert.match(read('app/beloning/week.tsx'),/filter\(d=>shown\(d\.day\)\)/);
});

test('rooster: melding na Ik doe het onderin in beeld, knoppen niet onder de tabbalk',()=>{
 const r=read('app/deelnemer/[token]/rooster.tsx');assert.match(r,/className=\{'m-toast'/);assert.match(r,/scrollIntoView/);
 assert.match(read('app/globals.css'),/html:has\(\.m-app\)\{scroll-padding-bottom:110px\}/);
});

test('halve dienst en hulp vragen: tablet, punten en berichten naar leden',()=>{
 assert.match(read('lib/pot-day-core.ts'),/p\.points\+=\(role\?\.points\|\|0\)\*\(s\.half\?0\.5:1\)/,'halve dienst = helft van de punten');
 const t=read('app/werkplek/team.tsx');assert.match(t,/Halve dienst<\/button>/);assert.match(t,/action:'hulp'/);
 assert.match(read('app/api/pot-planning/route.ts'),/b\.half===true/);
 const m=read('lib/member-push.ts');assert.match(m,/HELP_PAUSE_MS/);assert.match(m,/membersOf\(await people\(\),pot\)/);
 const sql=read('drizzle-pg/0016_halve_dienst.sql');for(const t of ['member_push','pot_help_calls'])assert.match(sql,new RegExp(`ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY`));
 assert.match(fs.readFileSync(new URL('../lib/member-routes.ts',import.meta.url),'utf8'),/path==='\/deelnemer-sw\.js'/);assert.match(read('public/deelnemer-sw.js'),/showNotification/);
 assert.match(read('lib/pot-core.ts'),/WEEK_TASK_DAY:Record<string,number>=\{schoonmaak:4\}/,'schoonmaak op donderdag');
});

test('kop van de ledenpagina: Boer Bart Coöperatie U.A., groot de naam, dan het onderdeel (8 november 2026)',()=>{
 const p=fs.readFileSync(new URL('../app/deelnemer/[token]/lid-pagina.tsx',import.meta.url),'utf8');
 assert.match(p,/<span className="m-brand">Boer Bart <small>Coöperatie U\.A\.<\/small><\/span>/);
 assert.match(p,/<span className="m-name">\{first\}<\/span>/);assert.ok(p.indexOf('className="m-hello"')<p.indexOf('<h1 className="m-title">'),'naam boven het onderdeel');
});

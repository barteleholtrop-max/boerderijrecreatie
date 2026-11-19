// Bloei → Waarde (besluit eigenaar 9 november 2026): rekenregels, bevriezen, winstbestemming, opslag en beveiliging.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './helpers/ts-resolve.mjs';
const W=await import('../lib/bloei-waarde-core.ts');
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
// De beginwaarden uit de migratie (cijfers uit de jaarrekeningen), zodat de test rekent met wat er echt in de database komt.
const seed=JSON.parse(read('drizzle-pg/0048_waardering_beginwaarden.sql').match(/VALUES \('main',1,'(.*)','2026-11-09/s)[1].replace(/''/g,"'"));

test('beginwaarden: taxatie 2022 voor het onroerend goed, boekwaarden en leningen uit de jaarrekeningen, 10.000 participaties',()=>{
 const w=W.parseWaardering(seed,null);
 assert.equal(w.participaties,10000);assert.equal(w.goodwillVanaf,2026);assert.equal(w.grondslag,'taxatie');assert.equal(w.winst.dividend,10000);
 const b=W.bereken(w,'boekwaarde');
 assert.equal(b.perSoort.grond,1235918);assert.equal(b.perSoort.gebouwen,338448+425520);assert.equal(b.perSoort.dieren,164249+2500);assert.equal(b.perSoort.machines,104635+35589+21138);
 assert.equal(b.inbreng,2327997);assert.equal(b.leningen,120913,'hypotheek en obligaties zijn leningen aan Bartele persoonlijk en tellen niet mee');assert.equal(b.blijvenPersoonlijk,1029650+588674);
 assert.equal(b.goodwill,0,'nog geen coöperatiejaar: goodwill begint op nul');
 assert.equal(b.netto,2327997-120913);assert.equal(b.perParticipatie,220.71);
 // Ter vergelijking de VOF-jaren: vrije kasstroom per jaar volgens de bron in de beginwaarden.
 assert.deepEqual(b.jaren.map(j=>j.vrij),[-75427+14505-74000,-46957-4732-75675,128630-55280-100500]);
 assert.deepEqual(b.vergelijkJaren,[2023,2024,2025]);
 // Optie 2 (besluit eigenaar 9 november 2026): omgerekend naar de coöperatie, alleen ter vergelijking.
 assert.deepEqual(b.jaren.map(j=>j.omgerekend),[-32228,-12432,81219]);assert.equal(b.gemiddeldeOmgerekend,12186);assert.equal(b.goodwillOmgerekend,60930);
 assert.equal(b.gemiddeldeVergelijk,-96479);assert.equal(b.goodwill,0,'de vergelijking telt niet mee');
 // Op taxatie: het onroerend goed volgens het taxatierapport (€ 1.845.000), de rest voorlopig op boekwaarde.
 const t=W.bereken(w,'taxatie');assert.equal(t.perSoort.grond,1241000+135000);assert.equal(t.perSoort.gebouwen,175000+294000+338448);
 assert.equal(1241000+135000+175000+294000,1845000,'gelijk aan de marktwaarde in het taxatierapport');
 assert.equal(t.perSoort.productierechten,3000*34831/100,'3.000 kg fosfaatrechten × € 348,31');
 assert.equal(t.inbreng,2511559+1044930);assert.equal(t.netto,3556489-120913);assert.equal(t.perParticipatie,343.56);
 // Telt de hypotheek toch mee (vinkje aan), dan gaat die er weer af.
 assert.equal(W.bereken({...w,leningen:w.leningen.map(l=>({...l,naarCooperatie:true}))},'taxatie').perParticipatie,181.73);
 assert.deepEqual(t.zonderTaxatie,[],'alles heeft een taxatie- of startwaarde');
});

test('vrije kasstroom en goodwill: laatste 3 jaren vanaf het startjaar, × veelvoud',()=>{
 const j=(jaar,resultaat,soort='cooperatie')=>({jaar,soort,resultaat,afschrijvingen:10,herinvesteringen:10,nietKas:0,aflossingen:0,bron:''});
 const w={...W.leeg(),participaties:100,veelvoud:5,goodwillVanaf:2026,jaren:[j(2025,-500,'vof'),j(2026,100),j(2027,200),j(2028,300),j(2029,400)]};
 const b=W.bereken(w);assert.deepEqual(b.goodwillJaren,[2027,2028,2029]);assert.equal(b.gemiddeldeVrij,300);assert.equal(b.goodwill,1500);
 assert.equal(W.vrijeKasstroom({...j(2026,100),afschrijvingen:50,herinvesteringen:20,nietKas:5,aflossingen:25}),100);
});

test('lopend jaar telt mee als prognose en blijft gemarkeerd na opslaan',()=>{
 const j=(jaar,resultaat,extra={})=>({jaar,soort:'cooperatie',resultaat,afschrijvingen:0,herinvesteringen:0,nietKas:0,aflossingen:0,bron:'',...extra});
 const w=W.parseWaardering({...W.leeg(),participaties:100,veelvoud:5,goodwillVanaf:2026,jaren:[j(2026,120000,{prognose:true})]},null);
 assert.equal(w.jaren[0].prognose,true);
 const b=W.bereken(w);assert.deepEqual(b.goodwillJaren,[2026]);assert.deepEqual(b.goodwillPrognose,[2026]);assert.equal(b.goodwill,600000);
 const vast=W.parseWaardering({...w,jaren:[j(2026,120000,{prognose:false})]},null);assert.equal(vast.jaren[0].prognose,undefined);assert.deepEqual(W.bereken(vast).goodwillPrognose,[]);
});

test('taxatie telt bij inbreng op taxatie; bevriezen kan één keer en alleen als alles getaxeerd is',()=>{
 const w=W.parseWaardering(seed,null);
 assert.throws(()=>W.bevries({...w,bezit:[...w.bezit,{...w.bezit[0],id:'x',taxatie:null}]},'b','2026-11-09T10:00:00Z'),/Nog geen taxatiewaarde/);
 const getaxeerd={...w,bezit:w.bezit.map(x=>({...x,taxatie:x.boekwaarde+1000}))};
 const v=W.bevries(getaxeerd,'bartele','2026-11-09T10:00:00Z');assert.equal(v.bedrag,2327997+11000);assert.equal(v.grondslag,'taxatie');
 const vast={...getaxeerd,bevroren:v,bezit:getaxeerd.bezit.map(x=>({...x,taxatie:(x.taxatie||0)*2}))};
 assert.equal(W.bereken(vast).inbreng,v.bedrag,'na bevriezen verandert de inbreng niet meer');
 assert.throws(()=>W.bevries(vast,'b','x'),/al bevroren/);
 // Het bevroren deel komt nooit uit de invoer van de browser.
 assert.equal(W.parseWaardering({...seed,bevroren:{bedrag:1}},null).bevroren,null);
});

test('winstbestemming: minstens 30% naar de reserve; € 10.000 dividend vraagt € 14.286 nettowinst, € 1 per participatie',()=>{
 const w=W.parseWaardering({...seed,winst:{jaar:2026,nettoNaVpb:20000,reservePct:30,dividend:10000}},null);
 const b=W.bereken(w);assert.equal(b.winst.nodigVoorDividend,14286);assert.equal(b.winst.dividendPerParticipatie,1);assert.equal(b.winst.reserveMin,6000);assert.equal(b.winst.ruimte,14000);assert.equal(b.winst.past,true);
 assert.equal(W.bereken({...w,winst:{...w.winst,nettoNaVpb:12000}}).winst.past,false);
 assert.throws(()=>W.parseWaardering({...seed,winst:{jaar:2026,nettoNaVpb:1,reservePct:20,dividend:0}},null),/minstens 30%/);
});

test('invoer wordt gecontroleerd: geen onbekende soort, geen dubbel jaar, geen rare bedragen',()=>{
 assert.throws(()=>W.parseWaardering({...seed,bezit:[{...seed.bezit[0],soort:'aandelen'}]},null),/Kies een soort/);
 assert.throws(()=>W.parseWaardering({...seed,jaren:[seed.jaren[0],seed.jaren[0]]},null),/één keer/);
 assert.throws(()=>W.parseWaardering({...seed,leningen:[{naam:'x',bedrag:'veel'}]},null),/Ongeldig bedrag/);
});

test('opslaan en bevriezen vragen een nieuwe code en worden vastgelegd; tabel met beveiliging per rij; tabblad Waarde',()=>{
 const r=read('app/api/bloei/waarde/route.ts'),post=r.slice(r.indexOf('export async function POST'));
 assert.match(post,/authorizeSheet\(req,true\);const stop=await actionCode\(req\);if\(stop\)return stop;/);
 assert.match(post,/noteSensitive\(req,'waarde:opslaan'/);assert.match(post,/noteSensitive\(req,'waarde:inbreng-bevriezen'/);
 assert.match(read('drizzle-pg/0047_waardering.sql'),/ALTER TABLE "bloei_waardering" ENABLE ROW LEVEL SECURITY/);
 assert.match(read('lib/bloei-waarde-store.ts'),/De inbreng is bevroren; het bezit kan niet meer worden gewijzigd/);
 assert.match(read('app/bloei/tabs.ts'),/\['\/bloei\/waarde','Waarde'\]/);
});

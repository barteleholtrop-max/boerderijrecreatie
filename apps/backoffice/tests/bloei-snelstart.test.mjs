// SnelStart → Bloei → Waarde (besluit eigenaar 9 november 2026): alleen lezen, inloggen met de koppelsleutel, indeling en berekening.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './helpers/ts-resolve.mjs';
const C=await import('../lib/bloei-snelstart-core.ts');
const S=await import('../lib/snelstart.ts');
const W=await import('../lib/bloei-waarde-core.ts');
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

// Een kleine, fictieve administratie zoals SnelStart die teruggeeft.
const gb=C.leesGrootboeken([
 {id:'g-omzet',nummer:'8000',omschrijving:'Omzet speelboerderij',rekeningCode:'WinstEnVerlies',rgsCode:[{rgsCode:'WOmzNop'}]},
 {id:'g-afs',nummer:'4800',omschrijving:'Afschrijving gebouwen',rekeningCode:'WinstEnVerlies',rgsCode:[{rgsCode:'WAfsMvaBed'}]},
 {id:'g-vee',nummer:'8100',omschrijving:'Omzet en aanwas melkvee',rekeningCode:'WinstEnVerlies',rgsCode:[]},
 {id:'g-rente',nummer:'4900',omschrijving:'Rente obligaties',rekeningCode:'WinstEnVerlies',rgsCode:[]},
 {id:'g-bvs',nummer:'4300',omschrijving:'Doorbelaste kosten buitenvennootschappelijk vermogen',rekeningCode:'WinstEnVerlies',rgsCode:[]},
 {id:'g-kosten',nummer:'4000',omschrijving:'Voer',rekeningCode:'WinstEnVerlies',rgsCode:[]},
 {id:'g-dijkstra',nummer:'1700',omschrijving:'Lening Pieter Dijkstra',rekeningCode:'Balans',rgsCode:[{rgsCode:'BLasSak'}]},
 {id:'g-obl',nummer:'1710',omschrijving:'Lening Bloei Foundation (obligaties)',rekeningCode:'Balans',rgsCode:[]},
 {id:'g-bank',nummer:'1100',omschrijving:'Bank',rekeningCode:'Balans',rgsCode:[]},
 {nummer:'zonder id'},
]);

test('grootboekrekeningen lezen en een voorstel voor de indeling uit RGS-code en omschrijving',()=>{
 assert.equal(gb.length,9,'regels zonder id vallen weg');assert.equal(gb.find(g=>g.id==='g-afs').soort,'winst-verlies');assert.deepEqual(gb.find(g=>g.id==='g-afs').rgs,['WAfsMvaBed']);
 assert.deepEqual(C.voorstelIndeling(gb),{'g-afs':'afschrijvingen','g-vee':'vee','g-rente':'rente-persoonlijk','g-bvs':'kosten-persoonlijk','g-dijkstra':'lening-cooperatie','g-obl':'lening-persoonlijk'});
});

test('één periode: resultaat, afschrijvingen, vee, aflossingen en de correctie voor de coöperatie',()=>{
 const {regels,velden}=C.leesPeriodebalans([
  {grootboek:{id:'g-omzet'},saldo:-500000},{grootboek:{id:'g-kosten'},saldo:250000},{grootboek:{id:'g-afs'},saldo:24000},
  {grootboek:{id:'g-vee'},saldo:-50000},{grootboek:{id:'g-rente'},saldo:15000},{grootboek:{id:'g-bvs'},saldo:55000},
  {grootboek:{id:'g-dijkstra'},debet:17000,credit:52000},{grootboek:{id:'g-obl'},debet:0,credit:38000},{grootboek:{id:'g-bank'},saldo:1000},{grootboek:{id:'onbekend'},saldo:5}]);
 assert.ok(velden.includes('grootboek'));
 const u=C.berekenPeriode(regels,gb,C.voorstelIndeling(gb));
 assert.equal(u.resultaat,500000-250000-24000+50000-15000-55000,'winst positief: opbrengsten min kosten');
 assert.equal(u.afschrijvingen,24000);assert.equal(u.nietKas,50000,'waardegroei vee is geen geld');
 assert.equal(u.aflossingen,17000,'alleen de debetkant van een lening van de coöperatie; nieuw lenen telt niet als negatieve aflossing');
 assert.equal(u.correctie,15000+55000+0,'rente en kosten die persoonlijk blijven + aflossing persoonlijke lening');
 assert.equal(u.nietGevonden,1);
 // In de waardering: vrije kasstroom zoals de handmatige jaren.
 assert.equal(W.vrijeKasstroom({jaar:2025,soort:'vof',resultaat:u.resultaat,afschrijvingen:u.afschrijvingen,herinvesteringen:u.afschrijvingen,nietKas:u.nietKas,aflossingen:u.aflossingen,bron:'',correctie:0,correctieUitleg:''}),u.resultaat-50000-17000);
 // Andere veldnamen (debet/credit zonder saldo, grootboekId) worden ook gelezen.
 assert.equal(C.leesPeriodebalans([{grootboekId:'g-afs',debet:10,credit:3}]).regels[0].saldo,7);
});

test('periode: een boekjaar of de laatste 12 hele maanden (prognose, geen begroting)',()=>{
 assert.deepEqual(C.periode('jaar',2025),{start:'2025-01-01',eind:'2025-12-31',label:'2025'});
 const p=C.periode('laatste12',0,new Date(Date.UTC(2026,10,9)));assert.equal(p.start,'2025-11-01');assert.equal(p.eind,'2026-10-31');
});

test('inloggen met de koppelsleutel, alleen GET, opnieuw inloggen na een verlopen token, nette melding zonder sleutels',async()=>{
 delete process.env.GUEST_SNELSTART_SUBSCRIPTION_KEY;delete process.env.GUEST_SNELSTART_CLIENT_KEY;
 await assert.rejects(S.grootboeken(async()=>{throw Error('mag niet')}),/nog niet gekoppeld/);
 process.env.GUEST_SNELSTART_SUBSCRIPTION_KEY='abo-test';process.env.GUEST_SNELSTART_CLIENT_KEY='koppel-test-1234';
 const calls=[];let tokens=0,eersteKeer=true;
 const nep=async(url,init={})=>{const u=String(url);calls.push({u,method:init.method||'GET',headers:init.headers,body:init.body?.toString()});
  if(u===S.SNELSTART_AUTH){tokens++;return Response.json({access_token:'tok'+tokens,expires_in:3600})}
  if(eersteKeer){eersteKeer=false;return new Response('',{status:401})}
  return Response.json([{grootboek:{id:'g-afs'},saldo:1}])};
 const d=await S.periodebalans('2025-01-01','2025-12-31',nep);assert.equal(d.length,1);
 const auth=calls.filter(c=>c.u===S.SNELSTART_AUTH);assert.equal(auth.length,2,'na 401 één keer opnieuw inloggen');
 assert.equal(auth[0].method,'POST');assert.match(auth[0].body,/grant_type=clientkey&clientkey=koppel-test-1234/);assert.equal(auth[0].headers['Ocp-Apim-Subscription-Key'],'abo-test');
 const api=calls.filter(c=>c.u!==S.SNELSTART_AUTH);assert.ok(api.every(c=>c.method==='GET'),'alleen lezen');
 assert.match(api.at(-1).u,/^https:\/\/b2bapi\.snelstart\.nl\/v2\/rapportages\/periodebalans\?start=2025-01-01&end=2025-12-31$/);
 assert.equal(api.at(-1).headers.Authorization,'Bearer tok2');assert.equal(api.at(-1).headers['Ocp-Apim-Subscription-Key'],'abo-test');
 await assert.rejects(S.snelStartGet('grootboeken/../x',{},nep),/Ongeldig/);
 delete process.env.GUEST_SNELSTART_SUBSCRIPTION_KEY;delete process.env.GUEST_SNELSTART_CLIENT_KEY;
});

test('de indeling wordt in de waardering bewaard en gecontroleerd; de route leest alleen',()=>{
 const seed={...W.leeg(),participaties:1,winst:{jaar:2026,nettoNaVpb:0,reservePct:30,dividend:0},snelstart:{toewijzing:{'g-afs':'afschrijvingen','x':'onzin','../a':'vee'}}};
 assert.deepEqual(W.parseWaardering(seed,null).snelstart.toewijzing,{'g-afs':'afschrijvingen'});
 const r=read('app/api/bloei/waarde/snelstart/route.ts');assert.ok(!/export async function (POST|PUT|DELETE)/.test(r),'alleen GET');
 assert.ok(!/method:'(POST|PUT|DELETE)'/.test(read('lib/snelstart.ts').replace("method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'","")),'alleen het inloggen is een POST');
});

// ---- Kolommenbalans (Excel-export), zonder API-abonnement (9 november 2026). Fictieve administratie in dezelfde opbouw. ----
const rij=(row,cells)=>{const v=Array(24).fill(null);for(const [i,x] of Object.entries(cells))v[i]=x;return {row,values:v}};
const kop=n=>[rij(n,{3:'Kolommenbalans',15:'Administratie:',18:'Proefboerderij'}),rij(n+1,{15:'Datum:',17:'01-01-2025 t/m 31-12-2025'}),rij(n+4,{11:'Verlies & Winst',18:'Eindbalans'}),rij(n+5,{2:'Grootboekrekening',11:'Debet',14:'Credit',18:'Debet',21:'Credit'})];
const kb2025=[...kop(1),
 rij(20,{2:'22.0',5:'Terreinen',17:'1000000.0'}),rij(22,{2:'535.0',5:'Rabo incasso lening 1',20:'630000.0'}),rij(23,{2:'582.0',5:'Lening Pieter Dijkstra',20:'110000.0'}),
 rij(24,{2:'1615.0',5:'Rente Rabo incasso lening 1',17:'3000.0'}),rij(25,{2:'1626.0',5:'Lening aan Boer Bart Coöperatie',17:'300.0'}),
 ...kop(30),rij(36,{4:'Totaal vorige pagina'}),
 rij(40,{2:'4800.0',5:'Afschrijving machines',10:'12000.0'}),rij(41,{2:'4944.0',5:'Rente Obligaties',10:'6000.0'}),rij(42,{2:'7005.0',5:'Krachtvoer',10:'50000.0'}),
 rij(43,{2:'8010.0',5:'Melkverkoop aan fabriek',13:'200000.0'}),rij(44,{2:'8150.0',5:'Waardeverandering melkvee',13:'10000.0'}),
 rij(50,{5:'Totaal',10:'68000.0',13:'210000.0'}),rij(51,{5:'Resultaat',10:'142000.0',20:'142000.0'})];

test('kolommenbalans lezen: periode, rekeningen, bedragen bij de juiste kolom, resultaat klopt met SnelStart',()=>{
 const kb=C.leesKolommenbalans(kb2025);
 assert.equal(kb.administratie,'Proefboerderij');assert.equal(kb.start,'2025-01-01');assert.equal(kb.eind,'2025-12-31');
 assert.equal(kb.grootboeken.length,10,'kopregels, totalen en „Totaal vorige pagina” tellen niet mee');
 assert.equal(kb.grootboeken.find(g=>g.nummer==='8010').soort,'winst-verlies');assert.equal(kb.grootboeken.find(g=>g.nummer==='535').soort,'balans');
 assert.equal(kb.regels.find(r=>r.nummer==='535').saldo,-630000,'schuld staat credit');
 assert.equal(kb.resultaatSnelStart,142000);assert.equal(kb.resultaatBerekend,142000);assert.equal(kb.klopt,true);
 const t=C.voorstelIndeling(kb.grootboeken);
 assert.equal(t['nr:535'],'lening-persoonlijk','Rabo-incassolening = hypotheek, blijft persoonlijk');assert.equal(t['nr:582'],'lening-cooperatie');
 assert.equal(t['nr:1615'],undefined,'een renterekening is geen lening');assert.equal(t['nr:1626'],undefined,'een lening aan iemand is geen schuld');
 assert.equal(t['nr:4800'],'afschrijvingen');assert.equal(t['nr:8150'],'vee');assert.equal(t['nr:4944'],'rente-persoonlijk');
 const u=C.berekenPeriode(kb.regels,kb.grootboeken,t,{eindstanden:true});
 assert.equal(u.resultaat,142000);assert.equal(u.afschrijvingen,12000);assert.equal(u.nietKas,10000);assert.equal(u.aflossingen,0,'eindstanden tellen nooit als aflossing');assert.equal(u.correctie,6000);
 assert.throws(()=>C.leesKolommenbalans([rij(1,{3:'Iets anders'})]),/geen kolommenbalans/);
});

test('aflossing uit twee eindstanden; meer lenen telt niet; lopend jaar is een prognose',()=>{
 const t={'nr:535':'lening-persoonlijk','nr:582':'lening-cooperatie'};
 const vorig={'nr:535':-693000,'nr:582':-127000},nu={'nr:535':-630000,'nr:582':-110000,'nr:999':-5};
 assert.equal(C.aflossingUitStanden(vorig,nu,t,'lening-cooperatie'),17000);assert.equal(C.aflossingUitStanden(vorig,nu,t,'lening-persoonlijk'),63000);
 assert.equal(C.aflossingUitStanden({'nr:582':-100000},{'nr:582':-150000},t,'lening-cooperatie'),0,'meer geleend');
 assert.deepEqual(C.leningStanden(C.leesKolommenbalans(kb2025),t),{'nr:535':-630000,'nr:582':-110000});
 const l=C.lopend({start:'2026-01-01',eind:'2026-12-31'},new Date(Date.UTC(2026,10,9)));assert.equal(l.lopend,true);assert.equal(l.maanden,10);assert.equal(l.factor,1.2);
 assert.equal(C.lopend({start:'2025-01-01',eind:'2025-12-31'},new Date(Date.UTC(2026,10,9))).lopend,false);
});

test('niets dubbel: elk bestand (vingerafdruk) één keer in de waardering; de nieuwste telt',()=>{
 const h='a'.repeat(64),u=(op,start='2025-01-01')=>({hash:h,naam:'kb.xlsx',administratie:'x',start,eind:'2025-12-31',op,standen:{'nr:582':-110000}});
 const w=W.parseWaardering({...W.leeg(),participaties:1,winst:{jaar:2026,nettoNaVpb:0,reservePct:30,dividend:0},snelstart:{toewijzing:{},uploads:[u('1'),u('2'),{hash:'kapot'}]}},null);
 assert.equal(w.snelstart.uploads.length,1);assert.equal(w.snelstart.uploads[0].op,'2');
 // Overnemen vervangt het jaar: de tabel staat geen twee regels voor hetzelfde jaar toe.
 const j={jaar:2025,soort:'vof',resultaat:1,afschrijvingen:0,herinvesteringen:0,nietKas:0,aflossingen:0,bron:'',correctie:0,correctieUitleg:''};
 assert.throws(()=>W.parseWaardering({...W.leeg(),participaties:1,winst:{jaar:2026,nettoNaVpb:0,reservePct:30,dividend:0},jaren:[j,j]},null),/één keer/);
});

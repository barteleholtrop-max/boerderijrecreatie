// Kennisbank voor gastmail (wens eigenaar 9 november 2026).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './helpers/ts-resolve.mjs';
import {allPgSql} from './helpers/pg-sql.mjs';
const {scrub,parseKbItem,chunk,trelloEntries,csvEntries,checkProposals,assistantKnowledge}=await import('../lib/kennisbank-core.ts');
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
test('gegevens van gasten gaan eruit, datums en tijden blijven',()=>{
 assert.equal(scrub('Mail anna@example.nl of bel 06-12345678'),'Mail [e-mail] of bel [telefoon]');
 assert.equal(scrub('IBAN NL91ABNA0417164300'),'IBAN [iban]');
 assert.equal(scrub('Op 2026-05-12 van 14:00 tot 16:00, 24 kinderen'),'Op 2026-05-12 van 14:00 tot 16:00, 24 kinderen');
});
test('een kennisitem moet compleet zijn',()=>{
 assert.deepEqual(parseKbItem({kind:'vraag',title:' Mag de hond mee? ',answer:'Ja, aangelijnd.'}),{kind:'vraag',title:'Mag de hond mee?',answer:'Ja, aangelijnd.'});
 assert.throws(()=>parseKbItem({kind:'x',title:'a',answer:'b'}),/soort/);
 assert.throws(()=>parseKbItem({kind:'regel',title:'',answer:'b'}),/titel/);
});
test('Trello-export: per kaart lijst, beschrijving en opmerkingen, zonder contactgegevens',()=>{
 const e=trelloEntries({cards:[{id:'c1',name:'Kinderfeest Jan',desc:'bel 0612345678',idList:'l1',dateLastActivity:'2026-05-12T10:00:00Z'}],lists:[{id:'l1',name:'Afgerond'}],actions:[{type:'commentCard',date:'2026-05-10T09:00:00Z',data:{card:{id:'c1'},text:'Pannenkoeken gekozen'}}]});
 assert.match(e[0],/Kaart: Kinderfeest Jan\nLijst: Afgerond\nDatum: 2026-05-12\nBeschrijving: bel \[telefoon\]\nOpmerking 2026-05-10: Pannenkoeken gekozen/);
 assert.throws(()=>trelloEntries({}),/Trello-export/);
});
test('Wix-CSV: komma of puntkomma, aanhalingstekens, lege velden weg',()=>{
 assert.deepEqual(csvEntries('Naam;Bericht;Mail\n"Piet";"Kan het op zondag; met 20?";piet@x.nl\n'),['Naam: Piet\nBericht: Kan het op zondag; met 20?\nMail: [e-mail]']);
 assert.deepEqual(csvEntries('a,b\n1,\n'),['a: 1']);
});
test('stukken blijven onder de grens',()=>{const c=chunk(['x'.repeat(7000),'y'.repeat(7000),'z'],12000);assert.equal(c.length,2);assert.ok(c.every(p=>p.length<=12000))});
test('voorstellen van de assistent: geen prijzen, geen contactgegevens, niets dubbel',()=>{
 const raw=JSON.stringify({items:[{kind:'vraag',title:'Mag de hond mee?',answer:'Ja, aangelijnd.'},{kind:'vraag',title:'Wat kost een feestje?',answer:'€ 12,50 per kind'},{kind:'regel',title:'Bellen',answer:'Bel [telefoon]'},{kind:'vraag',title:'Parkeren',answer:'Gratis bij de schuur.'},{kind:'werkwijze',title:'parkeren',answer:'dubbel'}]});
 assert.deepEqual(checkProposals('```json\n'+raw+'\n```',['Parkeren']).map(i=>i.title),['Mag de hond mee?']);
 assert.throws(()=>checkProposals('geen json',[]),/bruikbaar/);
});
test('de assistent krijgt goedgekeurde kennis, nieuwste eerst, binnen een vaste grootte',()=>{
 const k=assistantKnowledge([{kind:'vraag',title:'Oud',answer:'a',updated:'2026-01-01'},{kind:'regel',title:'Nieuw',answer:'b',updated:'2026-11-01'}]);
 assert.deepEqual(k.map(x=>x.vraag),['Nieuw','Oud']);assert.equal(k[0].soort,'Huisregel');
 assert.equal(assistantKnowledge([{kind:'vraag',title:'x',answer:'y'.repeat(500),updated:'1'}],100).length,0);
 assert.match(read('lib/guest-ai.ts'),/const data=\{products,knowledge,/);
 assert.match(allPgSql(),/ALTER TABLE "guest_kb" ENABLE ROW LEVEL SECURITY/);
});

test('WhatsApp-export als bron: Gast en Boerderijrecreatie in plaats van namen, per gesprek, alleen met een antwoord van ons',async()=>{
 const {whatsappEntries}=await import('../lib/kennisbank-core.ts');const {parseWhatsappExport}=await import('../lib/whatsapp-export.ts');
 const p=parseWhatsappExport([
  '01-05-2026 10:00 - Sanne de Vries: Mag onze hond mee op het erf?',
  '01-05-2026 10:05 - Boerderijrecreatie: Ja, aangelijnd mag hij mee. Bel gerust 06-12345678',
  '01-05-2026 10:06 - Sanne de Vries: IMG-1.jpg (bestand bijgevoegd)',
  '03-05-2026 09:00 - Sanne de Vries: Nog iets: zijn jullie zondag open?',
  '04-05-2026 09:00 - Piet: <Media weggelaten>',
  '04-05-2026 09:01 - Boerderijrecreatie: Graag gedaan!',
 ].join('\n'));
 const e=whatsappEntries(p.messages,'Boerderijrecreatie');
 assert.equal(e.length,2,'het losse bericht zonder antwoord van Boerderijrecreatie telt niet mee');
 assert.equal(e[0],'Datum: 2026-05-01\nGast: Mag onze hond mee op het erf?\nBoerderijrecreatie: Ja, aangelijnd mag hij mee. Bel gerust [telefoon]\nGast: [foto]');
 assert.ok(!e.join(' ').includes('Sanne'),'geen namen van gasten');
 assert.equal(e[1],'Datum: 2026-05-04\nGast: [bijlage]\nBoerderijrecreatie: Graag gedaan!');
 assert.deepEqual(whatsappEntries(p.messages,'Iemand anders'),[],'zonder Boerderijrecreatie geen stukken');
});

test('scherm en server: WhatsApp als bron in de kennisbank',()=>{
 const ui=read('app/gesprekken/kennisbank.tsx'),srv=read('lib/kennisbank.ts');
 assert.match(ui,/<option value="whatsapp">/);assert.match(ui,/whatsappEntries\(p\.messages,ours\)/);assert.match(ui,/namen in de export/);
 assert.match(srv,/SOURCES=\['trello','wix','tekst','whatsapp'\]/);
});

test('wie is Boerderijrecreatie: precies, hoofdletters, deel van de naam of „Boerderijrecreatie” in de naam',async()=>{
 const {pickOurName}=await import('../lib/kennisbank-core.ts');
 assert.equal(pickOurName(['Sanne','Boerderijrecreatie'],'Boerderijrecreatie Speelboerderij'),'Boerderijrecreatie','ingevulde naam langer dan in de export');
 assert.equal(pickOurName(['Sanne','Boerderijrecreatie Speelboerderij'],'boer bart'),'Boerderijrecreatie Speelboerderij');
 assert.equal(pickOurName(['Sanne','Piet'],'sanne'),'Sanne');
 assert.equal(pickOurName(['Sanne','Piet'],'Boerderijrecreatie'),'','niet te raden: dan kiest de gebruiker');
 assert.equal(pickOurName(['Boerderijrecreatie','Boerderijrecreatie winkel'],''),'','twee kandidaten: niet gokken');
});

// Vrijwilliger (wens eigenaar 8 november 2026): geen stemrecht en geen deel in een pot; vergoeding per dienst of per maand als BB,
// samen hoogstens € 160 per kalendermaand; een eigen vrijwilligersafspraak in plaats van de ledenafspraak.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './helpers/ts-resolve.mjs';
const {volunteerCredits}=await import('../lib/volunteer-core.ts');
const {parseMemberFields,VOLUNTEER_MAX_CENTS}=await import('../lib/members-core.ts');
const {buildAgreement,defaultAgreementRules,agreementText}=await import('../lib/member-agreement-core.ts');
const base={participantId:'v1',month:'2026-11',today:'2026-11-20',done:new Set(),earnedCents:0};
test('per dienst: één keer per gewerkte dag, nooit boven € 160 per maand',()=>{
 const days=Array.from({length:20},(_,i)=>'2026-11-'+String(i+1).padStart(2,'0'));
 const c=volunteerCredits({...base,basis:'dienst',cents:1000,workedDays:[...days,'2026-11-01','2026-11-25']});
 assert.equal(c.reduce((n,x)=>n+x.amountCents,0),VOLUNTEER_MAX_CENTS);assert.equal(c.length,16);assert.ok(c.every(x=>x.source.startsWith('vrijwilliger:2026-11-')));
 assert.ok(!c.some(x=>x.day==='2026-11-25'),'geen dag in de toekomst');
 assert.equal(volunteerCredits({...base,basis:'dienst',cents:1000,workedDays:['2026-11-02'],done:new Set(['vrijwilliger:2026-11-02'])}).length,0,'niet dubbel');
 const last=volunteerCredits({...base,basis:'dienst',cents:1000,workedDays:['2026-11-03'],earnedCents:15500});assert.equal(last[0].amountCents,500);assert.match(last[0].note,/maximum/);
});
test('per maand: één keer per maand, vanaf de eerste',()=>{
 const c=volunteerCredits({...base,basis:'maand',cents:12000,workedDays:[]});assert.deepEqual(c.map(x=>[x.source,x.amountCents,x.day]),[['vrijwilliger:2026-11',12000,'2026-11-01']]);
 assert.equal(volunteerCredits({...base,basis:'maand',cents:12000,workedDays:[],done:new Set(['vrijwilliger:2026-11'])}).length,0);
 assert.equal(volunteerCredits({...base,basis:'maand',cents:0,workedDays:[]}).length,0);
});
test('ledenkaart: vrijwilliger niet samen met A- of B-lid, bedrag tot € 160',()=>{
 const f=(x)=>parseMemberFields({memberClass:'',memberSince:'',voting:'auto',units:['restaurant'],...x},'2026-11-08');
 assert.deepEqual((({volunteer,volunteerCents,volunteerBasis})=>({volunteer,volunteerCents,volunteerBasis}))(f({volunteer:true,volunteerCents:1500,volunteerBasis:'dienst'})),{volunteer:true,volunteerCents:1500,volunteerBasis:'dienst'});
 assert.throws(()=>f({memberClass:'B',volunteer:true}),/deelt niet mee in een pot/);
 assert.throws(()=>f({volunteer:true,volunteerCents:16100}),/€ 160/);
 assert.equal(f({memberClass:'C',volunteer:true,volunteerCents:500}).volunteer,true,'C-lid kan ook vrijwilliger zijn');
});
test('vrijwilligersafspraak: geen lidmaatschap, geen winstvoorschot, wel vergoeding en maximum',()=>{
 const src={id:'v1',name:'Ingeborg',memberClass:'',units:['vrijwilliger'],roles:[{key:'vrijwilliger',group:'cooperatie',roleId:'vrijwilliger',name:'Vrijwilliger'}],contractKey:'vrijwilliger'};
 const d=buildAgreement(src,defaultAgreementRules()),t=agreementText(d);
 assert.equal(d.contractKey,'vrijwilliger');assert.match(t,/^Vrijwilligersafspraak/);assert.match(t,/€ 160 per kalendermaand/);
 assert.doesNotMatch(t,/Voorschot op de winst, BB-tegoed/);assert.doesNotMatch(t,/Lid van de Boer Bart-coöperatie/);
});
test('pot en overleg: vrijwilligers staan in het rooster maar delen niet en beslissen niet mee',()=>{
 const pa=fs.readFileSync(new URL('../lib/pot-agreements.ts',import.meta.url),'utf8'),pd=fs.readFileSync(new URL('../lib/pot-days.ts',import.meta.url),'utf8'),ov=fs.readFileSync(new URL('../lib/overleg.ts',import.meta.url),'utf8');
 assert.match(pa,/shareholdersOf=.*filter\(p=>!p\.volunteer\)/);assert.match(pa,/const required=shareholdersOf\(/);
 assert.match(pd,/shifts:use\.shifts\.filter\(s=>!volunteers\.has\(s\.participantId\)\)/);assert.match(ov,/return shareholdersOf\(all,pot as PotId\)/);
});
test('Soort lid: Vrijwilligerslid als keuze, opgeslagen als geen soort met vrijwilligersmarkering',async()=>{
 const {memberClassLabel,VOLUNTEER_CLASS_LABEL}=await import('../lib/members-core.ts');
 assert.equal(memberClassLabel('',true),VOLUNTEER_CLASS_LABEL);assert.equal(memberClassLabel('',false),'');assert.match(memberClassLabel('C',true),/^C-lid/);
 const page=fs.readFileSync(new URL('../app/leden/page.tsx',import.meta.url),'utf8');
 assert.match(page,/<option value=\{VOLUNTEER_CHOICE\}>\{VOLUNTEER_CLASS_LABEL\}<\/option>/,'keuze Vrijwilligerslid in de lijst Soort lid');
});
test('Werkt in: Groepen & feesten is weg, een oude aanvinking blokkeert opslaan niet',async()=>{
 const {UNITS,parseMemberFields}=await import('../lib/members-core.ts');
 assert.ok(!UNITS.some(([k])=>k==='groepen'));
 assert.deepEqual(parseMemberFields({memberClass:'C',memberSince:'',voting:'auto',units:['winkel','groepen']},'2026-11-08').units,['winkel']);
});
test('winkelrooster: vrijwilligers van de winkel wel, winkelpot niet, dienst telt voor de vergoeding',()=>{
 const shop=fs.readFileSync(new URL('../lib/member-shop.ts',import.meta.url),'utf8');
 assert.match(shop,/Number\(p\.volunteer\)===1\?readUnits\(p\.units\)\.includes\('winkel'\)/,'vrijwilliger met Boerderijwinkel in het rooster');
 assert.match(shop,/Number\(people\.find\(p=>p\.id===viewer\)\?\.volunteer\)===1\?null:1/,'geen verplicht minimum voor vrijwilligers');
 assert.match(fs.readFileSync(new URL('../lib/shop-pot.ts',import.meta.url),'utf8'),/AND COALESCE\(p\.volunteer,0\)=0/,'geen deel in de winkelpot');
 assert.match(fs.readFileSync(new URL('../lib/volunteer.ts',import.meta.url),'utf8'),/FROM member_shop_shifts WHERE participant_id=\? AND cancelled=''/,'winkeldienst telt als gewerkte dag');
 assert.match(fs.readFileSync(new URL('../app/deelnemer/[token]/lid-pagina.tsx',import.meta.url),'utf8'),/\(volunteer&&card\.unitKeys\.includes\('winkel'\)\)/);
});
test('database: de BB-soort vrijwilliger is toegestaan (anders wordt de vergoeding online geweigerd)',()=>{
 assert.match(fs.readFileSync(new URL('../drizzle-pg/0052_bb_vrijwilliger.sql',import.meta.url),'utf8'),/'vrijwilliger'/);
 assert.match(fs.readFileSync(new URL('../db/schema.ts',import.meta.url),'utf8'),/bb_entries_kind',sql`kind in \('pot-week','winkel-week','vrijwilliger'/);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import './helpers/ts-resolve.mjs';
const {regularHours,specialHours,hoursPayload,profileEvents,eventPost,planPosts,googleProblem,BUSINESS_SCOPE,hash}=await import('../lib/google-profile-core.ts');
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const closed={open:false,from:'10:00',to:'17:00'},open=(from,to)=>({open:true,from,to});

test('vaste openingstijden: Planning-week (0 = zondag) wordt de Google-weekdag',()=>{
 const week=[closed,closed,open('10:00','17:30'),open('10:00','17:00'),open('10:00','17:00'),open('10:00','21:00'),open('09:30','17:00')];
 const {periods}=regularHours(week);
 assert.equal(periods.length,5);
 assert.deepEqual(periods[0],{openDay:'TUESDAY',openTime:{hours:10},closeDay:'TUESDAY',closeTime:{hours:17,minutes:30}});
 assert.equal(periods.at(-1).openDay,'SATURDAY');assert.deepEqual(periods.at(-1).openTime,{hours:9,minutes:30});
 assert.equal(periods.some(p=>p.openDay==='SUNDAY'||p.openDay==='MONDAY'),false);
 // Ongeldige tijden (tot vóór vanaf) gaan niet naar Google.
 assert.equal(regularHours([open('17:00','10:00')]).periods.length,0);
});

test('afwijkende dagen: gesloten of andere tijden, vanaf vandaag en hooguit een jaar vooruit',()=>{
 const ex=[{date:'2026-12-25',hours:closed},{date:'2026-12-24',hours:open('10:00','15:00')},{date:'2026-11-01',hours:closed},{date:'2027-11-05',hours:closed},{date:'fout',hours:closed}];
 const {specialHourPeriods}=specialHours(ex,'2026-11-04');
 assert.deepEqual(specialHourPeriods,[
  {startDate:{year:2026,month:12,day:24},openTime:{hours:10},endDate:{year:2026,month:12,day:24},closeTime:{hours:15}},
  {startDate:{year:2026,month:12,day:25},closed:true},
 ]);
 const p=hoursPayload({hours:[closed],exceptions:[]},'2026-11-04');
 assert.deepEqual(Object.keys(p),['regularHours','specialHours']);
});

const ev=(o)=>({id:'e1',date:'2026-11-20',from:'19:00',to:'22:00',title:'Pubquiz in de schuur',holiday:false,...o});
test('evenementen: alleen eigen, toekomstige evenementen; geen feestdagen of voorbeelden',()=>{
 const list=profileEvents([ev({}),ev({id:'f',holiday:true}),ev({id:'v',example:true}),ev({id:'oud',date:'2026-11-01'}),ev({id:'leeg',title:'  '})],'2026-11-04');
 assert.deepEqual(list.map(e=>e.id),['e1']);
 assert.equal(profileEvents(Array.from({length:30},(_,i)=>ev({id:'x'+i})),'2026-11-04').length,20);
});

test('evenementbericht: soort EVENT, titel ingekort, knop naar de website als die er is',()=>{
 const p=eventPost(ev({title:'x'.repeat(80),description:'Kom gezellig'}),'https://www.example.nl/');
 assert.equal(p.topicType,'EVENT');assert.equal(p.languageCode,'nl');assert.equal(p.summary,'Kom gezellig');
 assert.equal(p.event.title.length,58);
 assert.deepEqual(p.event.schedule,{startDate:{year:2026,month:11,day:20},startTime:{hours:19},endDate:{year:2026,month:11,day:20},endTime:{hours:22}});
 assert.deepEqual(p.callToAction,{actionType:'LEARN_MORE',url:'https://www.example.nl/'});
 assert.equal('callToAction' in eventPost(ev({}),''),false);
});

test('berichten plannen: nieuw, bijwerken, weghalen en ongewijzigd laten',()=>{
 const same=eventPost(ev({id:'gelijk'}),'');
 const posted=[{eventId:'gelijk',postName:'accounts/1/locations/2/localPosts/a',hash:hash(same)},{eventId:'e1',postName:'accounts/1/locations/2/localPosts/b',hash:'oud'},{eventId:'weg',postName:'accounts/1/locations/2/localPosts/c',hash:'x'}];
 const plan=planPosts([ev({id:'gelijk'}),ev({}),ev({id:'nieuw'})],posted,'','2026-11-04');
 assert.deepEqual(plan.create.map(c=>c.eventId),['nieuw']);
 assert.deepEqual(plan.update.map(c=>[c.eventId,c.postName]),[['e1','accounts/1/locations/2/localPosts/b']]);
 assert.deepEqual(plan.remove,[{eventId:'weg',postName:'accounts/1/locations/2/localPosts/c'}]);
 // Een voorbij evenement verdwijnt van Google.
 assert.equal(planPosts([ev({date:'2026-11-01'})],[{eventId:'e1',postName:'p',hash:'h'}],'','2026-11-04').remove.length,1);
});

test('meldingen van Google zijn begrijpelijk en zeggen dat er niets is gewijzigd',()=>{
 assert.match(googleProblem(429),/nog niet goedgekeurd/);
 assert.match(googleProblem(403,'Quota exceeded for quota metric'),/nog niet goedgekeurd/);
 assert.match(googleProblem(403,'The caller does not have permission'),/niet beheren/);
 assert.match(googleProblem(401),/Koppel opnieuw/);
 assert.match(googleProblem(404),/niet gevonden/);
 assert.match(googleProblem(500,'boom'),/\(500: boom\)/);
});

test('database: tabellen voor de koppeling en de geplaatste berichten',()=>{
 const dir=new URL('../drizzle/',import.meta.url),files=fs.readdirSync(dir).filter(n=>n.endsWith('.sql')).sort();
 const db=new DatabaseSync(':memory:');for(const n of files)db.exec(fs.readFileSync(new URL(n,dir),'utf8'));
 db.prepare("INSERT INTO gbp_link (id) VALUES ('main')").run();
 const l=db.prepare("SELECT sync_hours,sync_events,lock_until,refresh_sealed FROM gbp_link").get();
 assert.equal(l.sync_hours,1);assert.equal(l.sync_events,1);assert.equal(l.lock_until,0);assert.equal(l.refresh_sealed,null);
 db.prepare("INSERT INTO gbp_posts (event_id,post_name,hash,updated) VALUES ('e1','accounts/1/locations/2/localPosts/3','h','nu')").run();
 assert.throws(()=>db.prepare("INSERT INTO gbp_posts (event_id,post_name,hash,updated) VALUES ('e1','x','h','nu')").run());
});

test('koppeling: alleen het recht om het profiel te beheren, eigen terugkeer en alleen de eigenaar',()=>{
 assert.equal(BUSINESS_SCOPE,'https://www.googleapis.com/auth/business.manage');
 const lib=read('../lib/google-profile.ts'),cb=read('../app/api/mail/oauth/callback/route.ts'),api=read('../app/api/google-profiel/route.ts'),start=read('../app/api/google-profiel/koppelen/route.ts');
 assert.match(lib,/purpose:'google-profiel'/);assert.match(lib,/refreshSealed:await seal\(/);
 assert.match(cb,/oauthPurpose\(state\)==='google-profiel'\)return profileCallback/);
 assert.match(api,/authorizeSheet\(req\);/);assert.match(api,/authorizeSheet\(req,true\)/);assert.match(start,/authorizeSheet\(req\)/);
 // Wijzigingen in Planning starten meteen een ronde; daarnaast elk half uur.
 assert.match(read('../app/api/gasten/route.ts'),/\['hours','exception','event','event-remove'\]\.includes\(action\)[^\n]*google-profiel-sync/);
 assert.match(read('../lib/assistant-jobs.ts'),/'google-profiel-sync':/);
 assert.match(read('../lib/assistant-jobs.ts'),/1800000\),'google-profiel-sync'/);
});

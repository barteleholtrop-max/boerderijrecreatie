// Database-kant van de Backoffice-assistent: gesprekken (assistant_threads met domein 'backoffice'), berichten, acties (proposals
// met soort 'actie') en het uitvoeren. Sinds 13 november 2026 voert de assistent een actie meteen uit (wens eigenaar: „heeft alle
// rechten”); de actie blijft als kaart in het gesprek met de uitkomst. Geen nieuwe tabellen: dezelfde opslag als de
// Weekassistent, dus ook dezelfde bewaartermijn (14 dagen) en dezelfde dagelijkse limiet.
import Anthropic from '@anthropic-ai/sdk';
import {env} from '@/lib/portable/env';
import {withConnectionSettings} from './connection-settings';
import {amsterdamDate,photoBlock,type Photo} from './assistant-core';
import {runTurn,configErrorNote,type StoredMessage} from './assistant-engine';
import {aiConfigured,engineConfig,getThread,threadExpired,threadMessages,type Thread} from './assistant-store';
import {anthropicKey,anthropicHeaders} from './integrations';
import {enqueue} from './outbox';
import {HULP_SYSTEM_PROMPT} from './hulp-prompt';
import {TOOL_DEFINITIONS,runTool,ACTION_TYPES,type Action,type HulpContext,type ActionType} from './hulp-tools';
import {executeAction,ActionError,type ActionDeps,type Route} from './hulp-actions';

export {aiConfigured};
export const HULP_DOMAIN='backoffice';
export const ACTION_TTL_HOURS=24;
const dutchNow=(d:Date)=>new Intl.DateTimeFormat('nl-NL',{weekday:'long',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Amsterdam'}).format(d);

const ADD_MESSAGE_SQL=`INSERT INTO assistant_messages(id, thread_id, seq, role, account, source, text, content, sources, created)
 SELECT ?1::text, ?2::text, COALESCE(MAX(seq),0)+1, ?3::text, ?4::text, 'tekst', ?5::text, ?6::text, ?7::text, ?8::text FROM assistant_messages WHERE thread_id=?2::text`;
const TOUCH_SQL=`UPDATE assistant_threads SET updated=?2 WHERE id=?1`;
const INSERT_ACTION_SQL=`INSERT INTO proposals(id, request_id, kind, domain, title, summary, payload, status, version, thread_id, created_by, created) VALUES(?1, ?1, 'actie', 'backoffice', ?2, ?3, ?4, 'concept', 1, ?5, 'assistent', ?6)`;
const CLAIM_ACTION_SQL=`UPDATE proposals SET status=?5, version=version+1, decided_by=?2, decided_at=?3, decision_request_id=?4 WHERE id=?1 AND kind='actie' AND status='concept' RETURNING id`;
const FINISH_ACTION_SQL=`UPDATE proposals SET status=?2, decision_note=?3 WHERE id=?1 AND kind='actie' AND status='bezig'`;

const userContent=(account:string,page:string,text:string,now:Date,photo:Photo|null=null)=>[{type:'text',text:`(Bericht van ${account}, ${dutchNow(now)}, vandaag is ${amsterdamDate(now)}${page?`, op het scherm ${page}`:''}${photo?', met een foto':''})`},...(photo?[photoBlock(photo)]:[]),{type:'text',text}];

/** Nieuw gesprek met het eerste bericht. De id is ook de aanvraag-id: twee keer klikken maakt niets dubbel. */
export async function startHulpThread(id:string,account:string,page:string,text:string,now=new Date(),photo:Photo|null=null){
 const iso=now.toISOString();
 await env.DB.batch([
  env.DB.prepare(`INSERT INTO assistant_threads(id, domain, week, account, title, status, created, updated) VALUES(?1, 'backoffice', ?2, ?3, ?4, 'open', ?5, ?5)`).bind(id,amsterdamDate(now),account,text.slice(0,80),iso),
  env.DB.prepare(ADD_MESSAGE_SQL).bind(id+'-start',id,'user',account,text,JSON.stringify(userContent(account,page,text,now,photo)),'[]',iso),
 ]);
}
export async function addHulpMessage(id:string,threadId:string,account:string,page:string,text:string,now=new Date(),photo:Photo|null=null){
 const iso=now.toISOString();
 await env.DB.batch([env.DB.prepare(ADD_MESSAGE_SQL).bind(id,threadId,'user',account,text,JSON.stringify(userContent(account,page,text,now,photo)),'[]',iso),env.DB.prepare(TOUCH_SQL).bind(threadId,iso)]);
}
export async function hulpThread(id:string,account:string):Promise<Thread|null>{
 const t=await getThread(id);
 return t&&t.domain===HULP_DOMAIN&&t.account===account?t:null;
}
export async function recentHulpThreads(account:string){
 return (await env.DB.prepare(`SELECT id, title, updated FROM assistant_threads WHERE domain='backoffice' AND account=? ORDER BY updated DESC LIMIT 10`).bind(account).all()).results as {id:string;title:string;updated:string}[];
}
export type ActionView={id:string;type:string;title:string;details:string[];status:string;note:string;created:string;expired:boolean};
export async function threadActions(threadId:string,now=new Date()):Promise<ActionView[]>{
 const rows=(await env.DB.prepare(`SELECT id, title, payload, status, decision_note AS note, created FROM proposals WHERE kind='actie' AND thread_id=? ORDER BY created`).bind(threadId).all()).results as {id:string;title:string;payload:string;status:string;note:string;created:string}[];
 return rows.map(r=>{const p=JSON.parse(r.payload) as Action;return {id:r.id,type:p.type,title:r.title,details:p.details||[],status:r.status,note:r.note||'',created:r.created,expired:actionExpired(r.created,now)}});
}
export const actionExpired=(created:string,now=new Date())=>Date.parse(created)<now.getTime()-ACTION_TTL_HOURS*3600000;
export async function hulpPending(threadId:string){
 const job=await env.DB.prepare(`SELECT status, attempts FROM outbox_jobs WHERE kind='hulp-antwoord' AND (payload::jsonb->>'threadId')=? AND status IN ('wachtend','bezig') ORDER BY id DESC LIMIT 1`).bind(threadId).first() as {status:string;attempts:number}|null;
 return job?{status:job.status,delayed:job.attempts>1}:null;
}
export async function answerHulpLater(threadId:string,key:string){
 await enqueue('hulp:'+threadId+':'+key,'hulp-antwoord',{threadId});
 const {tick}=await import('./assistant-jobs');void tick();
}

// ---- Gegevens voor de hulpmiddelen en het uitvoeren van een actie. Ook gebruikt door de Weekassistent (lib/assistant-store.ts).
/** Oorsprong voor de interne aanvraag aan een backoffice-route: de publieke oorsprong, anders de online backoffice. */
export const appOrigin=()=>new URL(process.env.APP_ORIGIN||'https://boerbart-backoffice-206627521194.europe-west3.run.app').origin;
export async function hulpContext(thread:Thread,now=new Date()):Promise<HulpContext>{return context(thread,now)}
async function context(thread:Thread,now=new Date()):Promise<HulpContext>{
 const today=amsterdamDate(now);
 return {
  today,
  roster:async(pot,from,days)=>{const {roster}=await import('./pot-planning');const r=await roster(pot,from,days);
   return {pot:r.pot,vandaag:r.today,leden:r.members.map(m=>({lid_id:m.id,naam:m.name})),dagen:r.days.map(d=>({dag:d.day,open:d.open,voorbij:d.past,week_ligt_vast:d.locked,pot_afspraak:d.hasAgreement,nodig:d.needed,bezet:d.filled,
    rollen:d.slots.map(s=>({rol_id:s.roleId,rol:s.roleName,nodig:s.need,open_plekken:s.open,weektaak:s.week,mensen:s.people.map(p=>({lid_id:p.participantId,naam:p.name,status:p.status,aangeboden:p.offered}))}))}))}},
  members:async()=>{const {memberCards}=await import('./members');return (await memberCards()).members.map(m=>({id:m.id,name:m.name,email:m.email,active:m.active,phone:m.phone,address:m.address,memberSince:m.memberSince,memberClass:m.memberClass,units:m.units,potRoles:m.potRoles}))},
  rollenlijst:async()=>{const {overview}=await import('./pot-roles');return overview()},
  roles:async()=>{const {roleCatalogue}=await import('./members');return (await roleCatalogue()).map(p=>({pot:p.pot,name:p.name,roles:p.roles.map(r=>({id:r.id,name:r.name}))}))},
  products:async()=>{
   const {isDeleted}=await import('./product-trash');
   const rows=(await env.DB.prepare(`SELECT id, draft, published FROM products`).all()).results as {id:string;draft:string;published:string|null}[];
   return rows.map(r=>{const d=JSON.parse(r.draft) as Record<string,unknown>;return {id:r.id,name:String(d.name||''),department:String(d.department||''),priceCents:Number(d.priceCents)||0,vat:String(d.vat||''),published:!!r.published,available:d.available!==false,note:String(d.note||''),deleted:isDeleted(d),photo:typeof d.photo==='string'?d.photo:''}});
  },
  bloei:async id=>{const {realOverview}=await import('./bloei-real-store');return await realOverview(id) as unknown as Record<string,unknown>|null},
  finance:async(part,week,year)=>{
   switch(part){
    case 'overzicht':{const {bankOverview}=await import('./bank-split');return bankOverview()}
    case 'bankverdeling':{const {splitView}=await import('./bank-split');return splitView(week)}
    case 'maandagvraag':{const {mondayView}=await import('./bb-payout');return mondayView(week)}
    case 'rente':{const {renteView}=await import('./rente-payout');return renteView(year)}
    case 'open_rekeningen':{const {openBills}=await import('./group-bill');return openBills()}
    case 'achterstallig':{const {overdueBills}=await import('./group-bill');return overdueBills()}
    case 'facturen':{const {invoicedBills}=await import('./group-bill');return invoicedBills()}
    case 'dividend':{const {dividendOverview}=await import('./dividend');return dividendOverview()}
   }
  },
  media:async()=>{
   const rows=(await env.DB.prepare(`SELECT id, name, mime FROM media`).all()).results as {id:string;name:string;mime:string}[];
   return rows.filter(r=>/^image\//.test(r.mime)).map(r=>({id:r.id,name:r.name}));
  },
  hours:async()=>{
   const {loadGuest}=await import('./guest-store'),{state}=await loadGuest();
   const names=['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'];
   return {weekly:[1,2,3,4,5,6,0].map(n=>({dag:names[n],open:state.hours[n].open,van:state.hours[n].from,tot:state.hours[n].to})),
    exceptions:state.exceptions.map(e=>({datum:e.date,open:e.hours.open,van:e.hours.from,tot:e.hours.to,notitie:e.note})).sort((a,b)=>a.datum.localeCompare(b.datum))};
  },
  signals:async()=>{const {staffSignals}=await import('./pot-planning');return staffSignals()},
  afspraken:async q=>{const {search}=await import('./overleg');return search(q)},
  contracts:async id=>{const {assistantContractsView}=await import('./member-agreements');return assistantContractsView(id)},
  roleContract:async(pot,id)=>{const {roleContractView}=await import('./role-contracts');return roleContractView(pot,id)},
  // Gasten (wens eigenaar 9 november 2026): klantenkaarten, agenda en of een optie past. Alleen lezen.
  customers:async()=>{const {loadGuest}=await import('./guest-store'),{customerCards}=await import('./guest-customers'),{mailConversations}=await import('./mail-store'),{state}=await loadGuest();
   const threads=[...state.threads.filter(t=>t.channel!=='gmail'),...await mailConversations().catch(()=>[])];
   return customerCards({...state,threads}).map(c=>({id:c.id,name:c.name,email:c.email,phone:c.phone,company:c.company,address:c.address,notes:c.notes,bookings:c.reservationIds.length,conversations:c.threadIds.length}))},
  agenda:async(from,days)=>{const {loadGuest}=await import('./guest-store'),{overviewRange}=await import('./guest-overview'),{state}=await loadGuest();
   return overviewRange(state,from,days).map(d=>({dag:d.date,open:d.open,openingstijden:d.hours,notitie:d.note,feestdagen:d.holidays,
    boekingen:d.items.filter(i=>i.kind!=='evenement'&&i.status!=='verlopen').map(i=>({id:i.id,soort:i.kind,van:i.from,tot:i.to,naam:i.title,personen:i.people,status:i.status,...(i.status==='optie'?{optie_geldig_tot:(i.expires||'').slice(0,10)}:{}),...(i.exception?{uitzondering:i.exception}:{})})),
    afspraken:(state.appointments||[]).filter(a=>a.date===d.date).sort((a,b)=>a.from.localeCompare(b.from)).map(a=>({van:a.from,tot:a.to,onderwerp:a.subject,klant:a.customerName})),
    evenementen:d.items.filter(i=>i.kind==='evenement').map(i=>({van:i.from,tot:i.to,titel:i.title})),
    dagdelen:d.parts.map(p=>({naam:p.name,van:p.from,tot:p.to,groep:p.groep.max?`${p.groep.used} van ${p.groep.max}`:'geen grens',daggasten:p.bezoek.max?`${p.bezoek.used} van ${p.bezoek.max}`:'geen grens'}))}))},
  checkOption:async o=>{const {loadGuest}=await import('./guest-store'),{validateBooking}=await import('./guest-core'),{state}=await loadGuest();
   try{validateBooking(state,{id:'controle',name:'controle',email:'',phone:'',activity:o.activity,date:o.date,from:o.from,to:o.to,people:o.people,sharing:false,status:o.status==='bevestigd'?'bevestigd':'optie',expires:new Date(Date.now()+86400000).toISOString(),notes:'',threadId:'',tables:[],...(o.exception?{exception:o.exception}:{})});return null}
   catch(e){return e instanceof Error?e.message:'Past niet.'}},
  propose:async a=>{const {id}=await saveAction(thread.id,a);return {id,...await executeNow(id,thread.id,a,thread.account)}},
 };
}

/** Een klaargezette actie: wacht in het gesprek op Uitvoeren of Annuleren. */
export async function saveAction(threadId:string,a:Action,now=new Date()){
 const id=crypto.randomUUID();
 await env.DB.prepare(INSERT_ACTION_SQL).bind(id,a.title.slice(0,200),a.details.join(' · ').slice(0,1000),JSON.stringify(a),threadId,now.toISOString()).run();
 return {id};
}

/** Achtergrondtaak: beantwoordt de open berichten van één gesprek. */
export async function answerHulpThread(threadId:string){return withConnectionSettings(()=>answer(threadId))}
async function answer(threadId:string){
 const thread=await getThread(threadId);if(!thread||thread.domain!==HULP_DOMAIN)return;
 const append=async(m:{role:string;text:string;content:unknown;sources:unknown})=>{const now=new Date().toISOString();await env.DB.batch([env.DB.prepare(ADD_MESSAGE_SQL).bind(crypto.randomUUID(),threadId,m.role,'assistent',m.text,JSON.stringify(m.content),JSON.stringify(m.sources),now),env.DB.prepare(TOUCH_SQL).bind(threadId,now)])};
 const apiKey=await anthropicKey();
 if(!apiKey){await append({role:'notitie',text:'De assistent is nog niet ingesteld: voeg een Claude-sleutel toe bij Systeem & koppelingen. Je bericht is bewaard.',content:[],sources:[]});return}
 if(threadExpired(thread)){await append({role:'notitie',text:'Dit gesprek is ouder dan twee weken. Begin een nieuw gesprek.',content:[],sources:[]});return}
 const store={
  messages:async():Promise<StoredMessage[]>=>(await threadMessages(threadId)).map(r=>({seq:r.seq,role:r.role as StoredMessage['role'],content:JSON.parse(r.content)})),
  append,
  callsToday:async()=>Number((await env.DB.prepare(`SELECT COUNT(*) AS n FROM assistant_messages WHERE role='assistant' AND created>=?`).bind(new Date(Date.now()-86400000).toISOString()).first() as {n:number}).n),
 };
 const client=new Anthropic({apiKey,maxRetries:2,defaultHeaders:await anthropicHeaders()});
 try{await runTurn(store,await context(thread),params=>client.beta.messages.create(params),engineConfig(),{system:HULP_SYSTEM_PROMPT,tools:TOOL_DEFINITIONS,runTool})}
 catch(e){
  if(e instanceof Anthropic.AuthenticationError||e instanceof Anthropic.PermissionDeniedError||e instanceof Anthropic.BadRequestError||e instanceof Anthropic.NotFoundError){
   console.error('[hulp] instelling of verzoek ongeldig:',e.message);
   await append({role:'notitie',text:configErrorNote(e.status,e.message,engineConfig().model),content:[],sources:[]});return;
  }
  throw e;
 }
}

// ---- Uitvoeren of annuleren (alleen door een beheerder, met een klik in het gesprek)
const ROUTES:Record<Route,()=>Promise<{POST:(r:Request)=>Promise<Response>}>>={
 'pot-planning':()=>import('@/app/api/pot-planning/route'),
 cooperatie:()=>import('@/app/api/cooperatie/route'),
 leden:()=>import('@/app/api/leden/route'),
 products:()=>import('@/app/api/products/route'),
 gasten:()=>import('@/app/api/gasten/route'),
 overleg:()=>import('@/app/api/overleg/route'),
 'leden/afspraken':()=>import('@/app/api/leden/afspraken/route'),
 rollen:()=>import('@/app/api/rollen/route'),
 bank:()=>import('@/app/api/bank/route'),
 rekeningen:()=>import('@/app/api/rekeningen/route'),
};
/** Dezelfde aanvraag als de knop op het scherm, met de rechten van de beheerder die klikte. */
function deps(account:string,origin:string):ActionDeps{
 return {
  post:async(route,body)=>{
   const {POST}=await ROUTES[route]();
   const res=await POST(new Request(origin+'/api/'+route,{method:'POST',body:JSON.stringify(body),headers:{'content-type':'application/json',origin,'sec-fetch-site':'same-origin',
    'x-boer-bart-verified-user':'owner','x-boer-bart-account':account,'x-boer-bart-role':'eigenaar'}}));
   const data=await res.json().catch(()=>({})) as Record<string,unknown>;
   return {ok:res.ok,status:res.status,data:data&&typeof data==='object'&&!Array.isArray(data)?data:{}};
  },
  participant:async id=>{const {overview}=await import('./coop-store');return (await overview()).participants.find(p=>p.id===id)||null},
  card:async id=>{const {memberCards}=await import('./members');const m=(await memberCards()).members.find(m=>m.id===id);return m?{version:m.version,memberClass:m.memberClass,memberSince:m.memberSince,voting:m.voting,phone:m.phone,address:m.address,units:m.units,bloeiMemberId:m.bloeiMemberId,potRoles:m.potRoles}:null},
  product:async id=>{const r=await env.DB.prepare(`SELECT version, draft, published FROM products WHERE id=?`).bind(id).first() as {version:number;draft:string;published:string|null}|null;return r?{version:Number(r.version),draft:JSON.parse(r.draft),published:!!r.published}:null},
  guest:async()=>{const {loadGuest}=await import('./guest-store'),g=await loadGuest();return {version:g.version,hours:g.state.hours,exceptions:g.state.exceptions,reservations:g.state.reservations as unknown as Record<string,unknown>[]}},
  contract:async(memberId,id)=>{const {assistantContractsView}=await import('./member-agreements'),v=await assistantContractsView(memberId),c=v.contracts.find(c=>c.id===id);return c?{...c,templateEditVersion:v.templateEditVersion}:null},
  roleContract:async(pot,id)=>{const {roleContractView}=await import('./role-contracts');return roleContractView(pot,id)},
  uuid:()=>crypto.randomUUID(),
 };
}
export class HulpError extends Error{status:number;constructor(m:string,s=400){super(m);this.status=s}}

/** Direct uitvoeren (wens eigenaar 13 november 2026), met de rechten van wie het gesprek voert. Geen melding in het gesprek:
 * de uitkomst gaat als resultaat van het hulpmiddel terug naar de assistent, en staat op de actiekaart. */
export async function executeNow(id:string,threadId:string,action:Action,account:string,now=new Date()):Promise<{status:'uitgevoerd'|'mislukt';result:string}>{
 const claimed=await env.DB.prepare(CLAIM_ACTION_SQL).bind(id,account,now.toISOString(),id,'bezig').first();
 if(!claimed)return {status:'mislukt',result:'Over deze actie is al beslist.'};
 let result:string,final:'uitgevoerd'|'mislukt';
 try{result=await executeAction(action,deps(account,appOrigin()));final='uitgevoerd'}
 catch(e){final='mislukt';result=e instanceof ActionError?e.message:'Er ging iets mis bij het uitvoeren. Er is mogelijk niets gewijzigd; controleer het scherm.';if(!(e instanceof ActionError))console.error('[hulp] uitvoeren:',e)}
 await env.DB.prepare(FINISH_ACTION_SQL).bind(id,final,result.slice(0,1000)).run();
 return {status:final,result};
}

export async function decideAction(o:{id:string;threadId:string;requestId:string;account:string;decision:'uitvoeren'|'annuleren';origin:string;now?:Date}){
 const now=o.now||new Date();
 const row=await env.DB.prepare(`SELECT id, payload, status, created, decision_request_id AS "requestId" FROM proposals WHERE id=? AND kind='actie' AND thread_id=?`).bind(o.id,o.threadId).first() as {id:string;payload:string;status:string;created:string;requestId:string|null}|null;
 if(!row)throw new HulpError('Deze actie bestaat niet (meer).',404);
 if(row.requestId===o.requestId)return {status:row.status,duplicate:true};
 if(row.status!=='concept')throw new HulpError('Over deze actie is al beslist.',409);
 const action=JSON.parse(row.payload) as Action;
 if(!ACTION_TYPES.includes(action.type as ActionType))throw new HulpError('Onbekende actie.');
 const expired=actionExpired(row.created,now);
 const status=o.decision==='annuleren'?'geannuleerd':expired?'vervallen':'bezig';
 const claimed=await env.DB.prepare(CLAIM_ACTION_SQL).bind(o.id,o.account,now.toISOString(),o.requestId,status).first();
 if(!claimed)throw new HulpError('Over deze actie is al beslist.',409);
 if(status==='vervallen')throw new HulpError(`Deze actie is ouder dan ${ACTION_TTL_HOURS} uur en vervallen. Vraag de assistent om hem opnieuw klaar te zetten.`,409);
 if(status==='geannuleerd'){await note(o.threadId,`${o.account} heeft de actie „${action.title}” geannuleerd. Er is niets gewijzigd.`,now);return {status}}
 let result:string,final:'uitgevoerd'|'mislukt';
 try{result=await executeAction(action,deps(o.account,o.origin));final='uitgevoerd'}
 catch(e){final='mislukt';result=e instanceof ActionError?e.message:'Er ging iets mis bij het uitvoeren. Er is mogelijk niets gewijzigd; controleer het scherm.';if(!(e instanceof ActionError))console.error('[hulp] uitvoeren:',e)}
 await env.DB.prepare(FINISH_ACTION_SQL).bind(o.id,final,result.slice(0,1000)).run();
 await note(o.threadId,final==='uitgevoerd'?`${o.account} klikte op Uitvoeren: „${action.title}” is uitgevoerd. ${result}`:`${o.account} klikte op Uitvoeren, maar „${action.title}” is NIET uitgevoerd. Reden van de backoffice: ${result}`,now);
 return {status:final,result};
}
/** Uitkomst van een beslissing als bericht in het gesprek, zodat de assistent bij een volgend bericht weet wat er gebeurde. */
async function note(threadId:string,text:string,now:Date){
 const iso=now.toISOString();
 await env.DB.batch([env.DB.prepare(ADD_MESSAGE_SQL).bind(crypto.randomUUID(),threadId,'user','systeem',text,JSON.stringify([{type:'text',text:'(Melding van de backoffice) '+text}]),'[]',iso),env.DB.prepare(TOUCH_SQL).bind(threadId,iso)]);
}

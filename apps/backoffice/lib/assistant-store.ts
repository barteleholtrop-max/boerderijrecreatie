import {withConnectionSettings} from './connection-settings';
// Database side of the Weekassistent: threads, messages, the tool context and the background answer job.
import Anthropic from '@anthropic-ai/sdk';
import {env} from '@/lib/portable/env';
import {loadOps} from './operations-store';
import {amsterdamDate,retentionCutoff,RETENTION_DAYS,photoBlock,type Photo} from './assistant-core';
import {runTurn,configErrorNote,DEFAULT_CONFIG,type StoredMessage,type EngineConfig} from './assistant-engine';
import type {ToolContext,ProductInfo,MenuItem,WeekMenuView} from './assistant-tools';
import {anthropicKey,anthropicHeaders} from './integrations';
import {SUPERSEDE_PROPOSALS_SQL,SUPERSEDE_MENUS_SQL,INSERT_MENU_SQL,INSERT_ITEM_SQL,INSERT_PROPOSAL_SQL,MENU_ITEMS_SQL,LATEST_MENU_SQL} from './weekmenu-sql';

// Configured when a Claude key is saved on Systeem & koppelingen (Gast-AI) or ANTHROPIC_API_KEY is set.
export const aiConfigured=async()=>!!(await anthropicKey());
export function engineConfig():EngineConfig{
 const effort=process.env.ASSISTANT_EFFORT;const limit=Number(process.env.ASSISTANT_DAILY_LIMIT);
 return {...DEFAULT_CONFIG,model:process.env.ASSISTANT_MODEL||DEFAULT_CONFIG.model,effort:effort==='low'||effort==='high'?effort:'medium',dailyLimit:Number.isInteger(limit)&&limit>0?limit:DEFAULT_CONFIG.dailyLimit};
}
const dutchDay=(day:string)=>new Intl.DateTimeFormat('nl-NL',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'));
const dutchNow=(d:Date)=>new Intl.DateTimeFormat('nl-NL',{weekday:'long',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Amsterdam'}).format(d);
export const weekTitle=(week:string)=>'Week van '+dutchDay(week).replace(/^\w+ /,'');

export type Thread={id:string;domain:string;week:string;account:string;title:string;status:string;created:string;updated:string};
/** A thread older than the retention period cannot continue: its first messages are being removed. */
export const threadExpired=(t:Thread,now=new Date())=>t.created<retentionCutoff(now,RETENTION_DAYS-1);

export async function getThread(id:string){return await env.DB.prepare(`SELECT id, domain, week, account, title, status, created, updated FROM assistant_threads WHERE id=?`).bind(id).first() as Thread|null}
export async function listThreads(){
 return (await env.DB.prepare(`SELECT id, domain, week, account, title, status, created, updated FROM assistant_threads WHERE domain='keuken' ORDER BY updated DESC LIMIT 20`).all()).results as Thread[];
}

const ADD_MESSAGE_SQL=`INSERT INTO assistant_messages(id, thread_id, seq, role, account, source, text, content, sources, created)
 SELECT ?1::text, ?2::text, COALESCE(MAX(seq),0)+1, ?3::text, ?4::text, 'tekst', ?5::text, ?6::text, ?7::text, ?8::text FROM assistant_messages WHERE thread_id=?2::text`;
const TOUCH_SQL=`UPDATE assistant_threads SET updated=?2 WHERE id=?1`;

/** Starts a thread with an opening message; id doubles as request id, so a repeated click creates nothing twice. */
export async function startThread(id:string,week:string,account:string,now=new Date()){
 const iso=now.toISOString();
 const opening=`(Weekgesprek geopend via de knop door ${account}. Moment: ${dutchNow(now)}. Het gesprek gaat over de ${weekTitle(week).toLowerCase()}.)\n\nGoedemorgen! Zullen we de week doornemen?`;
 await env.DB.batch([
  env.DB.prepare(`INSERT INTO assistant_threads(id, domain, week, account, title, status, created, updated) VALUES(?1, 'keuken', ?2, ?3, ?4, 'open', ?5, ?5)`).bind(id,week,account,weekTitle(week),iso),
  env.DB.prepare(ADD_MESSAGE_SQL).bind(id+'-start',id,'user',account,'Weekgesprek gestart',JSON.stringify([{type:'text',text:opening}]),'[]',iso),
 ]);
}
export async function addUserMessage(id:string,threadId:string,account:string,text:string,now=new Date(),photo:Photo|null=null){
 const iso=now.toISOString();
 const content=[{type:'text',text:`(Bericht van ${account}, ${dutchNow(now)}${photo?', met een foto':''})`},...(photo?[photoBlock(photo)]:[]),{type:'text',text}];
 await env.DB.batch([env.DB.prepare(ADD_MESSAGE_SQL).bind(id,threadId,'user',account,text,JSON.stringify(content),'[]',iso),env.DB.prepare(TOUCH_SQL).bind(threadId,iso)]);
}

export async function threadMessages(threadId:string){
 const rows=(await env.DB.prepare(`SELECT id, seq, role, account, text, content, sources, created FROM assistant_messages WHERE thread_id=? ORDER BY seq`).bind(threadId).all()).results as {id:string;seq:number;role:string;account:string;text:string;content:string;sources:string;created:string}[];
 return rows;
}
export async function threadPending(threadId:string){
 const job=await env.DB.prepare(`SELECT status, attempts, last_error AS "lastError" FROM outbox_jobs WHERE kind='assistent-antwoord' AND (payload::jsonb->>'threadId')=? AND status IN ('wachtend','bezig') ORDER BY id DESC LIMIT 1`).bind(threadId).first() as {status:string;attempts:number;lastError:string}|null;
 return job?{status:job.status,delayed:job.attempts>1}:null;
}

// ---- Weekmenus
async function menuView(week:string,status:string):Promise<WeekMenuView>{
 const m=await env.DB.prepare(LATEST_MENU_SQL).bind(week,status).first() as {id:string;week:string;status:string;version:number}|null;
 if(!m)return null;
 const items=(await env.DB.prepare(MENU_ITEMS_SQL).bind(m.id).all()).results as {productId:string;day:string;portions:number|null;note:string;draft:string|null}[];
 return {...m,items:items.map(i=>({productId:i.productId,day:i.day,portions:i.portions,note:i.note,name:i.draft?String(JSON.parse(i.draft).name||i.productId):'(product verwijderd)'}))};
}
export async function weekMenus(week:string){
 const [concept,confirmed]=await Promise.all([menuView(week,'concept'),menuView(week,'bevestigd')]);
 const proposal=concept?await env.DB.prepare(`SELECT id, version FROM proposals WHERE kind='weekmenu' AND status='concept' AND (payload::jsonb->>'menuId')=?`).bind(concept.id).first() as {id:string;version:number}|null:null;
 return {concept,confirmed,proposal};
}
async function proposeWeekMenu(threadId:string,week:string,items:MenuItem[],summary:string){
 const now=new Date().toISOString(),menuId=crypto.randomUUID(),proposalId=crypto.randomUUID();
 await env.DB.batch([
  env.DB.prepare(SUPERSEDE_PROPOSALS_SQL).bind(week),
  env.DB.prepare(SUPERSEDE_MENUS_SQL).bind(week,now),
  env.DB.prepare(INSERT_MENU_SQL).bind(menuId,week,threadId,now),
  ...items.map((it,i)=>env.DB.prepare(INSERT_ITEM_SQL).bind(menuId,i,it.productId,it.day,it.portions,it.note)),
  env.DB.prepare(INSERT_PROPOSAL_SQL).bind(proposalId,proposalId,'Weekmenu '+weekTitle(week).toLowerCase(),summary,JSON.stringify({menuId,week}),threadId,now),
 ]);
 return {proposalId,menuId};
}

async function products():Promise<ProductInfo[]>{
 const rows=(await env.DB.prepare(`SELECT id, draft, published FROM products`).all()).results as {id:string;draft:string;published:string|null}[];
 return rows.map(r=>{const d=JSON.parse(r.draft) as Record<string,unknown>;return {id:r.id,name:String(d.name||''),department:String(d.department||''),priceCents:Number(d.priceCents)||0,published:!!r.published,available:d.available!==false}});
}

export function toolContext(thread:Thread,now=new Date()):ToolContext{
 return {planning:async week=>{const [{loadGuest},{calendarView}]=await Promise.all([import('./guest-store'),import('./guest-calendar')]);const end=new Date(week+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+6);return calendarView((await loadGuest()).state,week,end.toISOString().slice(0,10))},today:amsterdamDate(now),week:thread.week,products,ops:async()=>(await loadOps('none')).state,
  weekMenus:async week=>{const m=await weekMenus(week);return {concept:m.concept,confirmed:m.confirmed}},
  proposeWeekMenu:(week,items,summary)=>proposeWeekMenu(thread.id,week,items,summary),
  // Bevestigen zoals de knop Bevestigen (wens eigenaar 13 november 2026: de assistent heeft alle rechten).
  confirmWeekMenu:async week=>{const m=await weekMenus(week);if(!m.proposal)return null;const {decide}=await import('./proposals-store');
   await decide(m.proposal.id,{action:'goedkeuren',version:m.proposal.version,requestId:crypto.randomUUID(),by:thread.account+' via de Weekassistent',note:'Bevestigd via de Weekassistent',now:new Date().toISOString()});return {confirmed:true}},
  addShopping:async(week,name,amount)=>{const {addItem}=await import('./boodschappen');return addItem(week,name,amount,thread.account+' via assistent')}};
}

/** Background job: answers the open messages of one thread. */
export async function answerThread(threadId:string){return withConnectionSettings(()=>answerConfiguredThread(threadId));}
async function answerConfiguredThread(threadId:string){
 const thread=await getThread(threadId);if(!thread)return; // removed by the retention cleanup
 const append=async(m:{role:string;text:string;content:unknown;sources:unknown})=>{const now=new Date().toISOString();await env.DB.batch([env.DB.prepare(ADD_MESSAGE_SQL).bind(crypto.randomUUID(),threadId,m.role,'assistent',m.text,JSON.stringify(m.content),JSON.stringify(m.sources),now),env.DB.prepare(TOUCH_SQL).bind(threadId,now)])};
 const apiKey=await anthropicKey();
 if(!apiKey){await append({role:'notitie',text:'De assistent is nog niet ingesteld: voeg een Claude-sleutel toe bij Systeem & koppelingen. Je bericht is bewaard.',content:[],sources:[]});return}
 if(threadExpired(thread)){await append({role:'notitie',text:'Dit gesprek is ouder dan twee weken. Start een nieuw weekgesprek.',content:[],sources:[]});return}
 const store={
  messages:async():Promise<StoredMessage[]>=>(await threadMessages(threadId)).map(r=>({seq:r.seq,role:r.role as StoredMessage['role'],content:JSON.parse(r.content)})),
  append,
  callsToday:async()=>Number((await env.DB.prepare(`SELECT COUNT(*) AS n FROM assistant_messages WHERE role='assistant' AND created>=?`).bind(new Date(Date.now()-86400000).toISOString()).first() as {n:number}).n),
 };
 const client=new Anthropic({apiKey,maxRetries:2,defaultHeaders:await anthropicHeaders()});
 // Alle rechten (wens eigenaar 13 november 2026): de keukenhulpmiddelen plus alle hulpmiddelen van de Backoffice-assistent.
 const [{FULL_KIT},{hulpContext}]=await Promise.all([import('./assistant-full'),import('./hulp-store')]);
 try{await runTurn(store,{week:toolContext(thread),hulp:await hulpContext(thread)},params=>client.beta.messages.create(params),engineConfig(),FULL_KIT)}
 catch(e){
  // Configuration errors will not fix themselves by retrying: tell Sanne and stop. Everything else is retried.
  if(e instanceof Anthropic.AuthenticationError||e instanceof Anthropic.PermissionDeniedError||e instanceof Anthropic.BadRequestError||e instanceof Anthropic.NotFoundError){
   console.error('[assistent] instelling of verzoek ongeldig:',e.message);
   await append({role:'notitie',text:configErrorNote(e.status,e.message,engineConfig().model),content:[],sources:[]});return;
  }
  throw e;
 }
}

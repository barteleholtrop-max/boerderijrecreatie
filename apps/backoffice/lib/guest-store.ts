import {env,inTransaction} from './portable/env';
import {initialGuestState,type GuestState} from './guest-core';

// Guest data in own tables (owner approval, 3 November 2026; migration 0021). Callers keep working with one GuestState:
// loadGuest assembles it, saveGuest writes only what changed. Every row has its own revision; a booking also checks
// the revision of its day, so two employees only conflict when they change the same row or book on the same day.
// The small settings (hours, exceptions, tables, capacity, day parts, Ite by Boer Bart) stay one document with its own revision.
type Spec={name:keyof GuestState;table:string;key:(v:any)=>string;day?:(v:any)=>string|null;rev?:true};
const COLLECTIONS:Spec[]=[
 {name:'reservations',table:'guest_reservations',key:r=>r.id,day:r=>r.date,rev:true},
 {name:'customers',table:'guest_customers',key:c=>c.id,rev:true},
 {name:'events',table:'guest_events',key:e=>e.id,day:e=>e.date,rev:true},
 {name:'pickups',table:'guest_pickups',key:p=>p.id,day:p=>p.date,rev:true},
 {name:'visits',table:'guest_visits',key:v=>v.date,day:v=>v.date},
 {name:'threads',table:'guest_threads',key:t=>t.id},
 {name:'groupKnowledge',table:'guest_knowledge',key:k=>k.id},
 // Afspraken (wens eigenaar 9 november 2026), migratie drizzle-pg/0046_gastcontact.
 {name:'appointments',table:'guest_appointments',key:a=>a.id,day:a=>a.date,rev:true},
];
// groupAdvice is a record (dossier key → dossier); stored as rows keyed by the record key.
const ADVICE='guest_advice';
const OUTSIDE_SETTINGS=new Set<string>([...COLLECTIONS.map(c=>c.name as string),'groupAdvice','audit']);
const OPTIONAL=new Set<string>(['groupKnowledge','appointments']);

type Snapshot={seq:number;settingsRev:number;resRev:number;settings:string;rows:Map<string,Map<string,{rev:number;json:string;day:string|null}>>;days:Map<string,number>};
const snapshots=new WeakMap<GuestState,Snapshot>();

function settingsOf(s:GuestState){return JSON.stringify(Object.fromEntries(Object.entries(s).filter(([k])=>!OUTSIDE_SETTINGS.has(k))));}
// Forms get each row's revision (rev) so a stale edit can be refused; it is never stored inside the row itself.
function strip(v:any){if(v&&typeof v==='object'&&'rev' in v){const {rev:_,...rest}=v;return rest}return v;}

type Row={rev:number;json:string;day:string|null};
type Cached={seq:number;days:Map<string,number>;rows:Map<string,{order:string[];byId:Map<string,Row>}>};
// Rows stay in memory while guest_settings.seq is unchanged: every save in any process raises it, so a changed
// database is always read fresh. Saving still checks every revision against the database itself.
const shared=globalThis as typeof globalThis&{__boerBartGuestCache?:Map<string,Cached>};
const TABLES=[...COLLECTIONS.map(c=>c.table),ADVICE];

async function rowsFromDatabase(seq:number):Promise<Cached>{
 const cached:Cached={seq,days:new Map(),rows:new Map()};
 // Read the day revisions before the bookings: a booking saved in between then makes a later save conflict (safe), never slip through.
 const {results:days}=await env.DB.prepare('SELECT day,rev FROM guest_days').all() as unknown as {results:{day:string;rev:number}[]};
 for(const d of days)cached.days.set(d.day,d.rev);
 for(const table of TABLES){
  const {results}=await env.DB.prepare(`SELECT id,rev,day,data FROM ${table} ORDER BY pos,id`).all() as unknown as {results:{id:string;rev:number;day:string|null;data:string}[]};
  // Normalized, so rows copied by SQL in migration 0021 compare equal to what JavaScript writes.
  cached.rows.set(table,{order:results.map(r=>r.id),byId:new Map(results.map(r=>[r.id,{rev:r.rev,json:JSON.stringify(JSON.parse(r.data)),day:r.day}]))});
 }
 return cached;
}

export async function loadGuest(){
 const settings=await env.DB.prepare('SELECT rev,res_rev,seq,data FROM guest_settings WHERE id=1').first() as {rev:number;res_rev:number;seq:number;data:string}|null;
 const key=process.env.APP_DATA_DIR||'';shared.__boerBartGuestCache??=new Map();
 let cached=shared.__boerBartGuestCache.get(key);
 if(!cached||cached.seq!==(settings?.seq??0)){cached=await rowsFromDatabase(settings?.seq??0);shared.__boerBartGuestCache.set(key,cached);}
 const state={...initialGuestState(),...JSON.parse(settings?.data||'{}')} as GuestState;
 const snap:Snapshot={seq:cached.seq,settingsRev:settings?.rev??0,resRev:settings?.res_rev??0,settings:'',rows:new Map(),days:cached.days};
 for(const c of [...COLLECTIONS,{name:'groupAdvice',table:ADVICE,key:()=>''} as Spec]){
  const {order,byId}=cached.rows.get(c.table)!;snap.rows.set(c.table,byId);
  // Every caller gets its own fresh objects; the cache only holds text.
  if(c.table===ADVICE){if(order.length)state.groupAdvice=Object.fromEntries(order.map(id=>[id,JSON.parse(byId.get(id)!.json)]));continue}
  if(OPTIONAL.has(c.name as string)&&!order.length)continue;
  (state as any)[c.name]=order.map(id=>{const r=byId.get(id)!,v=JSON.parse(r.json);return c.rev?{...v,rev:r.rev}:v});
 }
 // The log only grows; it is written, not loaded. New entries pushed during a request are appended on save.
 state.audit=[];
 snap.settings=settingsOf(state);snapshots.set(state,snap);
 return {version:snap.settingsRev,state};
}
export async function guestProcessed(id:string){return !!await env.DB.prepare('SELECT id FROM guest_requests WHERE id=?').bind(id).first();}

/** Writes only the changes since loadGuest returned this state. Throws when someone else changed the same rows, the same day or the settings. */
export async function saveGuest(_version:number,state:GuestState,requestId:string){
 if(await guestProcessed(requestId))return;
 const snap=snapshots.get(state);if(!snap)throw Error('Laad de planning opnieuw voordat je opslaat.');
 const stmts=[env.DB.prepare('INSERT INTO guest_requests(id,created) VALUES(?,?)').bind(requestId,new Date().toISOString())];
 const days=new Set<string>(),patch=new Map<string,{set:[string,Row][];del:string[]}>();
 const patchOf=(table:string)=>{let p=patch.get(table);if(!p){p={set:[],del:[]};patch.set(table,p)}return p};
 const write=(table:string,entries:[string,unknown][],day?:(v:any)=>string|null,withRev=false)=>{
  const old=snap.rows.get(table)!,seen=new Set<string>();
  for(const [id,value] of entries){
   if(seen.has(id))throw Error('Dubbel kenmerk in de planning: '+id);seen.add(id);
   const json=JSON.stringify(withRev?strip(value):value),d=day?day(value)??null:null,before=old.get(id);
   if(before&&before.json===json&&before.day===d)continue;
   if(table==='guest_reservations'){if(d)days.add(d);if(before?.day)days.add(before.day)}
   patchOf(table).set.push([id,{rev:before?before.rev+1:1,json,day:d}]);
   stmts.push(before
    // The rev check turns a concurrent change into a NOT NULL error, which rolls back the whole save.
    ?env.DB.prepare(`UPDATE ${table} SET data=?,day=?,rev=CASE WHEN rev=? THEN rev+1 ELSE NULL END WHERE id=?`).bind(json,d,before.rev,id)
    :env.DB.prepare(`INSERT INTO ${table}(id,rev,pos,day,data) VALUES(?,1,(SELECT COALESCE(MAX(pos),0)+1 FROM ${table}),?,?)`).bind(id,d,json));
  }
  for(const [id,before] of old)if(!seen.has(id)){
   if(table==='guest_reservations'&&before.day)days.add(before.day);
   patchOf(table).del.push(id);
   stmts.push(env.DB.prepare(`UPDATE ${table} SET rev=CASE WHEN rev=? THEN rev ELSE NULL END WHERE id=?`).bind(before.rev,id),env.DB.prepare(`DELETE FROM ${table} WHERE id=?`).bind(id));
  }
 };
 for(const c of COLLECTIONS){const list=((state as any)[c.name]||[]) as unknown[];write(c.table,list.map(v=>[c.key(v),v]),c.day,!!c.rev)}
 write(ADVICE,Object.entries(state.groupAdvice||{}));
 const settings=settingsOf(state),settingsChanged=settings!==snap.settings,reservationsChanged=days.size>0;
 // Settings rules (hours, capacity, day parts …) were checked against the reservations of this load: refuse if those changed.
 if(settingsChanged)stmts.push(env.DB.prepare('UPDATE guest_settings SET data=?,rev=CASE WHEN rev=? AND res_rev=? THEN rev+1 ELSE NULL END WHERE id=1').bind(settings,snap.settingsRev,snap.resRev));
 // Bookings were checked against these settings and the other bookings of the same day: refuse if either changed.
 else if(reservationsChanged)stmts.push(env.DB.prepare('UPDATE guest_settings SET rev=CASE WHEN rev=? THEN rev ELSE NULL END WHERE id=1').bind(snap.settingsRev));
 if(reservationsChanged){
  stmts.push(env.DB.prepare('UPDATE guest_settings SET res_rev=res_rev+1 WHERE id=1'));
  for(const day of days)stmts.push(env.DB.prepare('INSERT INTO guest_days(day,rev) VALUES(?,1) ON CONFLICT(day) DO UPDATE SET rev=CASE WHEN guest_days.rev=? THEN guest_days.rev+1 ELSE NULL END').bind(day,snap.days.get(day)??0));
 }
 // Any save invalidates the in-memory rows of every process.
 stmts.push(env.DB.prepare('UPDATE guest_settings SET seq=seq+1 WHERE id=1'));
 for(const a of state.audit||[])stmts.push(env.DB.prepare('INSERT INTO guest_audit(at,by,action,reference) VALUES(?,?,?,?)').bind(a.at,a.by,a.action,a.reference));
 stmts.push(env.DB.prepare('SELECT seq FROM guest_settings WHERE id=1'));
 let result;
 try{result=await inTransaction(async()=>{const r=await env.DB.batch(stmts);return r});}catch{if(await guestProcessed(requestId))return;throw Error('Er is elders iets gewijzigd. Ververs en controleer je wijzigingen.');}
 snapshots.delete(state);
 // Keep the in-memory rows when nobody else saved in between: apply exactly what was written, on copies, so
 // requests that loaded earlier keep their own unchanged basis. Otherwise the next load reads everything fresh.
 const key=process.env.APP_DATA_DIR||'',cache=shared.__boerBartGuestCache,current=cache?.get(key);
 const seq=(result.at(-1) as {results?:{seq:number}[]}|undefined)?.results?.[0]?.seq;
 if(!cache||!current)return;
 if(current.seq!==snap.seq||seq!==snap.seq+1){cache.delete(key);return}
 const next:Cached={seq,days:new Map(current.days),rows:new Map(current.rows)};
 for(const day of days)next.days.set(day,(snap.days.get(day)??0)+1);
 for(const [table,{set,del}] of patch){
  const before=current.rows.get(table)!,byId=new Map(before.byId);let order=before.order;
  for(const [id,row] of set){if(!byId.has(id))order=[...order,id];byId.set(id,row)}
  if(del.length){const gone=new Set(del);for(const id of del)byId.delete(id);order=order.filter(id=>!gone.has(id))}
  next.rows.set(table,{order,byId});
 }
 cache.set(key,next);
}
/** Lezen, aanpassen en opslaan als één stap. Gelijktijdige aanvragen (bijvoorbeeld twintig Ite-aanvragen voor dezelfde
 * avond, systeemtest 5 november 2026) wachten op elkaar via één slot in de database, in plaats van elkaar te overschrijven
 * en met een foutmelding terug te komen. Een fout uit fn zelf (zoals „dit moment is niet meer te reserveren”) gaat meteen
 * terug naar de gast; alleen een botsing bij het opslaan wordt na een korte, willekeurige pauze opnieuw geprobeerd. */
export async function editGuest(fn:(s:GuestState)=>void,requestId=crypto.randomUUID()){
 for(let i=0;i<6;i++){
  let ruleError:unknown=null;
  try{
   await inTransaction(async()=>{
    await env.DB.prepare('SELECT pg_advisory_xact_lock(hashtext(?))').bind('gasten:planning').first();
    const {version,state}=await loadGuest();
    try{fn(state)}catch(e){ruleError=e;throw e}
    await saveGuest(version,state,requestId);
   });
   return;
  }catch(e){if(ruleError||i===5)throw e;await new Promise(r=>setTimeout(r,20+Math.random()*80*(i+1)))}
 }
}

/** Cross-process lease serializes provider writes and sync for each conversation. */
export async function withGuestLock<T>(id:string,fn:()=>Promise<T>):Promise<T>{
 const token=crypto.randomUUID(),now=Date.now();
 const result=await env.DB.prepare(`INSERT INTO guest_locks(id,token,until_ms) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,until_ms=excluded.until_ms WHERE guest_locks.until_ms<? RETURNING token`).bind(id,token,now+300000,now).first() as {token:string}|null;
 if(result?.token!==token)throw Error('Dit gesprek wordt nu verwerkt. Wacht even en ververs.');
 try{return await fn()}finally{await env.DB.prepare('DELETE FROM guest_locks WHERE id=? AND token=?').bind(id,token).run()}
}

// Google Agenda's: meerdere agenda's koppelen, elk met één rol. De backoffice is de bron; Google Agenda is de weergave.
// - klanten:     conceptaanvragen en opties (voorlopig, "CONCEPT"). Bevestigde afspraken zet de bestaande dagelijkse taak
//                in de agenda; wordt een aanvraag bevestigd, geannuleerd of verloopt een optie, dan ruimt de backoffice
//                zijn eigen concept-item op. Zo staat dezelfde afspraak er nooit dubbel in.
// - evenementen: de evenementen uit Planning (geen feestdagen of voorbeelden).
// Elk item krijgt een vast ID en wordt bijgehouden in mail_calendar_events: herhaald synchroniseren maakt niets dubbel,
// en alleen items die de backoffice zelf maakte worden gewijzigd of verwijderd. Andere agenda-items blijven onaangeroerd.
import {createHash} from 'node:crypto';
import {getDb} from '@/db';
import {mailAccounts,mailCalendars,mailCalendarEvents} from '@/db/schema';
import {and,eq} from 'drizzle-orm';
import {unseal} from './sheets';
import {gmailClient,GmailError,GmailAuthError,type Gmail} from './gmail-api';
import {loadGuest} from './guest-store';
import {mailbox,MailError} from './mail-store';
import type {GuestState} from './guest-core';
import {CALENDAR_ROLES,desiredItems,eventId,type CalendarRole} from './calendar-core';
export {CALENDAR_ROLES,type CalendarRole};

const now=()=>new Date().toISOString();

async function client():Promise<Gmail>{
 const a=(await getDb().select().from(mailAccounts).where(eq(mailAccounts.mailbox,mailbox())))[0];
 if(!a?.refreshToken||a.status==='toegang-verlopen')throw new MailError('Koppel eerst Google in Gesprekken (Gmail koppelen).',409);
 if(!a.scopes.includes('calendar.events')||!a.scopes.includes('calendar.calendarlist.readonly'))throw new MailError('Geef bij het koppelen ook toestemming voor Google Agenda: koppel Google opnieuw.',409);
 return gmailClient({refresh:await unseal(a.refreshToken)});
}

/** The account's calendars (where it may write) plus which ones are linked and with which role. */
export async function calendarOverview(){
 const linked=await getDb().select().from(mailCalendars).where(eq(mailCalendars.mailbox,mailbox()));
 let available:{id:string;name:string;primary:boolean}[]=[],error='';
 try{const g=await client();let page:string|undefined,n=0;do{const r=await g.calendars(page);for(const c of r.items||[])available.push({id:c.id,name:c.summaryOverride||c.summary||c.id,primary:!!c.primary});page=r.nextPageToken}while(page&&++n<10)}
 catch(e){error=e instanceof GmailError||e instanceof MailError?e.message:'De agendalijst kon niet worden opgehaald.'}
 return {linked:linked.map(l=>({calendarId:l.calendarId,name:l.name,role:l.role,lastSyncOk:l.lastSyncOk,lastError:l.lastError,updatedBy:l.updatedBy})),available,error};
}
export async function linkCalendar(calendarId:string,role:CalendarRole|null,by:string){
 const db=getDb(),m=mailbox();
 if(!role){
  // Unlinking stops synchronising; items already in Google stay (nothing is deleted without a sync that owns them).
  await db.delete(mailCalendars).where(and(eq(mailCalendars.mailbox,m),eq(mailCalendars.calendarId,calendarId)));return;
 }
 const c=(await calendarOverview()).available.find(x=>x.id===calendarId);
 if(!c)throw new MailError('Deze agenda is niet gevonden of er mag niet in geschreven worden.',404);
 const values={name:c.name,role,updated:now(),updatedBy:by};
 await db.insert(mailCalendars).values({mailbox:m,calendarId,...values}).onConflictDoUpdate({target:[mailCalendars.mailbox,mailCalendars.calendarId],set:values});
}

const hashOf=(body:unknown)=>createHash('sha256').update(JSON.stringify(body)).digest('hex');

async function syncOne(g:Gmail,cal:typeof mailCalendars.$inferSelect,state:GuestState){
 const db=getDb(),items=desiredItems(state,cal.role as CalendarRole),wanted=new Map(items.map(i=>[eventId(cal.calendarId,i.ref),i]));
 const tracked=new Map((await db.select().from(mailCalendarEvents).where(eq(mailCalendarEvents.calendarId,cal.calendarId))).map(r=>[r.eventId,r]));
 let changed=0,removed=0;
 const current=async(id:string)=>{try{return await g.event(cal.calendarId,id)}catch(e){if(e instanceof GmailError&&(e.status===404||e.code==='410'))return null;throw e}};
 for(const [id,item] of wanted){
  const hash=hashOf(item.body);if(tracked.get(id)?.hash===hash)continue; // unchanged: no Google request
  const old=await current(id);
  await g.putEvent(cal.calendarId,id,item.body,old&&old.status!=='cancelled'?old.etag:undefined,!!old);
  await db.insert(mailCalendarEvents).values({calendarId:cal.calendarId,eventId:id,ref:item.ref,hash,updated:now()}).onConflictDoUpdate({target:[mailCalendarEvents.calendarId,mailCalendarEvents.eventId],set:{ref:item.ref,hash,updated:now()}});changed++;
 }
 for(const [id] of tracked){
  if(wanted.has(id))continue;
  const old=await current(id);if(old&&old.status!=='cancelled'){await g.deleteEvent(cal.calendarId,id,old.etag);removed++}
  await db.delete(mailCalendarEvents).where(and(eq(mailCalendarEvents.calendarId,cal.calendarId),eq(mailCalendarEvents.eventId,id)));
 }
 return {changed,removed};
}

/** Synchronises every linked calendar. Errors are kept per calendar and shown; one failing calendar does not stop the others. */
export async function syncCalendars(){
 const db=getDb(),cals=await db.select().from(mailCalendars).where(eq(mailCalendars.mailbox,mailbox()));
 if(!cals.length)return {ok:true,calendars:0};
 const g=await client(),{state}=await loadGuest();const results:Record<string,unknown>={};
 for(const cal of cals){
  try{results[cal.calendarId]=await syncOne(g,cal,state);await db.update(mailCalendars).set({lastSyncOk:now(),lastError:null}).where(and(eq(mailCalendars.mailbox,cal.mailbox),eq(mailCalendars.calendarId,cal.calendarId)))}
  catch(e){const msg=e instanceof GmailError||e instanceof MailError?e.message:'Synchroniseren mislukt.';await db.update(mailCalendars).set({lastError:msg}).where(and(eq(mailCalendars.mailbox,cal.mailbox),eq(mailCalendars.calendarId,cal.calendarId)));results[cal.calendarId]={error:msg};if(e instanceof GmailAuthError)throw e}
 }
 return {ok:true,calendars:cals.length,results};
}
export async function hasLinkedCalendars(){return (await getDb().select({c:mailCalendars.calendarId}).from(mailCalendars).where(eq(mailCalendars.mailbox,mailbox())).limit(1)).length>0}

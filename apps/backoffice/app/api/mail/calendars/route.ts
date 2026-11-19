import {json,who,handle} from '@/lib/mail-http';
import {calendarOverview,linkCalendar,CALENDAR_ROLES,type CalendarRole} from '@/lib/mail-calendar';
import {MailError} from '@/lib/mail-store';
import {enqueue} from '@/lib/outbox';
import {tick} from '@/lib/assistant-jobs';
export const dynamic='force-dynamic';
// Google Agenda's koppelen: kies een agenda uit de lijst van het gekoppelde account en geef die een rol.
export async function GET(req:Request){return handle(async()=>{who(req);return json(await calendarOverview())})}
export async function POST(req:Request){return handle(async()=>{
 const by=who(req,true);const b=await req.json().catch(()=>({})) as {action?:string;calendarId?:unknown;role?:unknown};
 if(b.action==='sync'){await enqueue('agenda-sync:handmatig:'+Date.now(),'agenda-sync');void tick();return json({ok:true,queued:true})}
 if(b.action!=='link'||typeof b.calendarId!=='string'||!b.calendarId||b.calendarId.length>300)throw new MailError('Ongeldige agenda.');
 if(b.role!==null&&!CALENDAR_ROLES.includes(b.role as CalendarRole))throw new MailError('Kies klanten, evenementen of niet gebruiken.');
 await linkCalendar(b.calendarId,b.role as CalendarRole|null,by);
 if(b.role){await enqueue('agenda-sync:gekoppeld:'+Date.now(),'agenda-sync');void tick()}
 return json({ok:true});
})}

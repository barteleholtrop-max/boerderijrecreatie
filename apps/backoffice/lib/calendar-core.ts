// Pure rules for the linked Google calendars (no database, no network): what belongs in a calendar with a given role.
// Used by lib/mail-calendar.ts; tested in tests/guest-workspace.test.mjs.
import {createHash} from 'node:crypto';
import type {GuestState} from './guest-core';
export const CALENDAR_ROLES=['klanten','evenementen'] as const;
export type CalendarRole=typeof CALENDAR_ROLES[number];
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date());
type Item={ref:string;body:Record<string,unknown>};
const at=(date:string,time:string)=>({dateTime:`${date}T${time}:00`,timeZone:'Europe/Amsterdam'});
/** What should be in a calendar with this role, from the central backoffice data. Pure, so it can be tested. */
export function desiredItems(s:GuestState,role:CalendarRole,day=today(),nowMs=Date.now()):Item[]{
 if(role==='klanten')return [...s.reservations
  .filter(r=>!r.example&&r.date>=day&&(r.status==='aanvraag'||(r.status==='optie'&&Date.parse(r.expires)>nowMs)))
  .map(r=>({ref:'reservering:'+r.id,body:{summary:`CONCEPT · ${r.status} · ${r.activity} · ${r.name} · ${r.people} personen`,
   description:[r.notes,r.status==='optie'?`Optie, geldig tot ${r.expires}.`:'Aanvraag: houdt nog geen plaats vast.','Voorlopig, nog niet bevestigd. Bevestigde afspraken zet de dagelijkse taak in de agenda; dit concept verdwijnt dan.'].filter(Boolean).join('\n\n'),
   start:at(r.date,r.from),end:at(r.date,r.to),status:'tentative',transparency:r.status==='optie'?'opaque':'transparent',extendedProperties:{private:{boerBart:'reservering:'+r.id}}}})),
  // Afspraken met klanten (wens eigenaar 9 november 2026): een gesprek, geen boeking.
  ...(s.appointments||[]).filter(a=>a.date>=day).map(a=>({ref:'afspraak:'+a.id,body:{summary:`Afspraak · ${a.subject}${a.customerName?' · '+a.customerName:''}`,
   description:a.notes,start:at(a.date,a.from),end:at(a.date,a.to),extendedProperties:{private:{boerBart:'afspraak:'+a.id}}}}))];
 return s.events.filter(e=>!e.holiday&&!e.example&&e.date>=day&&e.from&&e.to)
  .map(e=>({ref:'evenement:'+e.id,body:{summary:e.title,description:e.description||'',start:at(e.date,e.from),end:at(e.date,e.to),extendedProperties:{private:{boerBart:'evenement:'+e.id}}}}));
}
export const eventId=(calendarId:string,ref:string)=>'bb'+createHash('sha256').update(calendarId+'\u0000'+ref).digest('hex');

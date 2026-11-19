// Signalen voor de personeelsplanning (wens eigenaar 6 november 2026): een dag die extra open gaat, of een groep, evenement of
// offerte op een dag zonder diensten. Dan vraagt de backoffice: moeten er diensten bij, welke rollen en hoeveel?
// Een signaal is afgerond zodra er voor die pot en die dag een eigen bezetting is gezet (ook „0 = geen diensten nodig”).
// Er wordt niets opgeslagen: de signalen volgen steeds uit de planning, de openingstijden en de bezetting. Pure regels, los te testen.
import type {GuestState} from './guest-core';
import type {Quote} from './quotes';

export type SignalReason='extra-open'|'activiteit';
export type StaffSignal={pot:string;potName:string;day:string;reason:SignalReason;text:string;items:string[]};
const ACTIVE_QUOTES=new Set(['concept','verstuurd','geaccepteerd']);
const ACTIVE_BOOKINGS=new Set(['aanvraag','optie','bevestigd']);

/** Groepen, evenementen en offertes op een dag (titels), zonder geannuleerde, afgewezen of vervallen. */
export function activitiesOn(s:Pick<GuestState,'reservations'|'events'>&{quotes?:Quote[]},day:string){
 const out:string[]=[];
 for(const r of s.reservations)if(r.date===day&&r.activity==='groep'&&ACTIVE_BOOKINGS.has(r.status))out.push(`groep ${r.name} (${r.people} pers., ${r.status})`);
 for(const e of s.events)if(e.date===day&&!e.holiday)out.push(`evenement ${e.title}`);
 for(const q of s.quotes||[])if(q.eventDate===day&&ACTIVE_QUOTES.has(q.status))out.push(`offerte ${q.number||''}${q.people?` (${q.people} pers.)`:''}`.replace(/\s+/g,' ').trim());
 return out;
}

/** Het signaal voor één pot op één dag, of null. */
export function daySignal(o:{day:string;today:string;locked:boolean;hasAgreement:boolean;hasDayRow:boolean;weekdayOpen:boolean;exceptionOpen:boolean;totalNeed:number;items:string[]}):{reason:SignalReason;text:string}|null{
 if(o.day<o.today||o.locked||!o.hasAgreement||o.hasDayRow)return null;
 if(o.exceptionOpen&&!o.weekdayOpen)return {reason:'extra-open',text:'Extra open dag (afwijkende openingstijden). Moeten er diensten worden toegevoegd? Welke rollen en hoeveel?'};
 if(o.items.length&&o.totalNeed===0)return {reason:'activiteit',text:'Geboekt op een dag zonder diensten. Moeten er diensten worden toegevoegd? Welke rollen en hoeveel?'};
 return null;
}

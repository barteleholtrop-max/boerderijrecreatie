// Reserveren vanuit een gesprek (wens eigenaar 3 november 2026): als er bij het gesprek al een open aanvraag of optie
// staat, wordt die bijgewerkt in plaats van een tweede reservering aan te maken. Zo staat een bevestigde groep niet
// twee keer in de agenda (één keer als aanvraag en één keer als bevestigd).
import type {Reservation} from './guest-core';
/** De nieuwste open aanvraag of optie bij dit gesprek, of null. Bevestigde en geannuleerde tellen niet mee. */
export function openRequest(list:Reservation[],threadRef:string){
 const open=list.filter(r=>r.threadId===threadRef&&(r.status==='aanvraag'||r.status==='optie'));
 return open.sort((a,b)=>a.date.localeCompare(b.date)).at(-1)??null;
}

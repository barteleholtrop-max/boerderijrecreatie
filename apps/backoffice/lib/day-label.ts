// Readable date for the backoffice: "donderdag 5 nov '27" (owner's choice, 3 November 2026). Input is YYYY-MM-DD;
// the weekday follows the calendar date itself, independent of the browser's time zone.
const weekdays=['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'];
const months=['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
export function dayLabel(iso:string){
 const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso||'');if(!m)return iso||'';
 const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3],12));if(Number.isNaN(d.getTime())||d.getUTCMonth()!==+m[2]-1)return iso;
 return `${weekdays[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]} '${m[1].slice(2)}`;
}

// Rustige stand voor de bonprinters (wens eigenaar 7 november 2026: „op openingsdagen moet deze perfect draaien, op de andere
// dagen en tijden hoeft de printer niet zo vaak een opdracht te krijgen”). Regels zonder database, los te testen.
// - Druk: van 1 uur vóór tot 1 uur na de openingstijden, reserveringen, evenementen en de Ite-avond van vandaag. De printer krijgt
//   dan zoals altijd binnen 5 seconden zijn bon.
// - Rustig (de rest): de printer blijft elke 5 seconden aankloppen, maar de backoffice kijkt hooguit één keer per minuut in de
//   database. Na een afgedrukte bon is het 2 minuten weer druk, zodat een reeks bonnen vlot doorloopt.
// - Altijd: „ik ben er nog” (laatst gezien) wordt hooguit één keer per minuut weggeschreven.
export const MARGIN_MINUTES=60;
export const QUIET_CHECK_MS=60_000;
export const TOUCH_MS=60_000;
export const AWAKE_AFTER_JOB_MS=120_000;
/** Zolang geldt een printer als verbonden na zijn laatste aanmelding (ruim boven TOUCH_MS). */
export const CONNECTED_MS=TOUCH_MS+30_000;

type Slot={from?:string;to?:string};
const minutes=(t:string|undefined)=>{const m=/^(\d{1,2}):(\d{2})/.exec(t||'');return m?Math.min(24*60,+m[1]*60+ +m[2]):null};

/** De drukke uren van een dag (in minuten na middernacht), met marge ervoor en erna. Zonder eindtijd: tot middernacht. */
export function busyWindows(o:{openings:({open:boolean;from:string;to:string}|null|undefined)[];slots:Slot[]}):[number,number][]{
 const out:[number,number][]=[];
 const add=(from?:string,to?:string)=>{const a=minutes(from);if(a===null)return;let b=minutes(to);if(b===null||b<=a)b=24*60;out.push([Math.max(0,a-MARGIN_MINUTES),Math.min(24*60,b+MARGIN_MINUTES)])};
 for(const h of o.openings)if(h?.open)add(h.from,h.to);
 for(const s of o.slots)add(s.from,s.to);
 return out;
}
export const busyAt=(windows:[number,number][],minute:number)=>windows.some(([a,b])=>minute>=a&&minute<b);

/** Vandaag en de minuut van de dag in Amsterdam (zomer- en wintertijd). */
export function amsterdamNow(now:number){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now)).map(x=>[x.type,x.value]));
 return {day:`${p.year}-${p.month}-${p.day}`,minute:+p.hour*60+ +p.minute};
}

export type Pace={lastCheck:number;lastTouch:number;lastJob:number};
/** Wat de backoffice doet bij deze vraag van de printer: in de database kijken (check) en/of „laatst gezien” bijwerken (touch). */
export function plan(p:Pace|undefined,now:number,busy:boolean){
 const awake=busy||(!!p&&now-p.lastJob<AWAKE_AFTER_JOB_MS);
 return {check:awake||!p||now-p.lastCheck>=QUIET_CHECK_MS,touch:!p||now-p.lastTouch>=TOUCH_MS,quiet:!awake};
}

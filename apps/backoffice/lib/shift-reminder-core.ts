// Herinnering de dag ervoor (wens eigenaar 5 november 2026: „een push krijgen, Hey tot morgen, wat leuk dat je weer komt helpen…
// met nog heel veel andere leuke teksten”). Regels en teksten zonder database of netwerk, los te testen.
// - Om 18.00 uur (Amsterdamse tijd) krijgt ieder lid met een rol voor morgen één melding, op elke telefoon waar het lid meldingen aanzette.
// - Een weektaak (schoonmaak, organisatie) alleen op de eerste dag van die taak in de week: geen dagelijkse herhaling.
// - De tekst wisselt: elke dag en elk lid een andere, vast gekozen uit de lijst (zelfde lid + dag = zelfde tekst).
export const REMINDER_TIME='18:00';

export const TITLES=[
 'Tot morgen, {naam}! 🌱','Morgen op de boerderij 🐄','Hey {naam} 👋','Jij bent er morgen bij! ☀️','Even een seintje 🌾',
 'Morgen samen aan de slag 🍳','Zin in morgen? 🥕','De koeien weten het al 🐮','Boer Bart rekent op je 💚','Morgen is het jouw dag ✨',
];
// {naam} = voornaam, {rol} = rol(len) in kleine letters, {dag} = morgen als weekdag („vrijdag”), {tijd} = openingstijd („10:00”) of leeg.
export const BODIES=[
 'Hey {naam}, tot morgen! Wat leuk dat je weer komt helpen als {rol}.',
 'Morgen sta jij op het rooster als {rol}. We kijken ernaar uit!',
 'Fijn dat je er {dag} bij bent als {rol}. Samen maken we er een mooie dag van.',
 'De koffie staat {dag} klaar voor je. Tot morgen bij Boer Bart, {rol}!',
 '{dag} ben jij onze {rol}. Dankjewel dat je meedoet!',
 'Morgen weer lekker samen aan de slag. Jij doet {rol}; wat fijn!',
 'Geef de koeien morgen een knipoog van ons. Tot {dag}, {naam}!',
 'Zonder jou geen feest: morgen ben je {rol}. Tot dan!',
 'Je rol voor morgen: {rol}. Vergeet niet je aan te melden op de tablet bij de barista.',
 'Wat goed dat je er morgen weer bent, {naam}. De gasten gaan het merken!',
 'Morgen ruikt het naar verse koffie en appeltaart. En naar jou als {rol}. 😉',
 'Tot morgen! Meld je even aan op de tablet, dan telt je {rol} mee.',
 'Een heldendaad in de maak: {dag} ben jij {rol}. Tot morgen!',
 'Het erf heeft je morgen nodig. Fijn dat je komt als {rol}, {naam}.',
 'Hoera, {dag} werken we samen! Jij bent {rol}.',
 'Even een warm seintje: morgen ben jij {rol}. Slaap lekker vannacht!',
 'De kippen hebben gehoord dat jij morgen komt. Ze zijn zenuwachtig. 🐔',
 'Morgen sta je weer op het rooster als {rol}. Dankjewel voor je inzet!',
 'Klaar voor {dag}? Wij wel! Tot morgen als {rol}.',
 '{naam}, morgen ben je {rol}. Samen houden we de boerderij draaiende.',
 'Een kleine herinnering met een grote glimlach: tot morgen, {rol}! 😊',
 'Morgen weer gezellig! Jouw rol: {rol}{tijd}.',
 'Dankjewel dat je morgen meehelpt, {naam}. Zonder jou lukt het niet.',
 'Tot morgen bij Boer Bart! Jij bent {rol}, en wij zijn blij.',
 'Morgen samen het verschil maken: jij als {rol}. Tot dan!',
 'Zet je wekker maar: {dag} ben jij {rol}. De koffie is van ons.',
 'Wat leuk dat je er weer bij bent! Morgen: {rol}.',
 'Psst… morgen ben jij {rol}. Vergeet je goede humeur niet!',
 'Morgen een mooie dag op de boerderij, met jou als {rol}.',
 'Tot morgen, {naam}! Meld je aan op de tablet zodra je er bent.',
];

const WEEKDAYS=['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'];
const hash=(s:string)=>{let h=2166136261;for(const c of s){h^=c.codePointAt(0)!;h=Math.imul(h,16777619)}return h>>>0};
const fill=(t:string,v:Record<string,string>)=>t.replace(/\{(\w+)\}/g,(_,k)=>v[k]??'');
const list=(xs:string[])=>xs.length<=1?xs.join(''):xs.slice(0,-1).join(', ')+' en '+xs[xs.length-1];

/** The notification for one member for one day. Same member + day → same text; another day → (usually) another text. */
export function reminderMessage(o:{participantId:string;name:string;day:string;roles:string[];opens?:string}){
 const first=(o.name.trim().split(/\s+/)[0]||'collega'),h=hash(o.participantId+'|'+o.day);
 const v={naam:first,rol:list(o.roles.map(r=>r.toLowerCase())),dag:WEEKDAYS[new Date(o.day+'T12:00:00Z').getUTCDay()],tijd:o.opens?`, vanaf ${o.opens}`:''};
 return {title:fill(TITLES[h%TITLES.length],v),body:fill(BODIES[Math.floor(h/TITLES.length)%BODIES.length],v),tag:'dienst-'+o.day};
}

/** Who gets a reminder for `day`, with which roles. Week tasks only on the member's first day of that task in the week. */
export function reminderPlan(o:{day:string;shifts:{day:string;participantId:string;roleId:string;status?:string}[];roles:{id:string;name:string;week?:boolean}[];isWeek:(r:{id:string;week?:boolean})=>boolean}){
 const by=new Map<string,string[]>();
 for(const s of o.shifts.filter(s=>s.day===o.day)){
  const role=o.roles.find(r=>r.id===s.roleId);if(!role)continue;
  if(o.isWeek(role)&&o.shifts.some(x=>x.participantId===s.participantId&&x.roleId===s.roleId&&x.day<o.day))continue;
  by.set(s.participantId,[...(by.get(s.participantId)||[]),role.name]);
 }
 return [...by].map(([participantId,roles])=>({participantId,roles}));
}

/** The moment (UTC) of HH:MM on a day in Amsterdam, summer and winter time included. */
export function amsterdamAt(day:string,time:string){
 const [h,m]=time.split(':').map(Number),guess=Date.UTC(+day.slice(0,4),+day.slice(5,7)-1,+day.slice(8,10),h,m);
 const local=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Amsterdam',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(guess));
 const [lh,lm]=local.split(':').map(Number);
 return new Date(guess-((lh*60+lm)-(h*60+m))*60000);
}

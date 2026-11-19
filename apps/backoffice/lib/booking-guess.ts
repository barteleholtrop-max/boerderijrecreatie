// Fill in the reservation form for every conversation (wish owner, 3 November 2026): date, times and number of people
// read from the guest's mail and the advice, without AI. Only clear Dutch wording is used; anything unclear stays empty
// for Rianne to fill in. The AI suggestion, when present, takes precedence.
export type BookingGuess={date?:string;from?:string;to?:string;people?:number};

const MONTHS=['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
const SHORT=MONTHS.map(m=>m.slice(0,3));
const pad=(n:number)=>String(n).padStart(2,'0');
const valid=(y:number,m:number,d:number)=>{const t=new Date(Date.UTC(y,m-1,d));return t.getUTCFullYear()===y&&t.getUTCMonth()===m-1&&t.getUTCDate()===d};
const iso=(y:number,m:number,d:number)=>`${y}-${pad(m)}-${pad(d)}`;
const time=(h:string,m?:string)=>{const H=Number(h),M=Number(m||0);return H<=23&&M<=59?`${pad(H)}:${pad(M)}`:null};

/** The first future date, the first time range and the number of people found in the texts (most relevant text first). */
export function guessBooking(texts:(string|undefined|null)[],today:string):BookingGuess{
 const guess:BookingGuess={};
 for(const raw of texts){
  const text=(raw||'').toLowerCase().replace(/\s+/g,' ');
  if(!text)continue;
  if(!guess.date){const d=findDate(text,today);if(d)guess.date=d}
  if(!guess.from){const r=findTimes(text);if(r){guess.from=r[0];guess.to=r[1]}}
  if(!guess.people){const p=findPeople(text);if(p)guess.people=p}
 }
 return guess;
}

function findDate(text:string,today:string){
 const ty=Number(today.slice(0,4));
 const future=(y:number,m:number,d:number)=>valid(y,m,d)&&iso(y,m,d)>=today?iso(y,m,d):undefined;
 // 17 april 2027 · 17 apr · zaterdag 17 april (year missing: the next time that date comes)
 const months=`(${MONTHS.join('|')}|${SHORT.join('|')})\\.?`;
 for(const m of text.matchAll(new RegExp(`\\b(\\d{1,2})\\s+${months}(?:\\s+(\\d{4}))?\\b`,'g'))){
  const d=Number(m[1]),month=(MONTHS.indexOf(m[2])+1)||(SHORT.indexOf(m[2].slice(0,3))+1);
  if(m[3]){const r=future(Number(m[3]),month,d);if(r)return r;continue}
  const r=future(ty,month,d)||future(ty+1,month,d);if(r)return r;
 }
 // 17-4-2027 · 17/04/2027 · 2027-04-17
 for(const m of text.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)){const r=future(Number(m[1]),Number(m[2]),Number(m[3]));if(r)return r}
 for(const m of text.matchAll(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b/g)){const r=future(Number(m[3]),Number(m[2]),Number(m[1]));if(r)return r}
 return undefined;
}

function findTimes(text:string):[string,string]|null{
 // 14.00–18.00 · 14:00 - 18:00 · van 14.00 tot 18.00 uur · 14–18 uur · 14 tot 18 uur
 const hm='(\\d{1,2})(?:[.:](\\d{2}))?';
 const range=new RegExp(`(?:\\bvan\\s+)?\\b${hm}\\s*(?:uur\\s*)?(?:-|–|—|tot(?: en met)?)\\s*${hm}\\s*(uur|u\\b)?`,'g');
 for(const m of text.matchAll(range)){
  // Bare numbers (14–18) only count as times when followed by "uur"; otherwise they may be ages or amounts.
  if(m[2]===undefined&&m[4]===undefined&&!m[5])continue;
  const from=time(m[1],m[2]),to=time(m[3],m[4]);
  if(from&&to&&from<to&&Number(m[1])>=7)return [from,to];
 }
 return null;
}

function findPeople(text:string){
 const n=(re:RegExp)=>[...text.matchAll(re)].map(m=>Number(m[1])).filter(v=>v>0&&v<=1000);
 const adults=n(/\b(\d{1,4})\s+(?:volwassenen|volw\.?)/g),children=n(/\b(\d{1,4})\s+(?:kinderen|kind\.?|kids)\b/g);
 if(adults.length)return adults[0]+(children[0]||0);
 const total=n(/\b(\d{1,4})\s+(?:personen|pers\.?|gasten|mensen|deelnemers|collega'?s|leden|man)\b/g);
 if(total.length)return total[0];
 const group=n(/\bgroep\s+van\s+(\d{1,4})\b/g);
 return group[0];
}

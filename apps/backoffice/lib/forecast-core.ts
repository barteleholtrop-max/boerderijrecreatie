// Voorspelling daggasten (wens eigenaar 6 november 2026): aanpasbaar, en zelflerend op het werkelijke bezoek van een periode.
// Rekenregels zonder database of netwerk. De basis blijft predict() in lib/guest-forecast.ts (vergelijkbare dagen van vorig jaar en
// het weer). Daarop:
// 1. Zelflerend: over de afgelopen periode (standaard 28 dagen) wordt het werkelijke bezoek vergeleken met wat er vooraf voorspeld was.
//    Correctiefactor = som werkelijk ÷ som voorspeld, met minstens 3 vergelijkbare dagen, en begrensd tussen 0,5 en 2.
// 2. Met de hand: een algemene correctie in procenten (bijvoorbeeld +10% omdat er reclame loopt), en per dag een eigen getal dat
//    de berekening vervangt.
export const MIN_DAYS=3;
/** Historische bezoekdagen uit een lijst (wens eigenaar 9 november 2026): per regel een datum en een aantal bezoekers, gescheiden door
 *  puntkomma, komma, tab of spatie. Datum als 2025-06-14 of 14-6-2025. Een kopregel of lege regel wordt overgeslagen. Gooit bij onzin. */
export function parseVisitLines(text:string,today:string,max=1500){
 const out=new Map<string,number>(),bad:string[]=[];
 for(const raw of text.split(/\r?\n/)){
  const line=raw.trim();if(!line)continue;
  const m=line.match(/^(\d{4}-\d{2}-\d{2}|\d{1,2}-\d{1,2}-\d{4})[\s;,\t]+(\d{1,6})(?:[.,]\d+)?\s*$/);
  if(!m){if(out.size||bad.length||!/\d{4}/.test(line))continue;bad.push(line);continue}
  let date=m[1];if(!/^\d{4}/.test(date)){const [d,mo,y]=date.split('-');date=`${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`}
  const ms=Date.parse(date+'T12:00:00Z');if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==date||date>=today){bad.push(line);continue}
  out.set(date,Number(m[2]));
 }
 if(bad.length>3)throw new Error(`Deze regels zijn niet te lezen: ${bad.slice(0,3).join(' · ')}. Gebruik per regel een datum en een aantal, bijvoorbeeld 2025-06-14;120.`);
 if(!out.size)throw new Error('Er staan geen bezoekdagen in. Gebruik per regel een datum en een aantal, bijvoorbeeld 2025-06-14;120.');
 if(out.size>max)throw new Error(`Hoogstens ${max} dagen per keer.`);
 return [...out].map(([date,visitors])=>({date,visitors})).sort((a,b)=>a.date.localeCompare(b.date));
}
export const FACTOR_MIN=0.5,FACTOR_MAX=2;
export type Pair={date:string;predicted:number;actual:number};
export type Settings={auto:boolean;periodDays:number;manualPct:number;closedYears:number[]};
// Jaren waarin de boerderij dicht was tellen niet mee als vergelijkingsjaar (besluit eigenaar 6 november 2026: in 2026 dicht).
export const DEFAULT_SETTINGS:Settings={auto:true,periodDays:28,manualPct:0,closedYears:[2026]};
export const COMPARE_YEARS=2;
/** De vergelijkingsjaren voor een dag: de meest recente jaren vóór dat jaar waarin de boerderij open was (standaard twee).
 *  Voor 2026 en 2027 met 2026 dicht: 2025 en 2024; voor 2028: 2027 en 2025. */
export function compareYears(targetYear:number,closedYears:number[],count=COMPARE_YEARS){
 const out:number[]=[];for(let y=targetYear-1;out.length<count&&y>=targetYear-12;y--)if(!closedYears.includes(y))out.push(y);
 return out.sort((a,b)=>a-b);
}
export function parseYears(v:unknown){
 const list=Array.isArray(v)?v:typeof v==='string'?v.split(/[\s,;]+/).filter(Boolean):[];
 const years=list.map(Number);
 if(years.length>10||years.some(y=>!Number.isInteger(y)||y<2000||y>2100))throw Error('Vul jaartallen in, bijvoorbeeld 2026 (gescheiden door een komma).');
 return [...new Set(years)].sort((a,b)=>a-b);
}

/** De correctiefactor uit de vergelijking van voorspeld en werkelijk. null = te weinig gegevens of uitgeschakeld. */
export function calibration(pairs:Pair[],s:Settings){
 const used=pairs.filter(p=>p.predicted>0&&p.actual>=0);
 if(!s.auto)return {factor:null as number|null,days:used.length,reason:'Zelf bijstellen staat uit.'};
 if(used.length<MIN_DAYS)return {factor:null as number|null,days:used.length,reason:`Minstens ${MIN_DAYS} dagen nodig met een voorspelling én een werkelijk aantal (nu ${used.length}).`};
 const sumA=used.reduce((n,p)=>n+p.actual,0),sumP=used.reduce((n,p)=>n+p.predicted,0);
 const raw=sumA/sumP,factor=Math.min(FACTOR_MAX,Math.max(FACTOR_MIN,raw));
 return {factor:Math.round(factor*100)/100,days:used.length,reason:`Werkelijk ${sumA} tegen voorspeld ${sumP} over ${used.length} dagen${factor!==raw?' (begrensd)':''}.`};
}

/** De voorspelling voor een dag: eigen getal, of basis × correctiefactor × handmatige correctie. */
export function adjust(base:number|null,o:{factor:number|null;manualPct:number;override:number|null}){
 if(o.override!==null)return {expected:o.override,how:'eigen getal' as const};
 if(base===null)return {expected:null,how:'geen basis' as const};
 const v=base*(o.factor??1)*(1+o.manualPct/100);
 return {expected:Math.max(0,Math.round(v)),how:(o.factor!==null||o.manualPct?'bijgesteld':'basis') as 'bijgesteld'|'basis'};
}

/** Instellingen controleren. */
export function parseSettings(raw:unknown):Settings{
 const b=(raw&&typeof raw==='object'?raw:{}) as Record<string,unknown>;
 const periodDays=Number(b.periodDays),manualPct=Number(b.manualPct);
 if(!Number.isInteger(periodDays)||periodDays<7||periodDays>365)throw Error('Kies een periode van 7 tot 365 dagen.');
 if(!Number.isInteger(manualPct)||manualPct<-90||manualPct>300)throw Error('Kies een correctie tussen −90% en +300%.');
 return {auto:b.auto!==false,periodDays,manualPct,closedYears:b.closedYears===undefined?DEFAULT_SETTINGS.closedYears:parseYears(b.closedYears)};
}

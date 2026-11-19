// Werkplek open of dicht (wens eigenaar 14 november 2026): „per werkplek aangeven of je open bent of niet. Als er een dag open is,
// maar er is geen kok, dan moet dat station uit kunnen, en dan moet daar ook niet besteld kunnen worden. Aanpassen aan de
// openingstijden van bijvoorbeeld de speelboerderij, maar helemaal vrij instelbaar. En een optie: deze werkplek is op dit moment
// niet beschikbaar.” Pure regels, zonder database (te testen). Opslag in lib/station-open.ts.
import {opening,type GuestState} from './guest-core';
import {localMoment,serviceOn} from './availability';

export const STATION_IDS=['kok','barista','winkel'] as const;
export type StationId=typeof STATION_IDS[number];
export const isStationId=(v:unknown):v is StationId=>typeof v==='string'&&(STATION_IDS as readonly string[]).includes(v);
export const STATION_NAMES:Record<StationId,{name:string;place:string}>={kok:{name:'Kok',place:'De keuken'},barista:{name:'Barista',place:'De koffiebar'},winkel:{name:'Winkel',place:'De winkel'}};

/** Welke openingstijden een werkplek kan volgen (Openingstijden & Planning). */
export const SOURCES=[['speelboerderij','Speelboerderij'],['winkel','Winkel'],['yte','Ite-avond']] as const;
export type Source=typeof SOURCES[number][0];
export const MODES=[['altijd','Altijd open'],['openingstijden','Volgt openingstijden'],['eigen','Eigen tijden'],['dicht','Gesloten']] as const;
export type Mode=typeof MODES[number][0];
export type DayTimes={open:boolean;from:string;to:string};
/** paused: „Nu niet beschikbaar”, tot een tijdstip (ISO) of tot iemand hem weer aanzet (until null). */
export type StationRule={mode:Mode;source:Source;hours:DayTimes[];paused:{until:string|null;at:string;by:string}|null};
export type StationSettings=Record<StationId,StationRule>;
export type StationStatus={open:boolean;reason:string};

const TIME=/^([01]\d|2[0-3]):[0-5]\d$/;
const defaultHours=():DayTimes[]=>Array.from({length:7},()=>({open:true,from:'10:00',to:'18:00'}));
/** Standaard altijd open: zo verandert er niets tot de eigenaar iets instelt. */
export const defaultRule=():StationRule=>({mode:'altijd',source:'speelboerderij',hours:defaultHours(),paused:null});
export const defaultSettings=():StationSettings=>({kok:defaultRule(),barista:defaultRule(),winkel:defaultRule()});

export class StationError extends Error{status:number;constructor(message:string,status=400){super(message);this.status=status}}

/** Controleert wat de eigenaar instelt (alles behalve de pauze, die blijft zoals hij is). Gooit StationError. */
export function checkSettings(raw:unknown,keep:StationSettings):StationSettings{
 const r=(raw&&typeof raw==='object'?raw:{}) as Record<string,unknown>;
 const out={} as StationSettings;
 for(const id of STATION_IDS){
  const s=(r[id]&&typeof r[id]==='object'?r[id]:{}) as Partial<StationRule>;
  if(!MODES.some(([m])=>m===s.mode))throw new StationError(`Kies bij ${STATION_NAMES[id].name} wanneer hij open is.`);
  if(!SOURCES.some(([v])=>v===s.source))throw new StationError(`Kies bij ${STATION_NAMES[id].name} welke openingstijden hij volgt.`);
  if(!Array.isArray(s.hours)||s.hours.length!==7)throw new StationError('Ongeldige tijden.');
  const hours=s.hours.map(h=>{
   const d=(h&&typeof h==='object'?h:{}) as Partial<DayTimes>;
   if(typeof d.open!=='boolean'||typeof d.from!=='string'||typeof d.to!=='string'||!TIME.test(d.from)||!TIME.test(d.to))throw new StationError(`Vul bij ${STATION_NAMES[id].name} geldige tijden in (uu:mm).`);
   if(d.open&&d.to!=='00:00'&&d.to<=d.from)throw new StationError(`Bij ${STATION_NAMES[id].name} moet de sluitingstijd na de openingstijd liggen.`);
   return {open:d.open,from:d.from,to:d.to};
  });
  out[id]={mode:s.mode as Mode,source:s.source as Source,hours,paused:keep[id]?.paused??null};
 }
 return out;
}
/** Leest opgeslagen instellingen; wat ontbreekt of niet klopt wordt de standaard (nooit een fout voor gasten). */
export function readSettings(json:string|null|undefined):StationSettings{
 const base=defaultSettings();
 try{
  const r=JSON.parse(json||'{}') as Record<string,Partial<StationRule>>;
  for(const id of STATION_IDS){const s=r[id];if(!s)continue;
   try{base[id]={...checkSettings({...defaultSettings(),[id]:{...base[id],...s}},base)[id],paused:pausedOf(s.paused)}}catch{}}
 }catch{}
 return base;
}
function pausedOf(v:unknown):StationRule['paused']{
 const p=(v&&typeof v==='object'?v:null) as {until?:unknown;at?:unknown;by?:unknown}|null;
 if(!p)return null;
 const until=typeof p.until==='string'&&!Number.isNaN(Date.parse(p.until))?p.until:null;
 return {until,at:typeof p.at==='string'?p.at:'',by:typeof p.by==='string'?p.by.slice(0,80):''};
}

const minutes=(t:string)=>{const [h,m]=t.split(':').map(Number);return h*60+m};
const inside=(now:number,from:string,to:string)=>now>=minutes(from)&&now<(to==='00:00'||to===''?24*60:minutes(to));

/** Is de werkplek nu open? Met de reden voor de gast als hij dicht is. */
export function stationStatus(id:StationId,rule:StationRule,guest:Pick<GuestState,'hours'|'exceptions'|'services'|'servicePauses'|'yteService'>,now=new Date()):StationStatus{
 const place=STATION_NAMES[id].place;
 if(rule.paused&&(rule.paused.until===null||Date.parse(rule.paused.until)>now.getTime()))return {open:false,reason:`${place} is nu even niet beschikbaar.`};
 const closed={open:false,reason:`${place} is nu gesloten.`};
 if(rule.mode==='altijd')return {open:true,reason:''};
 if(rule.mode==='dicht')return closed;
 const {day,minutes:t}=localMoment(now);
 if(rule.mode==='eigen'){const h=rule.hours[new Date(day+'T12:00:00Z').getUTCDay()];return h?.open&&inside(t,h.from,h.to)?{open:true,reason:''}:closed}
 if(rule.source==='yte'){
  const y=guest.yteService;const g=guest as GuestState;
  const ok=!!y&&new Date(day+'T12:00:00Z').getUTCDay()===y.weekday&&serviceOn(g,'yte',day)&&inside(t,y.from,y.to||'00:00');
  return ok?{open:true,reason:''}:closed;
 }
 const h=opening(guest as GuestState,day,rule.source);
 return h.open&&inside(t,h.from,h.to)?{open:true,reason:''}:closed;
}
export function allStatuses(s:StationSettings,guest:Parameters<typeof stationStatus>[2],now=new Date()):Record<StationId,StationStatus>{
 return Object.fromEntries(STATION_IDS.map(id=>[id,stationStatus(id,s[id],guest,now)])) as Record<StationId,StationStatus>;
}
/** De eerste regel van een bestelling bij een gesloten werkplek, of null. */
export function closedProblem(lines:{station?:string}[],status:Record<string,StationStatus>):string|null{
 for(const l of lines){const s=l.station&&status[l.station];if(s&&!s.open)return s.reason+' Haal dit uit je mandje of vraag het aan een van ons.'}
 return null;
}

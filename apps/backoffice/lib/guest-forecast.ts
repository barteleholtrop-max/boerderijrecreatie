import {connectionSetting} from './connection-runtime';
import {z} from 'zod';
export const visitSchema=z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),visitors:z.number().int().min(0).max(100000),temperature:z.number().min(-40).max(60),rain:z.number().min(0).max(500)});
export type Visit=z.infer<typeof visitSchema>;
/** Vergelijkbare bezoekdagen: dezelfde weekdag, binnen 6 weken van dezelfde datum in een vergelijkingsjaar, temperatuur hooguit 8 graden
 * verschil en allebei wel of geen regen. years: de jaren om mee te vergelijken (standaard vorig jaar; zie compareYears in
 * lib/forecast-core.ts voor jaren waarin de boerderij dicht was, besluit eigenaar 6 november 2026). */
export function predict(visits:Visit[],date:string,weather:{temperature:number;rain:number}|null,years?:number[]){
 const day=new Date(date+'T12:00:00Z'),list=years&&years.length?years:[day.getUTCFullYear()-1];
 const refs=list.map(y=>{const d=new Date(day);d.setUTCFullYear(y);return d});
 // Dezelfde weekdag binnen 6 weken van dezelfde datum in een vergelijkingsjaar.
 const season=visits.filter(v=>{const old=new Date(v.date+'T12:00:00Z');return refs.some(ref=>old.getUTCFullYear()===ref.getUTCFullYear()&&Math.abs(old.getTime()-ref.getTime())<=42*86400000)&&old.getUTCDay()===day.getUTCDay()});
 const label=list.join(' en '),avg=(l:Visit[])=>Math.round(l.reduce((n,v)=>n+v.visitors,0)/l.length);
 if(weather){
  const samples=season.filter(v=>Math.abs(v.temperature-weather.temperature)<=8&&(v.rain>=1)===(weather.rain>=1));
  if(samples.length>=3)return {expected:avg(samples),samples:samples.length,reason:`Gemiddelde van ${samples.length} vergelijkbare bezoekdagen uit ${label} (zelfde weekdag, ±6 weken, vergelijkbaar weer); indicatie, geen garantie.`};
 }
 // Zonder weersverwachting (verder dan 16 dagen vooruit) of te weinig dagen met vergelijkbaar weer (wens eigenaar 9 november 2026):
 // het seizoensgemiddelde van dezelfde weekdag, zonder op het weer te letten.
 if(season.length>=3)return {expected:avg(season),samples:season.length,reason:`Seizoensgemiddelde van ${season.length} ${day.toLocaleDateString('nl-NL',{weekday:'long',timeZone:'UTC'})}en uit ${label} (±6 weken)${weather?', te weinig dagen met vergelijkbaar weer':', nog zonder weersverwachting'}; indicatie, geen garantie.`};
 return {expected:null,samples:season.length,reason:`Minimaal drie vergelijkbare dagen nodig uit ${label} (zelfde weekdag, ±6 weken); nu ${season.length}.`};
}
/** Gemeten dagweer uit het archief van Open-Meteo (gemiddelde temperatuur en neerslag), voor historische bezoekdagen.
 *  Wens eigenaar 9 november 2026: bezoekdagen uit de oude kassa (2024 en 2025) met het weer van die dag. Gooit bij een fout. */
export async function weatherHistory(from:string,to:string){
 if(!connectionSetting('GUEST_WEATHER_LOCATION'))throw Error('Stel eerst de weerlocatie in bij Systeem & koppelingen → Weer.');
 const location=z.object({latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180)}).parse(JSON.parse(connectionSetting('GUEST_WEATHER_LOCATION')!));
 const url=new URL('https://archive-api.open-meteo.com/v1/archive');url.search=new URLSearchParams({latitude:String(location.latitude),longitude:String(location.longitude),start_date:from,end_date:to,daily:'temperature_2m_mean,precipitation_sum',timezone:'Europe/Amsterdam'}).toString();
 const r=await fetch(url,{signal:AbortSignal.timeout(30000),cache:'no-store'});if(!r.ok)throw Error('Het weerarchief is nu niet bereikbaar. Probeer het later opnieuw.');
 const d=await r.json() as {daily?:{time:string[];temperature_2m_mean:(number|null)[];precipitation_sum:(number|null)[]}};
 const out=new Map<string,{temperature:number;rain:number}>();
 (d.daily?.time||[]).forEach((date,i)=>{const t=d.daily!.temperature_2m_mean[i],p=d.daily!.precipitation_sum[i];if(Number.isFinite(t)&&Number.isFinite(p))out.set(date,{temperature:Math.round(t!*10)/10,rain:Math.round(p!*10)/10})});
 return out;
}
export async function weatherForecast(){
 if(!connectionSetting('GUEST_WEATHER_LOCATION'))return {days:[] as {date:string;temperature:number;rain:number}[],at:'',error:'Weerlocatie nog niet ingesteld.'};
 const location=z.object({latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180)}).parse(JSON.parse(connectionSetting('GUEST_WEATHER_LOCATION')!));
 try{const url=new URL('https://api.open-meteo.com/v1/forecast');url.search=new URLSearchParams({...Object.fromEntries(Object.entries(location).map(([k,v])=>[k,String(v)])),daily:'temperature_2m_mean,precipitation_sum',timezone:'Europe/Amsterdam',forecast_days:'16'}).toString();const r=await fetch(url,{signal:AbortSignal.timeout(15000),cache:'no-store'});if(!r.ok)throw Error();const d=await r.json();return {days:d.daily.time.map((date:string,i:number)=>({date,temperature:d.daily.temperature_2m_mean[i],rain:d.daily.precipitation_sum[i]})).filter((v:any)=>Number.isFinite(v.temperature)&&Number.isFinite(v.rain)),at:new Date().toISOString(),error:''};}catch{return {days:[],at:'',error:'Weerbron niet bereikbaar. Er wordt geen actuele prognose getoond.'};}
}

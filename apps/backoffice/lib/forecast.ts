// Voorspelling daggasten (wens eigenaar 6 november 2026): opslag. Rekenregels in lib/forecast-core.ts, de basis in lib/guest-forecast.ts.
// - Werkelijk bezoek per dag: de verkochte entree van de speelboerderij (producten met „Telt voor pot: Speelboerderij”), zonder
//   proefbestellingen en zonder onbetaalde of terugbetaalde bestellingen. Een met de hand geregistreerde bezoekdag gaat voor.
// - Elke berekende voorspelling voor vandaag of later wordt bewaard (forecast_log, met het voorspelde weer). Na de dag wordt die
//   vergeleken met het werkelijke bezoek: daaruit volgt de correctiefactor. Zo past de voorspelling zich vanzelf aan.
// - Een werkelijke dag met bewaard weer telt daarna ook mee als bezoekdag voor de voorspelling van volgend jaar.
import {getDb} from '@/db';
import {forecastSettings,forecastOverrides,forecastLog,products} from '@/db/schema';
import {env} from '@/lib/portable/env';
import {and,eq,gte,lt} from 'drizzle-orm';
import {countsAsRevenue} from './order-revenue';
import {orderPeriod} from './orders';
import {amsterdamDay} from './nl-core';
import {addDays} from './guest-overview';
import {predict,weatherForecast,type Visit} from './guest-forecast';
import {calibration,adjust,parseSettings,parseYears,compareYears,parseVisitLines,DEFAULT_SETTINGS,type Settings} from './forecast-core';

export class ForecastError extends Error{status:number;constructor(message:string,status=400){super(message);this.status=status}}
const now=()=>new Date().toISOString();
const today=()=>amsterdamDay(new Date());

export async function loadSettings():Promise<Settings&{version:number}>{
 const r=(await getDb().select().from(forecastSettings).where(eq(forecastSettings.id,'main')))[0];
 let closedYears=DEFAULT_SETTINGS.closedYears;if(r){try{closedYears=parseYears(JSON.parse(r.closedYears))}catch{}}
 return r?{auto:!!r.auto,periodDays:r.periodDays,manualPct:r.manualPct,closedYears,version:r.version}:{...DEFAULT_SETTINGS,version:0};
}
export async function saveSettings(raw:unknown,version:number,by:string){
 let s:Settings;try{s=parseSettings(raw)}catch(e){throw new ForecastError((e as Error).message)}
 const db=getDb(),t=now(),v={auto:s.auto?1:0,periodDays:s.periodDays,manualPct:s.manualPct,closedYears:JSON.stringify(s.closedYears),updated:t,updatedBy:by};
 const r=version===0?await db.insert(forecastSettings).values({id:'main',...v}).onConflictDoNothing().returning({id:forecastSettings.id})
  :await db.update(forecastSettings).set({...v,version:version+1}).where(and(eq(forecastSettings.id,'main'),eq(forecastSettings.version,version))).returning({id:forecastSettings.id});
 if(!r.length)throw new ForecastError('Iemand anders heeft dit net gewijzigd. Ververs en probeer opnieuw.',409);
}
/** Eigen getal voor een dag; null haalt het weg. */
export async function setOverride(date:unknown,visitors:unknown,note:unknown,by:string){
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new ForecastError('Kies een datum.');
 const db=getDb();
 if(visitors===null||visitors===''){await db.delete(forecastOverrides).where(eq(forecastOverrides.date,date));return}
 if(!Number.isInteger(visitors)||(visitors as number)<0||(visitors as number)>100000)throw new ForecastError('Vul een aantal gasten in (0 of meer).');
 const n=typeof note==='string'?note.replace(/\s+/g,' ').trim().slice(0,200):'';
 await db.insert(forecastOverrides).values({date,visitors:visitors as number,note:n,at:now(),by}).onConflictDoUpdate({target:forecastOverrides.date,set:{visitors:visitors as number,note:n,at:now(),by}});
}

/** Werkelijk aantal daggasten per dag in [from, to] (entree), aangevuld met met de hand geregistreerde bezoekdagen. */
export async function actualVisitors(from:string,to:string,manual:Visit[]){
 const out=new Map<string,number>();
 // Een periode in één keer is hoogstens een jaar (orderPeriod): langer wordt in stukken opgehaald.
 if(Date.parse(to)-Date.parse(from)>360*86400000){const mid=addDays(from,360);
  for(const [k,v] of await actualVisitors(from,addDays(mid,-1),[]))out.set(k,v);for(const [k,v] of await actualVisitors(mid,to,[]))out.set(k,v);
  for(const v of manual)if(v.date>=from&&v.date<=to)out.set(v.date,v.visitors);return out}
 const ids=(await getDb().select({id:products.id,published:products.published}).from(products)).filter(r=>{try{return !!r.published&&(JSON.parse(r.published) as {pot?:unknown}).pot==='speelboerderij'}catch{return false}}).map(r=>r.id);
 const period=orderPeriod(from,to);
 if(ids.length&&period){
  const rows=(await env.DB.prepare(`SELECT o.created AS created, o.status AS status, o.payment_status AS "paymentStatus", o.test AS test, l.quantity AS quantity
   FROM order_lines l JOIN orders o ON o.id=l.order_id WHERE o.created>=? AND o.created<? AND l.product_id IN (${ids.map(()=>'?').join(',')})`).bind(period.from,period.until,...ids).all()).results as {created:string;status:string;paymentStatus:string;test:number;quantity:number}[];
  for(const r of rows){if(Number(r.test)===1||!countsAsRevenue(r))continue;const d=amsterdamDay(new Date(r.created));out.set(d,(out.get(d)||0)+Number(r.quantity||0))}
 }
 for(const v of manual)if(v.date>=from&&v.date<=to)out.set(v.date,v.visitors);
 return out;
}

type WeatherDay={date:string;temperature:number;rain:number};type Weather={days:WeatherDay[];error?:string};
let weatherCache:{at:number;data:Weather}|null=null;
/** Het weer hooguit één keer per uur ophalen; een fout of lege verwachting wordt niet bewaard. */
async function weather():Promise<Weather>{if(weatherCache&&Date.now()-weatherCache.at<3600000)return weatherCache.data;const data=await weatherForecast() as Weather;if(data.days?.length)weatherCache={at:Date.now(),data};return data}

/** Historische bezoekdagen inlezen (wens eigenaar 9 november 2026), met het gemeten weer van die dag uit het weerarchief.
 *  Een dag die al stond, wordt vervangen. Dagen zonder weer in het archief worden overgeslagen en gemeld. */
export async function importVisits(text:unknown,by:string){
 if(typeof text!=='string'||text.length>200000)throw new ForecastError('Ongeldige lijst.');
 let rows;try{rows=parseVisitLines(text,today())}catch(e){throw new ForecastError((e as Error).message)}
 const {weatherHistory}=await import('./guest-forecast');
 let weather;try{weather=await weatherHistory(rows[0].date,rows.at(-1)!.date)}catch(e){throw new ForecastError((e as Error).message,503)}
 const visits=rows.filter(r=>weather.has(r.date)).map(r=>({date:r.date,visitors:r.visitors,...weather.get(r.date)!}));
 const {editGuest}=await import('./guest-store');
 await editGuest(s=>{const dates=new Set(visits.map(v=>v.date));s.visits=[...s.visits.filter(v=>!dates.has(v.date)),...visits].sort((a,b)=>a.date.localeCompare(b.date))});
 console.info('[voorspelling] bezoekdagen ingelezen',visits.length,'door',by);
 return {imported:visits.length,skipped:rows.length-visits.length,from:rows[0].date,to:rows.at(-1)!.date};
}

/** De voorspelling voor een reeks dagen, met de correctie en de vergelijking van de afgelopen periode. */
export async function forecastsFor(from:string,days:number,o:{log?:boolean}={log:true}){
 const {loadGuest}=await import('./guest-store');
 const db=getDb(),{state}=await loadGuest(),s=await loadSettings(),day0=today(),until=addDays(from,days-1);
 const w:Weather=await weather().catch(()=>({days:[],error:'Weer niet beschikbaar.'}));
 // Bezoekdagen: met de hand geregistreerd, plus werkelijke dagen met het weer uit het logboek (die tellen volgend jaar mee).
 const periodFrom=addDays(day0,-s.periodDays),logs=await db.select().from(forecastLog).where(gte(forecastLog.date,addDays(day0,-1200)));
 const actual=await actualVisitors(addDays(day0,-1200),addDays(day0,-1),state.visits);
 const manualDates=new Set(state.visits.map(v=>v.date));
 const visits:Visit[]=[...state.visits,...logs.filter(l=>l.date<day0&&!manualDates.has(l.date)&&actual.has(l.date)).map(l=>({date:l.date,visitors:actual.get(l.date)!,temperature:l.temperature,rain:l.rain}))];
 const pairs=logs.filter(l=>l.date>=periodFrom&&l.date<day0&&actual.has(l.date)).map(l=>({date:l.date,predicted:l.predicted,actual:actual.get(l.date)!}));
 const cal=calibration(pairs,s);
 const overrides=new Map((await db.select().from(forecastOverrides).where(and(gte(forecastOverrides.date,from),lt(forecastOverrides.date,addDays(until,1))))).map(r=>[r.date,r]));
 const out=[];
 for(let i=0;i<days;i++){
  const date=addDays(from,i),wd=w.days.find(x=>x.date===date)||null,base=predict(visits,date,wd,compareYears(Number(date.slice(0,4)),s.closedYears));
  if(o.log!==false&&date>=day0&&base.expected!==null&&wd)await db.insert(forecastLog).values({date,predicted:base.expected,temperature:wd.temperature,rain:wd.rain,at:now()})
   .onConflictDoUpdate({target:forecastLog.date,set:{predicted:base.expected,temperature:wd.temperature,rain:wd.rain,at:now()}});
  const ov=overrides.get(date)??null,a=adjust(base.expected,{factor:cal.factor,manualPct:s.manualPct,override:ov?ov.visitors:null});
  out.push({date,base:base.expected,samples:base.samples,reason:base.reason,expected:a.expected,how:a.how,override:ov?{visitors:ov.visitors,note:ov.note,by:ov.by}:null,
   weather:wd,actual:date<day0?actual.get(date)??null:null});
 }
 return {settings:s,compareYears:compareYears(Number(from.slice(0,4)),s.closedYears),calibration:cal,period:pairs.sort((a,b)=>b.date.localeCompare(a.date)),weatherError:w.error||'',days:out};
}
/** Alleen de getallen per dag (voor de personeelsplanning en het dagoverzicht). */
export async function forecastMap(from:string,days:number){
 try{const {withConnectionSettings}=await import('./connection-settings');const f=await withConnectionSettings(()=>forecastsFor(from,days));return Object.fromEntries(f.days.map(d=>[d.date,d.expected])) as Record<string,number|null>}catch{return {} as Record<string,number|null>}
}


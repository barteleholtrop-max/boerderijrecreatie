import {authorizeSheet} from '@/lib/sheet-access';
import {SheetError} from '@/lib/sheets';
import {withConnectionSettings} from '@/lib/connection-settings';
import {forecastsFor,saveSettings,setOverride,importVisits,ForecastError} from '@/lib/forecast';
export const dynamic='force-dynamic';
// Voorspelling daggasten (wens eigenaar 6 november 2026): bekijken, met de hand aanpassen en zelf laten bijstellen. Alleen de beheerder.
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
const failure=(e:unknown)=>e instanceof SheetError||e instanceof ForecastError?json({error:e.message},e.status):(console.error('[voorspelling]',e instanceof Error?e.message:e),json({error:'Er ging iets mis. Ververs en probeer opnieuw.'},500));
const day=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date());
const view=()=>withConnectionSettings(()=>forecastsFor(day(),16));
// Een andere periode (wens eigenaar 9 november 2026): ?van=JJJJ-MM-DD&dagen=N (hoogstens 400), bijvoorbeeld voor de weekagenda in mei.
export async function GET(req:Request){try{authorizeSheet(req);const q=new URL(req.url).searchParams,from=q.get('van')||'',n=Number(q.get('dagen'));
 if(/^\d{4}-\d{2}-\d{2}$/.test(from)&&Number.isInteger(n)&&n>=1&&n<=400)return json(await withConnectionSettings(()=>forecastsFor(from,n,{log:false})));
 return json(await view())}catch(e){return failure(e)}}
export async function POST(req:Request){try{
 authorizeSheet(req,true);
 const b=await req.json().catch(()=>null) as Record<string,unknown>|null,by=req.headers.get('x-boer-bart-account')||'eigenaar';
 if(!b)throw new ForecastError('Ongeldige aanvraag.');
 if(b.action==='instellingen'){if(!Number.isInteger(b.version))throw new ForecastError('Ongeldige aanvraag.');await saveSettings(b.settings,b.version as number,by)}
 else if(b.action==='eigen-getal')await setOverride(b.date,b.visitors,b.note,by);
 else if(b.action==='bezoekdagen'){
  // Binnen de koppelingsinstellingen, net als de voorspelling zelf: daar staat de weerlocatie (anders „Stel eerst de weerlocatie in”).
  const r=await withConnectionSettings(()=>importVisits(b.text,by));return json({...await view(),imported:r})}
 else throw new ForecastError('Onbekende actie.');
 return json(await view());
}catch(e){return failure(e)}}

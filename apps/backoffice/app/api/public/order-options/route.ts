import {normalizeCode,groupProblem,budgetProblem} from '@/lib/order-options';
import {getSetting,findGroup,groupSpent,amsterdamToday} from '@/lib/order-options-store';
import {createRateLimit,clientKey} from '@/lib/public-orders';
import {pickupSlots} from '@/lib/pickup-core';
import {loadGuest} from '@/lib/guest-store';
import {publicUitstraling} from '@/lib/uitstraling';
import {withConnectionSettings} from '@/lib/connection-settings';
import {onlineMode} from '@/lib/online-payments';
export const dynamic='force-dynamic';
// Public, read-only (no login; see proxy.ts): may the guest choose an own amount on the website, and is a group code valid?
// Only the group's name, host and last day are shown; never the budget, the spent amount or other orders.
const limit=createRateLimit({perClient:30,total:600});
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','X-Content-Type-Options':'nosniff'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
export async function GET(req:Request){
 try{
  const s=await getSetting('website');
  const ownAmount={enabled:s.enabled,maxPercent:s.maxPercent,allowZero:s.allowZero};
  // Afhaalmomenten voor vooraf bestellen in de winkel (uit de openingstijden van Planning). Leeg = afhalen niet mogelijk.
  const pickup={days:await loadGuest().then(g=>pickupSlots(g.state)).catch(()=>[])};
  // Uitstraling van de bestelapp (wens eigenaar 9 november 2026), gekozen bij Website & uitstraling. Bij een storing: klassiek.
  const uitstraling=await publicUitstraling();
  // Stand van online betalen (12 november 2026): de bestelpagina toont de strook „Proefversie” alleen als er niet echt betaald wordt.
  const betalen=await withConnectionSettings(async()=>onlineMode()).catch(()=>'uit' as const);
  const raw=new URL(req.url).searchParams.get('groep');
  if(raw===null||raw==='')return reply({ownAmount,pickup,uitstraling,betalen,group:null});
  if(!limit(clientKey(req.headers)))return reply({error:'Even geduld: probeer het over een minuut opnieuw.'},429);
  const code=normalizeCode(raw),group=code?await findGroup(code):null;
  const problem=groupProblem(group,amsterdamToday())??(group&&budgetProblem(await groupSpent(group.id),1,group.budgetCents));
  if(problem||!group)return reply({ownAmount,pickup,uitstraling,betalen,group:null,groupProblem:problem});
  return reply({ownAmount,pickup,uitstraling,betalen,group:{code:group.code,name:group.name,host:group.host,validUntil:group.validUntil,...(group.kind==='eigen'?{kind:'eigen'}:{})}});
 }catch{return reply({error:'De bestelopties zijn tijdelijk niet beschikbaar.'},503)}
}

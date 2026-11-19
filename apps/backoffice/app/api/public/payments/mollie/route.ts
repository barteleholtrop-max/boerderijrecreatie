import {withConnectionSettings} from '@/lib/connection-settings';
import {createRateLimit,clientKey} from '@/lib/public-orders';
import {handleWebhook} from '@/lib/online-payments';
import {molliePaymentId} from '@/lib/mollie';
export const dynamic='force-dynamic';
// Melding van Mollie dat een betaling is veranderd (webhook). Openbaar, zonder login; zie proxy.ts.
// De melding bevat alleen het kenmerk (id=tr_…). De stand zelf haalt de backoffice altijd bij Mollie op, dus een
// nagemaakte melding kan niets als betaald markeren. Onbekende kenmerken krijgen ook 200, zodat niets uitlekt;
// lukt het ophalen bij Mollie niet, dan 503 en probeert Mollie het later opnieuw.
// Rem per afzender (#137): één bezoeker die blijft sturen, kan de echte meldingen van Mollie niet meer verdringen.
const limit=createRateLimit({perClient:60,total:1200});
const ok=()=>new Response('',{status:200,headers:{'Cache-Control':'no-store'}});
export async function POST(req:Request){
 if(!limit(clientKey(req.headers)))return new Response('',{status:429});
 const text=await req.text().catch(()=>'');
 if(text.length>500)return new Response('',{status:413});
 const id=new URLSearchParams(text).get('id')||'';
 if(!molliePaymentId(id))return ok();
 try{await withConnectionSettings(()=>handleWebhook(id));return ok()}
 catch{return new Response('',{status:503,headers:{'Cache-Control':'no-store'}})}
}

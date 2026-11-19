import {isSameOrigin} from '@/lib/portable/origin';
import {cashWaiting,confirmCash} from '@/lib/online-payments';
export const dynamic='force-dynamic';
// Contant betalen bij de zelfservicekassa (besluit eigenaar 4 november 2026): het werkplekscherm Winkel ziet welke
// bestellingen op contant geld wachten, en een medewerker bevestigt „Contant ontvangen”. Alleen voor medewerkers (niet openbaar).
const fail=(error:string,status=400)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
export async function GET(){
 try{return Response.json(await cashWaiting(),{headers:{'Cache-Control':'private, no-store'}})}catch{return fail('De wachtende betalingen konden niet worden geladen.',500)}
}
export async function POST(req:Request){
 if(!isSameOrigin(req))return fail('Ongeldige herkomst.',403);
 const b=await req.json().catch(()=>null) as {orderId?:unknown}|null;
 if(!b||!Number.isInteger(b.orderId)||Number(b.orderId)<1)return fail('Onbekende bestelling.');
 const who=req.headers.get('x-boer-bart-account')||'medewerker';
 try{await confirmCash(Number(b.orderId),who);return Response.json({ok:true})}
 catch(e){return fail((e as Error).message||'Bevestigen lukte niet. Probeer het opnieuw.',(e as {status?:number}).status&&(e as {status:number}).status<500?(e as {status:number}).status:409)}
}

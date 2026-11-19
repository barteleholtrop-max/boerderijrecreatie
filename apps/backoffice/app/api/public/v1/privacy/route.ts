import {publicPrivacy} from '@/lib/privacy';
export const dynamic='force-dynamic';
// De vaste poort voor het privacybeleid van alle sites, versie 1 (wens eigenaar 15 november 2026). Openbaar en alleen lezen
// (zie proxy.ts): GET /api/public/v1/privacy. Het antwoord is een contract (docs/PRIVACY-ALLE-SITES.md): velden komen erbij,
// maar verdwijnen of veranderen niet. De database wordt hooguit één keer per minuut gelezen. Bij een storing: 503, nooit een
// oude of geraden tekst; de site toont dan een korte melding.
const TTL=60000;let cache:{at:number;body:string}|null=null;
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=60','Access-Control-Allow-Origin':'*','X-Content-Type-Options':'nosniff'};
export async function GET(){
 try{
  if(!cache||Date.now()-cache.at>TTL)cache={at:Date.now(),body:JSON.stringify(await publicPrivacy())};
  return new Response(cache.body,{headers});
 }catch{
  return Response.json({error:'Het privacybeleid is tijdelijk niet beschikbaar.'},{status:503,headers:{'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}});
 }
}

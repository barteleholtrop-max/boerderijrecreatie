import {publishedRows,publicInhoud,isSiteKey,isKindKey,type Row} from '@/lib/inhoud';
export const dynamic='force-dynamic';
// De vaste poort van het dorp, versie 1 (wens eigenaar 13 november 2026). Openbaar en alleen lezen (zie proxy.ts):
//   GET /api/public/v1/inhoud?site=boerbart[&soort=blog|nieuws|video][&adres=<slug>][&aantal=10]
// Het antwoord is een contract (docs/INHOUD-EN-DORP.md): velden komen erbij, maar verdwijnen of veranderen niet.
// De database wordt hooguit één keer per minuut gelezen. Bij een storing: 503, nooit oude of geraden inhoud.
const TTL=60000;let cache:{at:number;rows:Row[]}|null=null;
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=60','Access-Control-Allow-Origin':'*','X-Content-Type-Options':'nosniff'};
const bad=(error:string,status=400)=>Response.json({error},{status,headers:{'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}});
export async function GET(req:Request){
 const q=new URL(req.url).searchParams,site=q.get('site')||'',kind=q.get('soort')||'',slug=q.get('adres')||'',limit=Number(q.get('aantal')||50);
 if(!isSiteKey(site))return bad('Onbekende site.');
 if(kind&&!isKindKey(kind))return bad('Onbekende soort.');
 if(slug&&!/^[a-z0-9-]{1,80}$/.test(slug))return bad('Ongeldig adres.');
 if(!Number.isInteger(limit)||limit<1||limit>100)return bad('Aantal moet tussen 1 en 100 liggen.');
 try{
  if(!cache||Date.now()-cache.at>TTL)cache={at:Date.now(),rows:await publishedRows()};
  const items=publicInhoud(cache.rows,{site,kind:isKindKey(kind)?kind:undefined,slug:slug||undefined,limit});
  if(slug&&!items.length)return bad('Niet gevonden.',404);
  return new Response(JSON.stringify({versie:1,site,items}),{headers});
 }catch{
  return Response.json({error:'De inhoud is tijdelijk niet beschikbaar.'},{status:503,headers:{'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}});
 }
}

// Reactie van de gast op een offerte (wens eigenaar 5 november 2026): akkoord of een vraag, via de persoonlijke link.
// - De link (43 tekens) is de toegang; een onbekende link geeft 404.
// - Alleen POST vanaf de offertepagina zelf (zelfde Origin als de backoffice), met een limiet per minuut en een maximale grootte.
// - Akkoord kan alleen op een verstuurde, nog geldige offerte en alleen op de versie die de gast ziet.
import {z} from 'zod';
import {createRateLimit,clientKey} from '@/lib/public-orders';
import {respondToQuote} from '@/lib/quote-mail';
import {publicQuote} from '@/lib/quotes';
export const dynamic='force-dynamic';
const limit=createRateLimit({perClient:10,total:60});
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const self=()=>new URL(process.env.APP_ORIGIN||'http://localhost:3001').origin;
export async function POST(req:Request,{params}:{params:Promise<{token:string}>}){
 const {token}=await params;
 if(!/^[A-Za-z0-9_-]{43}$/.test(token))return json({error:'Deze offerte kennen we niet.'},404);
 if(req.headers.get('origin')!==self())return json({error:'Niet toegestaan.'},403);
 if(!limit(clientKey(req.headers)))return json({error:'Even geduld, probeer het over een minuut opnieuw.'},429);
 try{
  const raw=await req.text();if(raw.length>5000)return json({error:'Bericht te lang.'},413);
  const q=await respondToQuote(token,JSON.parse(raw));
  return json({ok:true,quote:publicQuote(q)});
 }catch(e){
  if(e instanceof z.ZodError)return json({error:e.issues[0]?.message||'Controleer je gegevens.'},400);
  if(e instanceof SyntaxError)return json({error:'Ongeldig verzoek.'},400);
  const m=e instanceof Error?e.message:'';
  if(m==='Deze offerte kennen we niet.')return json({error:m},404);
  if(/^(Je hebt|Op deze offerte|Deze offerte is verlopen|De offerte is intussen)/.test(m))return json({error:m},409);
  return json({error:'Dat lukt nu niet. Probeer het zo opnieuw of antwoord op de mail.'},503);
 }
}

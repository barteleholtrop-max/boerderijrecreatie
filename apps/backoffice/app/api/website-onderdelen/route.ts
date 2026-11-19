import {authorizeSheet} from '@/lib/sheet-access';
import {SheetError} from '@/lib/sheets';
import {getOnderdelen,saveOnderdelen,OnderdelenError,ONDERDELEN} from '@/lib/website-onderdelen';
export const dynamic='force-dynamic';
// Backoffice: per onderdeel van de hoofdsite open of in ontwikkeling (wens eigenaar 15 november 2026). Zie lib/website-onderdelen.ts.
// Zelfde toegang als de uitstraling van de bestelapp (lib/uitstraling.ts): lezen met toegang tot het blad, opslaan met schrijfrecht.
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
const fail=(e:unknown)=>e instanceof SheetError||e instanceof OnderdelenError?json({error:e.message},e.status):json({error:'Er ging iets mis. Ververs en probeer opnieuw.'},500);

export async function GET(req:Request){try{
 authorizeSheet(req);
 return json({...await getOnderdelen(),options:ONDERDELEN});
}catch(e){return fail(e)}}

export async function POST(req:Request){try{
 authorizeSheet(req,true);
 const raw=await req.text();if(raw.length>2000)throw new OnderdelenError('De aanvraag is te groot.');
 let b:{onderdelen?:unknown;version?:unknown};try{b=JSON.parse(raw)}catch{throw new OnderdelenError('Ongeldige aanvraag.')}
 const version=await saveOnderdelen(b?.onderdelen,typeof b?.version==='number'?b.version:-1,req.headers.get('x-boer-bart-account')||'');
 return json({ok:true,version});
}catch(e){return fail(e)}}

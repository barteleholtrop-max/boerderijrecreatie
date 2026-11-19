import {authorizeSheet} from '@/lib/sheet-access';
import {SheetError} from '@/lib/sheets';
import {getUitstraling,saveUitstraling,UitstralingError,UITSTRALINGEN} from '@/lib/uitstraling';
export const dynamic='force-dynamic';
// Backoffice (owner only): which look the order app has for every guest (wens eigenaar 9 november 2026). See lib/uitstraling.ts.
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
const fail=(e:unknown)=>e instanceof SheetError||e instanceof UitstralingError?json({error:e.message},e.status):json({error:'Er ging iets mis. Ververs en probeer opnieuw.'},500);

export async function GET(req:Request){try{
 authorizeSheet(req);
 return json({...await getUitstraling(),options:UITSTRALINGEN});
}catch(e){return fail(e)}}

export async function POST(req:Request){try{
 authorizeSheet(req,true);
 const raw=await req.text();if(raw.length>1000)throw new UitstralingError('De aanvraag is te groot.');
 let b:{uitstraling?:unknown;version?:unknown};try{b=JSON.parse(raw)}catch{throw new UitstralingError('Ongeldige aanvraag.')}
 const version=await saveUitstraling(b?.uitstraling,typeof b?.version==='number'?b.version:-1,req.headers.get('x-boer-bart-account')||'');
 return json({ok:true,version});
}catch(e){return fail(e)}}

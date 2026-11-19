import {authorizeSheet} from '@/lib/sheet-access';
import {SheetError} from '@/lib/sheets';
import {isOwnerRequest} from '@/lib/owner';
import {noteSensitive} from '@/lib/gevoelig';
import {listPhones,revokePhone,PhoneError} from '@/lib/telefoon-pas';
export const dynamic='force-dynamic';
// Telefoons met de managerapp altijd ingelogd (Systeem → Toegang): bekijken en ontkoppelen. Alleen een eigenaar. Valt onder
// /api/toegang, dus de proxy vraagt opnieuw de Authenticator-code als de laatste langer dan 10 minuten geleden is.
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
const fail=(e:unknown)=>e instanceof SheetError||e instanceof PhoneError?json({error:e.message},e.status):(console.error('[telefoons]',e instanceof Error?e.message:e),json({error:'Er ging iets mis. Ververs en probeer opnieuw.'},500));
const ownerOnly=(req:Request,write=false)=>{authorizeSheet(req,write);if(!isOwnerRequest(req))throw new PhoneError('Alleen een eigenaar kan telefoons ontkoppelen.',403)};
export async function GET(req:Request){try{ownerOnly(req);return json({telefoons:await listPhones()})}catch(e){return fail(e)}}
export async function POST(req:Request){try{
 ownerOnly(req,true);const by=req.headers.get('x-boer-bart-account')||'eigenaar';
 const raw=await req.text();if(raw.length>1000)throw new PhoneError('Ongeldige aanvraag.');
 let b:Record<string,unknown>={};try{b=JSON.parse(raw)}catch{throw new PhoneError('Ongeldige aanvraag.')}
 if(b.action==='ontkoppelen'){await revokePhone(b.id,by);await noteSensitive(req,'telefoon:ontkoppeld',{id:b.id});return json({ok:true,telefoons:await listPhones()})}
 throw new PhoneError('Onbekende actie.');
}catch(e){return fail(e)}}

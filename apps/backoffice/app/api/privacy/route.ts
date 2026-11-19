import {authorizeSheet} from '@/lib/sheet-access';
import {SheetError} from '@/lib/sheets';
import {getPrivacy,savePrivacy,controller} from '@/lib/privacy';
import {PrivacyError,PLACEHOLDERS,LIMITS,DEFAULT_POLICY} from '@/lib/privacy-core';
export const dynamic='force-dynamic';
// Privacy · alle sites (wens eigenaar 15 november 2026): het ene privacybeleid beheren. Eigenaren en medewerkers met het vinkje
// Marketing & website. De sites lezen het via /api/public/v1/privacy.
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
const fail=(e:unknown)=>e instanceof SheetError||e instanceof PrivacyError?json({error:e.message},e.status):(console.error('[privacy]',e),json({error:'Er ging iets mis. Ververs en probeer opnieuw.'},500));

export async function GET(req:Request){try{
 authorizeSheet(req);
 const [p,c]=await Promise.all([getPrivacy(),controller()]);
 return json({...p,controller:c,placeholders:PLACEHOLDERS,limits:LIMITS,defaultPolicy:DEFAULT_POLICY});
}catch(e){return fail(e)}}

export async function POST(req:Request){try{
 authorizeSheet(req,true);
 const raw=await req.text();if(raw.length>600000)throw new PrivacyError('De aanvraag is te groot.');
 let b:{policy?:unknown;version?:unknown};try{b=JSON.parse(raw)}catch{throw new PrivacyError('Ongeldige aanvraag.')}
 return json({ok:true,...await savePrivacy(b?.policy,b?.version,req.headers.get('x-boer-bart-account')||'')});
}catch(e){return fail(e)}}

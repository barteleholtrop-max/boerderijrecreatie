import {authorizeSheet} from '@/lib/sheet-access';
import {SheetError} from '@/lib/sheets';
import {listAccounts,saveAccount,removeAccount,authIdOf,AccessError} from '@/lib/access-store';
import {authConfig,normalizeEmail,validEmail} from '@/lib/login-core';
import {adminRemoveTotp,AuthFail} from '@/lib/supabase-auth';
import {isOwnerRequest} from '@/lib/owner';
import {noteSensitive,recentAudit} from '@/lib/gevoelig';
export const dynamic='force-dynamic';
// Toegangslijst beheren (Systeem & koppelingen → Toegang). Alleen voor een eigenaar; wijzigen alleen vanaf de eigen backoffice.
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
const fail=(e:unknown)=>e instanceof SheetError||e instanceof AccessError?json({error:e.message},e.status):(console.error('[toegang]',e instanceof Error?e.message:e),json({error:'Er ging iets mis. Ververs en probeer opnieuw.'},500));
// Met de login aan beheert alleen een eigenaar van de lijst de toegang; zonder login (proefomgeving) de eigenaar van de proef.
const ownerOnly=(req:Request)=>{authorizeSheet(req);if(!isOwnerRequest(req))throw new AccessError('Alleen een eigenaar kan de toegang beheren.',403)};
// Inloggen staat altijd aan (besluit eigenaar 8 november 2026); zonder Supabase-instellingen is de backoffice dicht.
const loginOn=()=>!!authConfig();
export async function GET(req:Request){try{ownerOnly(req);
 const accounts=(await listAccounts()).map(({authId,modules,...a})=>({...a,linked:!!authId,modules:(()=>{try{return JSON.parse(modules)}catch{return []}})()}));
 return json({login:loginOn(),reset:!!authConfig()?.serviceKey,accounts,vastlegging:await recentAudit(50).catch(()=>[])});
}catch(e){return fail(e)}}
export async function POST(req:Request){try{
 authorizeSheet(req,true);ownerOnly(req);const by=req.headers.get('x-boer-bart-account')||'eigenaar';
 const raw=await req.text();if(raw.length>2000)throw new AccessError('Ongeldige aanvraag.');
 const b=JSON.parse(raw) as Record<string,unknown>;
 await noteSensitive(req,'toegang:'+String(b.action).slice(0,30),{wie:b.email??null,rol:b.role??null,actief:b.active??null,onderdelen:b.modules??null,zonderCode:b.quick??null});
 if(b.action==='opslaan'){await saveAccount({email:b.email,name:b.name,role:b.role,active:b.active,modules:b.modules,quick:b.quick},by);return json({ok:true})}
 if(b.action==='verwijderen'){await removeAccount(b.email);return json({ok:true})}
 // Telefoon kwijt (besluit eigenaar 6 november 2026): een ANDERE eigenaar haalt de Authenticator weg. Bij de volgende keer
 // inloggen koppelt de persoon een nieuwe app. Wie al ingelogd is, kan tot uiterlijk 8 uur verder; zet iemand uit om
 // dat direct te stoppen.
 if(b.action==='code-resetten'){
  const email=normalizeEmail(b.email);if(!validEmail(email))throw new AccessError('Ongeldig e-mailadres.');
  if(req.headers.get('x-boer-bart-email')===email)throw new AccessError('Je kunt je eigen Authenticator niet resetten. Vraag een andere eigenaar.',409);
  const cfg=authConfig();if(!cfg?.serviceKey)throw new AccessError('Resetten vraagt SUPABASE_SERVICE_ROLE_KEY op de server. Of haal de Authenticator weg in Supabase: Authentication → Users → dit adres.',503);
  const id=await authIdOf(email);if(!id)throw new AccessError('Deze persoon heeft nog nooit ingelogd; er is niets te resetten.',404);
  try{const n=await adminRemoveTotp(cfg,id);console.info('[toegang] Authenticator gereset',JSON.stringify({email,by,removed:n,at:new Date().toISOString()}));return json({ok:true,removed:n})}
  catch(e){if(e instanceof AuthFail)throw new AccessError('Supabase gaf een fout bij het resetten. Probeer het opnieuw of reset in Supabase zelf.',502);throw e}
 }
 throw new AccessError('Onbekende actie.');
}catch(e){return fail(e instanceof SyntaxError?new AccessError('Ongeldige aanvraag.'):e)}}

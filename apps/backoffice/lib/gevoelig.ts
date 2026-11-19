// Gevoelige handelingen (besluit eigenaar 6 november 2026): ook als je al bent ingelogd, vraagt de backoffice opnieuw de
// code uit de Authenticator-app als de laatste code langer dan 10 minuten geleden is. Voorbeelden: toegang wijzigen, de
// bankverdeling bevestigen of uitbetalen, Bloei (obligaties en participaties), koppelingen en sleutels, proefgegevens
// wissen, en namens een lid zijn bankrekening of persoonlijke link wijzigen. Elke handeling wordt vastgelegd.
// Voor Bloei geldt sinds 8 november 2026 strenger: één code per handeling (unusedCode hieronder).
// De proxy controleert de adressen hieronder; routes met een gevoelige handeling binnen een gewone route roepen
// requireFreshCode zelf aan. Zonder login (ontwikkelen) is er geen code en geldt dit niet.
export const FRESH_MINUTES=10;
const SENSITIVE_POST=['/api/toegang','/api/gasten/koppelingen'];
const under=(path:string,prefix:string)=>path===prefix||path.startsWith(prefix+'/');
export const sensitivePath=(path:string,method:string)=>method!=='GET'&&method!=='HEAD'&&method!=='OPTIONS'&&SENSITIVE_POST.some(p=>under(path,p));
export const freshCode=(mfa:number,now=Date.now())=>Number.isFinite(mfa)&&mfa>0&&now-mfa<=FRESH_MINUTES*60000;
/** Tijdstip van de laatste ingevoerde code; 0 als je zonder code binnenkwam (quick) en nog geen code gaf. */
export const codeAt=(s:{mfa:number;quick?:true})=>s.quick?0:s.mfa;
export const AGAIN_TEXT='Bevestig dit met de code uit je Authenticator-app.';
// Bloei (besluit eigenaar 8 november 2026): wie namens een obligatiehouder handelt (te koop zetten, publiceren, overdragen,
// documenten, import, leningen), bevestigt élke handeling met een nieuwe code. Geen venster van 10 minuten: de code is
// hooguit 2 minuten oud én nog niet eerder gebruikt. De route roept actionCode aan (lib/handeling-code.ts), die daarna
// mfaUsed in de sessie zet.
export const ONCE_SECONDS=120;
export const unusedCode=(s:{mfa:number;mfaUsed?:number;quick?:true},now=Date.now())=>!s.quick&&Number.isFinite(s.mfa)&&now-s.mfa<=ONCE_SECONDS*1000&&s.mfaUsed!==s.mfa;
export const ONCE_TEXT='Bevestig deze handeling met een nieuwe code uit je Authenticator-app.';

/** Gooit een 401-antwoord als de laatste code te oud is (alleen met login aan: de proxy zet x-boer-bart-mfa). */
export function requireFreshCode(req:Request){
 const raw=req.headers.get('x-boer-bart-mfa');if(raw===null)return;
 if(!freshCode(Number(raw)))throw Response.json({error:AGAIN_TEXT,opnieuwCode:true},{status:401,headers:{'Cache-Control':'no-store'}});
}

/** Vastleggen wie wat deed (alleen toevoegen). Een fout bij vastleggen blokkeert de handeling niet, maar komt in het log. */
export async function noteSensitive(req:Request,action:string,detail:unknown=''){
 const row={id:crypto.randomUUID(),at:new Date().toISOString(),account:req.headers.get('x-boer-bart-account')||'eigenaar',email:req.headers.get('x-boer-bart-email')||'',
  action:action.slice(0,80),path:new URL(req.url).pathname.slice(0,200),detail:(typeof detail==='string'?detail:JSON.stringify(detail)).slice(0,2000)};
 console.info('[vastlegging]',JSON.stringify(row));
 try{const {getDb}=await import('@/db');const {securityAudit}=await import('@/db/schema');await getDb().insert(securityAudit).values(row)}
 catch(e){console.error('[vastlegging] niet opgeslagen',e instanceof Error?e.message:e)}
}
/** De laatste vastleggingen, voor het scherm Toegang. */
export async function recentAudit(limit=50){
 const {getDb}=await import('@/db');const {securityAudit}=await import('@/db/schema');const {desc}=await import('drizzle-orm');
 return getDb().select().from(securityAudit).orderBy(desc(securityAudit.at)).limit(limit);
}

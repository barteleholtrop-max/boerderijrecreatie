import {authorizeSheet} from '@/lib/sheet-access';
import {SheetError} from '@/lib/sheets';
import {withConnectionSettings} from '@/lib/connection-settings';
import {enqueue} from '@/lib/outbox';
import {tick} from '@/lib/assistant-jobs';
import {profileStatus,profileLocations,chooseLocation,profileSettings,syncProfile,disconnectProfile,ProfileError} from '@/lib/google-profile';
export const dynamic='force-dynamic';
// Google Bedrijfsprofiel (Openingstijden & capaciteit): status, profiel kiezen, instellingen, nu bijwerken en ontkoppelen.
// Alleen voor de eigenaar; schrijfacties alleen vanaf de eigen backoffice.
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
function failure(e:unknown){
 if(e instanceof SheetError||e instanceof ProfileError)return json({error:e.message},e.status);
 console.error('[google-profiel]',e instanceof Error?e.message:e);return json({error:'Er ging iets mis. Ververs en probeer opnieuw.'},500);
}
export async function GET(req:Request){try{authorizeSheet(req);return json(await withConnectionSettings(async()=>{
 const s=await profileStatus();
 if(!s.connected)return {...s,locations:[],locationsError:null};
 try{return {...s,locations:await profileLocations(),locationsError:null}}catch(e){return {...s,locations:[],locationsError:e instanceof ProfileError?e.message:'De profielen konden niet worden opgehaald.'}}
}))}catch(e){return failure(e)}}
export async function POST(req:Request){try{
 authorizeSheet(req,true);
 const b=await req.json() as {action?:unknown;account?:unknown;location?:unknown;title?:unknown;syncHours?:unknown;syncEvents?:unknown};
 return await withConnectionSettings(async()=>{
  if(b.action==='kies-profiel'){await chooseLocation(String(b.account||''),String(b.location||''),String(b.title||''));await enqueue('google-profiel-sync:gekozen:'+Date.now(),'google-profiel-sync');void tick();return json({ok:true,message:'Profiel gekozen. De openingstijden en evenementen gaan nu naar Google.'})}
  if(b.action==='instellingen'){if(typeof b.syncHours!=='boolean'||typeof b.syncEvents!=='boolean')throw new ProfileError('Ongeldige aanvraag.');await profileSettings(b.syncHours,b.syncEvents);return json({ok:true,message:'Opgeslagen.'})}
  if(b.action==='nu-bijwerken'){const r=await syncProfile(true);if(!r.ok)throw new ProfileError(r.error||(r.skipped==='bezig'?'Er wordt al bijgewerkt. Probeer het zo opnieuw.':'Kies eerst een bedrijfsprofiel.'),409);const done=r.done||[];return json({ok:true,message:done.length?'Bijgewerkt: '+done.join(', ')+'.':'Alles stond al goed op Google.'})}
  if(b.action==='ontkoppelen'){await disconnectProfile();return json({ok:true,message:'Ontkoppeld. Er gaat niets meer naar Google; wat er al staat blijft staan.'})}
  throw new ProfileError('Onbekende actie.');
 });
}catch(e){return failure(e)}}

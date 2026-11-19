import {z} from 'zod';
import {env} from './portable/env';
import {encryptSecret,decryptSecret} from './sheet-secret';
import {runWithConnectionValues,connectionSetting} from './connection-runtime';
import {CONNECTION_FIELDS,googleMailboxesSchema,refreshKey} from './connection-fields';
import {validMollieKey} from './mollie';
import {validBunqKey,bunqLiveAllowed} from './bunq';
import {WORKSPACE_ID} from './claude-workspace';
export const settingsKeyReady=()=>/^[a-f0-9]{64}$/.test(process.env.SHEETS_CONFIG_KEY||'');
export async function loadConnectionSettings(){const row=await env.DB.prepare('SELECT version,secret FROM connection_settings WHERE id=1').first() as {version:number;secret:string}|null;if(!row)return {version:0,values:{} as Record<string,string>};if(!settingsKeyReady())throw Error('De beveiligde opslag kan niet worden geopend. Controleer de bestaande encryptiesleutel.');try{return {version:row.version,values:z.record(z.string(),z.string()).parse(JSON.parse(await decryptSecret(row.secret,process.env.SHEETS_CONFIG_KEY!)))}}catch{throw Error('De beveiligde opslag kan niet worden geopend. Controleer de encryptiesleutel; bestaande instellingen blijven bewaard.');}}
export async function withConnectionSettings<T>(fn:()=>Promise<T>){const saved=await loadConnectionSettings();return runWithConnectionValues(saved.values,fn);}
const patchSchema=z.object({id:z.string().min(1).max(60),version:z.number().int().nonnegative(),values:z.record(z.string(),z.string().max(30000)),clear:z.array(z.string()).max(100).default([])});
export function validatedPatch(raw:unknown,fields:typeof CONNECTION_FIELDS[string],saved:Record<string,string>){
 const b=patchSchema.parse(raw),allowed=new Map(fields.map(f=>[f.key,f])),result={...saved};
 let before:z.infer<typeof googleMailboxesSchema>=[];try{before=googleMailboxesSchema.parse(JSON.parse(saved.GUEST_GOOGLE_MAILBOXES??process.env.GUEST_GOOGLE_MAILBOXES??'[]'))}catch{}
 const after=Object.hasOwn(b.values,'GUEST_GOOGLE_MAILBOXES')?googleMailboxesSchema.parse(JSON.parse(b.values.GUEST_GOOGLE_MAILBOXES)):before;
 const tokens=new Set(after.map(m=>m.tokenEnv));
 // Existing server token selectors may be retained; new selectors must be in this connector's own namespace.
 for(const m of after)if(!before.some(old=>old.id===m.id&&old.tokenEnv===m.tokenEnv)&&m.tokenEnv!==refreshKey(m.id))throw Error('Ongeldige tokensleutel voor Google-account.');
 for(const key of tokens)if(fields.some(f=>f.kind==='mailboxes')&&(before.some(m=>m.tokenEnv===key)||key.startsWith('GUEST_GOOGLE_REFRESH_')))allowed.set(key,{key,label:'Google toegangstoken',secret:true});
 for(const [key,value] of Object.entries(b.values)){const field=allowed.get(key);if(!field)throw Error('Deze instelling mag hier niet worden gewijzigd.');if(field.secret&&value==='')continue;result[key]=value;}
 for(const key of b.clear){if(!allowed.has(key))throw Error('Deze instelling mag hier niet worden gewist.');result[key]='';}
 if(Object.hasOwn(b.values,'GUEST_GOOGLE_MAILBOXES')){result.GUEST_GOOGLE_MAILBOXES=JSON.stringify(after);for(const old of before)if(!after.some(m=>m.tokenEnv===old.tokenEnv)&&old.tokenEnv.startsWith('GUEST_GOOGLE_REFRESH_'))delete result[old.tokenEnv];}
 if(b.id==='weer'){const lat=result.GUEST_WEATHER_LATITUDE??process.env.GUEST_WEATHER_LATITUDE??'',lon=result.GUEST_WEATHER_LONGITUDE??process.env.GUEST_WEATHER_LONGITUDE??'';if(lat===''&&lon==='')result.GUEST_WEATHER_LOCATION='';else{if(lat===''||lon===''||!Number.isFinite(Number(lat))||!Number.isFinite(Number(lon))||Math.abs(Number(lat))>90||Math.abs(Number(lon))>180)throw Error('Vul een geldige breedtegraad en lengtegraad in.');result.GUEST_WEATHER_LOCATION=JSON.stringify({latitude:Number(lat),longitude:Number(lon)});}}
 if(b.id==='gast-ai'&&b.values.ANTHROPIC_WORKSPACE_ID?.trim()&&!WORKSPACE_ID.test(b.values.ANTHROPIC_WORKSPACE_ID.trim()))throw Error('Dit is geen geldig Claude werkruimte-ID. Kopieer het „Werkruimte-ID” uit de Claude Console; het begint met wrkspc_.');
 if(b.id==='gast-ai'&&b.values.ANTHROPIC_WORKSPACE_ID)result.ANTHROPIC_WORKSPACE_ID=b.values.ANTHROPIC_WORKSPACE_ID.trim();
 // bunq-sleutel meteen controleren (12 november 2026): een onbruikbare sleutel zette online betalen stil uit („staat nog niet aan”).
 // Spaties en regeleinden uit het kopiëren worden weggehaald; de sleutel zelf wordt nooit in een melding getoond.
 if(b.id==='bunq'&&b.values.GUEST_BUNQ_API_KEY){const k=b.values.GUEST_BUNQ_API_KEY.replace(/\s+/g,'');
  if(!validBunqKey(k))throw Error(bunqLiveAllowed()?'Dit is geen geldige bunq-sleutel. Een bunq API-sleutel bestaat alleen uit letters en cijfers (40 tot 80 tekens). Maak in de bunq-app in het zakelijke profiel bij Ontwikkelaars → API-sleutels een nieuwe sleutel en kopieer die in zijn geheel.':'Dit is geen geldige bunq-sleutel. Zolang live niet aanstaat werkt alleen een sandbox-sleutel (sandbox_…).');
  result.GUEST_BUNQ_API_KEY=k}
 if(b.id==='mollie'&&b.values.MOLLIE_API_KEY&&!validMollieKey(b.values.MOLLIE_API_KEY.trim()))throw Error(b.values.MOLLIE_API_KEY.trim().startsWith('live_')?'Een live-sleutel van Mollie werkt pas als live bij publiceren wordt aangezet. Gebruik nu de testsleutel (test_…).':'Dit is geen geldige Mollie-sleutel. Plak de testsleutel (test_…) uit het Mollie-dashboard.');
 if(b.id==='mollie'&&b.values.MOLLIE_API_KEY)result.MOLLIE_API_KEY=b.values.MOLLIE_API_KEY.trim();
 if(b.id==='mollie'&&Object.hasOwn(b.values,'ONLINE_BETALEN')&&!['','mollie','bunq'].includes(b.values.ONLINE_BETALEN))throw Error('Kies Mollie of bunq-betaalverzoek.');
 if(Buffer.byteLength(JSON.stringify(result),'utf8')>50000)throw Error('De totale instellingen zijn te groot. Verkort de tekstvelden.');
 return {version:b.version,values:result,changed:[...new Set([...Object.keys(b.values).filter(k=>b.values[k]!==''||!allowed.get(k)?.secret),...b.clear])]};
}
export async function saveConnectionSettings(raw:unknown,fields:typeof CONNECTION_FIELDS[string],account:string){if(!settingsKeyReady())throw Error('Beveiligd opslaan vereist de bestaande SHEETS_CONFIG_KEY op de server. Voer de normale project-setup uit als die nog ontbreekt.');const loaded=await loadConnectionSettings(),patch=validatedPatch(raw,fields,loaded.values);if(patch.version!==loaded.version)throw Error('Instellingen zijn elders gewijzigd. Ververs en controleer opnieuw.');const encrypted=await encryptSecret(JSON.stringify(patch.values),process.env.SHEETS_CONFIG_KEY!),at=new Date().toISOString();try{await env.DB.batch([
 env.DB.prepare('INSERT INTO connection_settings(id,version,secret,updated,updated_by) VALUES(1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET version=CASE WHEN connection_settings.version=? THEN excluded.version ELSE NULL END,secret=excluded.secret,updated=excluded.updated,updated_by=excluded.updated_by').bind(loaded.version+1,encrypted,at,account,loaded.version),
 env.DB.prepare('INSERT INTO connection_setting_audit(at,account,connection_id,fields) VALUES(?,?,?,?)').bind(at,account,String((raw as {id:string}).id),JSON.stringify(patch.changed)),
 ]);}catch{throw Error('Opslaan niet bevestigd. Ververs eerst; een andere beheerder kan de instellingen hebben gewijzigd.');}}
export {isOwnerRequest as isSettingsOwner} from './owner';

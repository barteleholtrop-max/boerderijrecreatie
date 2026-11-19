// Managerapp altijd ingelogd op de eigen telefoon (wens eigenaar 10 november 2026: „Bij de telefoonberichten-app moet nieuw
// inloggen niet nodig zijn. Die app moet altijd bij die telefoon passen.”). Pure regels, zonder database of netwerk: ook
// bruikbaar in proxy.ts. Zelfde opzet als de werkplektablets (lib/werkplek-pas-core.ts):
// - Wie de managerapp mag openen, logt één keer gewoon in (met de Authenticator-code) en kiest „Deze telefoon ingelogd
//   houden”. De telefoon krijgt twee cookies:
//   • bb_telefoon_pas: het geheime apparaatbewijs (alleen de sha-256 staat in de database), 400 dagen geldig;
//   • bb_telefoon: een ondertekende telefoonpas van 60 minuten, die de app zelf steeds vernieuwt zolang de telefoon niet is
//     ontkoppeld en de persoon de managerapp nog mag openen. Ontkoppelen werkt dus binnen een uur.
// - Met de telefoonpas opent de telefoon alleen de managerapp (Gesprekken, Assistent, Boodschappen, Agenda) en de gegevens
//   die die schermen nodig hebben, ook voor een eigenaar. Nooit de rest van de backoffice. Geen Authenticator-code, dus geen
//   gevoelige handelingen.
import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {allowed} from './onderdelen';

export const TELEFOON_COOKIE='bb_telefoon',TELEFOON_DEVICE_COOKIE='bb_telefoon_pas';
export const TELEFOON_MINUTES=60,TELEFOON_DEVICE_DAYS=400;
/** Waar de managerapp begint. */
export const TELEFOON_START='/management/gesprekken';
export type TelefoonPas={id:string;email:string;role:'eigenaar'|'medewerker';exp:number};

export const newSecret=()=>randomBytes(32).toString('base64url');
export const hashSecret=(s:string)=>createHash('sha256').update(s).digest('hex');
export const validSecret=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{43}$/.test(v);
const validEmail=(v:unknown):v is string=>typeof v==='string'&&v.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

// Een eigen afgeleide sleutel: een telefoonpas is geen backoffice-sessie en geen werkplekpas, en andersom.
const key=(secret:string)=>createHmac('sha256',secret).update('boer-bart-telefoon-pas-v1').digest();
export function signTelefoon(p:TelefoonPas,secret:string){
 const body=Buffer.from(JSON.stringify({id:p.id,email:p.email,role:p.role,exp:p.exp})).toString('base64url');
 return body+'.'+createHmac('sha256',key(secret)).update(body).digest('base64url');
}
export function readTelefoon(token:string|undefined|null,secret:string|undefined|null,now=Date.now()):TelefoonPas|null{
 if(!token||!secret||token.length>1500)return null;
 const parts=token.split('.');if(parts.length!==2)return null;
 const want=createHmac('sha256',key(secret)).update(parts[0]).digest(),got=Buffer.from(parts[1],'base64url');
 if(got.length!==want.length||!timingSafeEqual(got,want))return null;
 try{const p=JSON.parse(Buffer.from(parts[0],'base64url').toString()) as TelefoonPas;
  return typeof p.id==='string'&&/^[a-f0-9-]{36}$/.test(p.id)&&validEmail(p.email)&&(p.role==='eigenaar'||p.role==='medewerker')
   &&Number.isFinite(p.exp)&&p.exp>now&&p.exp<=now+TELEFOON_MINUTES*60000+60000?{id:p.id,email:p.email,role:p.role,exp:p.exp}:null}
 catch{return null}
}

/** Mag de persoon nog een telefoonpas krijgen? Een eigenaar altijd, een medewerker alleen met het vinkje Managerapp. */
export const mayUsePhone=(role:string,modules:readonly string[])=>role==='eigenaar'||role==='medewerker'&&modules.includes('managerapp');
/** Wat een telefoon met een telefoonpas mag openen: precies het onderdeel Managerapp, ook voor een eigenaar. Al het andere is dicht. */
export const telefoonAllowed=(path:string,method:string)=>allowed('medewerker',['managerapp'],path,method);
/** Een herkenbare naam voor de lijst in Toegang, uit de browser van de telefoon (geen gegevens, alleen het soort toestel). */
export function phoneLabel(userAgent:string|null){
 const ua=userAgent||'';
 return /iPhone/i.test(ua)?'iPhone':/iPad/i.test(ua)?'iPad':/Android/i.test(ua)?'Android-telefoon':/Mobile/i.test(ua)?'Telefoon':'Computer of tablet';
}

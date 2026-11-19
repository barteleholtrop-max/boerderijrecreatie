// Werkplektablets inloggen met een QR-code (besluit eigenaar 6 november 2026). Pure regels, zonder database of netwerk:
// ook bruikbaar in proxy.ts.
// - Een eigenaar maakt in Toegang een koppelcode (één keer te gebruiken, 10 minuten geldig) en toont die als QR-code en als korte code om te typen.
// - De tablet scant hem en krijgt twee cookies:
//   • bb_werkplek_pas: het geheime apparaatbewijs (alleen de sha-256 staat in de database), lang geldig;
//   • bb_werkplek: een ondertekende werkplekpas van 60 minuten, die de tablet zelf steeds vernieuwt zolang het apparaat
//     niet is ontkoppeld. Ontkoppelen werkt dus binnen een uur, ook als de tablet blijft aanstaan.
// - Met de werkplekpas opent de tablet alleen de werkplekschermen en de gegevens die ze nodig hebben. Nooit de backoffice:
//   geen menu, geen leden, geen financiën, geen toegang. De pas is geen backoffice-sessie en lijkt er ook niet op.
import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';

export const WERKPLEK_COOKIE='bb_werkplek',WERKPLEK_DEVICE_COOKIE='bb_werkplek_pas';
export const WERKPLEK_MINUTES=60,PAIR_SECONDS=600,DEVICE_DAYS=400;
/** Waar een net gekoppelde tablet begint. */
export const WERKPLEK_START='/werkplek/kassa';
export type WerkplekPas={id:string;name:string;exp:number};

export const newSecret=()=>randomBytes(32).toString('base64url');
export const hashSecret=(s:string)=>createHash('sha256').update(s).digest('hex');
export const validSecret=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{43}$/.test(v);
// Korte koppelcode (wens eigenaar 15 november 2026: „schermen zonder camera, hoe verbind ik die als werkplek?”): 8 tekens uit 31
// (geen 0/O, 1/I/L), te typen op het scherm zelf. Eén keer te gebruiken, 10 minuten geldig, en het inwisselen heeft een rem van
// 30 pogingen per minuut: 31^8 ≈ 8,5·10^11 mogelijkheden, raden is in 10 minuten kansloos. Ook de QR-code bevat deze code.
const PAIR_ALPHABET='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newPairCode(){const b=randomBytes(8);return Array.from(b,x=>PAIR_ALPHABET[x%PAIR_ALPHABET.length]).join('')}
/** Wat iemand typt (klein, met spaties of streepje) naar de vaste vorm, of '' als het geen koppelcode is. */
export function normalizePairCode(v:unknown){const s=typeof v==='string'?v.toUpperCase().replace(/[\s-]/g,''):'';return new RegExp(`^[${PAIR_ALPHABET}]{8}$`).test(s)?s:''}
export const showPairCode=(c:string)=>c.slice(0,4)+'-'+c.slice(4);
export function validTabletName(v:unknown){const s=typeof v==='string'?v.replace(/\s+/g,' ').trim():'';return s.length>=2&&s.length<=60?s:''}

const key=(secret:string)=>createHmac('sha256',secret).update('boer-bart-werkplek-pas-v1').digest();
export function signWerkplek(p:WerkplekPas,secret:string){
 const body=Buffer.from(JSON.stringify({id:p.id,name:p.name,exp:p.exp})).toString('base64url');
 return body+'.'+createHmac('sha256',key(secret)).update(body).digest('base64url');
}
export function readWerkplek(token:string|undefined|null,secret:string|undefined|null,now=Date.now()):WerkplekPas|null{
 if(!token||!secret||token.length>1000)return null;
 const parts=token.split('.');if(parts.length!==2)return null;
 const want=createHmac('sha256',key(secret)).update(parts[0]).digest(),got=Buffer.from(parts[1],'base64url');
 if(got.length!==want.length||!timingSafeEqual(got,want))return null;
 try{const p=JSON.parse(Buffer.from(parts[0],'base64url').toString()) as WerkplekPas;
  return typeof p.id==='string'&&/^[a-f0-9-]{36}$/.test(p.id)&&typeof p.name==='string'&&p.name.length<=60&&Number.isFinite(p.exp)&&p.exp>now&&p.exp<=now+WERKPLEK_MINUTES*60000+60000?p:null}
 catch{return null}
}

const under=(path:string,prefix:string)=>path===prefix||path.startsWith(prefix+'/');
/** Schermen van de tablet: de werkplekken (kok, barista, winkel, kassa, voorraad, team, dagplanning) en opnemen. */
export const WERKPLEK_PAGES=['/werkplek','/opnemen'];
/** Gegevens die die schermen lezen en wijzigen (bestellingen, uitgifte, afrekenen, voorraad, tafels, wie er is). */
export const WERKPLEK_API_WRITE=['/api/orders','/api/operations','/api/workplaces','/api/kassa','/api/werkplek','/api/products','/api/media','/api/tafels','/api/pot-planning'];
export const WERKPLEK_API_READ=['/api/omgeving'];
/** Mag een tablet met een werkplekpas dit adres openen? Al het andere is dicht (standaard dicht). */
export function werkplekAllowed(path:string,method:string){
 if(path.startsWith('/_next/'))return method==='GET'||method==='HEAD';
 if(path.startsWith('/api/')){
  if(WERKPLEK_API_WRITE.some(p=>under(path,p)))return true;
  return (method==='GET'||method==='HEAD')&&WERKPLEK_API_READ.some(p=>under(path,p));
 }
 if(method!=='GET'&&method!=='HEAD')return false;
 // Bestanden uit public/ (pictogrammen, manifest, scripts): geen gegevens.
 if(/\.[a-z0-9]{1,12}$/i.test(path))return true;
 return WERKPLEK_PAGES.some(p=>under(path,p));
}
/** Wie het deed, zoals dat bij bestellingen en afrekenen wordt vastgelegd. */
export const werkplekAccount=(name:string)=>('tablet '+name).replace(/[^\p{L}\p{N} ._-]/gu,'').slice(0,60);

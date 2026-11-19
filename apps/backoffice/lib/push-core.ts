// Pushmelding "Je bestelling staat klaar" (akkoord eigenaar 3 november 2026): regels zonder database of netwerk.
// - De gast meldt zich na het bestellen aan; de backoffice stuurt de melding zodra een werkplek op Gereed drukt.
// - Alleen naar de bekende pushdiensten van de browsers (Google, Mozilla, Apple, Microsoft): de backoffice stuurt nooit
//   iets naar een willekeurig adres dat een bezoeker opgeeft.
// - Aanmeldingen worden na 1 dag verwijderd.
export const RETENTION_MS=24*60*60*1000;
const PUSH_HOSTS=[/^fcm\.googleapis\.com$/,/^android\.googleapis\.com$/,/^updates\.push\.services\.mozilla\.com$/,/^web\.push\.apple\.com$/,/^[a-z0-9-]+\.push\.apple\.com$/,/^[a-z0-9-]+\.notify\.windows\.com$/];
export type PushSubscription={endpoint:string;p256dh:string;auth:string};
const key=(v:unknown,min:number,max:number)=>typeof v==='string'&&v.length>=min&&v.length<=max&&/^[A-Za-z0-9_-]+={0,2}$/.test(v);

/** Checks what the browser sends. extraOrigins is only for tests (a fake push service on this computer). */
export function parseSubscription(v:unknown,extraOrigins:string[]=[]):PushSubscription{
 const s=v as {endpoint?:unknown;keys?:{p256dh?:unknown;auth?:unknown}};
 if(!s||typeof s!=='object'||typeof s.endpoint!=='string'||s.endpoint.length>1000)throw Error('Ongeldige aanmelding voor meldingen.');
 let url:URL;try{url=new URL(s.endpoint)}catch{throw Error('Ongeldige aanmelding voor meldingen.')}
 const known=url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&PUSH_HOSTS.some(h=>h.test(url.hostname));
 if(!known&&!extraOrigins.includes(url.origin))throw Error('Deze browser gebruikt een onbekende meldingendienst.');
 if(!key(s.keys?.p256dh,80,100)||!key(s.keys?.auth,16,30))throw Error('Ongeldige aanmelding voor meldingen.');
 return {endpoint:s.endpoint,p256dh:s.keys!.p256dh as string,auth:s.keys!.auth as string};
}
export const testOrigins=(value=process.env.PUSH_TEST_ORIGINS)=>(value||'').split(',').map(v=>v.trim()).filter(v=>/^http:\/\/127\.0\.0\.1:\d+$/.test(v));

/** The text of the notification, per work station. */
export function readyMessage(station:string,number:string,round?:number){
 const where=station==='kok'?['Je eten','de keukenuitgifte']:station==='barista'?['Je drinken','de koffiebar']:['Je bestelling','de winkel'];
 return {title:'Je bestelling staat klaar',body:`${where[0]} (${number}) staat klaar bij ${where[1]}.`+(station==='winkel'?'':' Geniet ervan!'),tag:number+'-'+station+(round&&round>1?'-'+round:'')};
}
/** Welke werkplekken een bestelling klaar hebben (melding eigenaar 14 november 2026: de open bestelapp toont dan zelf de melding,
 *  ook zonder pushmelding). Alleen de werkplekken met regels in deze bestelling; per werkplek de tekst zoals de pushmelding. */
// round: het hoeveelste Gereed van die werkplek (na terughalen opnieuw Gereed = een nieuwe melding, wens eigenaar 14 november 2026).
export function readyStations(lines:{station?:string}[],status:Record<string,string>,number:string,rounds:Record<string,number>={}){
 const own=[...new Set(lines.map(l=>l.station).filter((s):s is string=>s==='kok'||s==='barista'||s==='winkel'))];
 return own.filter(s=>status[s]==='gereed').map(s=>({station:s,...readyMessage(s,number,rounds[s])}));
}
/** Na terughalen (Gereed → In behandeling): deze werkplek mag bij het volgende Gereed opnieuw een melding sturen. */
export const withoutSent=(sent:string,station:string)=>sentList(sent).filter(s=>s!==station).join(',');
export const sentList=(sent:string)=>sent.split(',').filter(Boolean);
export const withSent=(sent:string,station:string)=>[...new Set([...sentList(sent),station])].join(',');

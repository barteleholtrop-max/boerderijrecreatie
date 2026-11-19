// Eigen adres voor de ledenapp (opdracht eigenaar 13 november 2026, keuze 1a: „echt als aparte app, net zoals de zelfscankassa”).
// Met LEDEN_ORIGIN (bijvoorbeeld https://leden.example.nl) is de ledenapp een eigen website: eigen cookies, een eigen app op het
// startscherm, en de Backoffice-app kan hem op de telefoon niet meer opvangen. Zelfde server en database; alleen het adres verschilt.
// Zonder LEDEN_ORIGIN werkt alles zoals voorheen op het adres van de backoffice. Geen node-modules: ook bruikbaar in proxy.ts.
const clean=(v:string|undefined)=>{try{return v?new URL(v).origin:''}catch{return ''}};
/** Het eigen adres van de ledenapp, of '' als het niet is ingesteld. */
export const ledenOrigin=()=>clean(process.env.LEDEN_ORIGIN);
/** Adres voor alles wat een lid ziet of aanklikt: ledenlinks, uitnodigingen, inloggen voor leden. */
export const memberOrigin=(req?:Request)=>ledenOrigin()||clean(process.env.APP_ORIGIN)||(req?new URL(req.url).origin:'http://localhost:3001');
/** Komt dit verzoek binnen op het eigen adres van de ledenapp? (Host-kop; Cloud Run en de load balancer geven die door.) */
export function onLedenHost(request:Request){const o=ledenOrigin();if(!o)return false;return (request.headers.get('host')||'').toLowerCase()===new URL(o).host}

// Eigen adressen voor de backoffice en de managementapp (opdracht eigenaar 13 november 2026, docs/ONLINE-ZETTEN.md). Zelfde server;
// alleen het adres verschilt. OFFICE_ORIGIN (bijvoorbeeld https://backoffice.example.nl) en MANAGEMENT_ORIGIN (bijvoorbeeld
// https://management.example.nl). APP_ORIGIN (het Google-adres) blijft werken, zodat de werkplektablets en de kassa niet
// opnieuw gekoppeld hoeven te worden. Inloggen blijft op het adres waar je begon (requestOrigin): de cookies horen bij dat adres.
const list=(v:string|undefined)=>(v||'').split(',').map(x=>clean(x.trim())).filter(Boolean);
export const officeOrigin=()=>clean(process.env.OFFICE_ORIGIN);
export const managementOrigin=()=>clean(process.env.MANAGEMENT_ORIGIN);
/** Werkplektablets (kok, kassa enzovoort; wens eigenaar 13 november 2026): bijvoorbeeld https://werkstation.example.nl. */
export const werkstationOrigin=()=>clean(process.env.WERKSTATION_ORIGIN);
/** Al onze eigen adressen: het Google-adres, backoffice, management, leden, plus EXTRA_ORIGINS (komma's). */
export const knownOrigins=()=>[...new Set([clean(process.env.APP_ORIGIN),officeOrigin(),managementOrigin(),werkstationOrigin(),ledenOrigin(),...list(process.env.EXTRA_ORIGINS)].filter(Boolean))];
const hostOf=(request:Request)=>(request.headers.get('host')||'').toLowerCase();
/** Het adres waarop dit verzoek binnenkwam, als dat een van onze eigen adressen is; anders APP_ORIGIN. Voor doorsturen na inloggen. */
export function requestOrigin(request:Request){const host=hostOf(request);return knownOrigins().find(o=>new URL(o).host===host)||clean(process.env.APP_ORIGIN)||new URL(request.url).origin}
/** Komt dit verzoek binnen op het eigen adres van de werkplektablets? */
export function onWerkstationHost(request:Request){const o=werkstationOrigin();return !!o&&hostOf(request)===new URL(o).host}
/** Komt dit verzoek binnen op het eigen adres van de managementapp? */
export function onManagementHost(request:Request){const o=managementOrigin();return !!o&&hostOf(request)===new URL(o).host}

import {NextResponse,type NextRequest} from 'next/server';
import {authConfig,cookieDomain,readSession,sessionSecret,shortName,SESSION_COOKIE} from './lib/login-core';
import {allowed,firstPage} from './lib/onderdelen';
import {sensitivePath,freshCode,codeAt,AGAIN_TEXT} from './lib/gevoelig';
import {officeOrigin,managementOrigin,onManagementHost,werkstationOrigin,onWerkstationHost,requestOrigin} from './lib/member-origin';
import {readWerkplek,werkplekAllowed,werkplekAccount,WERKPLEK_COOKIE,WERKPLEK_DEVICE_COOKIE,WERKPLEK_START} from './lib/werkplek-pas-core';
import {readTelefoon,telefoonAllowed,TELEFOON_COOKIE,TELEFOON_DEVICE_COOKIE} from './lib/telefoon-pas-core';
// Identity headers are only ever set here; every branch strips what a client sends.
const trusted=['x-boer-bart-telefoon','x-boer-bart-namens','x-boer-bart-verified-user','x-boer-bart-account','x-boer-bart-email','x-boer-bart-role','x-boer-bart-onderdelen','x-boer-bart-mfa'];
// Openbare gegevens voor de website (alleen lezen).
const publicPaths=['/api/public/qr','/api/public/products','/api/public/availability','/api/public/weekmenu','/api/public/v1/inhoud','/api/public/v1/privacy','/api/public/order-options','/api/public/push'];
// Photos of published products for the website: only GET on /api/public/media/<id>; the route checks the photo is public.
const publicMedia=/^\/api\/public\/media\/[a-f0-9-]{36}$/;
// Eigen adres van de managementapp (13 november 2026): alleen de managementschermen, inloggen en de API's die ze gebruiken; de
// voordeur (/) gaat naar de gesprekken; andere backofficeschermen naar het backoffice-adres.
const MANAGEMENT_ASSETS=['/favicon.svg','/logo.webp','/brand.css','/backoffice-sw.js','/gesprekken.webmanifest','/api/health','/geen-onderdelen'];
function managementAddress(request:NextRequest):Response|null{
 if(!onManagementHost(request))return null;
 const p=request.nextUrl.pathname,read=request.method==='GET'||request.method==='HEAD';
 if(p==='/')return NextResponse.redirect(new URL('/management/gesprekken',managementOrigin()),307);
 if(p.startsWith('/management/')||p==='/management'||p.startsWith('/_next/')||p.startsWith('/icons/')||MANAGEMENT_ASSETS.includes(p)||p.startsWith('/api/')||p==='/inloggen'||p.startsWith('/inloggen/')||(p.startsWith('/auth/')&&!p.startsWith('/auth/lid/')))return null;
 const office=officeOrigin()||process.env.APP_ORIGIN;
 return read&&office?NextResponse.redirect(new URL(p+request.nextUrl.search,office),307):new NextResponse('Niet gevonden',{status:404});
}
// Eigen adres van de werkplektablets (kok, kassa enzovoort; 13 november 2026): alleen wat een tablet mag (werkplekAllowed), het
// koppelen en vernieuwen van de tabletpas; de voordeur (/) gaat naar de werkplek; al het andere naar het backoffice-adres.
function werkstationAddress(request:NextRequest):Response|null{
 if(!onWerkstationHost(request))return null;
 const p=request.nextUrl.pathname,read=request.method==='GET'||request.method==='HEAD';
 if(p==='/')return NextResponse.redirect(new URL(WERKPLEK_START,werkstationOrigin()),307);
 if(werkplekAllowed(p,request.method)||p==='/tablet/koppelen'||p.startsWith('/auth/werkplek/')||p==='/api/health')return null;
 const office=officeOrigin()||process.env.APP_ORIGIN;
 return read&&office?NextResponse.redirect(new URL(p+request.nextUrl.search,office),307):new NextResponse('Niet gevonden',{status:404});
}
function ledenAddress(request:NextRequest):Response|null{
 return managementAddress(request)||werkstationAddress(request);
}
// Onthouden telefoon: staat dit account nog actief op de lijst (rol en onderdelen van nu)? Een minuut onthouden per server.
// 'weg' = niet meer op de lijst of uitgezet; 'onbekend' = database even niet bereikbaar (dan geldt de sessie zoals hij is).
const accounts=new Map<string,{at:number;acc:{role:'eigenaar'|'medewerker';modules:string[]}|'weg'}>();
async function currentAccount(email:string):Promise<{role:'eigenaar'|'medewerker';modules:string[]}|'weg'|'onbekend'>{
 const hit=accounts.get(email);if(hit&&Date.now()-hit.at<60000)return hit.acc;
 try{const {activeAccount}=await import('./lib/access-store'),a=await activeAccount(email),acc=a?{role:a.role,modules:a.modules}:'weg' as const;
  accounts.set(email,{at:Date.now(),acc});if(accounts.size>500)accounts.clear();return acc}
 catch(e){console.error('[inloggen] toegangslijst niet bereikbaar',e instanceof Error?e.message:e);return hit?.acc??'onbekend'}
}
export function proxy(request:NextRequest){
 const moved=ledenAddress(request);if(moved)return moved;
 if(request.nextUrl.pathname==='/api/health')return NextResponse.next();
 // Werkproces op Cloud Run (7 november 2026): Cloud Scheduler klopt aan zonder login; de route controleert de geheime sleutel
 // (WORKER_SECRET). Geen vertrouwde identiteit gaat mee.
 if(request.nextUrl.pathname==='/api/werkproces/ronde'&&request.method==='POST'){const headers=new Headers(request.headers);for(const h of [...trusted,'oai-authenticated-user-id','oai-authenticated-user-email'])headers.delete(h);return NextResponse.next({request:{headers}})}
 // Public read-only data for the website: published products (guest-facing fields only), opening hours/Yte moments, the confirmed weekmenu and photos of published products. Only GET; no trusted identity is passed on.
 if((publicPaths.includes(request.nextUrl.pathname)||publicMedia.test(request.nextUrl.pathname))&&(request.method==='GET'||request.method==='HEAD')){const headers=new Headers(request.headers);for(const h of [...trusted,'oai-authenticated-user-id','oai-authenticated-user-email'])headers.delete(h);return NextResponse.next({request:{headers}});}
 // Public guest orders and event sign-ups from the website: only POST/OPTIONS on these exact paths; the route checks origin, shape, limits and prices. No trusted identity is passed on.
 if(['/api/public/orders','/api/public/event-signups','/api/public/push'].includes(request.nextUrl.pathname)&&(request.method==='POST'||request.method==='OPTIONS')){const headers=new Headers(request.headers);for(const h of [...trusted,'oai-authenticated-user-id','oai-authenticated-user-email'])headers.delete(h);return NextResponse.next({request:{headers}});}
 // Bonprinters (Server Direct Print, akkoord eigenaar 5 november 2026): alleen POST op exact deze adressen. De route laat
 // alleen een printer met zijn eigen koppelsleutel toe; er gaat geen vertrouwde identiteit mee.
 if(/^\/api\/public\/printers\/sdp(\/[A-Za-z0-9_-]{43})?$/.test(request.nextUrl.pathname)&&request.method==='POST'){const headers=new Headers(request.headers);for(const h of [...trusted,'oai-authenticated-user-id','oai-authenticated-user-email'])headers.delete(h);return NextResponse.next({request:{headers}});}
 // Online betalen (Mollie): the guest's payment start/status (GET/POST/OPTIONS) and Mollie's webhook (POST only).
 // The routes check origin, shape and limits and always ask Mollie itself; no trusted identity is passed on.
 if((request.nextUrl.pathname==='/api/public/payments'&&['GET','POST','OPTIONS'].includes(request.method))||(request.nextUrl.pathname==='/api/public/payments/mollie'&&request.method==='POST')){const headers=new Headers(request.headers);for(const h of [...trusted,'oai-authenticated-user-id','oai-authenticated-user-email'])headers.delete(h);return NextResponse.next({request:{headers}});}
 // Berichten van Meta (WhatsApp, Messenger, Instagram; akkoord eigenaar 9 november 2026): de controle bij het instellen (GET) en
 // elk nieuw bericht (POST). De route telt alleen een geldige handtekening van Meta mee; er gaat geen vertrouwde identiteit mee.
 if(request.nextUrl.pathname==='/api/public/meta'&&['GET','POST'].includes(request.method)){const headers=new Headers(request.headers);for(const h of [...trusted,'oai-authenticated-user-id','oai-authenticated-user-email'])headers.delete(h);return NextResponse.next({request:{headers}});}
 // Etiket lezen voor de zelfkassa (wens eigenaar 9 november 2026): de foto van een prijsetiket (POST/OPTIONS). The route checks
 // origin, shape and strict limits (each photo costs Claude usage); no trusted identity is passed on.
 if(request.nextUrl.pathname==='/api/public/etiket'&&['POST','OPTIONS'].includes(request.method)){const headers=new Headers(request.headers);for(const h of [...trusted,'oai-authenticated-user-id','oai-authenticated-user-email'])headers.delete(h);return NextResponse.next({request:{headers}});}
 // Groepen & feesten: direct antwoord op de datum (GET) en de aanvraag zelf (POST). The route checks origin, shape and
 // limits; no trusted identity is passed on.
 // Gezamenlijke rekening (wens eigenaar 5 november 2026): de beheerlink of het betaalverzoek is de toegang; de route controleert.
 if(request.nextUrl.pathname==='/api/public/rekening'&&['GET','POST','OPTIONS'].includes(request.method)){const headers=new Headers(request.headers);for(const h of [...trusted,'oai-authenticated-user-id','oai-authenticated-user-email'])headers.delete(h);return NextResponse.next({request:{headers}});}
 if(request.nextUrl.pathname==='/api/public/group-requests'&&['GET','POST','OPTIONS'].includes(request.method)){const headers=new Headers(request.headers);for(const h of [...trusted,'oai-authenticated-user-id','oai-authenticated-user-email'])headers.delete(h);return NextResponse.next({request:{headers}});}
 // Persoonlijke links: de offerte voor de gast.
 // De route controleert de link; geen vertrouwde identiteit gaat mee. Plus de vaste Next-bestanden (/_next/static) en pictogrammen.
 const portal=/^\/offerte\/[A-Za-z0-9_-]{43}$/.test(request.nextUrl.pathname)&&request.method==='GET'
  ||/^\/api\/public\/offerte\/[A-Za-z0-9_-]{43}$/.test(request.nextUrl.pathname)&&request.method==='POST'
  ||(request.nextUrl.pathname.startsWith('/_next/static/')||request.nextUrl.pathname==='/favicon.svg'||request.nextUrl.pathname==='/logo.webp'||request.nextUrl.pathname==='/brand.css'||/^\/icons\/(leden|kassa|backoffice|werkplek|opnemen|gesprekken)-(192|512)\.png$/.test(request.nextUrl.pathname))&&request.method==='GET';
 if(portal){const headers=new Headers(request.headers);for(const h of [...trusted,'oai-authenticated-user-id','oai-authenticated-user-email'])headers.delete(h);return NextResponse.next({request:{headers}});}
 // Inloggen staat altijd aan (besluit eigenaar 8 november 2026): geen schakelaar BOER_BART_LOGIN meer en geen uitzondering
 // zonder login op deze computer of in de telefoonstand. Iedereen die de backoffice opent, logt in met de Authenticator-code.
 // Inloggen via Supabase (besluiten eigenaar 4 en 6 november 2026): Google of e-mail en wachtwoord, en altijd de
 // Authenticator-code. Zonder geldige sessie: het inlogscherm (pagina's) of 401 (API). De oude noodrem met wachtwoorden
 // (Basic Auth) is weg; zonder Supabase-instellingen blijft de backoffice dicht (503), nooit open.
 const cfg=authConfig(),secret=sessionSecret();
 if(!cfg||!secret)return new NextResponse('Inloggen is nog niet ingesteld op deze server (SUPABASE_URL, SUPABASE_ANON_KEY en AUTH_SECRET). Zie docs/INLOGGEN-BIJ-LIVEGANG.md.',{status:503,headers:{'Cache-Control':'no-store','Content-Type':'text/plain; charset=utf-8'}});
 const p=request.nextUrl.pathname;
 // De inlogschermen en -routes zelf; elke route controleert herkomst, invoer en de toegangslijst.
 const open=(p==='/inloggen'||p==='/inloggen/code'||p==='/inloggen/nieuw-wachtwoord'||p==='/auth/google'||p==='/auth/terug'||p==='/auth/code')&&request.method==='GET'
  ||['/auth/uit','/auth/wachtwoord','/auth/aanmelden','/auth/vergeten','/auth/nieuw-wachtwoord','/auth/code','/auth/opnieuw'].includes(p)&&request.method==='POST'
  // Werkplektablets (QR-code, besluit eigenaar 6 november 2026): het koppelscherm, de code inwisselen en de pas vernieuwen.
  // De routes controleren herkomst, de eenmalige code en het apparaatbewijs.
  ||(p==='/tablet/koppelen'||p==='/auth/werkplek/vernieuw')&&request.method==='GET'
  ||(p==='/auth/werkplek/koppelen'||p==='/auth/werkplek/vernieuw')&&request.method==='POST'
  // Managerapp altijd ingelogd op de eigen telefoon (wens eigenaar 10 november 2026): de pas vernieuwen met het apparaatbewijs.
  ||p==='/auth/telefoon/vernieuw'&&(request.method==='GET'||request.method==='POST')
  ||(p.startsWith('/_next/static/')||p==='/favicon.svg'||p==='/logo.webp'||p==='/brand.css'||p==='/backoffice-sw.js'||['/kassa.webmanifest','/backoffice.webmanifest','/werkplek.webmanifest','/opnemen.webmanifest','/gesprekken.webmanifest'].includes(p)||/^\/icons\/(leden|kassa|backoffice|werkplek|opnemen|gesprekken)-(192|512)\.png$/.test(p))&&request.method==='GET';
 const clean=new Headers(request.headers);for(const h of [...trusted,'x-boer-bart-role','oai-authenticated-user-id','oai-authenticated-user-email'])clean.delete(h);
 if(open)return NextResponse.next({request:{headers:clean}});
 const session=readSession(request.cookies.get(SESSION_COOKIE)?.value,secret);
 if(!session){
  // Managerapp op de eigen telefoon (lib/telefoon-pas-core.ts, wens eigenaar 10 november 2026): alleen de managerapp en zijn
  // gegevens, ook voor een eigenaar. Geen Authenticator-code (x-boer-bart-mfa 0), dus geen gevoelige handelingen; daarvoor
  // logt iemand gewoon in. Voor al het andere: naar het inlogscherm.
  const tel=readTelefoon(request.cookies.get(TELEFOON_COOKIE)?.value,secret);
  if(tel){
   if(!telefoonAllowed(p,request.method)||sensitivePath(p,request.method)){
    if(p.startsWith('/api/'))return NextResponse.json({error:'Op deze telefoon is alleen de managerapp ingelogd. Log gewoon in voor de rest van de backoffice.'},{status:403,headers:{'Cache-Control':'no-store'}});
    const to=new URL('/inloggen',requestOrigin(request));to.searchParams.set('terug',p+request.nextUrl.search);return NextResponse.redirect(to,302);
   }
   clean.set('x-boer-bart-verified-user','owner');clean.set('x-boer-bart-account',shortName(tel.email));clean.set('x-boer-bart-role',tel.role);clean.set('x-boer-bart-email',tel.email);
   clean.set('x-boer-bart-onderdelen','managerapp');clean.set('x-boer-bart-mfa','0');clean.set('x-boer-bart-telefoon',tel.id);
   return NextResponse.next({request:{headers:clean}});
  }
  // Een onthouden telefoon met een verlopen pas (bijvoorbeeld de volgende ochtend): eerst een nieuwe pas, dan terug naar de app.
  if(request.cookies.get(TELEFOON_DEVICE_COOKIE)?.value&&!p.startsWith('/api/')&&request.method==='GET'&&!p.startsWith('/_next/')&&telefoonAllowed(p,'GET')&&!/\.[a-z0-9]{1,12}$/i.test(p)){
   const to=new URL('/auth/telefoon/vernieuw',requestOrigin(request));to.searchParams.set('terug',p+request.nextUrl.search);return NextResponse.redirect(to,302);
  }
  // Werkplektablet (lib/werkplek-pas-core.ts): alleen de werkplekschermen en hun gegevens, nooit de backoffice. Geen
  // Authenticator-code (x-boer-bart-mfa 0), dus ook geen gevoelige handelingen.
  const pas=readWerkplek(request.cookies.get(WERKPLEK_COOKIE)?.value,secret);
  if(pas){
   if(!werkplekAllowed(p,request.method)){
    if(p.startsWith('/api/'))return NextResponse.json({error:'Deze tablet is gekoppeld als werkplek en kan dit niet openen.'},{status:403,headers:{'Cache-Control':'no-store'}});
    return NextResponse.redirect(new URL(WERKPLEK_START,requestOrigin(request)),302);
   }
   clean.set('x-boer-bart-verified-user','owner');clean.set('x-boer-bart-account',werkplekAccount(pas.name));clean.set('x-boer-bart-role','werkplek');clean.set('x-boer-bart-email','');
   clean.set('x-boer-bart-onderdelen','');clean.set('x-boer-bart-mfa','0');
   return NextResponse.next({request:{headers:clean}});
  }
  // Een gekoppelde tablet met een verlopen pas (bijvoorbeeld na de nacht): eerst een nieuwe pas, dan terug naar het scherm.
  if(request.cookies.get(WERKPLEK_DEVICE_COOKIE)?.value&&!p.startsWith('/api/')&&request.method==='GET'){
   const to=new URL('/auth/werkplek/vernieuw',requestOrigin(request));if(werkplekAllowed(p,'GET'))to.searchParams.set('terug',p+request.nextUrl.search);return NextResponse.redirect(to,302);
  }
  if(p.startsWith('/api/'))return NextResponse.json({error:'Log opnieuw in.'},{status:401,headers:{'Cache-Control':'no-store'}});
  // Werkstation-adres (melding eigenaar 14 november 2026: „de werkstations hoeven geen inlog te hebben”): een tablet die hier nog
  // niet gekoppeld is, krijgt het koppelscherm (eenmalig een QR-code, daarna 400 dagen vanzelf), nooit het backoffice-inlogscherm.
  if(onWerkstationHost(request))return NextResponse.redirect(new URL('/tablet/koppelen',requestOrigin(request)),302);
  const to=new URL('/inloggen',requestOrigin(request));to.searchParams.set('terug',p+request.nextUrl.search);return NextResponse.redirect(to,302);
 }
 // Onthoud deze telefoon (lang, 30 dagen; wens eigenaar 13 november 2026): kijk bij zo'n sessie (hooguit elke minuut) of het
 // account nog op de lijst staat, en gebruik de rol en onderdelen van nu. Wie is uitgezet of verwijderd, is meteen uitgelogd.
 const finish=(s:typeof session)=>{
  // Rechten per onderdeel (besluit eigenaar 6 november 2026, lib/onderdelen.ts): een eigenaar mag alles, een medewerker
  // alleen zijn aangevinkte onderdelen. Al het andere is dicht, ook als iemand het adres zelf intypt.
  const mods=s.modules||[];
  if(p!=='/geen-onderdelen'&&!allowed(s.role,mods,p,request.method)){
   if(p.startsWith('/api/'))return NextResponse.json({error:'Dit onderdeel staat niet voor je open. Vraag een eigenaar om toegang.'},{status:403,headers:{'Cache-Control':'no-store'}});
   const first=firstPage(s.role,mods);
   return NextResponse.redirect(new URL(first&&first!==p?first:'/geen-onderdelen',requestOrigin(request)),302);
  }
  // Gevoelige handelingen: opnieuw de code als de laatste langer dan 10 minuten geleden is (lib/gevoelig.ts).
  if(sensitivePath(p,request.method)&&!freshCode(codeAt(s)))return NextResponse.json({error:AGAIN_TEXT,opnieuwCode:true},{status:401,headers:{'Cache-Control':'no-store'}});
  clean.set('x-boer-bart-verified-user','owner');clean.set('x-boer-bart-account',shortName(s.email));clean.set('x-boer-bart-role',s.role);clean.set('x-boer-bart-email',s.email);
  clean.set('x-boer-bart-onderdelen',s.role==='eigenaar'?'*':mods.join(','));clean.set('x-boer-bart-mfa',String(codeAt(s)));
  return NextResponse.next({request:{headers:clean}});
 };
 if(!session.lang)return finish(session);
 return currentAccount(session.email).then(acc=>{
  if(acc==='weg'){
   const out=p.startsWith('/api/')?NextResponse.json({error:'Log opnieuw in.'},{status:401,headers:{'Cache-Control':'no-store'}}):NextResponse.redirect(new URL('/inloggen?fout=geen-toegang',requestOrigin(request)),302);
   const gone=SESSION_COOKIE+'=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax',domain=cookieDomain();
   out.headers.append('Set-Cookie',gone);if(domain)out.headers.append('Set-Cookie',gone+'; Domain='+domain);return out;
  }
  return finish(acc==='onbekend'?session:{...session,role:acc.role,modules:acc.role==='eigenaar'?undefined:acc.modules});
 });
}
export const config={matcher:'/:path*'};

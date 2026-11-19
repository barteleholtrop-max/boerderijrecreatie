'use client';
import Link from 'next/link';
import {usePathname,useRouter} from 'next/navigation';
import {useEffect,useState} from 'react';
import {HulpBalk} from './hulp-balk';
import {CodeOpnieuw} from './code-opnieuw';
import {allowed} from '@/lib/onderdelen';
import {useOmgeving,betaalStand} from './omgeving';
// Menu-indeling volgens besluit eigenaar 6 november 2026: Planning en ABC-leden apart, met dezelfde ledenplanning in beide groepen.
// Coöperatie, marketing en beheer hebben eigen groepen.
// 9 november 2026 (wens eigenaar): Gesprekken in telefoonstand staat bij de Weekassistent.
// 13 november 2026 (wens eigenaar): GASTEN staat boven PLANNING en Leden & winstdeling staat onder COÖPERATIE & KAPITAAL; Ledenplanning staat alleen bij PLANNING.
// 15 november 2026 (wens eigenaar): Privacy · alle sites bij MARKETING & WEBSITE, één privacybeleid dat alle sites ophalen.
// Addresses never change here; moving an item between groups keeps every link working.
// 16 november 2026 (wens eigenaar: „logische indeling, dubbele dingen eruit”, voorstel akkoord): indelen naar wat je wilt doen.
// Elk onderdeel één plek; oude adressen sturen door. Weekafsluitingen (winkel en potten) staan onder GELD, Toegang staat in het menu,
// Reserveringen zit in Agenda & reserveringen, de telefoonapp en Marketing (nog niet gebouwd) staan niet meer in het menu.
export const navSections:[string,[string,string,string,string[]?][]][]=[
 ['VANDAAG',[
  ['/','◫','Dashboard',['/taken']],['/goedkeuringen','✓','Goedkeuringen'],['/assistent','✎','Weekassistent'],
 ]],
 ['GASTEN & PLANNING',[
  ['/planning','▦','Agenda & reserveringen',['/reserveringen','/planning/voorspelling']],
  ['/gesprekken','✉','Gesprekken & klanten',['/klanten']],['/offertes','▤','Offertes & groepen'],
 ]],
 ['VERKOOP & KEUKEN',[
  ['/werkplekken','☕','Kassa & bestellingen',['/kassa','/bestelopties']],['/producten','◉','Gerechten & prijzen',['/prijsanalyse']],['/winkel','♧','Boerderijwinkel'],
  ['/inkoop','▥','Inkoop & voorraad'],
 ]],
 ['GELD',[
  ['/financien','▣','Betalingen & facturen'],
 ]],
 ['WEBSITE',[['/website','▧','Website',['/inhoud','/privacy']]]],
 ['INSTELLINGEN',[['/openingstijden','◷','Openingstijden & capaciteit'],['/bedrijfsgegevens','▣','Bedrijfsgegevens & documenten'],['/toegang','⚿','Toegang'],['/koppeling','⚙','Koppelingen & printers']]],
];
const matches=(path:string,h:string)=>h==='/'?path==='/':path===h||path.startsWith(h+'/');
// Het best passende menu-onderdeel is actief.
const bestHref=(path:string)=>{let best:string|null=null,len=-1;for(const [href,,,also=[]] of navSections.flatMap(s=>s[1]))for(const h of [href,...also])if(matches(path,h)&&h.length>len){best=href;len=h.length}return best};
const active=(path:string,href:string)=>bestHref(path)===href;
export function Shell({children,signedIn=false,onderdelen=null}:{children:React.ReactNode;signedIn?:boolean;onderdelen?:string|null}){
 // Rechten per onderdeel: een medewerker ziet alleen wat hij mag openen (de proxy controleert het echt).
 const mods=onderdelen===null||onderdelen==='*'?null:onderdelen.split(',').filter(Boolean);
 const sections=mods?navSections.map(([l,items])=>[l,items.filter(i=>allowed('medewerker',mods,i[0],'GET'))] as typeof navSections[number]).filter(s=>s[1].length):navSections;
 const path=usePathname()||'/',router=useRouter(),[open,setOpen]=useState(false),[term,setTerm]=useState(''),[today,setToday]=useState('');
 // Test of live (wens eigenaar 9 november 2026): onderin het menu en in de voettekst, alleen als iemand is ingelogd.
 const omgeving=useOmgeving(signedIn);
 useEffect(()=>{setToday(new Intl.DateTimeFormat('nl-NL',{weekday:'short',day:'numeric',month:'short',timeZone:'Europe/Amsterdam'}).format(new Date()))},[]);
 useEffect(()=>{setOpen(false)},[path]);
 // Telefoon (wens eigenaar 8 november 2026): menu schermvullend; Escape sluit het en de pagina eronder scrolt niet mee.
 useEffect(()=>{if(!open)return;const esc=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false)};document.addEventListener('keydown',esc);document.documentElement.classList.add('menu-open');return()=>{document.removeEventListener('keydown',esc);document.documentElement.classList.remove('menu-open')}},[open]);
 // Werkplek- en opnameschermen voor tablets: volledig scherm, zonder menu (wens eigenaar 3 november 2026).
 if(path.startsWith('/werkplek/')||path==='/opnemen')return <div className="kiosk">{children}</div>;
 // De app Gesprekken (wens eigenaar 10 november 2026): eigen balk onderin (app/telefoon-app.tsx), zonder het backofficemenu.
 if(path.startsWith('/management/')||path.startsWith('/gesprekken/telefoon')||path.startsWith('/taken/telefoon')||path.startsWith('/assistent/telefoon')||path.startsWith('/planning/telefoon'))return <div className="kiosk">{children}</div>;
 // Documenten om af te drukken (verkoopoverzicht): zonder menu, zodat de PDF één nette pagina is.
 if(path==='/financien/verkoopoverzicht'||path==='/financien/factuur'||path==='/offertes/document')return <div className="doc-shell">{children}</div>;
 // Deelnemerspagina van de coöperatieve winkel: zonder backofficemenu (de deelnemer heeft alleen zijn eigen link).
 // Offerte voor de gast (persoonlijke link): zonder backofficemenu.
 if(path.startsWith('/offerte/'))return <div className="doc-shell">{children}</div>;
 // Inlogscherm (Google via Supabase): eigen vormgeving, zonder menu.
 if(path==='/inloggen'||path.startsWith('/inloggen/'))return <>{children}</>;
 // Tablet koppelen (QR-code) en inloggen voor leden: eigen vormgeving, zonder backofficemenu.
 if(path.startsWith('/tablet/'))return <>{children}</>;
 const current=navSections.flatMap(s=>s[1]).find(i=>active(path,i[0]));
 return <div className="app">
  <aside className={'sidebar'+(open?' open':'')} aria-label="Hoofdnavigatie"><div className="brand"><img className="brand-logo" src="/logo.webp" alt="Boerderijrecreatie" width={44} height={44}/><div><div className="brand-title">boer bart</div><div className="brand-sub">samen laten groeien</div></div><button type="button" className="menu-close" aria-label="Menu sluiten" onClick={()=>setOpen(false)}>✕</button></div>
   <nav className="nav-scroll">{sections.map(([label,items])=><div key={label}><div className="nav-label">{label}</div>{items.map(([href,icon,name])=><Link key={href} href={href} className={'nav-item'+(active(path,href)?' active':'')} aria-current={active(path,href)?'page':undefined}><span className="nav-ico">{icon}</span>{name}</Link>)}</div>)}</nav>
   {signedIn&&<form method="post" action="/auth/uit" className="sidebar-logout"><button className="btn secondary sm" type="submit">Uitloggen</button></form>}<div className="sidebar-bottom"><span className="status-dot"></span> {betaalStand(omgeving)||'Boerderijrecreatie backoffice'}<br/><span style={{opacity:.65}}>Eigen Boerderijrecreatie-platform · één centrale bron</span></div></aside>
  <div className={'nav-overlay'+(open?' open':'')} onClick={()=>setOpen(false)}></div>
  <div className="main"><header className="topbar"><div className="row"><button className="btn secondary mobile-menu" aria-label="Menu openen" aria-expanded={open} onClick={()=>setOpen(!open)}>☰</button><div className="crumb">Boerderijrecreatie <span style={{margin:'0 7px'}}>/</span> <strong>{current?.[2]||'Overzicht'}</strong></div></div>
   <div className="top-actions"><form className="searchbox" role="search" onSubmit={e=>{e.preventDefault();router.push('/producten?q='+encodeURIComponent(term.trim()))}}>⌕ <input aria-label="Zoek product" placeholder="Zoek product..." value={term} onChange={e=>setTerm(e.target.value)} autoComplete="off"/></form><span className="small">{today}</span>{(!mods||allowed('medewerker',mods,'/goedkeuringen','GET'))&&<Link className="btn secondary sm" href="/goedkeuringen" title="Goedkeuringen">✓ Akkoord</Link>}<div className="avatar" title="Aangemeld als eigenaar">B</div></div></header>
   <main className="content">{children}<div className="footer-note">BOER BART · Backoffice. Productgegevens komen uit de centrale bron.{betaalStand(omgeving)&&<> {betaalStand(omgeving)}.</>}</div></main><HulpBalk/>{signedIn&&<CodeOpnieuw/>}</div>
 </div>
}

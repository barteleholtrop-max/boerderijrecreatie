'use client';
// De app Gesprekken (wens eigenaar 10 november 2026: „een losse app die de info uit de backoffice haalt, ook voor de
// Weekassistent”). Eén app met een vaste balk onderin: Gesprekken, Vandaag, Assistent, Boodschappen en Agenda (net als de ledenapp). Zonder het menu van de
// backoffice; dezelfde login en dezelfde gegevens. Eigen icoon „Management” op het beginscherm (public/gesprekken.webmanifest).
// Op het startscherm zetten (wens eigenaar 12 november 2026: „Ik wilde alleen de optie hebben om het eenvoudig op mijn
// startscherm toe te voegen”): zolang de app in Chrome of Safari openstaat, blijft de knop „Op startscherm” bovenin staan.
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {usePathname} from 'next/navigation';
import {StartschermVraag} from './startscherm-vraag';
import {TelefoonIngelogd} from './telefoon-ingelogd';
import {CodeOpnieuw} from './code-opnieuw';

const TABS:[string,string,string][]=[['/management/gesprekken','Gesprekken','M4 5h16v11H9l-5 4z'],
 // Vandaag & taken (wens eigenaar 11 november 2026): de agenda van vandaag en wat er moet gebeuren.
 ['/management/taken','Vandaag','M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M8 14l2 2 4-4'],['/management/assistent','Assistent','M12 3a4 4 0 0 1 4 4v1a4 4 0 0 1-8 0V7a4 4 0 0 1 4-4zM5 20a7 7 0 0 1 14 0'],['/management/assistent/boodschappen','Boodschappen','M9 11l3 3 8-8M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h11'],['/management/planning','Agenda','M5 5h14v15H5zM5 10h14M9 3v4M15 3v4']];
export function TelefoonApp({children}:{children:React.ReactNode}){
 const path=usePathname()||'';
 const wacht=useWacht();
 const active=(href:string)=>href==='/management/assistent'?path===href:path===href||path.startsWith(href+'/');
 return <div className="tapp">
  <main className="tapp-main"><StartschermVraag naam="Management" altijd/><TelefoonIngelogd/>{children}</main><CodeOpnieuw/>
  <nav className="tapp-nav" aria-label="App">
   {TABS.map(([href,label,d])=><Link key={href} href={href} className={'tapp-tab'+(active(href)?' active':'')} aria-current={active(href)?'page':undefined}>
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d}/></svg>{label}
    {href==='/management/gesprekken'&&wacht>0&&<span className="tapp-badge" aria-label={wacht+(wacht===1?' gesprek wacht':' gesprekken wachten')+' op ons'}>{wacht>99?'99+':wacht}</span>}</Link>)}
   <Link href="/" className="tapp-tab"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>Backoffice</Link>
  </nav>
 </div>;
}

/**
 * Hoeveel gesprekken op ons wachten (bolletje op Gesprekken, wens eigenaar 18 november 2026). Elke minuut opnieuw, en meteen
 * als de app weer in beeld komt. Waar de telefoon het kan, staat het getal ook op het icoon van de app (Badging API).
 */
function useWacht(){
 const [n,setN]=useState(0);
 useEffect(()=>{
  let stop=false;
  const load=async()=>{if(document.visibilityState==='hidden')return;try{const r=await fetch('/api/gesprekken/teller',{cache:'no-store'});if(!r.ok)return;const d=await r.json() as {wacht?:number};const w=Math.max(0,Number(d.wacht)||0);if(stop)return;setN(w);
   const nav=navigator as Navigator&{setAppBadge?:(n?:number)=>Promise<void>;clearAppBadge?:()=>Promise<void>};
   if(w>0)nav.setAppBadge?.(w).catch(()=>{});else nav.clearAppBadge?.().catch(()=>{})}catch{}};
  void load();const t=setInterval(()=>void load(),60000),onVis=()=>void load();document.addEventListener('visibilitychange',onVis);
  return()=>{stop=true;clearInterval(t);document.removeEventListener('visibilitychange',onVis)};
 },[]);
 return n;
}

'use client';
// Wisselen tussen de tabletschermen (wens eigenaar 3 november 2026): van barista naar kok, winkel, opnemen of kassa,
// met een tik op de balk of door te vegen. Meldingen: het geluidje hoort bij het scherm dat open staat; nieuwe
// bestellingen bij een andere werkplek zie je als teller in de balk (die knippert even), zodat je weet waar je nodig bent.
// Wisselen laadt de pagina helemaal opnieuw (wens eigenaar 15 november 2026): op trage schermen (Unitouch met Firefox) tekende
// het wisselen binnen de pagina de kleuren maar half over, zodat knoppen deels groen bleven tot je ververste.
import {useEffect,useRef,useState} from 'react';
import {KIOSK_SCREENS,swipeTarget,type KioskScreen} from '@/lib/kiosk-core';
const STATIONS=['kok','barista','winkel'] as const;
export function KioskNav({current}:{current:KioskScreen}){
 const [counts,setCounts]=useState<Record<string,number>>({}),[fresh,setFresh]=useState<Record<string,boolean>>({});
 const known=useRef<Record<string,Set<number>>>({});
 // Tellers: nieuwe (nog niet gestarte) bestellingen per werkplek, elke 10 seconden.
 useEffect(()=>{let alive=true;
  async function poll(){for(const s of STATIONS){try{const r=await fetch('/api/workplaces?station='+s,{cache:'no-store'});if(!r.ok)continue;
   const ids=(await r.json() as {id:number;status:string}[]).filter(o=>o.status==='nieuw').map(o=>o.id);if(!alive)return;
   const before=known.current[s];const added=!!before&&ids.some(id=>!before.has(id));known.current[s]=new Set(ids);
   setCounts(c=>({...c,[s]:ids.length}));if(added&&s!==current){setFresh(f=>({...f,[s]:true}));setTimeout(()=>alive&&setFresh(f=>({...f,[s]:false})),6000)}
  }catch{}}}
  // Snelheid (4 november 2026): de tellers van de andere werkplekken elke 20 seconden, en niet als het scherm verborgen is.
  void poll();const t=setInterval(()=>{if(!document.hidden)void poll()},20000);return()=>{alive=false;clearInterval(t)};
 },[current]);
 // Vegen: horizontaal, minstens 90 pixels, niet in een invoerveld of een rij die zelf zijwaarts schuift.
 useEffect(()=>{let x=0,y=0,skip=false;
  const down=(e:TouchEvent)=>{const t=e.touches[0];x=t.clientX;y=t.clientY;const el=e.target as HTMLElement|null;
   skip=!!el?.closest('input,textarea,select,[data-no-swipe]')||!!el?.closest('*')&&(()=>{for(let n:HTMLElement|null=el;n;n=n.parentElement)if(n.scrollWidth>n.clientWidth+4&&getComputedStyle(n).overflowX!=='visible')return true;return false})()};
  const up=(e:TouchEvent)=>{if(skip)return;const t=e.changedTouches[0],dx=t.clientX-x,dy=t.clientY-y;if(Math.abs(dx)<90||Math.abs(dy)>Math.abs(dx)*0.6)return;const to=swipeTarget(current,dx);if(to)window.location.assign(to)};
  window.addEventListener('touchstart',down,{passive:true});window.addEventListener('touchend',up,{passive:true});
  return()=>{window.removeEventListener('touchstart',down);window.removeEventListener('touchend',up)};
 },[current]);
 return <nav className="kiosk-nav" aria-label="Wissel van scherm">
  {KIOSK_SCREENS.map(s=>{const n=counts[s.id]||0;return <a key={s.id} href={s.href} className={'kiosk-nav-item'+(s.id===current?' on':'')+(fresh[s.id]?' fresh':'')} aria-current={s.id===current?'page':undefined}>
   <span aria-hidden="true">{s.icon}</span> {s.name}{n>0&&<b className="kiosk-nav-count" aria-label={n+' nieuw'}>{n}</b>}
  </a>})}
  <span className="kiosk-nav-hint small">Veeg naar links of rechts om te wisselen</span>
 </nav>;
}

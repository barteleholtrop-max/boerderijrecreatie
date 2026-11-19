'use client';
// Werkplektablets (besluit eigenaar 6 november 2026): de werkplekpas geldt 60 minuten. Zolang het scherm openstaat, haalt de
// tablet elke 10 minuten (en als het scherm weer zichtbaar wordt) een nieuwe pas op met zijn apparaatbewijs. Een ontkoppelde
// tablet krijgt geen nieuwe pas meer en gaat bij de volgende keer naar het koppelscherm. Op een gewone login doet dit niets.
import {useEffect} from 'react';
export function WerkplekVernieuwen(){
 useEffect(()=>{let last=0;
  const renew=()=>{if(Date.now()-last<60000)return;last=Date.now();void fetch('/auth/werkplek/vernieuw',{method:'POST',cache:'no-store'}).catch(()=>{})};
  renew();const t=setInterval(renew,600000),vis=()=>{if(!document.hidden)renew()};document.addEventListener('visibilitychange',vis);
  return()=>{clearInterval(t);document.removeEventListener('visibilitychange',vis)};
 },[]);
 return null;
}

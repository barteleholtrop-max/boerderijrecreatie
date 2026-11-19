'use client';
// Wie is er vandaag? als eigen werkplekscherm (wens eigenaar 5 november 2026), naast de kassa in de balk bovenaan.
// Aanmelden kan alleen hier, op de tablet op de boerderij; pas dan telt een rol mee in de restaurantpot (lib/pot-planning.ts).
import {useCallback,useEffect,useState} from 'react';
import {KioskNav} from '../nav';
import {TeamToday} from '../team';
export default function KioskTeam(){
 const [now,setNow]=useState<Date|null>(null),[count,setCount]=useState<{present:number;planned:number}|null>(null);
 // Vaste functie: anders laadt de lijst bij elke weergave opnieuw.
 const onCount=useCallback((present:number,planned:number)=>setCount({present,planned}),[]);
 useEffect(()=>{setNow(new Date());const t=setInterval(()=>setNow(new Date()),30000);return()=>clearInterval(t)},[]);
 const day=now?new Intl.DateTimeFormat('nl-NL',{weekday:'long',day:'numeric',month:'long',timeZone:'Europe/Amsterdam'}).format(now):'';
 return <div className="kiosk-page station-team" data-bb-view="werkplek-team">
  <KioskNav current="team"/>
  <header className="kiosk-head">
   <div><p className="kiosk-hello">{day&&day[0].toUpperCase()+day.slice(1)} 🙋</p><h1>Wie is er vandaag?</h1>
    <p className="kiosk-sub">{count?(count.present?`${count.present} van de ${Math.max(count.planned,count.present)} ${count.planned===1?'is':'zijn'} er al. Meld je aan als je begint.`:'Nog niemand aangemeld. Meld je aan als je begint.'):'Meld je aan als je begint; dan telt je rol mee in de pot.'}</p></div>
   <div className="kiosk-tools">{now&&<span className="kiosk-clock">{now.toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Amsterdam'})}</span>}</div>
  </header>
  <TeamToday onCount={onCount}/>
 </div>;
}

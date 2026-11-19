'use client';
// Webadressen van de tabletschermen, met een QR-code om ze snel op een tablet of telefoon te openen.
// Eigen adres voor de werkplekken (13 november 2026, docs/ONLINE-ZETTEN.md): staat werkstation.example.nl aan (WERKSTATION_ORIGIN, in
// <meta name="werkstation-origin">), dan wijzen de links daarheen en opent Kassa de tabletkassa (/werkplek/kassa).
import {useEffect,useState} from 'react';
import QRCode from 'qrcode';
const screens=(werkstation:boolean):[string,string,string][]=>[['/werkplek/kok','🍳','Kok'],['/werkplek/barista','☕','Barista'],['/werkplek/winkel','🧺','Winkel'],['/opnemen','🍽️','Opnemen aan tafel'],[werkstation?'/werkplek/kassa':'/kassa','🧾','Kassa']];
export function TabletScreens(){
 const [origin,setOrigin]=useState(''),[codes,setCodes]=useState<Record<string,string>>({}),[open,setOpen]=useState(false);
 const [werkstation,setWerkstation]=useState(false);
 useEffect(()=>{const w=document.querySelector('meta[name="werkstation-origin"]')?.getAttribute('content')||'';setWerkstation(!!w);setOrigin(w||location.origin)},[]);
 const SCREENS=screens(werkstation);
 useEffect(()=>{if(!open||!origin)return;Promise.all(SCREENS.map(async([p])=>[p,await QRCode.toDataURL(origin+p,{width:240,margin:1,color:{dark:'#263d30',light:'#ffffff'}})] as const)).then(r=>setCodes(Object.fromEntries(r))).catch(()=>{})},[open,origin,werkstation]);
 const local=/^http:\/\/(localhost|127\.0\.0\.1)/.test(origin);
 return <section className="card section-gap" aria-label="Schermen voor tablets">
  <div className="card-head"><h3 className="card-title">📱 Open op een tablet, telefoon of computer</h3><button className="btn sm secondary" onClick={()=>setOpen(!open)}>{open?'QR-codes verbergen':'QR-codes tonen'}</button></div>
  <div className="grid four tablet-screens">{SCREENS.map(([p,icon,name])=><div key={p} className="stack" style={{gap:6}}><a className="btn secondary" href={origin+p} target="_blank" rel="noreferrer">{icon} {name}</a><small className="small" style={{wordBreak:'break-all'}}>{origin}{p}</small>{open&&codes[p]&&<img src={codes[p]} alt={'QR-code voor '+name} width={150} height={150} style={{border:'1px solid var(--border)',borderRadius:10}}/>}</div>)}</div>
  {local&&<p className="small" style={{marginTop:10}}>Dit adres werkt alleen op deze computer. Op tablets en telefoons in het wifi werkt het zodra het vaste wifi-adres is ingesteld (volgende stap); tot die tijd via <code>./boerbart-test --telefoon</code>.</p>}
 </section>;
}

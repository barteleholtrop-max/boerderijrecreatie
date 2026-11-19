'use client';
// Zelfkassa & QR-stickers (wens eigenaar 9 november 2026). Zie page.tsx en docs/ZELFSERVICEKASSA.md.
// - Tabletlink: <website>/zelfkassa.html (eigen pagina sinds 12 november 2026; het oude adres bestellen.html?zelfservice=1 werkt nog). Alleen het winkelmandje: scannen of aantikken, afrekenen met de eigen
//   telefoon (iDEAL of BB-saldo). Geen werkplekken, voorraad of dagplanning.
// - QR-stickers: per winkelproduct de link <website>/zelfscan.html?product=<id> (eigen Zelfscan-app, 12 november 2026; voorheen bestellen.html?winkel=1). De tablet zet het product in het
//   mandje; een gewone telefoon opent het product op de bestelpagina. De code verandert niet als de prijs verandert.
import {useEffect,useMemo,useState} from 'react';
import QRCode from 'qrcode';
import {PageHead,Pill,SubTabs,money} from '../../ui';
import {useBackoffice} from '../../use-backoffice';
const TABS:[string,string][]=[['/winkel','Assortiment & eigenaren'],['/winkel/zelfkassa','Zelfkassa & QR-stickers']];
const QR={margin:1,errorCorrectionLevel:'M' as const,color:{dark:'#263d30',light:'#ffffff'},width:360};
function useQr(text:string|null){const [src,setSrc]=useState('');useEffect(()=>{if(!text){setSrc('');return}let on=true;QRCode.toDataURL(text,QR).then(s=>{if(on)setSrc(s)}).catch(()=>setSrc(''));return()=>{on=false}},[text]);return src}
function Sticker({site,id,name,price}:{site:string;id:string;name:string;price:string}){
 const src=useQr(`${site}/zelfscan.html?product=${encodeURIComponent(id)}`); // Zelfscan-app (12 november 2026)
 return <div className="qr-sticker">{src?<img src={src} alt={'QR-code van '+name}/>:<div className="qr-wait"/>}<b>{name}</b><span>{price}</span></div>;
}
export function Zelfkassa({site}:{site:string|null}){
 const {products,loading,error}=useBackoffice({products:true});
 const [count,setCount]=useState<Record<string,number>>({}),[query,setQuery]=useState(''),[msg,setMsg]=useState('');
 const tablet=site?site+'/zelfkassa.html':null,tabletQr=useQr(tablet);
 // Alleen gepubliceerde winkelproducten: die staan op de website en kunnen in het mandje.
 const shop=useMemo(()=>products.filter(r=>r.published&&r.draft.department==='Winkel').sort((a,b)=>a.draft.name.localeCompare(b.draft.name,'nl')),[products]);
 const list=shop.filter(r=>r.draft.name.toLowerCase().includes(query.toLowerCase()));
 const sheet=shop.flatMap(r=>Array.from({length:count[r.id]||0},(_,i)=>({key:r.id+'-'+i,r})));
 const set=(id:string,n:number)=>setCount(c=>({...c,[id]:Math.max(0,Math.min(60,Math.round(n)||0))}));
 async function copy(){if(!tablet)return;try{await navigator.clipboard.writeText(tablet);setMsg('Link gekopieerd.')}catch{setMsg('Kopiëren lukte niet; selecteer de link en kopieer hem zelf.')}}
 return <div data-bb-view="zelfkassa">
  <div className="no-print">
   <PageHead eyebrow="BOERDERIJWINKEL" title="Zelfkassa & QR-stickers" sub="De link voor de tablet in de winkel: alleen de bestelkassa. Gasten scannen of tikken hun producten aan en rekenen af met hun eigen telefoon."/>
   <SubTabs current="/winkel/zelfkassa" items={TABS}/>
   {error&&<div className="message" role="status">{error}</div>}
   {msg&&<div className="message" role="status">{msg}</div>}
   <div className="grid two">
    <section className="card"><div className="card-head"><h3 className="card-title">Link voor de tablet</h3><Pill>alleen de bestelkassa</Pill></div>
     {tablet?<>
      <p className="small">Open deze link op de tablet in de winkel. Je ziet alleen het winkelmandje: geen barista, kok, voorraad, aanwezigheid of dagplanning.</p>
      <p className="site-url"><a href={tablet} target="_blank" rel="noopener">{tablet.replace(/^https?:\/\//,'')}</a></p>
      <div className="row" style={{gap:8,flexWrap:'wrap'}}><button type="button" className="btn" onClick={copy}>Link kopiëren</button><a className="btn secondary" href={tablet} target="_blank" rel="noopener">Openen ↗</a></div>
      {tabletQr&&<div className="qr-tablet"><img src={tabletQr} alt="QR-code met de link voor de tablet"/><span className="small">Scan deze code met de camera van de tablet om de link te openen.</span></div>}
     </>:<p className="small">Het adres van de website is nog niet bekend. Zet WEBSITE_URL of voeg het websiteadres toe aan PUBLIC_ORDER_ORIGINS (zie docs/ONLINE-ZETTEN.md).</p>}
    </section>
    <section className="card"><h3 className="card-title">Zo zet je de tablet neer</h3>
     <ol className="small zelfkassa-steps">
      <li>Gebruik een Android-tablet met Chrome. Alleen daarmee kan de tablet producten scannen met de camera.</li>
      <li>Open de link en tik in Chrome op ⋮ → <b>App installeren</b> (of <b>Toevoegen aan startscherm</b>). Het pictogram <b>Zelfkassa</b> opent altijd de zelfkassa, op volledig scherm en liggend; nooit de bestelpagina met eten en drinken.</li>
      <li>Zet in Android <b>App vastzetten</b> aan (Instellingen → Beveiliging), dan kunnen gasten de kassa niet verlaten.</li>
      <li>Hang de tablet zo op dat de voorcamera gasten aankijkt: zij houden de QR-sticker voor de camera.</li>
      <li>Geef de eerste keer toestemming voor de camera.</li>
     </ol>
     <p className="small">Afrekenen gaat niet contant. De tablet toont een QR-code; de gast betaalt op de eigen telefoon via een betaalverzoek (bank-app), of als lid met het BB-saldo (eerst die telefoon koppelen via de ledenpagina).</p>
    </section>
   </div>
   <section className="card section-gap"><div className="card-head"><h3 className="card-title">QR-stickers per product</h3><Pill>{sheet.length} stickers</Pill></div>
    <p className="small">Kies per product hoeveel stickers je wilt en print het vel. De sticker blijft goed als de prijs verandert; de prijs op de sticker is alleen ter informatie.</p>
    <div className="row" style={{gap:8,flexWrap:'wrap',marginBottom:10}}>
     <input className="input" aria-label="Zoek winkelproduct" placeholder="Zoek product…" value={query} onChange={e=>setQuery(e.target.value)} style={{maxWidth:260}}/>
     <button type="button" className="btn secondary" onClick={()=>setCount(Object.fromEntries(shop.map(r=>[r.id,1])))}>Van elk product 1</button>
     <button type="button" className="btn secondary" onClick={()=>setCount({})}>Alles op 0</button>
     <button type="button" className="btn" disabled={!sheet.length||!site} onClick={()=>window.print()}>Stickers printen</button>
    </div>
    {loading?<div className="empty">Laden…</div>:!shop.length?<div className="empty">Nog geen gepubliceerde winkelproducten.</div>:
     <div className="stack">{list.map(r=><label key={r.id} className="row zelfkassa-product" style={{justifyContent:'space-between',gap:10}}>
      <span><b>{r.draft.name}</b> <span className="small">{money(r.draft.priceCents)}</span></span>
      <input className="input" type="number" min={0} max={60} inputMode="numeric" aria-label={'Aantal stickers voor '+r.draft.name} value={count[r.id]||0} onChange={e=>set(r.id,Number(e.target.value))} style={{width:80}}/>
     </label>)}</div>}
   </section>
  </div>
  {site&&sheet.length>0&&<section className="qr-sheet" aria-label="Stickervel">{sheet.map(({key,r})=><Sticker key={key} site={site} id={r.id} name={r.draft.name} price={money(r.draft.priceCents)}/>)}</section>}
 </div>;
}

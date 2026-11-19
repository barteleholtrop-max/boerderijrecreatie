'use client';
// Pakbon fotograferen (wens eigenaar 17 november 2026: „pakbon fotograferen, zodat hij vanuit de pakbon de voorraad automatisch
// voorstel kan doen … uit de factuur de prijs haalt”). Werkplek Voorraad → Levering. Foto('s) van de pakbon → Claude leest de regels
// (/api/werkplek/pakbon) → per regel een voorstel: bestaand ingrediënt of nieuw, met de hoeveelheid → de medewerker controleert →
// „Voorraad bijwerken” (/api/operations, actie 'pakbon'). De prijs komt later uit de factuur van dezelfde leverancier.
// Kassabon (wens eigenaar 17 november 2026: eigen inkoop bij Lidl of Jumbo): zelfde stappen, met per regel het bedrag en de btw;
// de bon komt dan meteen als inkoopbon bij Inkoop, dus de prijs staat er direct.
// Uploaden (wens eigenaar 17 november 2026: „ook de optie pakbon of factuur uploaden”): een foto of PDF van een pakbon, kassabon of
// factuur. Bij een factuur: staat de levering al met de pakbon in de voorraad, dan alleen de prijzen.
import {useState} from 'react';
import {LabelCamera} from '../label-camera';
import {shrinkPhoto} from '../label-photo';
import {MAX_SLIP_PAGES,type Slip,type SlipLine,type SlipKind} from '@/lib/packing-slip-core';

type Unit='kg'|'l'|'st';
type Choice={id:string;name:string;unit:Unit;supplier:string;stock:number;known:boolean};
type Row=SlipLine&{pick:string;qty:string;name:string;skip:boolean;price:string;vat:9|21};
const UNIT={st:'stuks',kg:'kg',l:'liter'} as const;
const fmt=(n:number)=>new Intl.NumberFormat('nl-NL',{maximumFractionDigits:3}).format(n);
const num=(v:string)=>{const t=v.trim().replace(',','.');return /^\d+(\.\d+)?$/.test(t)&&Number(t)>0?Number(t):null};
// "3,49" → 349 (ook 0,00 voor een gratis product); ongeldig → null.
const centsOf=(v:string)=>{const t=v.trim().replace(/^€\s*/,'').replace(',','.');return /^\d{1,5}(\.\d{1,2})?$/.test(t)?Math.round(Number(t)*100):null};
/** Een PDF (of foto) als data-URL; foto's worden verkleind. */
const asDataUrl=(f:Blob)=>f.type==='application/pdf'?new Promise<string|null>(res=>{if(f.size>8_000_000){res(null);return}const r=new FileReader();r.onload=()=>res(typeof r.result==='string'?r.result.replace(/^data:[^;]*;/,'data:application/pdf;'):null);r.onerror=()=>res(null);r.readAsDataURL(f)}):shrinkPhoto(f,2000);
const KIND_NAME:Record<SlipKind,string>={pakbon:'Pakbon',kassabon:'Kassabon',factuur:'Factuur'};
const euroText=(c:number|null)=>c===null?'':(c/100).toFixed(2).replace('.',',');

export function PackingSlip({who}:{who:string}){
 const [cam,setCam]=useState(false),[pages,setPages]=useState<Blob[]>([]),[busy,setBusy]=useState(''),[error,setError]=useState(''),[done,setDone]=useState('');
 const [slip,setSlip]=useState<Slip|null>(null),[rows,setRows]=useState<Row[]>([]),[choices,setChoices]=useState<Choice[]>([]),[supplier,setSupplier]=useState(''),[number,setNumber]=useState('');
 const [requestId,setRequestId]=useState(''),[kind,setKind]=useState<SlipKind>('pakbon'),[camKind,setCamKind]=useState<SlipKind>('pakbon'),[upload,setUpload]=useState(false),[stock,setStock]=useState(true);
 const receipt=kind==='kassabon',invoice=kind==='factuur',priced=kind!=='pakbon';
 const set=(n:number,patch:Partial<Row>)=>{setRows(list=>list.map(r=>r.n===n?{...r,...patch}:r));setRequestId(crypto.randomUUID())};

 async function read(files:Blob[],k:SlipKind){
  setCam(false);setPages([]);setUpload(false);if(!files.length)return;
  setBusy(KIND_NAME[k]+' lezen… dit duurt even.');setKind(k);setStock(true);setError('');setDone('');setSlip(null);
  try{
   const pdfs=files.filter(f=>f.type==='application/pdf');if(pdfs.length>1||(pdfs.length&&files.length>1))throw Error('Kies één PDF, of 1 tot '+MAX_SLIP_PAGES+' foto’s.');
   const images=await Promise.all(files.slice(0,MAX_SLIP_PAGES).map(asDataUrl));
   if(images.some(i=>!i))throw Error('Een bestand kunnen we niet gebruiken. Kies een foto of een PDF tot 8 MB.');
   const r=await fetch('/api/werkplek/pakbon',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({images,kind:k})});
   const d=await r.json().catch(()=>({})) as {ok?:boolean;error?:string;slip?:Slip;ingredients?:Choice[]};
   if(!r.ok||!d.ok||!d.slip)throw Error(d.error||`De ${k} kon niet worden gelezen.`);
   setSlip(d.slip);setChoices(d.ingredients||[]);setSupplier(d.slip.supplier);setNumber(d.slip.number);setRequestId(crypto.randomUUID());
   setRows(d.slip.lines.map(l=>({...l,pick:l.ingredientId||'nieuw',qty:fmt(l.amount).replace(/\./g,''),name:'',skip:false,price:euroText(l.totalCents),vat:l.vatPct===21?21:9})));
  }catch(e){setError(e instanceof Error?e.message:`De ${k} kon niet worden gelezen.`)}finally{setBusy('')}
 }
 const pick=(k:SlipKind)=>{const input=document.createElement('input');input.type='file';input.accept='image/*,application/pdf';input.multiple=true;input.hidden=true;
  input.onchange=()=>{void read(Array.from(input.files||[]),k);input.remove()};document.body.append(input);input.click()};

 const chosen=rows.filter(r=>!r.skip);
 const unitOf=(r:Row)=>r.pick==='nieuw'?r.unit:choices.find(c=>c.id===r.pick)?.unit||r.unit;
 async function book(){
  setError('');setDone('');
  if(!who.trim()){setError('Vul bovenaan in wie je bent.');return}
  if(!supplier.trim()){setError(receipt?'Vul de winkel in.':'Vul de leverancier in.');return}
  if(receipt&&!number.trim()){setError('Vul de tijd of het bonnummer van de kassabon in.');return}
  if(invoice&&!number.trim()){setError('Vul het factuurnummer in.');return}
  const bad=chosen.find(r=>num(r.qty)===null);if(bad){setError(`Vul bij „${bad.description}” een hoeveelheid in.`);return}
  const noPrice=priced?chosen.find(r=>centsOf(r.price)===null):null;if(noPrice){setError(`Vul bij „${noPrice.description}” het bedrag ${invoice?'zonder btw':'van de bon'} in.`);return}
  const price=(r:Row)=>priced?{totalCents:centsOf(r.price),vatPct:r.vat}:{};
  const lines=chosen.map(r=>r.pick==='nieuw'?{quantity:num(r.qty),...price(r),newIngredient:{name:r.name.trim()||undefined,description:r.description,article:r.article,unit:r.unit,perPackage:r.perPackage}}:{ingredientId:r.pick,quantity:num(r.qty),...price(r)});
  setBusy('Voorraad bijwerken…');
  try{
   // De nieuwste versie van de voorraad ophalen; is er net iets anders opgeslagen, dan nog een keer (zelfde requestId: nooit dubbel).
   for(let attempt=0;attempt<3;attempt++){
    const v=await fetch('/api/operations?magazijn=1',{cache:'no-store'}).then(r=>r.json()).catch(()=>({})) as {version?:number};
    const r=await fetch('/api/operations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'pakbon',kind,stock,date:slip?.date??null,requestId,version:v.version??0,by:who.trim(),supplier:supplier.trim(),number:number.trim(),lines})});
    const d=await r.json().catch(()=>({})) as {ok?:boolean;error?:string};
    if(r.status===409&&attempt<2)continue;
    if(!r.ok||!d.ok)throw Error(d.error||'Bijwerken lukte niet.');
    const nieuw=chosen.filter(x=>x.pick==='nieuw').length;
    setDone(invoice&&!stock?`✓ Prijzen bijgewerkt: de factuur van ${supplier.trim()} staat bij Inkoop (${chosen.length} ${chosen.length===1?'regel':'regels'}). De voorraad is niet veranderd, want die kwam al binnen met de pakbon.`
     :invoice?`✓ Voorraad bijgewerkt: ${chosen.length} ${chosen.length===1?'regel':'regels'} van ${supplier.trim()}${nieuw?`, waarvan ${nieuw} nieuw ingrediënt`:''}. De factuur staat bij Inkoop, met de prijzen.`
     :receipt?`✓ Voorraad bijgewerkt: ${chosen.length} ${chosen.length===1?'regel':'regels'} van ${supplier.trim()}${nieuw?`, waarvan ${nieuw} nieuw ingrediënt`:''}. De kassabon staat bij Inkoop, met de prijzen zonder btw.`
     :`✓ Voorraad bijgewerkt: ${chosen.length} ${chosen.length===1?'regel':'regels'} van ${supplier.trim()}${nieuw?`, waarvan ${nieuw} nieuw ingrediënt`:''}. De prijs komt uit de factuur van ${supplier.trim()} zodra die bij Inkoop is ingelezen. Bevestig daar de levering niet nog een keer, anders telt hij dubbel.`);
    setSlip(null);setRows([]);return;
   }
  }catch(e){setError(e instanceof Error?e.message:'Bijwerken lukte niet.')}finally{setBusy('')}
 }

 return <section className="slip" aria-label="Pakbon fotograferen">
  <div className="delivery-actions">
   <button type="button" className="kiosk-btn soft" disabled={!!busy} onClick={()=>{setPages([]);setCamKind('pakbon');setCam(true)}}>🧾 Pakbon fotograferen</button>
   <button type="button" className="kiosk-btn soft" disabled={!!busy} onClick={()=>{setPages([]);setCamKind('kassabon');setCam(true)}}>🛒 Kassabon fotograferen</button>
   <button type="button" className="kiosk-btn soft" disabled={!!busy} aria-expanded={upload} onClick={()=>setUpload(u=>!u)}>📄 Uploaden</button>
  </div>
  {upload&&<div className="delivery-actions" role="group" aria-label="Wat upload je?">
   <span className="kiosk-sub">Wat upload je? Een foto of PDF.</span>
   <button type="button" className="kiosk-btn soft" disabled={!!busy} onClick={()=>pick('pakbon')}>Pakbon</button>
   <button type="button" className="kiosk-btn soft" disabled={!!busy} onClick={()=>pick('kassabon')}>Kassabon</button>
   <button type="button" className="kiosk-btn soft" disabled={!!busy} onClick={()=>pick('factuur')}>Factuur</button>
  </div>}
  <p className="kiosk-sub">Pakbon: levering van een leverancier, de prijs komt later uit de factuur. Kassabon: zelf ingekocht bij bijvoorbeeld Lidl of Jumbo, de prijs komt meteen van de bon. Factuur uploaden: de prijzen, en de voorraad als die nog niet met de pakbon is binnengekomen.</p>
  {cam&&<LabelCamera count={pages.length} onShot={f=>setPages(p=>p.length<MAX_SLIP_PAGES?[...p,f]:p)} onClose={()=>void read(pages,camKind)}
   status={!pages.length?(camKind==='kassabon'?'Leg de kassabon plat en fotografeer de hele bon. Lange bon? Fotografeer hem in stukken (hooguit 4) en tik op Klaar.':'Leg de pakbon plat en fotografeer de hele bon. Meer pagina’s? Maak er nog een foto van, en tik op Klaar.'):`${pages.length} ${pages.length===1?'pagina':'pagina’s'}. Volgende pagina, of tik op Klaar.`}/>}
  {busy&&<p className="kiosk-note" role="status">{busy}</p>}
  {error&&<p className="kiosk-error" role="alert">{error}</p>}
  {done&&<p className="kiosk-note" role="status">{done}</p>}
  {slip&&<div className="slip-review">
   <div className="slip-head">
    <label className="kiosk-label">{receipt?'Winkel':'Leverancier'}<input className="kiosk-input" value={supplier} maxLength={200} onChange={e=>{setSupplier(e.target.value);setRequestId(crypto.randomUUID())}}/></label>
    <label className="kiosk-label">{receipt?'Tijd en bonnummer':invoice?'Factuurnummer':'Pakbonnummer'}<input className="kiosk-input" value={number} maxLength={60} onChange={e=>{setNumber(e.target.value);setRequestId(crypto.randomUUID())}}/></label>
    {slip.date&&<p className="kiosk-sub">{receipt?'Datum op de kassabon':invoice?'Factuurdatum':'Leverdatum op de pakbon'}: {slip.date.split('-').reverse().join('-')}</p>}
   </div>
   {invoice&&<label className="kiosk-check"><input type="checkbox" checked={!stock} onChange={e=>{setStock(!e.target.checked);setRequestId(crypto.randomUUID())}}/> Deze levering staat al in de voorraad (met de pakbon): alleen de prijzen bijwerken</label>}
   <p className="kiosk-sub">Controleer elke regel: klopt het ingrediënt en de hoeveelheid{receipt?' en het bedrag (met btw, na korting)':invoice?' en het bedrag (zonder btw)':''}? {receipt?'Niet voor de zaak gekocht?':'Niet uitgepakt of niet voor ons?'} Tik op Overslaan.</p>
   <ul className="slip-lines">{rows.map(r=><li key={r.n} className={'slip-line'+(r.skip?' skip':r.pick==='nieuw'?' nieuw':'')}>
    <div className="slip-text"><b>{r.description}</b>
     <small>{receipt?'Op de bon':invoice?'Op de factuur':'Op de pakbon'}: {r.packages&&r.perPackage?`${fmt(r.packages)} × ${fmt(r.perPackage)} ${UNIT[r.unit]}`:`${fmt(r.quantity)} ${UNIT[r.unit]}`}{r.article&&!receipt?` · art. ${r.article}`:''}
      {r.match==='artikel'?(receipt?' · herkend van een vorige bon':' · herkend aan het artikelnummer'):r.match==='naam'?' · herkend aan de naam':r.match==='claude'?' · voorstel, even controleren':''}</small>
     {r.note&&!r.skip&&<small className="slip-warn">{r.note}</small>}
    </div>
    {!r.skip&&<div className="slip-fields">
     <select className="kiosk-input" aria-label={`Ingrediënt voor ${r.description}`} value={r.pick} onChange={e=>{const c=choices.find(x=>x.id===e.target.value);set(r.n,{pick:e.target.value,...(c&&c.unit!==r.unit?{note:`Op de pakbon in ${UNIT[r.unit]}, het ingrediënt telt in ${UNIT[c.unit]}. Controleer de hoeveelheid.`}:{note:''})})}}>
      <option value="nieuw">＋ Nieuw ingrediënt</option>
      {choices.map(c=><option key={c.id} value={c.id}>{c.name} · {UNIT[c.unit]}{c.supplier?` · ${c.supplier}`:''}</option>)}
     </select>
     {r.pick==='nieuw'&&<input className="kiosk-input" aria-label={`Naam van het nieuwe ingrediënt voor ${r.description}`} placeholder="Naam (mag leeg: dan de omschrijving)" value={r.name} maxLength={200} onChange={e=>set(r.n,{name:e.target.value})}/>}
     <span className="slip-qty"><input className="kiosk-input" inputMode="decimal" aria-label={`Hoeveelheid ${r.description}`} value={r.qty} onChange={e=>set(r.n,{qty:e.target.value})}/> {UNIT[unitOf(r)]}</span>
     {priced&&<span className="slip-qty">€ <input className="kiosk-input" inputMode="decimal" aria-label={`Bedrag ${invoice?'zonder btw':'op de bon'} voor ${r.description}`} placeholder="0,00" value={r.price} onChange={e=>set(r.n,{price:e.target.value})}/>
      <select className="kiosk-input slip-vat" aria-label={`Btw ${r.description}`} value={r.vat} onChange={e=>set(r.n,{vat:e.target.value==='21'?21:9})}><option value={9}>9% btw</option><option value={21}>21% btw</option></select></span>}
    </div>}
    <button type="button" className="kiosk-btn soft" onClick={()=>set(r.n,{skip:!r.skip})}>{r.skip?'Toch meenemen':'Overslaan'}</button>
   </li>)}</ul>
   <div className="delivery-actions">
    <button type="button" className="kiosk-btn big" disabled={!!busy||!chosen.length} onClick={()=>void book()}>✓ {invoice&&!stock?'Prijzen bijwerken':'Voorraad bijwerken'} ({chosen.length} {chosen.length===1?'regel':'regels'})</button>
    <button type="button" className="kiosk-btn soft" disabled={!!busy} onClick={()=>{setSlip(null);setRows([])}}>Annuleren</button>
   </div>
  </div>}
 </section>;
}

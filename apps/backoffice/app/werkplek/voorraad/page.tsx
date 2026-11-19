'use client';
// Voorraad als eigen werkplekscherm (wens eigenaar 6 november 2026), in de balk naast kok, barista en kassa.
// 1. Tellen: personeel loopt de voorraad door. Per regel de oude voorraad, de nieuwe intypen en bij een verschil een reden.
// 2. Uit de winkel: de kok (of de bar) haalt iets uit de winkel dat van een lid is. Dat wordt een verkoop op naam van de
//    keuken, zodat het in de weekafsluiting bij de eigenaar van het product terechtkomt (lib/stock-count-core.ts).
// 3. Afwijkingen: de lijst voor Rianne en Bartele, met wat er sinds de vorige telling via kassa en website is verkocht.
// 4. Magazijn (wens eigenaar 8 november 2026): toiletpapier, schoonmaakmiddel en andere spullen voor eigen gebruik, nooit voor gasten.
//    Tellen in de weekcontrole en „Bijna op” of „Op” melden, zodat Rianne weet wat er besteld moet worden (lib/warehouse-core.ts).
// 5. Levering (wens eigenaar 10 november 2026: „Levering fotograferen”, bij voorraad bijwerken): bij het uitpakken elk product
//    fotograferen (etiket of streepjescode). Bekend: herkend. Nieuw: meteen in de kassa met het prijsvoorstel uit de inkoopfactuur
//    (inkoopprijs + 20% marge + btw); zonder inkoopprijs vult de medewerker de verkoopprijs in (lib/label-read.ts).
//    Pakbon fotograferen (wens eigenaar 17 november 2026): de hele levering in één keer in de voorraad (./pakbon.tsx).
// Geen tweede voorraadlijst: dit is dezelfde voorraad als Inkoop & voorraad en Gerechten & prijzen.
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {KioskNav} from '../nav';
import {LabelCamera} from '../label-camera';
import {shrinkPhoto,barcodeIn} from '../label-photo';
import {PackingSlip} from './pakbon';
import {CountPhotos} from './tel-foto';
import {DEVIATION_REASONS,INTERNAL_TAKERS,amount,type DeviationRow} from '@/lib/stock-count-core';
import {REQUEST_STATUS,type OpenRequest} from '@/lib/warehouse-core';

type Ingredient={id:string;name:string;unit:'kg'|'l'|'st';stock:number;known:boolean;countedAt:string;min:number;kind?:string};
type Entry={qty:string;reason:string;note:string};
type Tab='tellen'|'levering'|'magazijn'|'winkel'|'afwijkingen';
const UNIT={st:'stuks',kg:'kg',l:'liter'} as const;
// "3,50" → 350; leeg of ongeldig → null.
const cents=(v:string)=>{const t=v.trim().replace(/^€\s*/,'').replace(',','.');if(!/^\d{1,4}(\.\d{1,2})?$/.test(t))return null;const c=Math.round(Number(t)*100);return c>0?c:null};
const euro=(c:number)=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(c/100);
const num=(v:string)=>{const t=v.trim().replace(',','.');if(!t||!/^\d+(\.\d+)?$/.test(t))return null;return Number(t)};
const nice=(d:string)=>d?new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z')):'';
// Naam van wie er telt of haalt: alleen voor het gemak op deze tablet onthouden.
const remembered=()=>{try{return localStorage.getItem('bb-voorraad-wie')||''}catch{return ''}};
const remember=(v:string)=>{try{localStorage.setItem('bb-voorraad-wie',v)}catch{}};

export default function KioskVoorraad(){
 const [tab,setTab]=useState<Tab>('tellen'),[who,setWho]=useState('');
 useEffect(()=>{setWho(remembered())},[]);
 const changeWho=(v:string)=>{setWho(v);remember(v)};
 return <div className="kiosk-page station-voorraad" data-bb-view={'werkplek-voorraad-'+tab}>
  <KioskNav current="voorraad"/>
  <header className="kiosk-head">
   <div><p className="kiosk-hello">Voorraad 📦</p><h1>{tab==='levering'?'Levering fotograferen':tab==='tellen'?'Wat staat er nog?':tab==='magazijn'?'Magazijn: wat is (bijna) op?':tab==='winkel'?'Iets uit de winkel halen':'Afwijkingen bij het tellen'}</h1>
    <p className="kiosk-sub">{tab==='levering'?'Pak de levering uit en fotografeer elk product: het etiket of de streepjescode. Nieuwe producten staan meteen in de kassa, met een prijs uit de inkoopfactuur. Of fotografeer de pakbon: dan stelt hij de voorraad voor.':tab==='tellen'?'Loop de voorraad door en typ wat er echt staat. Bij een verschil: even de reden.':tab==='magazijn'?'Toiletpapier, schoonmaakmiddel en andere spullen voor onszelf. Is iets (bijna) op? Tik het aan, dan weet Rianne wat er besteld moet worden.':tab==='winkel'?'Haal je iets uit de winkel voor de keuken of de bar? Leg het hier vast, dan krijgt het lid het op zijn tegoed.':'Voor Rianne en Bartele: wat week af, en hoeveel ging er via de kassa?'}</p></div>
   <div className="kiosk-tools"><label className="kiosk-tone"><span>Wie ben je?</span><input className="kiosk-input" value={who} maxLength={40} placeholder="Je naam" onChange={e=>changeWho(e.target.value)}/></label></div>
  </header>
  <div className="kiosk-tabs" role="tablist">
   {([['tellen','📋 Voorraad tellen'],['levering','📦 Levering'],['magazijn','🧻 Magazijn'],['winkel','🧺 Uit de winkel halen'],['afwijkingen','🔎 Afwijkingen']] as [Tab,string][]).map(([id,label])=><button key={id} type="button" role="tab" aria-selected={tab===id} className={'kiosk-btn soft'+(tab===id?' on':'')} onClick={()=>setTab(id)}>{label}</button>)}
  </div>
  {tab==='tellen'&&<Count who={who}/>}
  {tab==='levering'&&<Delivery who={who}/>}
  {tab==='magazijn'&&<Warehouse who={who}/>}
  {tab==='winkel'&&<FromShop who={who}/>}
  {tab==='afwijkingen'&&<Deviations/>}
 </div>;
}

function Count({who}:{who:string}){
 const [list,setList]=useState<Ingredient[]|null>(null),[version,setVersion]=useState(0),[today,setToday]=useState(''),[entries,setEntries]=useState<Record<string,Entry>>({});
 const [search,setSearch]=useState(''),[onlyOpen,setOnlyOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[msg,setMsg]=useState('');
 const load=useCallback(async()=>{const r=await fetch('/api/operations',{cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok){setError(d.error||'De voorraad kon niet worden geladen.');return}
  setList((d.state.ingredients as Ingredient[]).filter(i=>i.kind!=='magazijn').sort((a,b)=>a.name.localeCompare(b.name,'nl')));setVersion(d.version);setToday(d.today);setError('')},[]);
 useEffect(()=>{void load()},[load]);
 const set=(id:string,patch:Partial<Entry>)=>setEntries(e=>({...e,[id]:Object.assign({qty:'',reason:'',note:''},e[id],patch)}));
 const shown=useMemo(()=>{const q=search.trim().toLowerCase();return (list||[]).filter(i=>(!q||i.name.toLowerCase().includes(q))&&(!onlyOpen||i.countedAt!==today||entries[i.id]))},[list,search,onlyOpen,today,entries]);
 const filled=(list||[]).flatMap(i=>{const e=entries[i.id],n=e?num(e.qty):null;return e&&n!==null?[{i,e,n,diff:Math.round((n-(i.known?i.stock:0))*1000)/1000}]:[]});
 // Nog nooit geteld: de eerste telling is de beginvoorraad, zonder reden (wens eigenaar 17 november 2026, tellen met foto's).
 const missing=filled.filter(f=>f.i.known&&f.diff!==0&&(!f.e.reason||f.e.reason==='anders'&&!f.e.note.trim()));
 const bad=(list||[]).filter(i=>entries[i.id]?.qty.trim()&&num(entries[i.id].qty)===null);
 async function save(){if(!who.trim()){setError('Vul bovenaan in wie er telt.');return}if(missing.length){setError('Geef bij elk verschil een reden: '+missing.map(f=>f.i.name).join(', ')+'.');return}
  setBusy(true);setError('');setMsg('');
  try{const r=await fetch('/api/operations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'werkplek-telling',requestId:crypto.randomUUID(),version,by:who.trim(),counts:filled.map(f=>({ingredientId:f.i.id,quantity:f.n,...(f.diff!==0?{reason:f.e.reason,note:f.e.note}:{})}))})});
   const d=await r.json().catch(()=>({}));if(!r.ok){if(r.status===409)await load();throw Error(r.status===409?'Er is net iets verkocht of geteld. De oude voorraad is ververst: kijk de verschillen nog even na en sla opnieuw op.':d.error||'Opslaan lukte niet.')}
   const changed=filled.filter(f=>f.diff!==0).length;setEntries({});await load();
   setMsg(`Opgeslagen: ${filled.length} ${filled.length===1?'regel':'regels'}${changed?`, ${changed} met een verschil`:''}. Dank je, ${who.trim().split(' ')[0]}! 🌱`)}
  catch(e){setError(e instanceof Error?e.message:'Opslaan lukte niet.')}finally{setBusy(false)}}
 if(!list)return <section className="kiosk-stock">{error?<p className="kiosk-error">{error}</p>:<p className="kiosk-sub">Even laden…</p>}</section>;
 return <section className="kiosk-stock" aria-label="Voorraad tellen">
  <div className="kiosk-stock-head"><input className="kiosk-input" type="search" placeholder="Zoek, bijvoorbeeld cola" value={search} onChange={e=>setSearch(e.target.value)} aria-label="Zoeken"/>
   <label className="kiosk-check"><input type="checkbox" checked={onlyOpen} onChange={e=>setOnlyOpen(e.target.checked)}/> Alleen wat vandaag nog niet geteld is</label></div>
  {msg&&<p className="kiosk-team-msg" role="status">{msg}</p>}{error&&<p className="kiosk-error" role="alert">{error}</p>}
  <CountPhotos list={list} qty={id=>entries[id]?.qty||''} setQty={(id,v)=>set(id,{qty:v})} reload={load}/>
  {!list.length&&<p className="kiosk-sub">Er staat nog geen voorraad in Inkoop & voorraad.</p>}
  <div className="count-table" role="table" aria-label="Voorraad">
   <div className="count-row count-headrow" role="row"><span role="columnheader">Product</span><span role="columnheader">Oude voorraad</span><span role="columnheader">Nieuwe voorraad</span><span role="columnheader">Verschil</span><span role="columnheader">Reden van de afwijking</span></div>
   {shown.map(i=>{const e=entries[i.id],n=e?num(e.qty):null,old=i.known?i.stock:0,diff=n===null?null:Math.round((n-old)*1000)/1000;
    return <div key={i.id} className={'count-row'+(diff?' differs':'')+(diff===0?' same':'')} role="row">
     <span role="cell"><b>{i.name}</b><small>{UNIT[i.unit]}{i.countedAt===today?' · vandaag geteld ✓':i.countedAt?' · geteld '+nice(i.countedAt):''}</small></span>
     <span role="cell" className="count-old">{i.known?<>{amount(i.stock)} <small>{UNIT[i.unit]}</small></>:<small>nog niet geteld</small>}</span>
     <span role="cell" className="count-new"><input className="kiosk-input" inputMode="decimal" aria-label={'Nieuwe voorraad '+i.name} placeholder={i.known?amount(i.stock):'0'} value={e?.qty||''} onChange={x=>set(i.id,{qty:x.target.value})}/>
      <button type="button" className="kiosk-btn soft count-pm" aria-label={'Eén minder '+i.name} onClick={()=>{const c=num(e?.qty||'')??(i.known?i.stock:0);set(i.id,{qty:amount(Math.max(0,c-1))})}}>−</button>
      <button type="button" className="kiosk-btn soft count-pm" aria-label={'Eén meer '+i.name} onClick={()=>{const c=num(e?.qty||'')??(i.known?i.stock:0);set(i.id,{qty:amount(c+1)})}}>+</button>
      {i.known&&!e?.qty&&<button type="button" className="kiosk-btn soft count-ok" onClick={()=>set(i.id,{qty:amount(i.stock)})} aria-label={i.name+' klopt'}>Klopt</button>}</span>
     <span role="cell" className={'count-diff'+(diff&&diff<0?' minus':diff&&diff>0?' plus':'')}>{diff===null?'':diff===0?'✓':(diff>0?'+':'')+amount(diff)}</span>
     <span role="cell" className="count-reason">{diff&&i.known?<><select className="kiosk-input" value={e?.reason||''} onChange={x=>set(i.id,{reason:x.target.value})} aria-label={'Reden afwijking '+i.name}><option value="">Kies een reden</option>{Object.entries(DEVIATION_REASONS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
      <input className="kiosk-input" maxLength={200} placeholder={e?.reason==='anders'?'Wat is er gebeurd? (verplicht)':'Toelichting (mag leeg)'} value={e?.note||''} onChange={x=>set(i.id,{note:x.target.value})} aria-label={'Toelichting '+i.name}/></>:null}</span>
    </div>})}
  </div>
  <div className="count-save"><span className="kiosk-sub">{filled.length?`${filled.length} ${filled.length===1?'regel':'regels'} ingevuld${missing.length?`, nog ${missing.length} zonder reden`:''}.`:'Nog niets ingevuld.'}{bad.length?` Controleer: ${bad.map(i=>i.name).join(', ')} (alleen cijfers).`:''}</span>
   <button type="button" className="kiosk-btn" disabled={busy||!filled.length||bad.length>0} onClick={save}>{busy?'Even…':'Telling opslaan'}</button></div>
 </section>;
}

// priceCents: de inkoopprijs die de keuken betaalt (besluit eigenaar 6 november 2026); null = nog niet bekend. shopCents: winkelprijs.
// label: prijs van het etiket (bijvoorbeeld vlees uit de vriezer); de keuken betaalt het etiketbedrag min labelBp (besluit eigenaar 9 november 2026).
type ShopProduct={id:string;version:number;name:string;priceCents:number|null;shopCents:number;department:string;owner:string|null;label?:boolean;labelBp?:number};
const labelUnit=(p:ShopProduct,c:number)=>Math.round(c*(10000-Math.min(10000,Math.max(0,p.labelBp||0)))/10000);
type DeliveryItem={n:number;status:'bezig'|'bekend'|'nieuw'|'prijs'|'fout';name:string;priceCents?:number;proposal?:{unitCostCents:number;marginPct:number;supplier:string};barcode?:string|null;error?:string;price?:string;saving?:boolean};
function Delivery({who}:{who:string}){
 const [items,setItems]=useState<DeliveryItem[]>([]),seq=useRef(0);
 const set=(n:number,patch:Partial<DeliveryItem>)=>setItems(list=>list.map(i=>i.n===n?{...i,...patch}:i));
 async function read(file:Blob){
  const n=++seq.current;setItems(list=>[{n,status:'bezig',name:`Foto ${n}`},...list]);
  try{const [image,barcode]=await Promise.all([shrinkPhoto(file),barcodeIn(file)]);if(!image)throw Error('Deze foto kunnen we niet gebruiken. Probeer het opnieuw.');
   const r=await fetch('/api/werkplek/etiket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(barcode?{image,barcode}:{image})});
   const d=await r.json().catch(()=>({})) as {ok?:boolean;error?:string;code?:string;newName?:string;barcode?:string|null;created?:boolean;product?:{name:string}|null;labelName?:string;totalCents?:number;proposal?:DeliveryItem['proposal']};
   if(r.status===422&&d.code==='geen-inkoopprijs'){set(n,{status:'prijs',name:d.newName||`Foto ${n}`,barcode:d.barcode??barcode,price:''});return}
   if(!r.ok||!d.ok)throw Error(d.error||'De foto kon niet worden gelezen.');
   set(n,{status:d.created?'nieuw':'bekend',name:d.product?.name||d.labelName||`Foto ${n}`,priceCents:d.totalCents,proposal:d.proposal,barcode:d.barcode??barcode});
  }catch(e){set(n,{status:'fout',error:e instanceof Error?e.message:'De foto kon niet worden gelezen.'})}
 }
 async function addByHand(i:DeliveryItem){
  const c=cents(i.price||'');if(!c){set(i.n,{error:'Vul een verkoopprijs in, bijvoorbeeld 2,50.'});return}
  set(i.n,{saving:true,error:''});
  try{const r=await fetch('/api/werkplek/etiket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:i.name,barcode:i.barcode,priceCents:c})});
   const d=await r.json().catch(()=>({})) as {ok?:boolean;error?:string;created?:boolean;product?:{name:string}|null;totalCents?:number};
   if(!r.ok||!d.ok)throw Error(d.error||'Toevoegen lukte niet.');
   set(i.n,{status:d.created?'nieuw':'bekend',name:d.product?.name||i.name,priceCents:d.totalCents,saving:false});
  }catch(e){set(i.n,{saving:false,error:e instanceof Error?e.message:'Toevoegen lukte niet.'})}
 }
 const pick=()=>{const input=document.createElement('input');input.type='file';input.accept='image/*';input.multiple=true;
  input.hidden=true;input.onchange=()=>{for(const f of Array.from(input.files||[]).slice(0,12))void read(f);input.remove()};document.body.append(input);input.click()};
 const nieuw=items.filter(i=>i.status==='nieuw').length,busy=items.some(i=>i.status==='bezig');
 // Eigen camera met „Volgend etiket” en „Klaar” in beeld (wens eigenaar 11 november 2026, zoals bij de zelfkassa).
 const [cam,setCam]=useState(false),[camShots,setCamShots]=useState(0);
 const done=items.find(i=>i.status!=='bezig'),reading=items.filter(i=>i.status==='bezig').length;
 const lastText=!done?'':done.status==='bekend'?`✓ ${done.name}. `:done.status==='nieuw'?`＋ Nieuw: ${done.name} ${done.priceCents?euro(done.priceCents):''}. `:done.status==='prijs'?`€ ${done.name}: prijs invullen na Klaar. `:'Een foto is niet gelezen. ';
 return <section className="delivery" aria-label="Levering fotograferen">
  <div className="delivery-actions">
   <button type="button" className="kiosk-btn big" onClick={()=>{setCamShots(0);setCam(true)}}>📸 {items.length?'Verder fotograferen':'Foto maken'}</button>
   <button type="button" className="kiosk-btn soft" onClick={()=>pick()}>🖼️ Foto's kiezen</button>
  </div>
  <PackingSlip who={who}/>
  {cam&&<LabelCamera count={camShots} onShot={f=>{setCamShots(n=>n+1);void read(f)}} onClose={()=>setCam(false)}
   status={!camShots?'Richt op het etiket of de streepjescode en tik op Foto maken.':`${lastText}${camShots} ${camShots===1?'foto':"foto's"}${reading?` · ${reading} bezig`:''}. Volgend etiket, of tik op Klaar.`}/>}
  {items.length>0&&<p className="kiosk-sub" role="status">{items.length} {items.length===1?'foto':"foto's"}{nieuw?` · ${nieuw} nieuw in de kassa`:''}{busy?' · bezig met lezen…':''}</p>}
  <ul className="delivery-list">{items.map(i=><li key={i.n} className={'delivery-item '+i.status}>
   <div><b>{i.name}</b>
    {i.status==='bezig'&&<small>We lezen de foto…</small>}
    {i.status==='bekend'&&<small>Staat al in de kassa{i.priceCents?` · ${euro(i.priceCents)}`:''}</small>}
    {i.status==='nieuw'&&<small>Nieuw in de kassa · {i.priceCents?euro(i.priceCents):''}{i.proposal?` (inkoop ${euro(i.proposal.unitCostCents)} bij ${i.proposal.supplier} + ${i.proposal.marginPct}% marge + btw)`:''}. Nakijken bij Gerechten &amp; prijzen → Nieuw via zelfkassa.</small>}
    {i.status==='prijs'&&<small>Geen inkoopprijs op een factuur gevonden. Vul de verkoopprijs in, dan staat het meteen in de kassa.</small>}
    {i.status==='fout'&&<small>{i.error}</small>}
    {i.status==='prijs'&&<div className="delivery-price"><input className="kiosk-input" inputMode="decimal" placeholder="€ 0,00" aria-label={`Verkoopprijs voor ${i.name}`} value={i.price||''} onChange={e=>set(i.n,{price:e.target.value})}/>
     <button type="button" className="kiosk-btn" disabled={i.saving} onClick={()=>void addByHand(i)}>{i.saving?'Bezig…':'Toevoegen'}</button></div>}
    {i.status==='prijs'&&i.error&&<small className="delivery-error" role="alert">{i.error}</small>}
   </div>
   <span className="delivery-badge" aria-hidden="true">{i.status==='bezig'?'…':i.status==='bekend'?'✓':i.status==='nieuw'?'＋':i.status==='prijs'?'€':'!'}</span>
  </li>)}</ul>
 </section>;
}
type TakenOrder={id:number;number:string;reference:string;created:string;totalCents:number;lines:{name:string;quantity:number;totalCents:number}[]};
function FromShop({who}:{who:string}){
 const [products,setProducts]=useState<ShopProduct[]|null>(null),[taken,setTaken]=useState<TakenOrder[]>([]),[cart,setCart]=useState<Record<string,number>>({}),[taker,setTaker]=useState<keyof typeof INTERNAL_TAKERS>('keuken');
 // Zelf ingevulde prijs per stuk (tekst, in euro's) als de inkoopprijs onbekend is (besluit eigenaar 6 november 2026).
 const [manual,setManual]=useState<Record<string,string>>({});
 // Etiketprijzen per product: per stuk het bedrag van het etiket (centen), uit een foto of zelf ingetypt.
 const [labels,setLabels]=useState<Record<string,number[]>>({}),[labelText,setLabelText]=useState<Record<string,string>>({}),[reading,setReading]=useState(false);
 const addLabel=(id:string,c:number)=>{setRequestId(crypto.randomUUID());setLabels(l=>({...l,[id]:[...(l[id]||[]),c]}))};
 const dropLabel=(id:string,i:number)=>{setRequestId(crypto.randomUUID());setLabels(l=>{const left=(l[id]||[]).filter((_,k)=>k!==i);const next={...l};if(left.length)next[id]=left;else delete next[id];return next})};
 // Etiketten achter elkaar in de eigen camera (wens eigenaar 11 november 2026, zoals bij de zelfkassa): elke foto wordt gelezen terwijl
 // de volgende gemaakt wordt, één voor één op volgorde (zodat een net aangemaakt product niet twee keer wordt opgehaald).
 const [cam,setCam]=useState(false),[shots,setShots]=useState(0),[pending,setPending]=useState(0),[last,setLast]=useState(''),queue=useRef<Promise<void>>(Promise.resolve());
 const shot=(file:Blob)=>{setShots(n=>n+1);setPending(n=>n+1);queue.current=queue.current.then(()=>photo(file)).then(t=>setLast(t)).finally(()=>setPending(n=>n-1))};
 const openCam=()=>{setShots(0);setLast('');setCam(true)};
 async function photo(file:Blob):Promise<string>{setReading(true);setError('');setMsg('');
  try{const [image,barcode]=await Promise.all([shrinkPhoto(file),barcodeIn(file)]);if(!image)throw Error('Deze foto kunnen we niet gebruiken. Probeer het opnieuw.');
   const r=await fetch('/api/werkplek/etiket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(barcode?{image,barcode}:{image})});const d=await r.json().catch(()=>({}));
   if(!r.ok)throw Error(d.error||'Het etiket kon niet worden gelezen. Typ het bedrag zelf in.');
   // Nieuw via het etiket (wens eigenaar 9 november 2026): de backoffice heeft het net aangemaakt; lijst opnieuw ophalen.
   let list=products||[];if(!list.some(x=>x.id===d.productId)){const f=await fetch('/api/orders?onderling=1',{cache:'no-store'}).then(x=>x.json()).catch(()=>null);if(Array.isArray(f?.products)){list=f.products;setProducts(f.products)}}
   const p=list.find(x=>x.id===d.productId);if(!p)throw Error('Dit product staat niet in de lijst. Typ het bedrag zelf in.');
   if(!p.label){add(p.id,1);setMsg(`1× ${p.name} toegevoegd.`);return `✓ 1× ${p.name}.`}
   addLabel(p.id,d.totalCents);const text=`${d.created?'Nieuw in de productlijst: ':''}${p.name}: etiket ${euro(d.totalCents)}${d.weightGrams&&d.unitPriceCents?` (${(d.weightGrams/1000).toFixed(3).replace('.',',')} kg × ${euro(d.unitPriceCents)}/kg)`:''} toegevoegd. ${INTERNAL_TAKERS[taker]} betaalt ${euro(labelUnit(p,d.totalCents))}.${d.checked?'':' Kijk even of het bedrag klopt.'}`;setMsg(text);return `✓ ${p.name} ${euro(d.totalCents)}.`}
  catch(e){const t=e instanceof Error?e.message:'Het etiket kon niet worden gelezen.';setError(t);return `Niet gelezen: ${t}`}finally{setReading(false)}}
 const [search,setSearch]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[msg,setMsg]=useState(''),[requestId,setRequestId]=useState('');
 const load=useCallback(async()=>{const r=await fetch('/api/orders?onderling=1',{cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok){setError(d.error||'De winkel kon niet worden geladen.');return}setProducts(d.products);setTaken(d.today);setError('')},[]);
 useEffect(()=>{void load();setRequestId(crypto.randomUUID())},[load]);
 const add=(id:string,n:number)=>{setRequestId(crypto.randomUUID());setCart(c=>{const q=Math.max(0,Math.min(99,(c[id]||0)+n));const next={...c};if(q)next[id]=q;else delete next[id];return next})};
 const list=(products||[]).filter(p=>(!search.trim()||(p.name+' '+(p.owner||'')).toLowerCase().includes(search.trim().toLowerCase())));
 const chosen=(products||[]).filter(p=>cart[p.id]),unit=(p:ShopProduct)=>p.priceCents??cents(manual[p.id]||''),noPrice=chosen.filter(p=>unit(p)===null);
 const pieces=(products||[]).flatMap(p=>(labels[p.id]||[]).map((c,i)=>({p,c,i})));
 const total=chosen.reduce((n,p)=>n+(unit(p)??0)*cart[p.id],0)+pieces.reduce((n,x)=>n+labelUnit(x.p,x.c),0);
 async function save(){if(!who.trim()){setError('Vul bovenaan in wie het uit de winkel haalt.');return}setBusy(true);setError('');setMsg('');
  try{const r=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId,mode:'onderling',reference:'',taker,by:who.trim(),lines:[...chosen.map(p=>({productId:p.id,version:p.version,quantity:cart[p.id],...(p.priceCents===null?{priceCents:unit(p)}:{}),selections:{},note:''})),...pieces.map(x=>({productId:x.p.id,version:x.p.version,quantity:1,priceCents:x.c,selections:{},note:''}))]})});
   const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Vastleggen lukte niet.');
   const owners=[...new Set([...chosen,...pieces.map(x=>x.p)].map(p=>p.owner||'de coöperatie'))];setCart({});setManual({});setLabels({});setRequestId(crypto.randomUUID());await load();
   setMsg(`Vastgelegd als ${d.number}: ${euro(d.totalCents)} inkoopprijs. Komt bij ${owners.join(', ')} op het tegoed in de weekafsluiting. 🧺`)}
  catch(e){setError(e instanceof Error?e.message:'Vastleggen lukte niet.')}finally{setBusy(false)}}
 if(!products)return <section className="kiosk-stock">{error?<p className="kiosk-error">{error}</p>:<p className="kiosk-sub">Even laden…</p>}</section>;
 let lastOwner:string|null|undefined;
 return <section className="kiosk-stock" aria-label="Uit de winkel halen">
  <div className="kiosk-stock-head"><label className="kiosk-tone"><span>Voor</span><select className="kiosk-input" value={taker} onChange={e=>setTaker(e.target.value as keyof typeof INTERNAL_TAKERS)}>{Object.entries(INTERNAL_TAKERS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
   <input className="kiosk-input" type="search" placeholder="Zoek product of lid" value={search} onChange={e=>setSearch(e.target.value)} aria-label="Zoeken"/>
   <button type="button" className={"kiosk-btn soft shop-photo"+(reading?" busy":"")} onClick={openCam}>{pending?`Etiket lezen… (${pending})`:"📷 Etiketten"}</button></div>
  {cam&&<LabelCamera count={shots} onShot={shot} onClose={()=>setCam(false)}
   status={!shots?'Richt op het etiket of de streepjescode en tik op Foto maken.':`${last?last+' ':''}${shots} ${shots===1?'foto':"foto's"}${pending?` · ${pending} bezig`:''}. Volgend etiket, of tik op Klaar.`}/>}
  {msg&&<p className="kiosk-team-msg" role="status">{msg}</p>}{error&&<p className="kiosk-error" role="alert">{error}</p>}
  <div className="shop-take">
   <ul className="kiosk-team-list shop-list">{list.flatMap(p=>{const head=p.owner!==lastOwner;lastOwner=p.owner;return [...(head?[<li key={'h-'+(p.owner||'')} className="shop-owner">{p.owner?'🌱 Van '+p.owner:'Coöperatie (geen eigenaar)'}</li>]:[]),<li key={p.id} className={cart[p.id]?'picked':''}>
    <div><b>{p.name}</b><span>{p.label?<>prijs van het etiket{p.labelBp?<> min {(p.labelBp/100).toLocaleString('nl-NL')}% (coöperatiedeel en winkelpot)</>:null}</>:p.priceCents===null?'inkoopprijs onbekend: vul zelf een prijs in':<>inkoop {euro(p.priceCents)} <s>{euro(p.shopCents)}</s></>}</span></div>
    {p.label?<span className="kiosk-actions shop-label"><input className="kiosk-input" inputMode="decimal" placeholder="etiket €" aria-label={'Etiketbedrag '+p.name} value={labelText[p.id]||''} onChange={e=>setLabelText(t=>({...t,[p.id]:e.target.value}))} style={{width:96}}/>
     <button type="button" className="kiosk-btn soft" disabled={cents(labelText[p.id]||'')===null} onClick={()=>{const c=cents(labelText[p.id]||'');if(c){addLabel(p.id,c);setLabelText(t=>({...t,[p.id]:''}))}}} aria-label={'Etiket toevoegen '+p.name}>+</button></span>:
    <span className="kiosk-actions">{cart[p.id]?<><button type="button" className="kiosk-btn soft" onClick={()=>add(p.id,-1)} aria-label={'Eén minder '+p.name}>−</button><b className="kiosk-qty">{cart[p.id]}</b></>:null}<button type="button" className="kiosk-btn soft" onClick={()=>add(p.id,1)} aria-label={'Eén '+p.name}>+</button></span>}
   </li>]})}{!list.length&&<li><span className="kiosk-sub">Geen producten gevonden.</span></li>}</ul>
   <aside className="shop-cart"><h2>Mee naar de {INTERNAL_TAKERS[taker].toLowerCase()}</h2>
    {chosen.length?<ul>{chosen.map(p=><li key={p.id}><span>{cart[p.id]}× {p.name}</span><small>{p.owner||'coöperatie'}</small><b>{unit(p)===null?'–':euro((unit(p) as number)*cart[p.id])}</b>{p.priceCents===null&&<label className="shop-manual"><span>Prijs per stuk (€, incl. btw)</span><input className="kiosk-input" inputMode="decimal" placeholder="0,00" value={manual[p.id]||''} onChange={e=>{setRequestId(crypto.randomUUID());setManual(m=>({...m,[p.id]:e.target.value}))}} aria-label={'Prijs per stuk '+p.name}/></label>}</li>)}</ul>:pieces.length?null:<p className="kiosk-sub">Tik op + bij wat je meeneemt, of maak een foto van het etiket.</p>}
    {pieces.length>0&&<ul>{pieces.map(x=><li key={x.p.id+'-'+x.i}><span>{x.p.name} · etiket {euro(x.c)}</span><small>{x.p.owner||'coöperatie'}</small><b>{euro(labelUnit(x.p,x.c))}</b><button type="button" className="kiosk-btn soft" onClick={()=>dropLabel(x.p.id,x.i)} aria-label={'Weghalen: '+x.p.name}>×</button></li>)}</ul>}
    <p className="shop-total">Totaal inkoopprijs <b>{euro(total)}</b></p>
    <p className="kiosk-sub">De keuken betaalt de inkoopprijs. Van een lid: wat het lid normaal krijgt (winkelprijs min het coöperatiedeel); dat gaat in de weekafsluiting helemaal naar het lid. Van de coöperatie: de laatste factuurprijs; is die onbekend, vul dan zelf een prijs in. Het gaat van de winkelvoorraad af.</p>
    <button type="button" className="kiosk-btn big" disabled={busy||(!chosen.length&&!pieces.length)||noPrice.length>0} onClick={save}>{busy?'Even…':'Vastleggen'}</button></aside>
  </div>
  {taken.length>0&&<div className="shop-today"><h2>Vandaag al gehaald</h2><ul className="kiosk-team-list">{taken.map(o=><li key={o.id}><div><b>{o.reference}</b><span>{o.number} · {new Date(o.created).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Amsterdam'})} · {o.lines.map(l=>l.quantity+'× '+l.name).join(', ')}</span></div><b>{euro(o.totalCents)}</b></li>)}</ul></div>}
 </section>;
}

function Deviations(){
 const [rows,setRows]=useState<DeviationRow[]|null>(null),[days,setDays]=useState(30),[onlyLarge,setOnlyLarge]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let alive=true;setRows(null);fetch('/api/operations?afwijkingen=1&dagen='+days,{cache:'no-store'}).then(async r=>{const d=await r.json().catch(()=>({}));if(!alive)return;if(!r.ok){setError(d.error||'Laden lukte niet.');return}setRows(d.rows);setError('')}).catch(()=>alive&&setError('Laden lukte niet.'));return()=>{alive=false}},[days]);
 const shown=(rows||[]).filter(r=>!onlyLarge||r.large);
 return <section className="kiosk-stock" aria-label="Afwijkingen">
  <div className="kiosk-stock-head"><label className="kiosk-tone"><span>Periode</span><select className="kiosk-input" value={days} onChange={e=>setDays(Number(e.target.value))}><option value={7}>Laatste week</option><option value={30}>Laatste 30 dagen</option><option value={90}>Laatste 3 maanden</option></select></label>
   <label className="kiosk-check"><input type="checkbox" checked={onlyLarge} onChange={e=>setOnlyLarge(e.target.checked)}/> Alleen grote afwijkingen</label></div>
  {error&&<p className="kiosk-error" role="alert">{error}</p>}
  {!rows&&!error&&<p className="kiosk-sub">Even laden…</p>}
  {rows&&!shown.length&&<p className="kiosk-sub">Geen afwijkingen in deze periode. Alles klopte met de kassa. 👌</p>}
  {shown.length>0&&<div className="dev-wrap" data-no-swipe><table className="dev-table"><thead><tr><th>Datum</th><th>Product</th><th>Was</th><th>Geteld</th><th>Verschil</th><th>Verkocht via kassa en website sinds vorige telling</th><th>Reden</th><th>Door</th></tr></thead>
   <tbody>{shown.map((r,k)=><tr key={k} className={r.large?'large':''}><td>{nice(r.date)}</td><td><b>{r.name}</b></td><td>{amount(r.oldStock)}</td><td>{amount(r.quantity)}</td>
    <td className={r.diff<0?'minus':'plus'}>{r.diff>0?'+':''}{amount(r.diff)} {r.unit}{r.large&&<span className="dev-flag" title="Groot verschil">⚠️</span>}</td>
    <td>{amount(r.soldSince)}{r.sinceDate?<small> sinds {nice(r.sinceDate)}</small>:<small> (eerste telling)</small>}</td><td>{r.reasonText||<em>geen reden</em>}{r.note&&<small>„{r.note}”</small>}</td><td>{r.by}</td></tr>)}</tbody></table></div>}
  <p className="kiosk-sub">⚠️ = groot verschil: minstens 2 en meer dan een vijfde van wat er lag of verkocht is. Alle tellingen staan ook bij Inkoop & voorraad.</p>
 </section>;
}

// Magazijn (wens eigenaar 8 november 2026). Dezelfde voorraadlijst als Inkoop & voorraad, alleen de regels met soort „magazijn”.
// Melden: „Bijna op” of „Op” (bij Op gaat de voorraad naar 0). Tellen in de weekcontrole kan hier ook; een verschil hoeft
// geen reden, want deze spullen raken gewoon op door gebruik. Nieuwe magazijnartikelen zet de beheerder bij Inkoop & voorraad.
type WarehouseItem={id:string;name:string;unit:'kg'|'l'|'st';stock:number;known:boolean;countedAt:string;min:number};
const STATUS_ICON={op:'🔴','bijna-op':'🟠',besteld:'🚚'} as const;
function Warehouse({who}:{who:string}){
 const [items,setItems]=useState<WarehouseItem[]|null>(null),[requests,setRequests]=useState<OpenRequest[]>([]),[version,setVersion]=useState(0),[today,setToday]=useState('');
 const [counts,setCounts]=useState<Record<string,string>>({}),[search,setSearch]=useState(''),[busy,setBusy]=useState(''),[error,setError]=useState(''),[msg,setMsg]=useState('');
 const load=useCallback(async()=>{const r=await fetch('/api/operations?magazijn=1',{cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok){setError(d.error||'Het magazijn kon niet worden geladen.');return}
  setItems((d.items as WarehouseItem[]).slice().sort((a,b)=>a.name.localeCompare(b.name,'nl')));setRequests(d.requests);setVersion(d.version);setToday(d.today);setError('')},[]);
 useEffect(()=>{void load()},[load]);
 const open=useMemo(()=>new Map(requests.map(r=>[r.ingredientId,r])),[requests]);
 const shown=(items||[]).filter(i=>!search.trim()||i.name.toLowerCase().includes(search.trim().toLowerCase()));
 const filled=(items||[]).flatMap(i=>{const n=counts[i.id]?num(counts[i.id]):null;return n===null?[]:[{i,n}]});
 const bad=(items||[]).filter(i=>counts[i.id]?.trim()&&num(counts[i.id])===null);
 async function post(body:object,key:string){
  if(!who.trim()){setError('Vul bovenaan in wie je bent.');return false}
  setBusy(key);setError('');setMsg('');
  try{const r=await fetch('/api/operations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),version,by:who.trim(),...body})});
   const d=await r.json().catch(()=>({}));if(!r.ok){if(r.status===409)await load();throw Error(r.status===409?'Er is net iets anders opgeslagen. De lijst is ververst: probeer het nog een keer.':d.error||'Opslaan lukte niet.')}
   await load();return true}
  catch(e){setError(e instanceof Error?e.message:'Opslaan lukte niet.');return false}finally{setBusy('')}}
 async function report(i:WarehouseItem,status:'bijna-op'|'op'){
  if(await post({action:'magazijn-melding',from:'werkplek',ingredientId:i.id,status},i.id+status))
   setMsg(`${i.name}: ${REQUEST_STATUS[status].toLowerCase()} gemeld. Rianne ziet het bij de bestellijst. Dank je, ${who.trim().split(' ')[0]}! 🧻`)}
 async function saveCounts(){
  if(await post({action:'werkplek-telling',counts:filled.map(f=>({ingredientId:f.i.id,quantity:f.n}))},'tellen')){
   setCounts({});setMsg(`Telling opgeslagen: ${filled.length} ${filled.length===1?'regel':'regels'}. Dank je, ${who.trim().split(' ')[0]}! 🌱`)}}
 if(!items)return <section className="kiosk-stock">{error?<p className="kiosk-error">{error}</p>:<p className="kiosk-sub">Even laden…</p>}</section>;
 return <section className="kiosk-stock" aria-label="Magazijn">
  {requests.length>0&&<div className="ware-open"><h2>Al gemeld</h2><ul>{requests.map(r=><li key={r.ingredientId} className={'ware-'+r.status}>
   <span>{STATUS_ICON[r.status]} <b>{r.name}</b></span><small>{r.status==='besteld'?`besteld${r.orderedBy?' door '+r.orderedBy:''} ${nice(r.orderedDate)}`:`${REQUEST_STATUS[r.reportedStatus].toLowerCase()} · ${r.reportedBy} · ${nice(r.reportedDate)}`}</small></li>)}</ul></div>}
  <div className="kiosk-stock-head"><input className="kiosk-input" type="search" placeholder="Zoek, bijvoorbeeld toiletpapier" value={search} onChange={e=>setSearch(e.target.value)} aria-label="Zoeken"/></div>
  {msg&&<p className="kiosk-team-msg" role="status">{msg}</p>}{error&&<p className="kiosk-error" role="alert">{error}</p>}
  {!items.length&&<p className="kiosk-sub">Er staan nog geen magazijnartikelen in de voorraad. De beheerder zet ze bij Inkoop &amp; voorraad → Ingrediënten op soort „Magazijn”.</p>}
  <div className="count-table ware-table" role="table" aria-label="Magazijnvoorraad">
   {items.length>0&&<div className="count-row ware-row count-headrow" role="row"><span role="columnheader">Artikel</span><span role="columnheader">Voorraad</span><span role="columnheader">Geteld (weekcontrole)</span><span role="columnheader">Melden aan Rianne</span></div>}
   {shown.map(i=>{const r=open.get(i.id);
    return <div key={i.id} className={'count-row ware-row'+(r?' ware-'+r.status:'')} role="row">
     <span role="cell"><b>{i.name}</b><small>{UNIT[i.unit]}{i.countedAt===today?' · vandaag geteld ✓':i.countedAt?' · geteld '+nice(i.countedAt):''}</small></span>
     <span role="cell" className="count-old">{i.known?<>{amount(i.stock)} <small>{UNIT[i.unit]}</small></>:<small>nog niet geteld</small>}</span>
     <span role="cell" className="count-new"><input className="kiosk-input" inputMode="decimal" aria-label={'Geteld '+i.name} placeholder={i.known?amount(i.stock):'0'} value={counts[i.id]||''} onChange={e=>setCounts(c=>({...c,[i.id]:e.target.value}))}/></span>
     <span role="cell" className="ware-actions">{r&&<small className="ware-status">{STATUS_ICON[r.status]} {r.status==='besteld'?'besteld':REQUEST_STATUS[r.reportedStatus].toLowerCase()+' gemeld'}</small>}
      <button type="button" className="kiosk-btn soft" disabled={!!busy||r?.reportedStatus==='bijna-op'||r?.reportedStatus==='op'} onClick={()=>report(i,'bijna-op')} aria-label={i.name+' bijna op'}>Bijna op</button>
      <button type="button" className="kiosk-btn soft ware-empty" disabled={!!busy||r?.reportedStatus==='op'} onClick={()=>report(i,'op')} aria-label={i.name+' op'}>Op</button></span>
    </div>})}
  </div>
  {items.length>0&&<div className="count-save"><span className="kiosk-sub">{filled.length?`${filled.length} ${filled.length===1?'regel':'regels'} geteld.`:'Weekcontrole: typ wat er ligt en sla op.'}{bad.length?` Controleer: ${bad.map(i=>i.name).join(', ')} (alleen cijfers).`:''}</span>
   <button type="button" className="kiosk-btn" disabled={!!busy||!filled.length||bad.length>0} onClick={saveCounts}>{busy==='tellen'?'Even…':'Telling opslaan'}</button></div>}
  <p className="kiosk-sub">Gasten zien het magazijn nooit: deze spullen zijn geen product. Komt er weer voorraad bij (levering of een hogere telling), dan verdwijnt de melding vanzelf.</p>
 </section>;
}

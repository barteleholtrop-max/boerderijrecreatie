'use client';
// Werkplekscherm voor een tablet bij de kok, de barista of de winkel (wens eigenaar 3 november 2026):
// eigen webadres (/werkplek/kok, /werkplek/barista, /werkplek/winkel), volledig scherm, vriendelijk, een geluidje bij een
// nieuwe bestelling en "snelle voorraad": iets is op (taart!) of er wordt weer bijgezet.
import {StationOpenToggle} from '../station-open-toggle';
import {use,useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {KioskNav} from '../nav';
import {lineTotals} from '@/lib/kiosk-totals';
import type {SaleLine} from '@/lib/orders';
import type {WorkState} from '@/lib/work-status';
import {STATIONS,isStation,cheer,greeting,emptyText,waiting,doneText,type Station} from '@/lib/kiosk-core';
import {loadOps,stockState,setCount,saveSettings,lowAt,type OpsInfo,type StockFields} from '../../producten/voorraad';
import {library,quickGroup,type Group} from '@/lib/option-groups';
import {allergenNames} from '@/lib/sheet-core';
import {SOUNDS,DEFAULT_SOUND,savedSound,saveSound,play,isSound,type SoundId} from '@/lib/kiosk-sounds';
// bill: gezamenlijke rekening (wens eigenaar 5 november 2026): naam, wie bestelde en hoe vol de rekening is.
type Bill={name:string;holder:string;orderedBy:string;spentCents:number;limitCents:number;percent:number;near:boolean;full:boolean};
type WorkOrder={id:number;number:string;reference:string;mode:string;created:string;lines:SaleLine[];status:WorkState;version:number;updated:string;test:boolean;bill?:Bill};
const euro=(c:number)=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(c/100);
function BillBar({b}:{b:Bill}){return <div className={'kiosk-bill'+(b.full?' full':b.near?' near':'')}><p>🧾 Op rekening: <b>{b.name}</b>{b.orderedBy&&<> · besteld door {b.orderedBy}</>}</p><div className="kiosk-bill-bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={b.percent} aria-label={'Rekening '+b.name}><span style={{width:b.percent+'%'}}/></div><small>{euro(b.spentCents)} van {euro(b.limitCents)}{b.full?' · vol':b.near?' · bijna vol':''}</small></div>}
type Product={id:string;version:number;draft?:{name?:string;optionGroups?:Group[]};published:(StockFields&{name:string;station?:string;optionGroups?:Group[]})|null};

// Geluid bij een nieuwe bestelling: per werkplek zelf te kiezen (lib/kiosk-sounds.ts).

export default function Werkplek({params}:{params:Promise<{station:string}>}){
 const {station:raw}=use(params);
 if(!isStation(raw))return <div className="kiosk-page"><h1>Deze werkplek bestaat niet.</h1><p><Link href="/werkplek/kok">Kok</Link> · <Link href="/werkplek/barista">Barista</Link> · <Link href="/werkplek/winkel">Winkel</Link></p></div>;
 return <Screen station={raw}/>;
}

function Screen({station}:{station:Station}){
 const info=STATIONS[station];
 const [orders,setOrders]=useState<WorkOrder[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState<number|null>(null),[now,setNow]=useState<number|null>(null),[sound,setSound]=useState(true),[stockOpen,setStockOpen]=useState(false),[tone,setTone]=useState<SoundId>(DEFAULT_SOUND[station]),[newOpen,setNewOpen]=useState(false),[stockTick,setStockTick]=useState(0);
 const seen=useRef<Set<number>|null>(null),warned=useRef<Set<string>|null>(null);
 const lastList=useRef('');
 const [notice,setNotice]=useState<string[]>([]);
 const load=useCallback(async()=>{try{const r=await fetch('/api/workplaces?station='+station,{cache:'no-store'});if(!r.ok)throw Error();const list=await r.json() as WorkOrder[];
  const fresh=list.filter(o=>o.status==='nieuw').map(o=>o.id);
  if(seen.current&&fresh.some(id=>!seen.current!.has(id))&&sound)play(tone);
  seen.current=new Set(fresh);
  // Melding als een rekening bijna vol (80%) of vol raakt: een medewerker kan de rekeninghouder erop wijzen.
  const bills=new Map(list.filter(o=>o.bill&&(o.bill.near||o.bill.full)).map(o=>[o.bill!.name,o.bill!]));
  const keys=[...bills.values()].map(b=>b.name+(b.full?':vol':':bijna'));
  if(warned.current&&keys.some(k=>!warned.current!.has(k))&&sound)play(tone);
  warned.current=new Set(keys);{const next=[...bills.values()].map(b=>`Rekening ${b.name} (${b.holder}) staat op ${b.percent}%: ${euro(b.spentCents)} van ${euro(b.limitCents)}.${b.full?' De rekening is vol.':''}`);setNotice(n=>n.join('\n')===next.join('\n')?n:next)}
  // Alleen opnieuw tekenen als er iets veranderd is (melding eigenaar 15 november 2026: flitsen op een trage tablet).
  const key=JSON.stringify(list);if(key!==lastList.current){lastList.current=key;setOrders(list)}setError('')}catch{setError('Even geen verbinding. We proberen het zo opnieuw.')}},[station,sound,tone]);
 // Snelheid (4 november 2026): niet verversen als het scherm verborgen is (ander tabblad, scherm uit); bij terugkomst meteen.
 useEffect(()=>{void load();const t=setInterval(()=>{if(!document.hidden)void load()},5000);const back=()=>{if(!document.hidden)void load()};document.addEventListener('visibilitychange',back);return()=>{clearInterval(t);document.removeEventListener('visibilitychange',back)}},[load]);
 useEffect(()=>{setTone(savedSound(station))},[station]);
 // Tijd alleen in de browser (anders verschilt de eerste weergave van de server).
 useEffect(()=>{setNow(Date.now());const t=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(t)},[]);
 async function move(o:WorkOrder,to:WorkState){setBusy(o.id);try{const r=await fetch('/api/workplaces',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderId:o.id,station,status:to,version:o.version})});const d=await r.json();if(!r.ok)throw Error(d.error);await load()}catch(e){setError((e as Error).message||'Dat lukte niet. Probeer het nog eens.')}finally{setBusy(null)}}
 const open=orders.filter(o=>o.status!=='gereed'),done=orders.filter(o=>o.status==='gereed');
 if(now===null)return <div className={'kiosk-page station-'+station}><p className="kiosk-sub">Even laden…</p></div>;
 const date=new Date(now);
 return <div className={'kiosk-page station-'+station} data-bb-view={'werkplek-'+station}>
  <KioskNav current={station}/>
  <header className="kiosk-head">
   <div><p className="kiosk-hello">{greeting(date)}, {info.name.toLowerCase()}! {info.icon}</p><h1>{cheer(station,date)}</h1><p className="kiosk-sub">{open.length?`${open.length} ${open.length===1?'bestelling':'bestellingen'} voor je klaar om te maken.`:emptyText(station,date)} {doneText(done.length,station)}</p></div>
   <div className="kiosk-tools"><span className="kiosk-clock">{date.toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Amsterdam'})}</span>
    <StationOpenToggle station={station}/>
    <button className="kiosk-btn soft" onClick={()=>setSound(!sound)} aria-pressed={sound}>{sound?'🔔 Geluid aan':'🔕 Geluid uit'}</button>
    {sound&&<label className="kiosk-tone"><span>Geluid</span><select className="kiosk-input" value={tone} onChange={e=>{if(!isSound(e.target.value))return;setTone(e.target.value);saveSound(station,e.target.value);play(e.target.value)}}>{(Object.keys(SOUNDS) as SoundId[]).map(id=><option key={id} value={id}>{SOUNDS[id].name}</option>)}</select></label>}
    {station==='barista'&&<Link className="kiosk-btn soft" href="/werkplek/team">🙋 Wie is er vandaag?</Link>}
    <button className="kiosk-btn soft" onClick={()=>setStockOpen(!stockOpen)} aria-expanded={stockOpen}>📦 Snelle voorraad</button>
    {station!=='winkel'&&<button className="kiosk-btn soft" onClick={()=>setNewOpen(!newOpen)} aria-expanded={newOpen}>➕ Nieuw product</button>}</div>
  </header>
  {error&&<p className="kiosk-error" role="status">{error}</p>}
  {/* Personeelsplanning: aanmelden staat sinds 5 november 2026 op een eigen werkplekscherm (/werkplek/team), naast de kassa. */}
  <StockWatch station={station} tick={stockTick}/>
  {newOpen&&<NewProduct station={station} close={()=>setNewOpen(false)} done={()=>setStockTick(t=>t+1)}/>}
  {stockOpen&&<QuickStock station={station} changed={()=>setStockTick(t=>t+1)}/>}
  {station==='winkel'&&<CashWaiting/>}
  {notice.length>0&&<div className="kiosk-bill-notice" role="status">{notice.map(n=><p key={n}>⚠️ {n} Laat het de rekeninghouder weten.</p>)}</div>}
  {/* Totalen (wens eigenaar 5 november 2026): alles wat nog gemaakt moet worden, opgeteld per gerecht met dezelfde keuzes. */}
  {open.length>1&&(()=>{const t=lineTotals(open);return t.length?<section className="kiosk-totals" aria-label="Samen te maken"><h2>Samen te maken</h2><ul>{t.map(x=><li key={x.name+x.choices.join('|')}><b>{x.quantity}×</b><span>{x.name}{x.choices.length>0&&<small>{x.choices.join(', ')}</small>}</span>{x.orders>1&&<em>{x.orders} bonnen</em>}</li>)}</ul></section>:null})()}
  <section className="kiosk-board">
   {open.length===0?<div className="kiosk-empty"><span>{info.icon}</span><p>{emptyText(station,date)}</p></div>:open.map(o=>{const w=waiting(o.created,now);return <article key={o.id} className={'kiosk-ticket '+o.status+' wait-'+w.level}>
    <div className="kiosk-ticket-head"><div><b>{o.reference}</b><small>{o.number}{o.test?' · proef':''}</small></div><span className="kiosk-wait">{w.text}</span></div>
    <p className="kiosk-route">{o.mode==='yte'?'🍽️ Ite by Boer Bart · de bediening serveert uit':o.mode==='winkel'?'🧺 Winkel · afhalen':'🙋 Dagrestaurant · afhalen'}</p>
    {o.bill&&<BillBar b={o.bill}/>}
    <ul>{o.lines.map((l,i)=><li key={i}><span className="kiosk-qty">{l.quantity}×</span><div><b>{l.name}</b>{l.choices.map((c,j)=><small key={j}>{c}</small>)}{l.note&&<em>„{l.note}”</em>}</div></li>)}</ul>
    {o.status==='nieuw'?<button className="kiosk-btn" disabled={busy!==null} onClick={()=>move(o,'behandeling')}>{busy===o.id?'Even…':'Ik pak hem op 👩‍🍳'}</button>
     :<button className="kiosk-btn done" disabled={busy!==null} onClick={()=>move(o,'gereed')}>{busy===o.id?'Even…':'Klaar! ✨'}</button>}
   </article>})}
  </section>
  {done.length>0&&<details className="kiosk-done"><summary>Klaar in de laatste 24 uur ({done.length})</summary>{done.map(o=><div key={o.id} className="kiosk-done-row"><span><b>{o.reference}</b> · {o.lines.map(l=>l.quantity+'× '+l.name).join(', ')}</span><button className="kiosk-btn soft" disabled={busy!==null} onClick={()=>move(o,'behandeling')}>Foutje? Terugzetten</button></div>)}<p className="kiosk-sub">{info.handoff}</p></details>}
  <footer className="kiosk-foot">Dit scherm ververst vanzelf. Webadres: <b>{location.origin}/werkplek/{station}</b></footer>
 </div>;
}

/** Snelle voorraad: alleen de producten van deze werkplek. "Op" en "bijzetten" werken meteen voor kassa en website. */
function QuickStock({station,changed}:{station:Station;changed:()=>void}){
 const [products,setProducts]=useState<Product[]>([]),[ops,setOps]=useState<OpsInfo|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(''),[add,setAdd]=useState<Record<string,string>>({}),[query,setQuery]=useState('');
 const load=useCallback(async()=>{try{const [p,o]=await Promise.all([fetch('/api/products',{cache:'no-store'}).then(r=>r.json()),loadOps()]);setProducts((p as Product[]).filter(x=>x.published?.station===station));setOps(o?.ops??null)}catch{setMessage('Laden lukte niet.')}},[station]);
 useEffect(()=>{void load()},[load]);
 async function act(p:Product,work:()=>Promise<unknown>,done:string){setBusy(p.id);setMessage('');try{await work();setMessage(done);await load();changed()}catch(e){setMessage((e as Error).message)}finally{setBusy('')}}
 const list=products.filter(p=>p.published!.name.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>a.published!.name.localeCompare(b.published!.name,'nl'));
 return <section className="kiosk-stock" aria-label="Snelle voorraad">
  <div className="kiosk-stock-head"><h2>📦 Snelle voorraad</h2><input className="kiosk-input" placeholder="Zoek…" value={query} onChange={e=>setQuery(e.target.value)} aria-label="Zoek product"/></div>
  <p className="kiosk-sub">Is iets op? Tik op <b>Op</b>, dan kan niemand het meer bestellen. Weer gemaakt of aangevuld? Vul het aantal in en tik op <b>Bijzetten</b>.</p>
  {message&&<p className="kiosk-note" role="status">{message}</p>}
  <div className="kiosk-stock-list">{list.map(p=>{const pub=p.published!,s=stockState(ops,p.id,pub),off=pub.available===false||s.kind==='out';
   return <div key={p.id} className={'kiosk-stock-row'+(off?' off':'')}>
    <div><b>{pub.name}</b><small>{pub.available===false?'Staat uit':s.kind==='none'?'Onbeperkt':s.kind==='problem'?s.label:s.kind==='out'?'Op':`Nog ${s.label}`}</small></div>
    {off?<button className="kiosk-btn soft" disabled={!!busy} onClick={()=>act(p,()=>saveSettings(p.id,p.version,{available:true}),pub.name+' kan weer besteld worden.')}>Weer beschikbaar</button>
     :<button className="kiosk-btn warn" disabled={!!busy} onClick={()=>act(p,()=>s.kind==='ok'||s.kind==='low'?setCount(p.id,p.version,0):saveSettings(p.id,p.version,{available:false}),pub.name+' staat op „op”. Gasten zien het als uitverkocht.')}>Op</button>}
    <span className="kiosk-add"><input className="kiosk-input" inputMode="numeric" aria-label={'Aantal bijzetten voor '+pub.name} placeholder="aantal" value={add[p.id]||''} onChange={e=>setAdd({...add,[p.id]:e.target.value.replace(/\D/g,'').slice(0,4)})}/>
     <button className="kiosk-btn soft" disabled={!!busy||!add[p.id]} onClick={()=>{const n=Number(add[p.id]);const base=s.kind==='ok'||s.kind==='low'?Number(s.stock):0;
      void act(p,async()=>{const r=await setCount(p.id,p.version,base+n) as {version?:number};if(pub.available===false)await saveSettings(p.id,r.version??p.version+1,{available:true});setAdd({...add,[p.id]:''})},`${n} ${pub.name} bijgezet. Er ${base+n===1?'is':'zijn'} er nu ${base+n}.`)}}>Bijzetten</button></span>
   </div>})}{!list.length&&<p className="kiosk-sub">Geen producten voor deze werkplek.</p>}</div>
 </section>;
}

// Zelfservicekassa (besluit eigenaar 4 november 2026): een gast die contant wil betalen roept een medewerker. Hier zie je
// welke bestellingen op contant geld wachten; na „Contant ontvangen” is de bestelling betaald en gaat hij van de voorraad af.
function CashWaiting(){
 const [list,setList]=useState<{orderId:number;number:string;amountCents:number;lines:{name:string;quantity:number}[]}[]>([]),[busy,setBusy]=useState<number|null>(null),[msg,setMsg]=useState('');
 const last=useRef('');
 const load=useCallback(async()=>{try{const r=await fetch('/api/werkplek/contant',{cache:'no-store'});if(r.ok){const text=await r.text();if(text!==last.current){last.current=text;setList(JSON.parse(text))}}}catch{}},[]);
 useEffect(()=>{void load();const t=setInterval(()=>{if(!document.hidden)void load()},5000);return()=>clearInterval(t)},[load]);
 async function confirm(id:number){setBusy(id);setMsg('');try{const r=await fetch('/api/werkplek/contant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderId:id})});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Bevestigen lukte niet.');setMsg('Betaald! De gast ziet het op de zelfservicekassa.');await load()}catch(e){setMsg((e as Error).message)}finally{setBusy(null)}}
 if(!list.length&&!msg)return null;
 const euro=(c:number)=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(c/100);
 return <section className="kiosk-cash" aria-label="Wacht op contante betaling"><h2>💶 Wacht op contante betaling</h2>
  {msg&&<p className="kiosk-note" role="status">{msg}</p>}
  {list.map(o=><div key={o.orderId} className="kiosk-cash-row"><div><b>{o.number} · {euro(o.amountCents)}</b><small>{o.lines.map(l=>l.quantity+'× '+l.name).join(', ')}</small></div>
   <button className="kiosk-btn" disabled={busy!==null} onClick={()=>{if(window.confirm(`${euro(o.amountCents)} contant ontvangen voor ${o.number}?`))void confirm(o.orderId)}}>{busy===o.orderId?'Even…':'Contant ontvangen'}</button></div>)}
 </section>;
}


/**
 * Voorraad in beeld (wens eigenaar 5 november 2026): van elk getelde product van deze werkplek staat het aantal op het
 * scherm. Bij „bijna op” (standaard 10 of minder, per product in te stellen) licht het op; bij 0 staat er „Op”.
 * Ververst elke 30 seconden, en meteen na bijzetten of een nieuw product.
 */
function StockWatch({station,tick}:{station:Station;tick:number}){
 const [items,setItems]=useState<{id:string;name:string;stock:number;kind:'ok'|'low'|'out';at:number}[]>([]);
 const load=useCallback(async()=>{try{const [r,o]=await Promise.all([fetch('/api/products',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()),loadOps()]);const ops=o?.ops??null;if(!ops)return;
  setItems((r as Product[]).filter(p=>p.published?.station===station&&p.published.available!==false).flatMap(p=>{const s=stockState(ops,p.id,p.published!);
   return (s.kind==='ok'||s.kind==='low'||s.kind==='out')&&'stock' in s?[{id:p.id,name:p.published!.name,stock:Number(s.stock),kind:s.kind,at:lowAt(p.published!)}]:[]})
   .sort((a,b)=>(a.kind==='ok'?1:0)-(b.kind==='ok'?1:0)||a.stock-b.stock||a.name.localeCompare(b.name,'nl')))}catch{}},[station]);
 useEffect(()=>{void load();const t=setInterval(()=>{if(!document.hidden)void load()},30000);return()=>clearInterval(t)},[load,tick]);
 if(!items.length)return null;
 const low=items.filter(i=>i.kind!=='ok').length;
 return <section className="kiosk-watch" aria-label="Voorraad">
  <p className="kiosk-watch-head">📦 Voorraad{low?<b> · {low} {low===1?'product':'producten'} bijna op</b>:''}</p>
  <ul>{items.map(i=><li key={i.id} className={'kiosk-watch-item '+i.kind} title={i.kind==='low'?`Bijna op: ${i.at} of minder`:undefined}><span>{i.name}</span><b>{i.kind==='out'?'Op':i.stock}</b></li>)}</ul>
 </section>;
}

/**
 * Nieuw product vanaf de werkplek (wens eigenaar 5 november 2026: „zo makkelijk mogelijk, met een paar kleine vragen”;
 * besluit: meteen te bestellen). Naam, prijs, alcohol (btw 21% of 9%) en eventueel hoeveel er zijn.
 * Aanvulling (wens eigenaar 5 november 2026): „eigenlijk alles wat we ook vragen in de backoffice”, maar alles behalve
 * naam en prijs mag leeg: allergenen (met „ik weet het zeker” = gecontroleerd), een foto (met de vraag of we hem mogen
 * aanpassen voor een mooiere weergave), keuzes (bestaande keuzevraag uit een keuzelijst of een nieuwe) en daarna een
 * recept, nu of later. Het product komt gepubliceerd in Gerechten & prijzen, bij deze werkplek, met een notitie.
 */
function NewProduct({station,close,done}:{station:Station;close:()=>void;done:()=>void}){
 const [all,setAll]=useState<Product[]|null>(null),[name,setName]=useState(''),[price,setPrice]=useState(''),[alcohol,setAlcohol]=useState(false),[picked,setPicked]=useState<string[]>([]),[count,setCount_]=useState(''),[busy,setBusy]=useState(false),[msg,setMsg]=useState(''),[made,setMade]=useState<{text:string;id:string}|null>(null);
 const [hasAllergens,setHasAllergens]=useState<boolean|null>(null),[allergens,setAllergens]=useState<string[]>([]),[sure,setSure]=useState(false);
 const [photo,setPhoto]=useState<{url:string;name:string}|null>(null),[photoBusy,setPhotoBusy]=useState(false),[mayEdit,setMayEdit]=useState<boolean|null>(null);
 const [hasOptions,setHasOptions]=useState(false),[newGroups,setNewGroups]=useState<Group[]>([]),[gTitle,setGTitle]=useState(''),[gChoices,setGChoices]=useState(''),[gRequired,setGRequired]=useState(true);
 useEffect(()=>{fetch('/api/products',{cache:'no-store'}).then(r=>r.ok?r.json():[]).then(setAll).catch(()=>setAll([]))},[]);
 const groups=all?library(all.map(p=>({id:p.id,draft:p.draft??null,published:p.published}))):[];
 const chosen=[...picked.map(id=>groups.find(g=>g.group.id===id)?.group).filter((g):g is Group=>!!g),...newGroups];
 function reset(){setName('');setPrice('');setAlcohol(false);setPicked([]);setCount_('');setHasAllergens(null);setAllergens([]);setSure(false);setPhoto(null);setMayEdit(null);setHasOptions(false);setNewGroups([]);setGTitle('');setGChoices('');setGRequired(true)}
 async function upload(file:File){setMsg('');setPhotoBusy(true);
  try{const f=new FormData();f.append('file',file);f.append('name',(name.trim()||'Product')+' · werkplek '+station);f.append('source','Werkplek '+station);
   const r=await fetch('/api/media',{method:'POST',body:f});const d=await r.json().catch(()=>({})) as {error?:string;url?:string;name?:string};
   if(!r.ok||!d.url)throw Error(d.error||'De foto opslaan lukte niet. Probeer het opnieuw.');setPhoto({url:d.url,name:d.name||file.name});setMayEdit(null);
  }catch(err){setMsg((err as Error).message)}finally{setPhotoBusy(false)}}
 function addGroup(){const g=quickGroup(gTitle,gChoices,gRequired);if(!g){setMsg('Vul de vraag in en minstens twee keuzes, gescheiden door een komma.');return}setMsg('');setNewGroups([...newGroups,g]);setGTitle('');setGChoices('');setGRequired(true)}
 async function save(e:React.FormEvent){e.preventDefault();if(busy)return;setMsg('');
  const n=name.trim(),raw=price.trim().replace(',','.');
  if(!n){setMsg('Hoe heet het product?');return}
  if(!/^\d+(\.\d{1,2})?$/.test(raw)){setMsg('Vul een prijs in, bijvoorbeeld 4,50.');return}
  if(count.trim()&&!/^\d{1,4}$/.test(count.trim())){setMsg('Vul bij „hoeveel” een heel aantal in, of laat het leeg.');return}
  if(hasAllergens&&!allergens.length){setMsg('Kies welke allergenen erin zitten, of zet „Zitten er allergenen in?” op Weet ik niet.');return}
  if(photo&&mayEdit===null){setMsg('Mogen we de foto aanpassen voor een mooiere weergave? Kies Ja of Nee.');return}
  if(gTitle.trim()||gChoices.trim()){setMsg('Je bent een nieuwe keuzevraag aan het maken. Klik op „Keuzevraag toevoegen” of maak de velden leeg.');return}
  setBusy(true);
  try{
   const checked=hasAllergens===false?sure:hasAllergens===true?sure:false;
   const notes=[`Toegevoegd op de werkplek (${station}) op ${new Date().toLocaleDateString('nl-NL')}.`,
    hasAllergens===null?'Allergenen nog niet ingevuld.':checked?'Allergenen ingevuld en gecontroleerd op de werkplek.':'Allergenen ingevuld, nog controleren.',
    photo?(mayEdit?'Foto mag aangepast worden voor een mooiere weergave.':'Foto niet aanpassen.'):'Nog geen foto.',
    'Controleer nog de omschrijving.'];
   const product={name:n,department:'Restaurant',priceCents:Math.round(Number(raw)*100),vat:alcohol?'21':'9',station,available:true,photo:photo?.url||'',check:'',note:notes.join(' '),sourceId:'',
    allergens:hasAllergens?allergens:[],allergensChecked:hasAllergens===null?false:checked,orderOptions:'',optionGroups:hasOptions?chosen:[]};
   const r=await fetch('/api/products',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'create-publish',product})});
   const d=await r.json().catch(()=>({})) as {error?:string;id?:string};if(!r.ok||!d.id)throw Error(d.error||'Toevoegen lukte niet. Probeer het opnieuw.');
   if(count.trim())await setCount(d.id,1,Number(count.trim())).catch(()=>{throw Error(`${n} staat erin en kan besteld worden, maar het aantal vastleggen lukte niet. Zet het aantal via Snelle voorraad.`)});
   setMade({text:`${n} staat erin en kan meteen besteld worden${count.trim()?`, ${count.trim()} op voorraad`:''}.`,id:d.id});reset();done();
  }catch(err){setMsg((err as Error).message)}finally{setBusy(false)}}
 const yesNo=(value:boolean|null,set:(v:boolean)=>void,labels:[string,string]=['Nee','Ja'])=><div className="kiosk-choice">
  <button type="button" className={'kiosk-btn soft'+(value===false?' on':'')} aria-pressed={value===false} onClick={()=>set(false)}>{labels[0]}</button>
  <button type="button" className={'kiosk-btn soft'+(value===true?' on':'')} aria-pressed={value===true} onClick={()=>set(true)}>{labels[1]}</button></div>;
 return <section className="kiosk-new" aria-label="Nieuw product">
  <div className="kiosk-stock-head"><h2>➕ Nieuw product</h2><button type="button" className="kiosk-btn soft" onClick={close}>Sluiten</button></div>
  {made&&<div className="kiosk-note" role="status"><p>✅ {made.text}</p><p><a className="kiosk-btn soft" href={'/inkoop?product='+encodeURIComponent(made.id)}>📋 Recept toevoegen</a> <small>Mag ook later, bij Inkoop → Recepten.</small></p></div>}
  <form onSubmit={save} className="kiosk-new-form">
   <label>Hoe heet het?<input className="kiosk-input" value={name} onChange={e=>setName(e.target.value)} maxLength={180} placeholder={station==='barista'?'Bijvoorbeeld: Chai latte':'Bijvoorbeeld: Appeltaart'}/></label>
   <label>Wat kost het?<input className="kiosk-input" inputMode="decimal" value={price} onChange={e=>setPrice(e.target.value)} placeholder="4,50"/></label>
   <fieldset><legend>Zit er alcohol in?</legend>{yesNo(alcohol,setAlcohol)}</fieldset>

   <fieldset><legend>Zitten er allergenen in? <small>(mag later)</small></legend>
    <div className="kiosk-choice">
     <button type="button" className={'kiosk-btn soft'+(hasAllergens===false?' on':'')} aria-pressed={hasAllergens===false} onClick={()=>{setHasAllergens(false);setAllergens([])}}>Nee</button>
     <button type="button" className={'kiosk-btn soft'+(hasAllergens===true?' on':'')} aria-pressed={hasAllergens===true} onClick={()=>setHasAllergens(true)}>Ja</button>
     <button type="button" className={'kiosk-btn soft'+(hasAllergens===null?' on':'')} aria-pressed={hasAllergens===null} onClick={()=>{setHasAllergens(null);setAllergens([]);setSure(false)}}>Weet ik niet</button></div>
    {hasAllergens&&<div className="kiosk-choice kiosk-allergens">{allergenNames.map(a=>{const on=allergens.includes(a);return <button type="button" key={a} className={'kiosk-btn soft'+(on?' on':'')} aria-pressed={on} onClick={()=>setAllergens(on?allergens.filter(x=>x!==a):[...allergens,a])}>{a}</button>})}</div>}
    {hasAllergens!==null&&<label className="kiosk-check"><input type="checkbox" checked={sure} onChange={e=>setSure(e.target.checked)}/> Ik weet het zeker (gecontroleerd). <small>Anders ziet de gast „vraag het even na” tot Rianne het nakijkt.</small></label>}
   </fieldset>

   <fieldset><legend>Foto <small>(mag later)</small></legend>
    <div className="kiosk-photo">{photo&&<img src={photo.url} alt=""/>}
     <label className="kiosk-btn soft kiosk-file">{photoBusy?'Foto opslaan…':photo?'📷 Andere foto':'📷 Foto maken of kiezen'}<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={photoBusy} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)upload(f)}}/></label>
     {photo&&<button type="button" className="kiosk-btn soft" onClick={()=>{setPhoto(null);setMayEdit(null)}}>Foto weghalen</button>}</div>
    {photo&&<><p className="kiosk-q">Mogen we de foto aanpassen voor een mooiere weergave? <small>(bijvoorbeeld bijsnijden, licht en kleur)</small></p>{yesNo(mayEdit,setMayEdit)}</>}
   </fieldset>

   <fieldset><legend>Zijn er keuzes voor de gast? <small>(bijvoorbeeld soort melk)</small></legend>{yesNo(hasOptions,setHasOptions)}
    {hasOptions&&<div className="kiosk-options">
     {chosen.length>0&&<ul className="kiosk-chosen">{chosen.map(g=><li key={g.id}><b>{g.title}</b> <small>{g.choices.map(c=>c.label).join(' / ')}{g.required?'':' · mag leeg'}</small> <button type="button" className="kiosk-btn soft" onClick={()=>{setPicked(picked.filter(x=>x!==g.id));setNewGroups(newGroups.filter(x=>x.id!==g.id))}}>Weg</button></li>)}</ul>}
     {groups.filter(g=>!picked.includes(g.group.id)).length>0&&<label>Bestaande keuzevraag<select className="kiosk-input" value="" onChange={e=>{if(e.target.value)setPicked([...picked,e.target.value])}}><option value="">Kies uit de lijst…</option>{groups.filter(g=>!picked.includes(g.group.id)).map(g=><option key={g.group.id} value={g.group.id}>{g.group.title}: {g.group.choices.map(c=>c.label).join(' / ')}</option>)}</select></label>}
     <details className="kiosk-newgroup" open={groups.length===0}><summary>Nieuwe keuzevraag maken</summary>
      <label>Vraag<input className="kiosk-input" value={gTitle} onChange={e=>setGTitle(e.target.value)} maxLength={100} placeholder="Bijvoorbeeld: Soort melk"/></label>
      <label>Keuzes <small>(met komma’s)</small><input className="kiosk-input" value={gChoices} onChange={e=>setGChoices(e.target.value)} maxLength={1000} placeholder="Bijvoorbeeld: Koe, Haver"/></label>
      <label className="kiosk-check"><input type="checkbox" checked={gRequired} onChange={e=>setGRequired(e.target.checked)}/> De gast moet kiezen</label>
      <button type="button" className="kiosk-btn soft" onClick={addGroup}>Keuzevraag toevoegen</button></details>
    </div>}
   </fieldset>

   <label>Hoeveel heb je er? <small>(leeg = niet tellen)</small><input className="kiosk-input" inputMode="numeric" value={count} onChange={e=>setCount_(e.target.value.replace(/\D/g,'').slice(0,4))} placeholder="bijvoorbeeld 12"/></label>
   {msg&&<p className="kiosk-error" role="alert">{msg}</p>}
   <button className="kiosk-btn" disabled={busy||photoBusy}>{busy?'Even…':'Toevoegen en meteen te bestellen'}</button>
   <p className="kiosk-sub">Het product staat daarna in de kassa, het opnemen en de bestelapp. Een recept kun je daarna toevoegen, of later. Rianne kan alles nakijken in Gerechten & prijzen.</p>
  </form>
 </section>;
}

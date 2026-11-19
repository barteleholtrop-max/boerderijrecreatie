'use client';
// Voorraad en winkelprijzen in Gerechten & prijzen (besluit eigenaar 3 november 2026).
// - Snel aanpassen in de lijst: beschikbaar voor de gast en het aantal op voorraad (−/+ of intypen).
// - In het productvenster: tellen of onbeperkt, grootboekrekening, „mag sneller weg” en eigen doelmarge.
// Het aantal is een telling in de bestaande voorraadlijst van Inkoop (actie „count” op het ingrediënt); er is geen
// tweede voorraad. Beschikbaarheid en instellingen gaan via actie „stock-settings” en gelden direct voor gasten.
import {useEffect,useRef,useState} from 'react';
import {Pill} from '../ui';
import {productStock,type StockSource,type StockMode} from '@/lib/shop-stock';
import {SALE_LEDGERS,LEDGERS,targetMargin} from '@/lib/shop-price-advice';

export type StockFields={stockMode?:StockMode;ledger?:string;fasterSale?:boolean;targetMarginPct?:number;lowAt?:number;available:boolean;customerPrice?:boolean;onStartscherm?:boolean;zelfkassa?:{at:string;labelName:string;voorstel?:{inkoopCents:number;margePct:number;leverancier:string;factuur:string;regel:string};handmatig?:boolean};barcodes?:string[]};
/** Bijna op (wens eigenaar 5 november 2026): standaard bij 10 stuks of minder, per product aan te passen (lowAt). */
export const LOW_DEFAULT=10;
export const lowAt=(p:{lowAt?:number})=>Number.isInteger(p.lowAt)?p.lowAt as number:LOW_DEFAULT;
export type OpsInfo={source:StockSource;version:number;today:string};
type Settings=Partial<Omit<StockFields,'targetMarginPct'|'lowAt'|'zelfkassa'>>&{targetMarginPct?:number|null;lowAt?:number|null;zelfkassa?:null};

async function post(url:string,body:object){
 const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const d=await r.json().catch(()=>({})) as {error?:string};
 if(!r.ok)throw Error(d.error||'Opslaan is niet gelukt. Ververs en probeer opnieuw.');
 return d;
}
export const saveSettings=(id:string,version:number,settings:Settings)=>post('/api/products',{action:'stock-settings',id,version,settings});
/** Telling vastleggen: het aantal stuks dat er nu ligt. Alleen bij doorverkoop (1 stuk = 1 ingrediënt). */
export const countStock=(ops:OpsInfo,ingredientId:string,quantity:number)=>post('/api/operations',{action:'count',requestId:crypto.randomUUID(),version:ops.version,ingredientId,quantity,date:ops.today});

export async function loadOps():Promise<{ops:OpsInfo;costs:Record<string,{portionCents:number|null}>;invoices:unknown[]}|null>{
 const r=await fetch('/api/operations',{cache:'no-store'});if(!r.ok)return null;
 const d=await r.json() as {state:StockSource&{invoices:unknown[]};version:number;today:string;costs:Record<string,{portionCents:number|null}>};
 return {ops:{source:{ingredients:d.state.ingredients,recipes:d.state.recipes},version:d.version,today:d.today},costs:d.costs||{},invoices:d.state.invoices||[]};
}

/** Korte stand voor filters en de lijst. */
export function stockState(ops:OpsInfo|null,id:string,p:StockFields){
 if(!ops)return {label:p.stockMode==='geteld'?'…':'Onbeperkt',kind:'none' as const};
 const s=productStock(ops.source,{id,stockMode:p.stockMode});
 if(!s.tracked)return {label:'Onbeperkt',kind:'none' as const};
 if(s.stock===null)return {label:s.problem,kind:'problem' as const};
 return {label:String(s.stock),kind:s.stock<=0?'out' as const:s.low||s.stock<=lowAt(p)?'low' as const:'ok' as const,stock:s.stock,resale:s.resale};
}

/** Aantal invoeren vanuit de tabel: telt het product (zo nodig als doorverkoopproduct) en zet het op „geteld”. */
export const setCount=(id:string,version:number,count:number)=>post('/api/products',{action:'set-stock',id,version,count,requestId:crypto.randomUUID()});

/** Cel in de productlijst: beschikbaar voor de gast, het aantal en „snel verkopen”, zonder het productvenster te openen.
 *  Een getal invullen zet het product op tellen; leeg laten of „onbeperkt” zet het tellen weer uit. */
export function StockCell({id,version,p,ops,busy,onDone}:{id:string;version:number;p:StockFields;ops:OpsInfo|null;busy:boolean;onDone:(msg:string,ok:boolean)=>void}){
 const st=stockState(ops,id,p);
 const current='stock' in st&&st.stock!==undefined?String(st.stock):'';
 const [value,setValue]=useState(current);
 const [saving,setSaving]=useState(false),[fast,setFast]=useState(!!p.fasterSale),[forGuest,setForGuest]=useState(p.available);
 useEffect(()=>{setValue(current)},[st.label]);
 useEffect(()=>{setFast(!!p.fasterSale);setForGuest(p.available)},[p.fasterSale,p.available]);
 const stop=(e:React.SyntheticEvent)=>e.stopPropagation();
 const counted=st.kind!=='none';
 // Een samengesteld recept wordt via de ingrediënten geteld, niet hier.
 const viaRecipe=st.kind!=='none'&&st.kind!=='problem'&&!('resale' in st&&st.resale);
 async function run(fn:()=>Promise<unknown>,ok:string,undo?:()=>void){setSaving(true);try{await fn();onDone(ok,true)}catch(e){onDone((e as Error).message,false);setValue(current);undo?.()}finally{setSaving(false)}}
 async function count(raw:string){
  const t=raw.trim();if(t===current)return;
  if(t===''){if(counted)await run(()=>saveSettings(id,version,{stockMode:'onbeperkt'}),'Voorraad staat weer op onbeperkt.');return}
  const n=Number(t);if(!Number.isInteger(n)||n<0){onDone('Vul een heel aantal in (0 of meer), of laat leeg voor onbeperkt.',false);setValue(current);return}
  await run(()=>setCount(id,version,n),`${n} op voorraad vastgelegd.`);
 }
// Vinkjes springen meteen om; lukt opslaan niet, dan terug.
 async function guest(on:boolean){setForGuest(on);await run(()=>saveSettings(id,version,{available:on}),on?'Weer beschikbaar voor gasten.':'Niet meer beschikbaar voor gasten.',()=>setForGuest(!on))}
async function faster(on:boolean){setFast(on);await run(()=>saveSettings(id,version,{fasterSale:on}),on?'Mag sneller weg: het prijsvoorstel houdt hier rekening mee.':'„Mag sneller weg” staat uit.',()=>setFast(!on))}
 const off=busy||saving;
 return <div className="stock-cell" onClick={stop}>
  <label className="small stock-guest"><input type="checkbox" aria-label="Beschikbaar voor gast" checked={forGuest} disabled={off} onChange={e=>guest(e.target.checked)}/> Gast</label>
  {viaRecipe?<div className="stock-row"><strong title="Berekend uit het recept">{st.label}</strong></div>
  :<div className="stock-row"><span className="stock-stepper">
    <button type="button" aria-label="Eén minder" disabled={off||!counted||!('stock' in st)||!st.stock} onClick={()=>count(String(Number(current)-1))}>−</button>
    <input aria-label="Aantal op voorraad" inputMode="numeric" placeholder="∞" title="Aantal op voorraad. Leeg = onbeperkt." value={value} disabled={off} onChange={e=>setValue(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')(e.target as HTMLInputElement).blur()}} onBlur={()=>count(value)}/>
    <button type="button" aria-label="Eén meer" disabled={off} onClick={()=>count(String((Number(current)||0)+1))}>+</button>
   </span>
   {!counted&&<span className="small">onbeperkt</span>}
   {st.kind==='problem'&&<Pill color="orange">{st.label.startsWith('Leg')?'Nog niet geteld':'Geen ingrediënt'}</Pill>}
  </div>}
  {(st.kind==='out'||st.kind==='low')&&<div>{st.kind==='out'?<Pill color="red">Uitverkocht</Pill>:<Pill color="orange">Bijna op</Pill>}</div>}
  <label className="small stock-guest"><input type="checkbox" aria-label="Snel verkopen" checked={fast} disabled={off} onChange={e=>faster(e.target.checked)}/> Snel verkopen</label>
 </div>;
}

/** Blok in het productvenster. Heeft een eigen opslaanknop: deze instellingen gelden direct, ook voor gasten. */
export function StockFieldset({id,version,p,ops,onDone}:{id:string|null;version:number;p:StockFields;ops:OpsInfo|null;onDone:(msg:string,ok:boolean,saved?:Partial<StockFields>)=>void}){
 const [mode,setMode]=useState<StockMode>(p.stockMode==='geteld'?'geteld':'onbeperkt');
 const [ledger,setLedger]=useState(p.ledger||'');
 const [faster,setFaster]=useState(!!p.fasterSale),[custom,setCustom]=useState(!!p.customerPrice),[tile,setTile]=useState(p.onStartscherm!==false);
 const [codes,setCodes]=useState((p.barcodes||[]).join(', ')),[scanning,setScanning]=useState(false);
 const [own,setOwn]=useState(p.targetMarginPct===undefined?'':String(p.targetMarginPct));
 const [low,setLow]=useState(p.lowAt===undefined?'':String(p.lowAt));
 const [busy,setBusy]=useState(false);
 if(!id)return <fieldset className="stock-fieldset"><legend>Voorraad & prijsadvies</legend><p>Sla het product eerst op. Daarna kun je hier de voorraad en het prijsadvies instellen.</p></fieldset>;
 const st=stockState(ops,id,{...p,stockMode:mode});
 const defaultMargin=targetMargin({ledger});
 async function save(){
  const n=own.trim()===''?null:Number(own);
  if(n!==null&&(!Number.isInteger(n)||n<0||n>90)){onDone('Vul een doelmarge in van 0 tot en met 90 procent, of laat het leeg.',false);return}
  const l=low.trim()===''?null:Number(low);
  if(l!==null&&(!Number.isInteger(l)||l<0||l>9999)){onDone('Vul bij „bijna op” een heel aantal in, of laat het leeg voor de standaard ('+LOW_DEFAULT+').',false);return}
  const list=[...new Set(codes.split(/[\s,;]+/).map(c=>c.trim()).filter(Boolean))];
  if(list.some(c=>!/^\d{6,14}$/.test(c))||list.length>20){onDone('Een streepjescode bestaat uit 6 tot 14 cijfers (hooguit 20 codes).',false);return}
  setBusy(true);
  // Opslaan geldt als nagekeken: het kenmerk „nieuw via zelfkassa” gaat eraf.
  try{const settings={stockMode:mode,ledger,fasterSale:faster,targetMarginPct:n,lowAt:l,customerPrice:custom,onStartscherm:tile,barcodes:list,...(p.zelfkassa?{zelfkassa:null}:{})};await saveSettings(id!,version,settings);onDone('Voorraad en prijsadvies opgeslagen. Dit geldt direct, ook voor gasten.',true,{stockMode:mode,ledger,fasterSale:faster,targetMarginPct:n??undefined,lowAt:l??undefined,customerPrice:custom,onStartscherm:tile,zelfkassa:undefined,barcodes:list})}
  catch(e){onDone((e as Error).message,false)}finally{setBusy(false)}
 }
 return <fieldset className="stock-fieldset"><legend>Voorraad & prijsadvies</legend>
  {p.zelfkassa&&<p className="message">Nieuw via de zelfkassa op {new Date(p.zelfkassa.at).toLocaleDateString('nl-NL',{day:'numeric',month:'long'})} (etiket: „{p.zelfkassa.labelName}”).{p.zelfkassa.voorstel?` Prijsvoorstel: inkoop ${(p.zelfkassa.voorstel.inkoopCents/100).toLocaleString('nl-NL',{style:'currency',currency:'EUR'})} per stuk bij ${p.zelfkassa.voorstel.leverancier} (factuur ${p.zelfkassa.voorstel.factuur}: „${p.zelfkassa.voorstel.regel}”) + ${p.zelfkassa.voorstel.margePct}% marge + btw. Het product is al te koop voor deze prijs.`:p.zelfkassa.handmatig?' De verkoopprijs is op de werkplek ingevuld.':''} Kijk naam, btw, eigenaar en prijs na, en sla dit blok op als het klopt.</p>}
  <div className="two">
   <label>Voorraad<select value={mode} onChange={e=>setMode(e.target.value as StockMode)}><option value="onbeperkt">Onbeperkt (niet tellen)</option><option value="geteld">Tellen</option></select></label>
   <label>Grootboekrekening (SnelStart)<select value={ledger} onChange={e=>setLedger(e.target.value)}><option value="">Nog kiezen</option>{SALE_LEDGERS.map(l=><option key={l.id} value={l.id}>{l.id} {l.name}</option>)}{ledger&&!SALE_LEDGERS.some(l=>l.id===ledger)&&<option value={ledger}>{LEDGERS.find(l=>l.id===ledger)?.name||ledger}</option>}</select></label>
  </div>
  {mode==='geteld'&&<p className="small">{st.kind==='problem'?st.label:st.kind==='none'?'':`Nu op voorraad: ${st.label}. Het aantal pas je aan in de productlijst of bij Inkoop & voorraad.`} Bij 0 staat het product op de website als <b>Uitverkocht</b>. De kassa haalt een verkoop direct af, een online bestelling na betaling.</p>}
  {mode==='geteld'&&st.kind==='problem'&&st.label.startsWith('Koppel')&&<p className="small">Wordt dit product ongewijzigd doorverkocht? Koppel het dan bij <a href={'/inkoop?tab=recepten'}>Recepten & kostprijs → Producten zonder recept</a> (1 stuk van één ingrediënt). Daarna kun je hier tellen.</p>}
  {mode==='geteld'&&<label>Bijna op bij <span className="muted">(zoveel stuks of minder: het product licht op het werkplekscherm op; leeg = {LOW_DEFAULT})</span><input inputMode="numeric" value={low} onChange={e=>setLow(e.target.value)} placeholder={String(LOW_DEFAULT)}/></label>}
  {/* Klant voert prijs in (wens eigenaar 5 november 2026): bijvoorbeeld rundvlees, dat per stuk in gewicht verschilt. */}
  <label className="check"><input type="checkbox" checked={custom} onChange={e=>setCustom(e.target.checked)}/> Klant voert de prijs in <span className="muted">(prijs staat op het etiket en verschilt per stuk, zoals rundvlees; de klant typt het bedrag in bij de zelfservicekassa, de medewerker bij de kassa. De prijs hierboven is dan een richtprijs. Online vooraf bestellen kan dan niet.)</span></label>
  {/* Op het startscherm (wens eigenaar 9 november 2026): uit = geen toets op de kassa en de zelfkassa, wel te scannen en via een etiket te kopen. */}
  <label className="check"><input type="checkbox" checked={tile} onChange={e=>setTile(e.target.checked)}/> Op het startscherm van de kassa <span className="muted">(uit: geen toets op de kassa en de zelfkassa; het product is wel te scannen, te zoeken en via een etiket te kopen)</span></label>
  {/* Streepjescodes (wens eigenaar 9 november 2026): de zelfkassa herkent het product aan de code op de verpakking. */}
  <label>Streepjescodes (EAN) <span className="muted">(de zelfkassa herkent het product dan aan de code op de verpakking; meerdere met een komma)</span>
   <span className="row" style={{gap:6}}><input inputMode="numeric" value={codes} onChange={e=>setCodes(e.target.value)} placeholder="bijv. 8712345678906"/>{scanSupported()&&<button type="button" className="btn secondary" onClick={()=>setScanning(true)}>📷 Scannen</button>}</span></label>
  {scanning&&<BarcodeScan onCode={c=>{setCodes(v=>[...new Set([...v.split(/[\s,;]+/).filter(Boolean),c])].join(', '));setScanning(false)}} onClose={()=>setScanning(false)}/>}
  <label className="check"><input type="checkbox" checked={faster} onChange={e=>setFaster(e.target.checked)}/> Mag sneller worden verkocht <span className="muted">(bijvoorbeeld korte houdbaarheid: het prijsadvies stelt dan eerder een lagere prijs voor)</span></label>
  <label>Eigen doelmarge in % <span className="muted">(leeg = {defaultMargin}% van {ledger?'de grootboekrekening':'de standaard'})</span><input inputMode="numeric" value={own} onChange={e=>setOwn(e.target.value)} placeholder={String(defaultMargin)}/></label>
  <button type="button" className="btn secondary" disabled={busy} onClick={save}>Voorraad & prijsadvies opslaan</button>
  <p className="tiny">Deze instellingen gelden direct, ook in de gastweergave. De andere velden bewaar je met Concept opslaan of Opslaan en publiceren.</p>
 </fieldset>;
}

/** Streepjescode scannen met de camera (Chrome op Android): leest één code en sluit. */
const scanSupported=()=>typeof window!=='undefined'&&'BarcodeDetector' in window&&!!navigator.mediaDevices?.getUserMedia;
function BarcodeScan({onCode,onClose}:{onCode:(c:string)=>void;onClose:()=>void}){
 const ref=useRef<HTMLVideoElement>(null),[note,setNote]=useState('Houd de streepjescode voor de camera.');
 useEffect(()=>{let stream:MediaStream|null=null,stop=false;
  (async()=>{try{
   const D=(window as unknown as {BarcodeDetector:new(o:{formats:string[]})=>{detect:(v:HTMLVideoElement)=>Promise<{rawValue:string}[]>}}).BarcodeDetector;
   const detector=new D({formats:['ean_13','ean_8','upc_a','upc_e','code_128']});
   stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'},audio:false});if(stop){stream.getTracks().forEach(t=>t.stop());return}
   if(ref.current){ref.current.srcObject=stream;ref.current.play().catch(()=>{})}
   const tick=async()=>{if(stop||!ref.current)return;try{for(const r of await detector.detect(ref.current)){const c=(r.rawValue||'').replace(/\D/g,'');if(/^\d{6,14}$/.test(c)){onCode(c);return}}}catch{}setTimeout(tick,250)};tick();
  }catch{setNote('De camera kan hier niet scannen. Typ de cijfers onder de streepjes in.')}})();
  return()=>{stop=true;stream?.getTracks().forEach(t=>t.stop())};
 },[onCode]);
 return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className="drawer" role="dialog" aria-modal="true" aria-label="Streepjescode scannen" style={{maxWidth:420}}>
  <h3>Streepjescode scannen</h3><video ref={ref} playsInline muted style={{width:'100%',borderRadius:12,background:'#000'}}/><p className="small">{note}</p>
  <button type="button" className="btn secondary" onClick={onClose}>Sluiten</button></section></div>;
}

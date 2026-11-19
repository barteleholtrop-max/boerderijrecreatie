'use client';
// Winkelproducten: prijsvoorstel op basis van inkoop (besluit eigenaar 3 november 2026, „Voorraad en winkelprijzen”).
// Rekenregels in lib/shop-price-advice.ts. Er verandert niets tot een medewerker op Overnemen drukt; dat gaat via
// dezelfde actie als de andere voorstellen op dit scherm (POST /api/products, apply-advice, met versiecontrole).
import {useEffect,useMemo,useState} from 'react';
import {Pill,money} from '../ui';
import {adviseShop,costTrend,ledgerLabel,type ShopAdvice} from '@/lib/shop-price-advice';
import {productStock,resaleIngredient,type StockSource} from '@/lib/shop-stock';

type Product={name:string;priceCents:number;vat:string;station:string;department:string;ledger?:string;targetMarginPct?:number;fasterSale?:boolean;stockMode?:string};
type Row={id:string;version:number;draft:Product;published:Product|null};
type Invoice=Parameters<typeof costTrend>[0][number];
type Item={row:Row;advice:ShopAdvice;soldPerWeek:number;stock:number|null};
const WEEKS=4;
const isShop=(p:Product)=>p.station==='winkel'||!!p.ledger;
const dayStr=(d:Date)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(d);

export function WinkelAdvies(){
 const [items,setItems]=useState<Item[]|null>(null);
 const [problems,setProblems]=useState<{name:string;problem:string}[]>([]);
 const [picked,setPicked]=useState<Record<string,boolean>>({});
 const [hidden,setHidden]=useState<Record<string,boolean>>({});
 const [publish,setPublish]=useState(true);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');

 async function load(){
  const now=new Date(),from=dayStr(new Date(now.getTime()-WEEKS*7*86400000)),to=dayStr(now);
  const [pr,op,or]=await Promise.all([fetch('/api/products',{cache:'no-store'}),fetch('/api/operations',{cache:'no-store'}),fetch(`/api/orders?van=${from}&tot=${to}`,{cache:'no-store'})]);
  if(!pr.ok||!op.ok)throw Error('Gegevens voor het winkeladvies konden niet worden geladen.');
  const rows=await pr.json() as Row[];
  const ops=await op.json() as {state:StockSource&{invoices:Invoice[]};costs:Record<string,{portionCents:number|null}>};
  const orders=or.ok?await or.json() as {lines?:{productId:string;quantity:number}[]}[]:[];
  const sold=new Map<string,number>();for(const o of orders)for(const l of o.lines||[])sold.set(l.productId,(sold.get(l.productId)??0)+l.quantity);
  const src:StockSource={ingredients:ops.state.ingredients,recipes:ops.state.recipes};
  const list:Item[]=[],missing:{name:string;problem:string}[]=[];
  for(const row of rows){
   const p=row.published??row.draft;if(!isShop(p))continue;
   const s=productStock(src,{id:row.id,stockMode:p.stockMode});
   const stock=s.tracked&&s.stock!==null?s.stock:null;
   const ing=resaleIngredient(src,row.id),trend=ing?costTrend(ops.state.invoices,ing.id):null;
   const soldPerWeek=(sold.get(row.id)??0)/WEEKS;
   const advice=adviseShop({priceCents:row.draft.priceCents,vat:row.draft.vat,ledger:p.ledger,targetMarginPct:p.targetMarginPct,fasterSale:p.fasterSale,costCents:ops.costs[row.id]?.portionCents??null,previousCostCents:trend?.previousCents??null,costNote:trend?.note,soldPerWeek,stock});
   if(advice.problem)missing.push({name:p.name,problem:advice.problem});
   else if(advice.proposedCents!==null)list.push({row,advice,soldPerWeek,stock});
  }
  list.sort((a,b)=>a.row.draft.name.localeCompare(b.row.draft.name,'nl'));
  setItems(list);setProblems(missing);setPicked({});
 }
 useEffect(()=>{load().catch(e=>setMessage(e.message))},[]);

 const shown=useMemo(()=>(items||[]).filter(i=>!hidden[i.row.id]),[items,hidden]);
 const chosen=shown.filter(i=>picked[i.row.id]);

 async function apply(list:Item[]){
  if(!list.length)return;setBusy(true);setMessage('');
  try{
   const changes=list.map(i=>({id:i.row.id,version:i.row.version,priceCents:i.advice.proposedCents!,confirmPrice:true,publish:publish&&!!i.row.published}));
   const r=await fetch('/api/products',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'apply-advice',changes})});
   const d=await r.json();if(!r.ok)throw Error(d.error||'Overnemen is niet gelukt.');
   const names=new Map(list.map(i=>[i.row.id,i.row.draft.name]));
   const skipped=(d.skipped as {id:string;reason:string}[]).slice(0,6).map(s=>`${names.get(s.id)}: ${s.reason}`).join(' · ');
   setMessage(d.message+(skipped?' '+skipped:''));await load();
  }catch(e){setMessage((e as Error).message)}finally{setBusy(false)}
 }

 return <div className="card section-gap shop-advice">
  <div className="card-head"><div><h3 className="card-title">Winkel: prijsvoorstel op basis van inkoop</h3>
   <p className="small" style={{margin:'4px 0 0'}}>Laatste inkoopprijs plus de doelmarge van de grootboekrekening, met verkoopsnelheid (laatste {WEEKS} weken), voorraad en „mag sneller weg”. Afgerond op hele of halve euro's, nooit onder 20% marge en hooguit 15% per keer. De prijs verandert pas als je overneemt.</p></div></div>
  <div className="row" style={{flexWrap:'wrap',gap:12,margin:'0 0 12px'}}>
   <label className="small"><input type="checkbox" checked={publish} onChange={e=>setPublish(e.target.checked)}/> Direct publiceren als het product al gepubliceerd is</label>
   <button className="btn secondary sm" disabled={busy||!shown.length} onClick={()=>apply(shown)}>Alles overnemen ({shown.length})</button>
   <button className="btn" disabled={busy||!chosen.length} onClick={()=>apply(chosen)}>{busy?'Bezig…':`Overnemen (${chosen.length})`}</button>
  </div>
  {message&&<div className="message" role="status">{message}</div>}
  {!items?<p className="small">Winkeladvies laden…</p>:!shown.length?<div className="empty">Geen open prijsvoorstellen voor winkelproducten.</div>:
  <div className="table-wrap"><table>
   <thead><tr><th aria-label="Kiezen"/><th>Product</th><th>Nu</th><th>Voorstel</th><th>Marge nu → voorstel</th><th>Waarom</th><th aria-label="Negeren"/></tr></thead>
   <tbody>{shown.map(({row,advice})=>{const p=row.draft,d=advice.proposedCents!/p.priceCents-1;return <tr key={row.id}>
    <td><input type="checkbox" aria-label={'Kies '+p.name} checked={!!picked[row.id]} disabled={busy} onChange={e=>setPicked(x=>({...x,[row.id]:e.target.checked}))}/></td>
    <td><strong>{p.name}</strong><div className="small">{(row.published??p).ledger?ledgerLabel((row.published??p).ledger!):'Grootboekrekening nog kiezen'}{(row.published??p).fasterSale&&<> · <Pill color="orange">Mag sneller weg</Pill></>}</div></td>
    <td className="n">{money(p.priceCents)}</td>
    <td className="n"><strong>{money(advice.proposedCents!)}</strong> <span className={d>0?'up':'down'}>{d>0?'+':''}{Math.round(d*100)}%</span></td>
    <td className="n">{advice.marginNowPct}% → {advice.marginNewPct}%<div className="why">doel {advice.targetMarginPct}%</div></td>
    <td>{advice.reasons.join(' · ')}</td>
    <td><button className="text-button" disabled={busy} onClick={()=>setHidden(h=>({...h,[row.id]:true}))}>Negeren</button></td>
   </tr>})}</tbody>
  </table></div>}
  {problems.length>0&&<details className="section-gap"><summary className="small">{problems.length} winkelproduct{problems.length===1?'':'en'} zonder voorstel (bijvoorbeeld geen inkoopprijs)</summary>
   <ul className="small">{problems.slice(0,60).map((x,i)=><li key={i}>{x.name}: {x.problem}</li>)}</ul></details>}
 </div>;
}

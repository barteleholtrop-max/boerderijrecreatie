'use client';
// Opnamescherm voor de bediening (wens eigenaar 3 november 2026): heel makkelijk een bestelling op een tafel zetten.
// Tafel kiezen → producten tikken (keuzes als het product die heeft) → versturen. Gerechten gaan naar de kok, drankjes
// naar de barista. Eigen webadres: /opnemen. Tafels zijn zelf in te stellen (knop ⚙ Tafels).
import {useCallback,useEffect,useMemo,useState} from 'react';
import {KioskNav} from '../werkplek/nav';
import {buildLine,type SaleProduct,type SaleLine,type RequestedLine} from '@/lib/orders';
import {money} from '../ui';
type Product={id:string;version:number;published:SaleProduct|null};
type Table={id?:string;name:string;active:boolean};
type CartLine=RequestedLine&{snapshot:SaleLine};
type Order={id:number;number:string;created:string;mode:string;reference:string;totalCents:number;lines:SaleLine[]};

export default function Opnemen(){
 const [products,setProducts]=useState<Product[]>([]),[tables,setTables]=useState<Table[]>([]),[orders,setOrders]=useState<Order[]>([]),[table,setTable]=useState(''),[cart,setCart]=useState<CartLine[]>([]),[group,setGroup]=useState('');
 const [picking,setPicking]=useState<Product|null>(null),[sel,setSel]=useState<Record<string,string>>({}),[note,setNote]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[requestId,setRequestId]=useState(''),[editTables,setEditTables]=useState(false);
 const load=useCallback(async()=>{try{const [p,t,o]=await Promise.all([fetch('/api/products',{cache:'no-store'}).then(r=>r.json()),fetch('/api/tafels',{cache:'no-store'}).then(r=>r.json()),fetch('/api/orders',{cache:'no-store'}).then(r=>r.json())]);
  setProducts((p as Product[]).filter(x=>x.published&&x.published.available!==false&&['kok','barista'].includes(x.published.station)));setTables((t as {tables:Table[]}).tables);setOrders(o as Order[])}catch{setMessage('Laden lukte niet. Herlaad de pagina.')}},[]);
 useEffect(()=>{void load();setRequestId(crypto.randomUUID())},[load]);
 const groups=useMemo(()=>[...new Set(products.map(p=>p.published!.department||'Overig'))].sort((a,b)=>a.localeCompare(b,'nl')),[products]);
 // Typen om te zoeken (wens eigenaar 3 november 2026): zoekt in alle soorten, hoofdletters en accenten maken niet uit.
 const [typed,setTyped]=useState('');
 const plain=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const words=plain(typed).split(/\s+/).filter(Boolean);
 const shown=products.filter(p=>words.length?words.every(w=>plain(p.published!.name).includes(w)):!group||p.published!.department===group).sort((a,b)=>a.published!.name.localeCompare(b.published!.name,'nl'));
 function addLine(p:Product,selections:Record<string,string>,lineNote:string){try{const input={productId:p.id,version:p.version,quantity:1,selections,note:lineNote};const snapshot=buildLine(p.published!,input);
  setCart(c=>{const same=c.findIndex(l=>l.productId===p.id&&JSON.stringify(l.selections)===JSON.stringify(selections)&&l.note===lineNote);if(same<0)return [...c,{...input,snapshot}];const n=[...c];const q=n[same].quantity+1;n[same]={...n[same],quantity:q,snapshot:buildLine(p.published!,{...n[same],quantity:q})};return n});
  setRequestId(crypto.randomUUID());setPicking(null);setMessage('')}catch(e){setMessage((e as Error).message)}}
 function tap(p:Product){if(p.published!.optionGroups?.length){setPicking(p);setSel({});setNote('')}else addLine(p,{},'')}
 function change(i:number,d:number){setCart(c=>{const n=[...c],l=n[i],q=l.quantity+d;if(q<=0)return n.filter((_,j)=>j!==i);const p=products.find(x=>x.id===l.productId)!;n[i]={...l,quantity:q,snapshot:buildLine(p.published!,{...l,quantity:q})};return n});setRequestId(crypto.randomUUID())}
 async function send(){if(!table||!cart.length)return;setBusy(true);setMessage('');
  try{const r=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId,mode:'yte',reference:table,lines:cart.map(({snapshot:_s,...l})=>l)})});const d=await r.json();if(!r.ok)throw Error(d.error||'Versturen lukte niet.');
   setMessage(`Top! ${table} is doorgegeven (${d.number}). De keuken en de bar gaan aan de slag.`);setCart([]);setRequestId(crypto.randomUUID());await load()}
  catch(e){setMessage((e as Error).message+' Je bestelling staat nog klaar; probeer het nog eens.')}finally{setBusy(false)}}
 const total=cart.reduce((s,l)=>s+l.snapshot.totalCents,0),count=cart.reduce((s,l)=>s+l.quantity,0);
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date());
 const tableOrders=orders.filter(o=>o.mode==='yte'&&o.reference===table&&new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date(o.created))===today);
 if(editTables)return <TablesEditor tables={tables} onDone={async()=>{setEditTables(false);await load()}}/>;
 return <div className="kiosk-page opnemen" data-bb-view="opnemen">
  <KioskNav current="opnemen"/>
  <header className="kiosk-head"><div><p className="kiosk-hello">Hoi! Wat mag het zijn? 🍽️</p><h1>{table?table:'Kies een tafel'}</h1><p className="kiosk-sub">{table?'Tik op wat de gasten willen. Nog eens tikken = één extra.':'Daarna tik je de gerechten en drankjes aan.'}</p></div>
   <div className="kiosk-tools"><button className="kiosk-btn soft" onClick={()=>setEditTables(true)}>⚙ Tafels</button></div></header>
  {message&&<p className="kiosk-note" role="status">{message}</p>}
  <div className="kiosk-tables" role="group" aria-label="Tafel">{tables.filter(t=>t.active).map(t=><button key={t.name} className={'kiosk-table'+(t.name===table?' on':'')} aria-pressed={t.name===table} onClick={()=>{setTable(t.name);setMessage('')}}>{t.name}</button>)}</div>
  {table&&<div className="kiosk-take">
   <section>
    <input className="kiosk-search" type="search" aria-label="Typ om een product te zoeken" placeholder="Typ wat de gast wil, bijv. capp of burger · Enter = toevoegen" value={typed} onChange={e=>setTyped(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&words.length&&shown.length){e.preventDefault();tap(shown[0]);setTyped('')}if(e.key==='Escape')setTyped('')}}/>
    <div className="kiosk-groups" role="group" aria-label="Soort">{['',...groups].map(g=><button key={g||'alles'} className={'kiosk-chip'+(g===group?' on':'')} onClick={()=>{setGroup(g);setTyped('')}}>{g||'Alles'}</button>)}</div>
    <div className="kiosk-products">{shown.map(p=><button key={p.id} className="kiosk-product" onClick={()=>tap(p)}><b>{p.published!.name}</b><small>{money(p.published!.priceCents)}{p.published!.optionGroups?.length?' · keuze':''}</small><span className={'kiosk-dot '+p.published!.station}>{p.published!.station==='kok'?'keuken':'bar'}</span></button>)}{!shown.length&&<p className="kiosk-sub">{words.length?`Niets gevonden voor „${typed}”. Probeer een ander woord.`:'Geen producten. Publiceer ze bij Gerechten & prijzen.'}</p>}</div>
   </section>
   <aside className="kiosk-cart" aria-label="Bestelling">
    <h2>{table}</h2>
    {!cart.length?<p className="kiosk-sub">Nog niets gekozen.</p>:<ul>{cart.map((l,i)=><li key={i}><div><b>{l.snapshot.name}</b>{l.snapshot.choices.map((c,j)=><small key={j}>{c}</small>)}{l.note&&<em>„{l.note}”</em>}</div><span className="kiosk-steps"><button aria-label="Eén minder" onClick={()=>change(i,-1)}>−</button><b>{l.quantity}</b><button aria-label="Eén meer" onClick={()=>change(i,1)}>+</button></span></li>)}</ul>}
    <button className="kiosk-btn big" disabled={busy||!cart.length} onClick={send}>{busy?'Versturen…':`Versturen naar keuken en bar · ${count}× · ${money(total)}`}</button>
    {tableOrders.length>0&&<details className="kiosk-done"><summary>Vandaag al doorgegeven voor {table} ({tableOrders.length})</summary>{tableOrders.map(o=><div key={o.id} className="kiosk-done-row"><span><b>{o.number}</b> · {o.lines.map(l=>l.quantity+'× '+l.name).join(', ')}</span><span>{money(o.totalCents)}</span></div>)}</details>}
   </aside>
  </div>}
  {picking&&<div className="kiosk-modal" role="dialog" aria-modal="true" aria-label={picking.published!.name}><div className="kiosk-modal-box">
   <h2>{picking.published!.name}</h2>
   {picking.published!.optionGroups!.map(g=><fieldset key={g.id}><legend>{g.title}{g.required?' *':''}</legend><div className="kiosk-groups">{g.choices.map(c=><button key={c.id} className={'kiosk-chip'+(sel[g.id]===c.id?' on':'')} onClick={()=>setSel({...sel,[g.id]:sel[g.id]===c.id?'':c.id})}>{c.label}{c.extraCents?' +'+money(c.extraCents):''}</button>)}</div></fieldset>)}
   <label className="kiosk-label">Opmerking voor de keuken of bar<input className="kiosk-input" maxLength={200} value={note} onChange={e=>setNote(e.target.value)} placeholder="Bijvoorbeeld: zonder ui"/></label>
   <div className="kiosk-tools"><button className="kiosk-btn" onClick={()=>addLine(picking,Object.fromEntries(Object.entries(sel).filter(([,v])=>v)),note.trim())}>Toevoegen</button><button className="kiosk-btn soft" onClick={()=>setPicking(null)}>Annuleren</button></div>
  </div></div>}
 </div>;
}

function TablesEditor({tables,onDone}:{tables:Table[];onDone:()=>void}){
 const [list,setList]=useState<Table[]>(tables),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[name,setName]=useState('');
 const move=(i:number,d:number)=>setList(l=>{const n=[...l],j=i+d;if(j<0||j>=n.length)return l;[n[i],n[j]]=[n[j],n[i]];return n});
 async function save(){setBusy(true);setMessage('');try{const r=await fetch('/api/tafels',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tables:list})});const d=await r.json();if(!r.ok)throw Error(d.error);onDone()}catch(e){setMessage((e as Error).message||'Opslaan lukte niet.')}finally{setBusy(false)}}
 return <div className="kiosk-page" data-bb-view="tafels"><header className="kiosk-head"><div><p className="kiosk-hello">⚙ Tafels instellen</p><h1>Welke tafels zijn er?</h1><p className="kiosk-sub">Geef ze een naam die de bediening kent, bijvoorbeeld „Tafel 4”, „Terras 2” of „Serre”. Uitzetten = tijdelijk niet tonen.</p></div></header>
  {message&&<p className="kiosk-error" role="status">{message}</p>}
  <div className="kiosk-stock-list">{list.map((t,i)=><div key={i} className="kiosk-stock-row"><input className="kiosk-input" aria-label="Naam" maxLength={40} value={t.name} onChange={e=>setList(l=>l.map((x,j)=>j===i?{...x,name:e.target.value}:x))}/>
   <label className="kiosk-label inline"><input type="checkbox" checked={t.active} onChange={e=>setList(l=>l.map((x,j)=>j===i?{...x,active:e.target.checked}:x))}/> tonen</label>
   <span className="kiosk-steps"><button aria-label="Omhoog" onClick={()=>move(i,-1)}>↑</button><button aria-label="Omlaag" onClick={()=>move(i,1)}>↓</button><button aria-label="Verwijderen" onClick={()=>setList(l=>l.filter((_,j)=>j!==i))}>✕</button></span></div>)}</div>
  <div className="kiosk-tools" style={{marginTop:14}}><input className="kiosk-input" placeholder="Nieuwe tafel" maxLength={40} value={name} onChange={e=>setName(e.target.value)} aria-label="Nieuwe tafel"/><button className="kiosk-btn soft" disabled={!name.trim()} onClick={()=>{setList(l=>[...l,{name:name.trim(),active:true}]);setName('')}}>＋ Toevoegen</button></div>
  <div className="kiosk-tools" style={{marginTop:18}}><button className="kiosk-btn" disabled={busy} onClick={save}>{busy?'Opslaan…':'Opslaan'}</button><button className="kiosk-btn soft" onClick={onDone}>Terug</button></div>
 </div>;
}

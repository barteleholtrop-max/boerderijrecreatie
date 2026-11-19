'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {money} from '../ui';
// Open rekeningen aan de kassa (wens eigenaar 5 november 2026): gezamenlijke rekeningen van gasten en groepscodes.
// Afrekenen in één keer of gesplitst; elk deel contant, pin of QR (iDEAL op de telefoon van de gast). Daarna voldaan.
type Fill={spentCents:number;limitCents:number;percent:number;near:boolean;full:boolean};
type Summary=Fill&{id:string;code:string;name:string;origin:string;holderName:string;holderPhone:string;status:string;orders:number;cashCents?:number};
type Share={id:string;position:number;count:number;amountCents:number;status:string;method:string;busy:boolean;payer?:string;holder?:boolean;paidCents?:number|null};
type Detail={id:string;name:string;status:string;paidAt:string;fill:Fill;holder:{name:string;phone:string;email:string};shares:Share[];
 invoice:{number:string;totalCents:number;paid:boolean;openCents:number;people:{name:string;email:string;phone:string;totalCents:number;lines:{quantity:number;name:string;totalCents:number}[]}[]}};
const METHOD:Record<string,string>={bunq:'betaalverzoek',online:'iDEAL',contant:'contant',pin:'pin',dividend:'dividend',bb:'BB-tegoed',nul:'zelf € 0 gekozen'};
const call=async<T,>(url:string,body?:unknown)=>{const r=await fetch(url,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error||'Dat lukte niet.');return d as T};

export function OpenBills(){
 const [list,setList]=useState<Summary[]>([]),[open,setOpen]=useState<string|null>(null);
 const load=useCallback(async()=>{try{setList(await call<Summary[]>('/api/rekeningen'))}catch{}},[]);
 useEffect(()=>{void load();const t=setInterval(()=>{if(!document.hidden)void load()},15000);return()=>clearInterval(t)},[load]);
 if(!list.length)return null;
 return <section className="cash-bills"><h3 className="card-title">Open rekeningen</h3><p>Gezamenlijke rekeningen en groepscodes die nog betaald moeten worden. Tik op een rekening om af te rekenen.</p>
  <div className="cash-order-list">{list.map(b=><button key={b.id} onClick={()=>setOpen(b.id)}><b>{b.name}</b><span>{b.holderName}{b.holderPhone?' · '+b.holderPhone:''}</span>
   <div className={'kiosk-bill-bar'+(b.full?' full':b.near?' near':'')}><span style={{width:b.percent+'%'}}/></div>
   <small>{b.orders} {b.orders===1?'bestelling':'bestellingen'} · {b.status==='actief'?'open':'wordt afgerekend'}</small><strong>{money(b.spentCents)}</strong>
   {/* De gast koos „Contant betalen” (wens eigenaar 11 november 2026): opvallend in de lijst, met het bedrag dat hij geeft. */}
   {!!b.cashCents&&<small className="cash-open-label">💶 Wil contant betalen · {money(b.cashCents)}</small>}</button>)}</div>
  {open&&<BillDrawer id={open} onClose={()=>{setOpen(null);void load()}}/>}
 </section>;
}

function BillDrawer({id,onClose}:{id:string;onClose:()=>void}){
 const [d,setD]=useState<Detail|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[count,setCount]=useState(2),[qr,setQr]=useState<{share:string;url:string}|null>(null);
 const load=useCallback(async()=>{try{setD(await call<Detail>('/api/rekeningen?id='+encodeURIComponent(id)))}catch(e){setError((e as Error).message)}},[id]);
 useEffect(()=>{void load()},[load]);
 // Tijdens een QR-betaling elke 3 seconden kijken (de backoffice vraagt de stand zelf op bij Mollie).
 const qrRef=useRef(qr);qrRef.current=qr;
 useEffect(()=>{if(!qr)return;const t=setInterval(async()=>{const x=await call<Detail>('/api/rekeningen?id='+encodeURIComponent(id)).catch(()=>null);if(x){setD(x);if(x.shares.find(s=>s.id===qrRef.current?.share)?.status==='betaald')setQr(null)}},3000);return()=>clearInterval(t)},[qr,id]);
 async function act(body:unknown){setBusy(true);setError('');try{const x=await call<Detail&{checkoutUrl?:string;paid?:boolean}>('/api/rekeningen',body);if('checkoutUrl' in x&&x.checkoutUrl)setQr({share:(body as {shareId:string}).shareId,url:x.checkoutUrl});else if(x.shares)setD(x);else await load()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <div className="overlay"><section className="drawer cash-pay" role="dialog" aria-modal="true" aria-label="Rekening afrekenen"><div className="drawer-top"><h2>{d?d.name:'Rekening'}</h2><button className="close" onClick={onClose} aria-label="Sluiten">×</button></div>
  {error&&<div role="alert" className="message">{error}</div>}
  {!d?<p>Laden…</p>:<>
   <p>{d.holder.name}{d.holder.phone?' · '+d.holder.phone:''}{d.holder.email?' · '+d.holder.email:''} · factuur {d.invoice.number}</p>
   <div className="cash-total"><span>{d.invoice.paid?'Voldaan':'Te betalen'}</span><strong>{money(d.invoice.paid?d.invoice.totalCents:d.invoice.openCents)}</strong></div>
   <p className="small">Besteld door: {d.invoice.people.map(p=>p.name).join(', ')}</p>
   {d.invoice.paid?<div className="cash-paid"><p className="cash-paid-mark">✓ Voldaan</p><button className="btn" onClick={onClose}>Klaar</button></div>
   :!d.shares.length?<div className="cash-pay-step"><button className="btn" disabled={busy||d.fill.spentCents<=0} onClick={()=>act({id,count:1})}>In één keer afrekenen</button>
     <label>Splitsen: door hoeveel personen?<input type="number" min={2} max={20} value={count} onChange={e=>setCount(Number(e.target.value))}/></label>
     <button className="btn secondary" disabled={busy||d.fill.spentCents<=0} onClick={()=>act({id,count})}>Splitsen in {count} delen</button>
     <p className="tiny">Daarna kan er niets meer op de rekening.</p></div>
   :<div className="cash-pay-step">{d.shares.map(s=><div key={s.id} className="cash-cart-line"><div><b>{s.payer?s.payer+(s.holder?' (rekeninghouder)':''):s.count>1?`Deel ${s.position} van ${s.count}`:'Hele rekening'}</b><small>{s.status==='betaald'?'✓ Betaald'+(s.method?' · '+(METHOD[s.method]||s.method):''):s.method==='contant-gevraagd'?'💶 Wil contant betalen':s.busy?'Betaalverzoek loopt…':'Open'}</small></div>
     <div className="cash-line-side"><b>{money(s.status!=='betaald'&&s.paidCents!=null?s.paidCents:s.amountCents)}</b>{s.status!=='betaald'&&<div className="cash-stepper"><button type="button" disabled={busy} onClick={()=>act({shareId:s.id,method:'contant'})}>💶</button><button type="button" disabled={busy} onClick={()=>act({shareId:s.id,method:'pin'})}>💳</button><button type="button" disabled={busy} onClick={()=>act({shareId:s.id,method:'qr'})}>📱</button></div>}</div></div>)}
     <p className="tiny">💶 contant ontvangen · 💳 pin gelukt (losse pinautomaat) · 📱 betaalverzoek: de gast scant de QR-code of krijgt de link en betaalt in de eigen bank-app.</p>
     {qr&&<div className="cash-pay-step"><img className="cash-qr" src={'/api/public/qr?url='+encodeURIComponent(qr.url)} alt="QR-code om te betalen" width={240} height={240}/><p>Laat de gast scannen en betalen. Het scherm ziet vanzelf dat er betaald is.</p></div>}
     {d.shares.every(s=>s.status==='open'&&!s.busy)&&<button className="btn secondary" disabled={busy} onClick={()=>act({id,count:d.shares.length===1?2:1})}>{d.shares.length===1?'Toch splitsen in 2':'Toch in één keer'}</button>}
    </div>}
  </>}
 </section></div>;
}

'use client';
// Tellen met foto's (wens eigenaar 17 november 2026: „met het voorraad opnemen foto's maken van de producten die er zijn, en dan een
// plusje en een minnetje of het aantal ingeven … voor de eerste keer als er een nieuw product bij moet”). Werkplek Voorraad → Voorraad
// tellen. Elke foto gaat naar /api/werkplek/tel-foto; wat herkend is komt bovenaan met − en +, in dezelfde telling als de lijst eronder.
// Een product dat nog niet in de voorraad staat, voeg je met één tik toe (actie 'ingredient'); de eerste telling is de beginvoorraad.
import {useRef,useState} from 'react';
import {LabelCamera} from '../label-camera';
import {shrinkPhoto} from '../label-photo';
import type {SeenItem} from '@/lib/count-photo-core';

type Unit='kg'|'l'|'st';
type Item={id:string;name:string;unit:Unit;stock:number;known:boolean};
type Seen=SeenItem&{key:string;adding?:boolean;error?:string};
const UNIT={st:'stuks',kg:'kg',l:'liter'} as const;
const fmt=(n:number)=>String(Math.round(n*1000)/1000).replace('.',',');

export function CountPhotos({list,qty,setQty,reload}:{list:Item[];qty:(id:string)=>string;setQty:(id:string,v:string)=>void;reload:()=>Promise<void>}){
 const [cam,setCam]=useState(false),[shots,setShots]=useState(0),[pending,setPending]=useState(0),[last,setLast]=useState('');
 const [seen,setSeen]=useState<Seen[]>([]),[error,setError]=useState('');const queue=useRef<Promise<void>>(Promise.resolve());const n=useRef(0);
 const byId=new Map(list.map(i=>[i.id,i]));
 // Nieuw gefotografeerd: bovenaan, en meteen het aantal dat Claude zag (of de oude voorraad) als startpunt voor − en +.
 function add(items:SeenItem[]){
  setSeen(old=>{let next=[...old];for(const it of items){const key=it.ingredientId||'new:'+it.name.toLowerCase();if(next.some(x=>x.key===key))continue;next=[{...it,key},...next]}return next});
  for(const it of items)if(it.ingredientId&&!qty(it.ingredientId).trim()){const i=byId.get(it.ingredientId);const start=it.seen??(i?.known?i.stock:null);if(start!==null)setQty(it.ingredientId,fmt(start))}
 }
 async function read(file:Blob):Promise<string>{
  try{const image=await shrinkPhoto(file);if(!image)throw Error('Deze foto kunnen we niet gebruiken.');
   const r=await fetch('/api/werkplek/tel-foto',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image})});
   const d=await r.json().catch(()=>({})) as {ok?:boolean;error?:string;items?:SeenItem[]};
   if(!r.ok||!d.ok||!d.items)throw Error(d.error||'De foto kon niet worden gelezen.');
   add(d.items);setError('');return d.items.map(i=>(i.ingredientId?'✓ ':'＋ ')+i.name).join(', ')+'. ';
  }catch(e){const m=e instanceof Error?e.message:'De foto kon niet worden gelezen.';setError(m);return m+' '}
 }
 const shot=(f:Blob)=>{setShots(x=>x+1);setPending(x=>x+1);queue.current=queue.current.then(()=>read(f)).then(t=>setLast(t)).finally(()=>setPending(x=>x-1))};
 const step=(id:string,d:number)=>{const cur=Number((qty(id)||'0').replace(',','.'));const v=Math.max(0,Math.round(((Number.isFinite(cur)?cur:0)+d)*1000)/1000);setQty(id,fmt(v))};
 async function create(s:Seen){
  setSeen(l=>l.map(x=>x.key===s.key?{...x,adding:true,error:''}:x));
  try{
   const v=await fetch('/api/operations?magazijn=1',{cache:'no-store'}).then(r=>r.json()).catch(()=>({})) as {version?:number};
   const id=crypto.randomUUID();
   const ingredient={id,name:s.name.trim(),unit:s.unit,supplier:'',article:'',stock:0,known:false,countedAt:'',pack:1,min:0,leadDays:1,shelfDays:0,allergens:[],checked:false,
    notes:'Toegevoegd bij het tellen met een foto (werkplek Voorraad). Allergenen, leverancier en prijs nog aanvullen.',origin:'inkoop',ownCents:null};
   const r=await fetch('/api/operations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'ingredient',requestId:crypto.randomUUID(),version:v.version??0,ingredient})});
   const d=await r.json().catch(()=>({})) as {ok?:boolean;error?:string};if(!r.ok||!d.ok)throw Error(d.error||'Toevoegen lukte niet.');
   await reload();
   setSeen(l=>l.map(x=>x.key===s.key?{...x,ingredientId:id,adding:false}:x));setQty(id,fmt(s.seen??1));
  }catch(e){setSeen(l=>l.map(x=>x.key===s.key?{...x,adding:false,error:e instanceof Error?e.message:'Toevoegen lukte niet.'}:x))}
 }
 return <div className="count-photos">
  <div className="delivery-actions">
   <button type="button" className="kiosk-btn" onClick={()=>{setShots(0);setLast('');setCam(true)}}>📸 Tellen met foto’s</button>
   {seen.length>0&&<button type="button" className="kiosk-btn soft" onClick={()=>setSeen([])}>Foto-lijst leegmaken</button>}
  </div>
  <p className="kiosk-sub">Fotografeer wat er staat: we zoeken het product op en zetten het bovenaan. Met − en + zet je het aantal goed. Nieuw product? Eén tik op Toevoegen.</p>
  {cam&&<LabelCamera count={shots} onShot={shot} onClose={()=>setCam(false)}
   status={!shots?'Richt op het product (etiket naar voren) en tik op Foto maken.':`${last}${shots} ${shots===1?'foto':"foto's"}${pending?` · ${pending} bezig`:''}. Volgend product, of tik op Klaar.`}/>}
  {error&&!cam&&<p className="kiosk-error" role="alert">{error}</p>}
  {seen.length>0&&<ul className="count-seen">{seen.map(s=>{const i=s.ingredientId?byId.get(s.ingredientId):undefined;
   return <li key={s.key} className={'count-seen-item'+(i?'':' nieuw')}>
    <div><b>{i?.name||s.name}</b><small>{i?(i.known?`Oude voorraad ${fmt(i.stock)} ${UNIT[i.unit]}`:'Nog niet geteld: dit wordt de beginvoorraad'):'Staat nog niet in de voorraad'}{s.seen!==null?` · op de foto: ${fmt(s.seen)}`:''}</small>
     {s.error&&<small className="delivery-error" role="alert">{s.error}</small>}</div>
    {i?<span className="count-step">
      <button type="button" className="kiosk-btn soft" aria-label={`Eén minder ${i.name}`} onClick={()=>step(i.id,-1)}>−</button>
      <input className="kiosk-input" inputMode="decimal" aria-label={`Aantal ${i.name}`} value={qty(i.id)} placeholder="0" onChange={e=>setQty(i.id,e.target.value)}/>
      <button type="button" className="kiosk-btn soft" aria-label={`Eén meer ${i.name}`} onClick={()=>step(i.id,1)}>+</button>
      <small>{UNIT[i.unit]}</small></span>
    :<span className="count-step">
      <select className="kiosk-input" aria-label={`Eenheid ${s.name}`} value={s.unit} onChange={e=>setSeen(l=>l.map(x=>x.key===s.key?{...x,unit:e.target.value as Unit}:x))}><option value="st">stuks</option><option value="kg">kg</option><option value="l">liter</option></select>
      <button type="button" className="kiosk-btn" disabled={s.adding} onClick={()=>void create(s)}>{s.adding?'Bezig…':'＋ Toevoegen'}</button></span>}
   </li>})}</ul>}
 </div>;
}

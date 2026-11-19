'use client';
// Boodschappenlijst onder het weekmenu (wens eigenaar 9 november 2026): wat er voor deze week gekocht moet worden, met een
// duidelijke vink „besteld”. Gemaakt voor de telefoon in de winkel (grote tikvlakken). Rekenwerk: lib/boodschappen.ts.
import {useCallback,useEffect,useState} from 'react';
import Link from 'next/link';
import {makeId} from '@/lib/id.mjs';
import {useDictation} from '../spraak';
import {spokenItem} from '@/lib/spraak-core';

type Line={ingredientId:string;name:string;unit:string;supplier:string;quantity:number|null;packs:number|null;pack:number;needed:number;stock:number|null;estimatedCents:number|null;counted:boolean;checked:boolean;received:boolean;reason:'menu'|'voorraad'};
type Item={id:string;name:string;amount:string;checked:boolean;checkedBy:string;createdBy:string};
type List={week:string;menu:{status:string;items:number}|null;lines:Line[];items:Item[];missingPortions:string[];blockers:string[];totalCents:number|null};
const num=(n:number)=>new Intl.NumberFormat('nl-NL',{maximumFractionDigits:2}).format(n);
const unitName:Record<string,string>={kg:'kg',l:'liter',st:'stuks'};
const euro=(c:number)=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(c/100);

export function Boodschappen({week,refresh}:{week:string;refresh:number}){
 const [list,setList]=useState<List|null>(null),[busy,setBusy]=useState(''),[problem,setProblem]=useState(''),[name,setName]=useState(''),[amount,setAmount]=useState('');
 const load=useCallback(async()=>{try{const r=await fetch('/api/assistent/boodschappen?week='+week,{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.error);setList(d);setProblem('')}catch(e){setProblem((e as Error).message)}},[week]);
 useEffect(()=>{void load()},[load,refresh]);
 async function toggle(l:Line){
  if(busy)return;setBusy(l.ingredientId);setProblem('');
  // Meteen tonen; bij een fout zet de lijst het terug.
  setList(v=>v&&{...v,lines:v.lines.map(x=>x.ingredientId===l.ingredientId?{...x,checked:!l.checked}:x)});
  try{const r=await fetch('/api/assistent/boodschappen',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({week,ingredientId:l.ingredientId,checked:!l.checked,requestId:makeId()})}),d=await r.json();if(!r.ok)throw Error(d.error)}
  catch(e){setProblem((e as Error).message)}finally{setBusy('');void load()}
 }
 // Inspreken (wens eigenaar 9 november 2026): „zet wc-papier op de lijst” → „wc-papier” in het veld; daarna Zet erop.
 const dictation=useDictation(t=>setName(spokenItem(t)));
 async function post(body:Record<string,unknown>,key:string){
  if(busy)return false;setBusy(key);setProblem('');
  try{const r=await fetch('/api/assistent/boodschappen',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({week,...body})}),d=await r.json();if(!r.ok)throw Error(d.error);return true}
  catch(e){setProblem((e as Error).message);return false}finally{setBusy('');void load()}
 }
 function toggleItem(i:Item){setList(v=>v&&{...v,items:v.items.map(x=>x.id===i.id?{...x,checked:!i.checked}:x)});void post({action:'item',id:i.id,checked:!i.checked},i.id)}
 async function add(e:React.FormEvent){e.preventDefault();if(!name.trim())return;if(await post({action:'toevoegen',name,amount},'nieuw')){setName('');setAmount('')}}
 if(!list)return <div className="card"><h3 className="card-title">Boodschappenlijst</h3><p className="small">{problem||'Laden…'}</p></div>;
 const done=list.lines.filter(l=>l.checked).length+list.items.filter(i=>i.checked).length,total=list.lines.length+list.items.length,groups=[...new Set(list.lines.map(l=>l.supplier||'Overig'))];
 return <section className="card shop" aria-label="Boodschappenlijst">
  <div className="card-head"><h3 className="card-title">Boodschappenlijst</h3>{total>0&&<span className={'shop-count'+(done===total?' all':'')}>{done} van {total} besteld</span>}</div>
  <>
   <p className="small">{list.menu?<>Uit het {list.menu.status==='bevestigd'?'bevestigde':'concept-'}weekmenu, min de voorraad en wat al onderweg is, </>:<>Nog geen weekmenu. Wel op de lijst: </>}plus wat na een telling onder het minimum zit en wat jullie zelf toevoegen. Tik op een regel als het besteld of gekocht is.</p>
   {problem&&<p className="small shop-error" role="alert">{problem}</p>}
   {!total&&!list.blockers.length&&<p className="shop-empty">{list.menu?'Alles is op voorraad voor dit menu. 🎉':'Nog niets op de lijst.'}</p>}
   {groups.map(g=><div key={g} className="shop-group"><h4>{g}</h4><ul>{list.lines.filter(l=>(l.supplier||'Overig')===g).map(l=><li key={l.ingredientId}>
    <button className={'shop-line'+(l.checked?' checked':'')} aria-pressed={l.checked} disabled={!!busy||l.received||(!l.checked&&l.quantity===null)} onClick={()=>toggle(l)}>
     <span className="shop-tick" aria-hidden="true">{l.checked?'✓':''}</span>
     <span className="shop-what"><strong>{l.name}</strong>
      <span className="small">{l.reason==='voorraad'?'Onder het minimum · ':''}{l.quantity===null?'Voorraad nog niet geteld: tel eerst in Inkoop & voorraad':`${l.packs&&l.pack!==1?l.packs+' × '+num(l.pack)+' '+unitName[l.unit]+' = ':''}${num(l.quantity)} ${unitName[l.unit]}`}{l.estimatedCents!==null&&l.quantity!==null?' · ± '+euro(l.estimatedCents):''}</span></span>
     <span className="shop-state">{l.received?'Ontvangen':l.checked?'Besteld':''}</span>
    </button></li>)}</ul></div>)}
   {list.items.length>0&&<div className="shop-group"><h4>Zelf toegevoegd</h4><ul>{list.items.map(i=><li key={i.id} className="shop-own">
    <button className={'shop-line'+(i.checked?' checked':'')} aria-pressed={i.checked} disabled={!!busy} onClick={()=>toggleItem(i)}>
     <span className="shop-tick" aria-hidden="true">{i.checked?'✓':''}</span>
     <span className="shop-what"><strong>{i.name}</strong><span className="small">{[i.amount,i.createdBy&&'door '+i.createdBy].filter(Boolean).join(' · ')}</span></span>
     <span className="shop-state">{i.checked?'Besteld':''}</span>
    </button>
    <button className="shop-remove" aria-label={'Haal '+i.name+' van de lijst'} disabled={!!busy} onClick={()=>{if(confirm(i.name+' van de lijst halen?'))void post({action:'weghalen',id:i.id},i.id)}}>×</button>
   </li>)}</ul></div>}
   <form className="shop-add" onSubmit={add}><label className="sr-only" htmlFor="shop-name">Wat moet er nog bij?</label>
    <input id="shop-name" value={name} maxLength={120} placeholder="+ Toevoegen, bijv. servetten" onChange={e=>setName(e.target.value)}/>
    {dictation.supported&&<button type="button" className={'wa-round shop-mic'+(dictation.listening?' rec':'')} aria-pressed={dictation.listening} aria-label={dictation.listening?'Stop met inspreken':'Inspreken wat er op de lijst moet'} onClick={()=>dictation.listening?dictation.stop():dictation.start('')}>{dictation.listening?'■':'🎤'}</button>}
    <input aria-label="Hoeveelheid" value={amount} maxLength={60} placeholder="Hoeveel" onChange={e=>setAmount(e.target.value)}/>
    <button className="btn" disabled={!!busy||!name.trim()}>Zet erop</button></form>
   {dictation.listening&&<p className="wa-hint shop-hint" role="status">● Luistert… zeg bijvoorbeeld „wc-papier”. Tik op ■ en dan op Zet erop.</p>}{dictation.problem&&<p className="small shop-error" role="alert">{dictation.problem}</p>}
   <p className="small">Tip: of zeg in het gesprek met de assistent „zet wc-papier op de lijst”.</p>
   {list.missingPortions.length>0&&<p className="small">Zonder aantal porties, dus niet meegeteld: {list.missingPortions.join(', ')}. Geef de porties door aan de assistent.</p>}
   {list.blockers.map((b,i)=><p className="small shop-error" key={i}>{b}</p>)}
   {list.totalCents!==null&&list.lines.length>0&&<p className="small">Geschat totaal: <strong>{euro(list.totalCents)}</strong> (laatste factuurprijzen).</p>}
   <p className="small">Een vinkje staat ook bij <Link href="/inkoop">Inkoop &amp; voorraad</Link> als „onderweg”. Er gaat niets naar een leverancier.</p>
  </>
 </section>;
}

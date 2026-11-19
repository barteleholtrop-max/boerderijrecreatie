'use client';
import Link from 'next/link';
import {useCallback,useEffect,useState} from 'react';
import {makeId} from '@/lib/id.mjs';
import {PageHead,Pill,Notice} from '../ui';
import {useBackoffice,changed} from '../use-backoffice';
type Item={id:string,kind:string,title:string,description:string,href:string};
type Proposal={id:string,kind:string,title:string,summary:string,status:string,version:number,createdBy:string,created:string,decidedBy:string|null,decidedAt:string|null,decisionNote:string,canApprove:boolean};
const kindLabel:Record<string,string>={weekmenu:'Weekmenu',bestelling:'Bestelling',marketing:'Marketing'};
const when=(iso:string|null)=>iso?new Intl.DateTimeFormat('nl-NL',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Amsterdam'}).format(new Date(iso)):'';
export default function Goedkeuringen(){
 const {products,ops,loading,error}=useBackoffice({products:true,operations:true}),[tab,setTab]=useState('alle');
 const [proposals,setProposals]=useState<{open:Proposal[],recent:Proposal[]}>({open:[],recent:[]}),[msg,setMsg]=useState(''),[busy,setBusy]=useState('');
 const load=useCallback(async()=>{try{const r=await fetch('/api/voorstellen',{cache:'no-store'});if(!r.ok)throw Error();setProposals(await r.json())}catch{setMsg('AI-voorstellen konden niet worden geladen.')}},[]);
 useEffect(()=>{void load()},[load]);
 async function decide(p:Proposal,action:'goedkeuren'|'afwijzen'){
  let note='';
  if(action==='afwijzen'){const n=window.prompt('Waarom wijs je dit voorstel af? De assistent gebruikt dit om het beter te doen.');if(n===null)return;note=n}
  setBusy(p.id);setMsg('');
  try{const r=await fetch('/api/voorstellen',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:p.id,action,version:p.version,requestId:makeId(),note})});const b=await r.json().catch(()=>({}));if(!r.ok)setMsg(b.error||'Beslissen mislukt.');else setMsg(action==='goedkeuren'?'Goedgekeurd.':'Afgewezen.');}
  catch{setMsg('Geen verbinding. Er is niets gewijzigd; probeer opnieuw.')}
  finally{setBusy('');void load()}
 }
 const items:Item[]=[
  ...products.filter(changed).map(r=>({id:'p'+r.id,kind:'Product',title:r.draft.name,description:'Opgeslagen wijziging staat nog niet in de gastweergave. Publiceer bewust opnieuw.',href:'/producten?id='+r.id})),
  ...(ops?.state.invoices||[]).filter(i=>!i.reviewed).map(i=>({id:'i'+i.id,kind:'Inkoop',title:`Factuur ${i.supplier} ${i.number}`,description:`${i.lines.length} regels · herkenning controleren en koppelen aan ingrediënten`,href:'/inkoop?tab=facturen'})),
  ...(ops?.state.recipes||[]).filter(r=>!r.reviewed).map(r=>({id:'r'+r.productId,kind:'Recept',title:r.name,description:'Recept en kostprijs nog niet beoordeeld',href:'/inkoop?product='+r.productId})),
 ];
 const shown=tab==='AI'?[]:items.filter(i=>tab==='alle'||i.kind===tab);
 const shownProposals=tab==='alle'||tab==='AI'?proposals.open:[];
 return <div data-bb-view="approvals"><PageHead eyebrow="BESLISSINGEN" title="Wacht op jouw akkoord" sub="Voorstellen en wijzigingen worden nooit stilzwijgend uitgevoerd."/>
  {error&&<div className="message" role="status">{error}</div>}
  {msg&&<div className="message" role="status">{msg}</div>}
  <div className="tabs" role="group" aria-label="Soort">{[['alle','Alle'],['AI','AI-voorstellen'],['Product','Producten'],['Inkoop','Inkoop'],['Recept','Recepten']].map(([id,label])=><button key={id} className={'tab'+(tab===id?' active':'')} onClick={()=>setTab(id)}>{label} {id!=='alle'&&<Pill>{id==='AI'?proposals.open.length:items.filter(i=>i.kind===id).length}</Pill>}</button>)}</div>
  {loading?<div className="card empty">Laden…</div>:<div className="grid two">
   {shownProposals.map(p=><div className="card" key={'v'+p.id} data-proposal={p.id}><div className="row between" style={{marginBottom:13}}><Pill color="purple">{kindLabel[p.kind]||p.kind}</Pill><Pill color="orange">Concept · versie {p.version}</Pill></div><h3>{p.title}</h3><p className="small">{p.summary}</p><p className="small">Voorgesteld door {p.createdBy} · {when(p.created)}</p>
    <div className="action-row"><button className="btn sm" disabled={busy===p.id||!p.canApprove} title={p.canApprove?'':'Uitvoeren volgt in een volgende fase'} onClick={()=>decide(p,'goedkeuren')}>Goedkeuren</button><button className="btn secondary sm" disabled={busy===p.id} onClick={()=>decide(p,'afwijzen')}>Afwijzen</button></div></div>)}
   {shown.map(a=><div className="card" key={a.id}><div className="row between" style={{marginBottom:13}}><Pill color="blue">{a.kind}</Pill><Pill color="orange">Te beoordelen</Pill></div><h3>{a.title}</h3><p className="small">{a.description}</p><div className="action-row">{<Link className="btn sm" href={a.href}>Onderdeel openen</Link>}</div></div>)}
   {!shown.length&&!shownProposals.length&&<div className="card empty" style={{gridColumn:'1/-1'}}>Alles is beoordeeld ✓</div>}</div>}
  {proposals.recent.length>0&&<div className="card section-gap"><div className="card-head"><h3 className="card-title">Recent beslist</h3></div>{proposals.recent.map(p=><div className="task" key={'d'+p.id}><div className="task-body"><strong>{p.title} · {p.status}</strong><span>{p.decidedBy} · {when(p.decidedAt)}{p.decisionNote?' · '+p.decisionNote:''}</span></div></div>)}</div>}
  <div className="section-gap"><Notice kind="info" title="Weekassistent en AI-voorstellen">Voorstellen van de Weekassistent (weekmenu, conceptbestelling, marketingopdracht) verschijnen hier. Ze worden pas uitgevoerd na jouw akkoord, en alleen voor soorten die al gebouwd zijn.</Notice></div>
 </div>
}

'use client';
import Link from 'next/link';
import {useCallback,useEffect,useState} from 'react';
import {makeId} from '@/lib/id.mjs';
import {PageHead,Pill,Notice} from '../ui';
import {useBackoffice,changed} from '../use-backoffice';
import {LedenEvenementen,useLedenEvenementen} from './ledenevenementen';
type Item={id:string,kind:string,title:string,description:string,href:string,request?:Req};
// Leden-aanvragen (wens eigenaar 15 november 2026): nieuw rekeningnummer en productmeldingen van de deelnemerspagina, hier te beslissen.
type Req={id:string;participantId:string;participantName:string;kind:string;holder:string;ibanEnd:string;created:string;productId?:string|null;productName?:string|null;priceCents?:number|null};
const euro=(c:number)=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(c/100);
function reqText(r:Req){const p=r.productName||'een product';switch(r.kind){
 case 'iban':return {title:`${r.participantName}: nieuw rekeningnummer`,description:`Uitbetalen op •••• ${r.ibanEnd} (${r.holder}) · ${when(r.created)}. Controleer het nummer eerst even met het lid zelf, bijvoorbeeld telefonisch.`,href:'/leden'};
 case 'nieuw-product':return {title:`${r.participantName}: nieuw product ${p}`,description:`${r.priceCents!=null?euro(r.priceCents)+' · ':''}staat al in de winkel. Pas het aan als dat nodig is.`,href:r.productId?'/producten?id='+encodeURIComponent(r.productId):'/financien/weekafsluiting'};
 case 'product-gewijzigd':return {title:`${r.participantName}: ${p} aangepast`,description:`${r.priceCents!=null?euro(r.priceCents)+' · ':''}de wijziging staat al in de winkel. Pas het aan als dat nodig is.`,href:r.productId?'/producten?id='+encodeURIComponent(r.productId):'/financien/weekafsluiting'};
 case 'product-weg':return {title:`${r.participantName}: ${p} verwijderd`,description:'Levert het niet meer. Het staat in de prullenbak bij Gerechten & prijzen; daar kun je het terugzetten.',href:'/producten'};
 case 'oude-voorraad':return {title:`${r.participantName}: oude voorraad ${p}`,description:r.holder==='ophalen'?'Komt het ophalen; zet het apart. De oude voorraad is al afgeboekt.':'Mag weg. De oude voorraad is al afgeboekt.',href:'/financien/weekafsluiting'};
 default:return {title:`${r.participantName}: melding`,description:when(r.created),href:'/financien/weekafsluiting'}}}
type Proposal={id:string,kind:string,title:string,summary:string,status:string,version:number,createdBy:string,created:string,decidedBy:string|null,decidedAt:string|null,decisionNote:string,canApprove:boolean};
const kindLabel:Record<string,string>={weekmenu:'Weekmenu',bestelling:'Bestelling',marketing:'Marketing'};
const when=(iso:string|null)=>iso?new Intl.DateTimeFormat('nl-NL',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Amsterdam'}).format(new Date(iso)):'';
export default function Goedkeuringen(){
 const {products,ops,loading,error}=useBackoffice({products:true,operations:true}),[tab,setTab]=useState('alle');
 const leden=useLedenEvenementen();
 // Bonvraag (wens eigenaar 9 november 2026): verkopen van nieuwe zelfkassa-producten waarvan nog niet is gezegd bij wie ze horen.
 const [bon,setBon]=useState(0);
 useEffect(()=>{fetch('/api/cooperatie?bonvragen=alle',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>setBon(d?.questions?.length||0)).catch(()=>{})},[]); // Evenementen van leden (besluit eigenaar 8 november 2026)
 // Geld (nieuwe indeling, 16 november 2026): uitbetalingen die op akkoord wachten, en een afgelopen winkelweek die het werkproces
 // niet zelf kon goedkeuren (bijvoorbeeld door een correctie). Alleen wat de eigenaar mag zien; voor anderen blijft dit leeg.
 const [geld,setGeld]=useState<Item[]>([]);
 useEffect(()=>{let stop=false;(async()=>{const out:Item[]=[];
  try{const r=await fetch('/api/bank',{cache:'no-store'});if(r.ok){const d=await r.json() as {payouts?:{id:string;name:string;amountCents:number;status:string}[]};
   for(const p of (d.payouts||[]).filter(p=>p.status==='aangevraagd'))out.push({id:'u'+p.id,kind:'Geld',title:`Uitbetaling ${p.name}: € ${(p.amountCents/100).toFixed(2).replace('.',',')}`,description:'Wacht op jouw akkoord in Bank & uitbetalen; daarna zet bunq de betaling klaar.',href:'/financien/bank'})}}catch{}
  try{const now=new Date(),day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(now),d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7)-7);const last=d.toISOString().slice(0,10);
   const r=await fetch('/api/cooperatie?week='+last,{cache:'no-store'});if(r.ok){const v=await r.json() as {status?:string;finished?:boolean;label?:string};
    if(v.finished&&v.status==='open')out.push({id:'w'+last,kind:'Geld',title:`Winkelweek ${v.label||last} wacht op goedkeuring`,description:'Het werkproces kon deze week niet zelf goedkeuren (bijvoorbeeld een bonvraag of correctie). Kijk bij Weekafsluitingen.',href:'/financien/weekafsluiting'})}}catch{}
  if(!stop)setGeld(out)})();return()=>{stop=true}},[]);
 const [reqs,setReqs]=useState<Req[]>([]);
 const loadReqs=useCallback(async()=>{try{const r=await fetch('/api/cooperatie?meldingen=1',{cache:'no-store'});if(r.ok)setReqs(((await r.json()) as {requests?:Req[]}).requests||[])}catch{}},[]);
 useEffect(()=>{void loadReqs()},[loadReqs]);
 async function decideReq(r:Req,approve:boolean){setBusy(r.id);setMsg('');
  try{const x=await fetch('/api/cooperatie',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'verzoek',id:r.id,approve})});const b=await x.json().catch(()=>({}));if(!x.ok)setMsg(b.error||'Beslissen mislukt.');else setMsg(r.kind!=='iban'?'Melding weggehaald.':approve?`Nieuw rekeningnummer van ${r.participantName} overgenomen.`:`Verzoek afgewezen; het oude rekeningnummer van ${r.participantName} blijft.`)}
  catch{setMsg('Geen verbinding. Er is niets gewijzigd; probeer opnieuw.')}
  finally{setBusy('');void loadReqs()}}
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
  ...reqs.map(r=>({id:'q'+r.id,kind:'Leden',...reqText(r),request:r})),
  ...products.filter(changed).map(r=>({id:'p'+r.id,kind:'Product',title:r.draft.name,description:'Opgeslagen wijziging staat nog niet in de gastweergave. Publiceer bewust opnieuw.',href:'/producten?id='+r.id})),
  ...(ops?.state.invoices||[]).filter(i=>!i.reviewed).map(i=>({id:'i'+i.id,kind:'Inkoop',title:`Factuur ${i.supplier} ${i.number}`,description:`${i.lines.length} regels · herkenning controleren en koppelen aan ingrediënten`,href:'/inkoop?tab=facturen'})),
  ...(bon?[{id:'bonvraag',kind:'Winkel',title:`Bij wie hoort de bon? (${bon})`,description:`${bon===1?'1 verkoop':bon+' verkopen'} van een nieuw product via de zelfkassa. Zeg bij wie het hoort vóór de weekafsluiting.`,href:'/financien/weekafsluiting'}]:[]),
  ...geld,
  ...(ops?.state.recipes||[]).filter(r=>!r.reviewed).map(r=>({id:'r'+r.productId,kind:'Recept',title:r.name,description:'Recept en kostprijs nog niet beoordeeld',href:'/inkoop?product='+r.productId})),
 ];
 const shown=tab==='AI'?[]:items.filter(i=>tab==='alle'||i.kind===tab);
 const shownProposals=tab==='alle'||tab==='AI'?proposals.open:[];
 return <div data-bb-view="approvals"><PageHead eyebrow="BESLISSINGEN" title="Wacht op jouw akkoord" sub="Voorstellen en wijzigingen worden nooit stilzwijgend uitgevoerd."/>
  {error&&<div className="message" role="status">{error}</div>}
  {msg&&<div className="message" role="status">{msg}</div>}
  <div className="tabs" role="group" aria-label="Soort">{[['alle','Alle'],['AI','AI-voorstellen'],['Leden','Leden'],['Product','Producten'],['Winkel','Winkel'],['Geld','Geld'],['Inkoop','Inkoop'],['Recept','Recepten']].map(([id,label])=><button key={id} className={'tab'+(tab===id?' active':'')} onClick={()=>setTab(id)}>{label} {id!=='alle'&&<Pill>{id==='AI'?proposals.open.length:items.filter(i=>i.kind===id).length}</Pill>}</button>)}</div>
  {loading?<div className="card empty">Laden…</div>:<div className="grid two">
   {shownProposals.map(p=><div className="card" key={'v'+p.id} data-proposal={p.id}><div className="row between" style={{marginBottom:13}}><Pill color="purple">{kindLabel[p.kind]||p.kind}</Pill><Pill color="orange">Concept · versie {p.version}</Pill></div><h3>{p.title}</h3><p className="small">{p.summary}</p><p className="small">Voorgesteld door {p.createdBy} · {when(p.created)}</p>
    <div className="action-row"><button className="btn sm" disabled={busy===p.id||!p.canApprove} title={p.canApprove?'':'Uitvoeren volgt in een volgende fase'} onClick={()=>decide(p,'goedkeuren')}>Goedkeuren</button><button className="btn secondary sm" disabled={busy===p.id} onClick={()=>decide(p,'afwijzen')}>Afwijzen</button></div></div>)}
   {shown.map(a=><div className="card" key={a.id}><div className="row between" style={{marginBottom:13}}><Pill color="blue">{a.kind}</Pill><Pill color="orange">Te beoordelen</Pill></div><h3>{a.title}</h3><p className="small">{a.description}</p><div className="action-row">{a.request?.kind==='iban'?<><button className="btn sm" disabled={busy===a.request.id} onClick={()=>decideReq(a.request!,true)}>Goedkeuren</button><button className="btn secondary sm" disabled={busy===a.request.id} onClick={()=>decideReq(a.request!,false)}>Afwijzen</button><Link className="btn secondary sm" href={a.href}>Ledenkaart</Link></>
    :a.request?<><Link className="btn sm" href={a.href}>Bekijken</Link><button className="btn secondary sm" disabled={busy===a.request.id} onClick={()=>decideReq(a.request!,true)}>Gezien</button></>
    :<Link className="btn sm" href={a.href}>Onderdeel openen</Link>}</div></div>)}
   {!shown.length&&!shownProposals.length&&<div className="card empty" style={{gridColumn:'1/-1'}}>Alles is beoordeeld ✓</div>}</div>}
  <LedenEvenementen data={leden.data} setData={leden.setData} error={leden.error}/>
  {proposals.recent.length>0&&<div className="card section-gap"><div className="card-head"><h3 className="card-title">Recent beslist</h3></div>{proposals.recent.map(p=><div className="task" key={'d'+p.id}><div className="task-body"><strong>{p.title} · {p.status}</strong><span>{p.decidedBy} · {when(p.decidedAt)}{p.decisionNote?' · '+p.decisionNote:''}</span></div></div>)}</div>}
  <div className="section-gap"><Notice kind="info" title="Weekassistent en AI-voorstellen">Voorstellen van de Weekassistent (weekmenu, conceptbestelling, marketingopdracht) verschijnen hier. Ze worden pas uitgevoerd na jouw akkoord, en alleen voor soorten die al gebouwd zijn.</Notice></div>
 </div>
}

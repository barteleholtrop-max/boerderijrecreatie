'use client';
// Privacy · alle sites (wens eigenaar 15 november 2026: „een algemene privacypagina in de backoffice; alle websites die we
// gaan bouwen moeten deze regels hier ophalen”). Eén privacybeleid voor elke site. De sites lezen het via de vaste poort
// /api/public/v1/privacy; geen site heeft een eigen kopie. Bedrijfsnaam, adres, KvK en e-mail komen uit Bedrijfsgegevens.
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {PageHead,Notice,SubTabs} from '../ui';
import {WEBSITE_TABS} from '../website/tabs';
import {fill,type Controller,type Policy,type Section} from '@/lib/privacy-core';
import {blocks} from '@/lib/text-blocks';

type Data={policy:Policy;version:number;updated:string;updatedBy:string;controller:Controller;placeholders:Record<string,string>;limits:{title:number;intro:number;heading:number;text:number;sections:number};defaultPolicy:Policy};
const date=(d:string)=>d?new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Amsterdam'}).format(new Date(d.length===10?d+'T12:00:00Z':d)):'';
const same=(a:Policy,b:Policy)=>JSON.stringify(a)===JSON.stringify(b);

function Text({text}:{text:string}){
 return <>{blocks(text).map((b,i)=>b.type==='kop'?<h4 key={i}>{b.text}</h4>:<p key={i} style={{whiteSpace:'pre-line'}}>{b.text}</p>)}</>;
}

export default function Privacy(){
 const [data,setData]=useState<Data|null>(null),[draft,setDraft]=useState<Policy|null>(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[preview,setPreview]=useState(false);
 async function load(){
  setError('');
  try{const r=await fetch('/api/privacy',{cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Laden mislukt.');setData(d);setDraft(d.policy)}
  catch(e){setError(e instanceof Error?e.message:'Laden mislukt.')}
 }
 useEffect(()=>{void load()},[]);
 const changed=useMemo(()=>!!data&&!!draft&&!same(data.policy,draft),[data,draft]);
 useEffect(()=>{if(!changed)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault()};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[changed]);
 const set=<K extends keyof Policy>(k:K,v:Policy[K])=>setDraft(d=>d&&{...d,[k]:v});
 const setSection=(i:number,v:Partial<Section>)=>setDraft(d=>d&&{...d,sections:d.sections.map((s,j)=>j===i?{...s,...v}:s)});
 const move=(i:number,to:number)=>setDraft(d=>{if(!d||to<0||to>=d.sections.length)return d;const s=[...d.sections];[s[i],s[to]]=[s[to],s[i]];return {...d,sections:s}});
 async function save(){
  if(!draft||!data)return;setBusy(true);setError('');setMessage('');
  try{
   const r=await fetch('/api/privacy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({policy:draft,version:data.version})});
   const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Opslaan mislukt.');
   setMessage('Opgeslagen. Alle sites tonen het nieuwe privacybeleid binnen twee minuten.');await load();
  }catch(e){setError(e instanceof Error?e.message:'Opslaan mislukt.')}finally{setBusy(false)}
 }
 const c=data?.controller,missing=c?[['naam',c.name],['adres',c.street&&c.city],['KvK-nummer',c.kvk],['e-mailadres',c.email]].filter(([,v])=>!v).map(([k])=>k):[];
 return <div data-bb-view="privacy">
  <PageHead eyebrow="WEBSITE" title="Privacy · alle sites" sub="Eén privacybeleid voor elke website. De sites halen het zelf hier op; nergens staat een eigen kopie."/><SubTabs current="/privacy" items={WEBSITE_TABS}/>
  <Notice kind="info" title="Hoe het werkt">Wat je hier opslaat, staat binnen twee minuten op <b>alle</b> sites, op hun pagina Privacy. Een nieuwe site haalt het op via <code>/api/public/v1/privacy</code> (zie <code>docs/PRIVACY-ALLE-SITES.md</code>). Bedrijfsnaam, adres, KvK en e-mail typ je niet in de tekst: schrijf <code>{'{bedrijfsnaam}'}</code>, <code>{'{adres}'}</code>, <code>{'{kvk}'}</code> of <code>{'{email}'}</code>; die komen uit <Link href="/bedrijfsgegevens">Bedrijfsgegevens</Link>. Een witregel begint een nieuwe alinea, een regel met <code>## </code> is een tussenkop.</Notice>
  {missing.length>0&&<Notice kind="warn" title="Bedrijfsgegevens niet compleet">Nog niet ingevuld: {missing.join(', ')}. Vul ze in bij <Link href="/bedrijfsgegevens">Bedrijfsgegevens</Link>, anders blijft die plek in het privacybeleid leeg.</Notice>}
  {error&&<p className="small" role="alert" style={{color:'var(--red)'}}>{error}</p>}
  {message&&<p className="small" role="status" style={{color:'var(--green)'}}>{message}</p>}
  {!data||!draft?(!error&&<p className="small">Laden…</p>):<>
   <section className="card section-gap">
    <div className="card-head"><h3 className="card-title">Privacybeleid</h3><span className="small">{data.version?`Versie ${data.version}, laatst opgeslagen ${date(data.updated)}${data.updatedBy?` door ${data.updatedBy}`:''}`:'Nog niet opgeslagen: dit is de beginwaarde, en die tonen de sites nu.'}</span></div>
    <div className="row" style={{gap:8,flexWrap:'wrap',marginBottom:12}}>
     <button type="button" className={'btn sm'+(preview?' secondary':'')} onClick={()=>setPreview(false)}>Bewerken</button>
     <button type="button" className={'btn sm'+(preview?'':' secondary')} onClick={()=>setPreview(true)}>Zo ziet de gast het</button>
    </div>
    {preview&&c?<article className="stack" style={{maxWidth:720}}>
     <h2>{fill(draft.title,c)}</h2><Text text={fill(draft.intro,c)}/>
     {draft.sections.map((s,i)=><div key={i}><h3>{fill(s.heading,c)}</h3><Text text={fill(s.text,c)}/></div>)}
     <p className="small">Geldt vanaf {date(draft.effectiveFrom)}.</p>
    </article>:<div className="stack">
     <div className="row" style={{gap:12,flexWrap:'wrap'}}>
      <div className="field" style={{flex:'2 1 260px'}}><label htmlFor="pv-title">Titel</label><input id="pv-title" value={draft.title} maxLength={data.limits.title} onChange={e=>set('title',e.target.value)}/></div>
      <div className="field" style={{flex:'1 1 160px'}}><label htmlFor="pv-date">Geldt vanaf</label><input id="pv-date" type="date" value={draft.effectiveFrom} onChange={e=>set('effectiveFrom',e.target.value)}/><span className="small">Pas aan als de regels echt veranderen.</span></div>
     </div>
     <div className="field"><label htmlFor="pv-intro">Inleiding</label><textarea id="pv-intro" rows={3} maxLength={data.limits.intro} value={draft.intro} onChange={e=>set('intro',e.target.value)}/></div>
     {draft.sections.map((s,i)=><fieldset key={i} className="card" style={{padding:12}}>
      <legend className="small">Onderdeel {i+1}</legend>
      <div className="field"><label htmlFor={`pv-h-${i}`}>Kop</label><input id={`pv-h-${i}`} value={s.heading} maxLength={data.limits.heading} onChange={e=>setSection(i,{heading:e.target.value})}/></div>
      <div className="field"><label htmlFor={`pv-t-${i}`}>Tekst</label><textarea id={`pv-t-${i}`} rows={Math.min(14,Math.max(4,Math.ceil(s.text.length/90)))} maxLength={data.limits.text} value={s.text} onChange={e=>setSection(i,{text:e.target.value})}/></div>
      <div className="row" style={{gap:6,flexWrap:'wrap'}}>
       <button type="button" className="btn secondary sm" disabled={i===0} onClick={()=>move(i,i-1)} aria-label={`Onderdeel ${i+1} omhoog`}>↑ Omhoog</button>
       <button type="button" className="btn secondary sm" disabled={i===draft.sections.length-1} onClick={()=>move(i,i+1)} aria-label={`Onderdeel ${i+1} omlaag`}>↓ Omlaag</button>
       <button type="button" className="btn red sm" disabled={draft.sections.length<=1} onClick={()=>{if(confirm(`Onderdeel „${s.heading||i+1}” weghalen?`))set('sections',draft.sections.filter((_,j)=>j!==i))}}>Weghalen</button>
      </div>
     </fieldset>)}
     <button type="button" className="btn secondary sm" style={{alignSelf:'flex-start'}} disabled={draft.sections.length>=data.limits.sections} onClick={()=>set('sections',[...draft.sections,{heading:'',text:''}])}>＋ Onderdeel toevoegen</button>
    </div>}
    <div className="row" style={{gap:8,flexWrap:'wrap',marginTop:16}}>
     <button type="button" className="btn" disabled={busy||!changed&&data.version>0} onClick={()=>void save()}>{busy?'Opslaan…':data.version?'Opslaan voor alle sites':'Vastleggen voor alle sites'}</button>
     <button type="button" className="btn secondary" disabled={busy||!changed} onClick={()=>{setDraft(data.policy);setMessage('')}}>Wijzigingen ongedaan maken</button>
     {changed&&<span className="small">Niet opgeslagen wijzigingen.</span>}
    </div>
   </section>
  </>}
 </div>;
}

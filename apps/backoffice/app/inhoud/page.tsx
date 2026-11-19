'use client';
// Inhoud · blogs & filmpjes (wens eigenaar 13 november 2026: „Er moet plek zijn voor nieuwsbrieven, blogs, filmjes,
// evenementen enz. Maar dit mag de backoffice niet beïnvloeden.”). Eén keer schrijven, aanvinken op welke sites het komt.
// De sites lezen het via de vaste poort /api/public/v1/inhoud; dit scherm verandert niets aan andere onderdelen.
// Evenementen blijven in Planning (met aanmelden en betalen); de agenda op de sites leest die daar.
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {PageHead,Pill,Notice,SubTabs} from '../ui';
import {WEBSITE_TABS} from '../website/tabs';
import {MediaPicker} from '../media-picker';

type Kind='blog'|'nieuws'|'video';type Status='concept'|'gepubliceerd'|'archief';
type Item={id:string;kind:Kind;slug:string;title:string;summary:string;body:string;photo:string;video:string;sites:string[];status:Status;publishedAt:string;version:number;updatedBy:string;updated:string;source?:string};
type Data={items:Item[];sites:Record<string,string>;kinds:Record<Kind,string>;statuses:Record<Status,string>};
type Draft=Omit<Item,'id'|'version'|'updatedBy'|'updated'|'source'>&{id?:string;version?:number;slugTouched?:boolean};
const empty=():Draft=>({kind:'blog',slug:'',title:'',summary:'',body:'',photo:'',video:'',sites:['boerbart'],status:'concept',publishedAt:''});
const COLOR:Record<Status,''|'green'|'orange'>={concept:'orange',gepubliceerd:'green',archief:''};
const date=(d:string)=>d?new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z')):'';
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date());
const slugify=(v:string)=>v.normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/&/g,' en ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80);
/** Alleen om te tonen of de link herkend wordt; de backoffice controleert het echt bij het opslaan. */
const videoKind=(v:string)=>/(^|\/\/|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)\//i.test(v)?'YouTube':/(^|\/\/|\.)vimeo\.com\//i.test(v)?'Vimeo':'';

export default function Inhoud(){
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [draft,setDraft]=useState<Draft|null>(null),[busy,setBusy]=useState(false),[picker,setPicker]=useState(false);
 const [filter,setFilter]=useState<'alles'|'oud'|Status>('alles');
 const [picked,setPicked]=useState<Set<string>>(new Set()),[wix,setWix]=useState<{busy:boolean;done:number;total:number;text:string;problems:string[]}|null>(null);
 const post=async(body:unknown)=>{const r=await fetch('/api/inhoud',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const b=await r.json().catch(()=>({}));if(!r.ok)throw Error(b.error||'Er ging iets mis.');return b};
 // Oude blogs van boerbart.nl (13 november 2026): lijst ophalen, dan in porties van 5 overhalen als concept, met een teller.
 async function oldBlogs(){
  setError('');setMessage('');setWix({busy:true,done:0,total:0,text:'Lijst ophalen van boerbart.nl…',problems:[]});
  try{
   const l=await post({action:'oude-blogs-lijst'}) as {total:number;posts:{url:string;imported:boolean}[]};
   const todo=l.posts.filter(p=>!p.imported).map(p=>p.url);let added=0,skipped=0;const problems:string[]=[];
   setWix({busy:true,done:0,total:todo.length,text:`${l.total} oude blogs gevonden, ${l.total-todo.length} al overgehaald.`,problems});
   for(let i=0;i<todo.length;i+=5){
    const {results}=await post({action:'oude-blogs-ophalen',urls:todo.slice(i,i+5)}) as {results:{url:string;status:string;title?:string;note?:string}[]};
    for(const r of results){if(r.status==='nieuw')added++;else if(r.status==='vertaling')skipped++;if(r.status==='mislukt'||r.note&&r.status==='nieuw')problems.push((r.title||r.url.replace(/.*\/post\//,''))+': '+(r.note||'mislukt'))}
    setWix({busy:true,done:Math.min(todo.length,i+5),total:todo.length,text:`Bezig: ${Math.min(todo.length,i+5)} van ${todo.length}…`,problems:[...problems]});
   }
   setWix({busy:false,done:todo.length,total:todo.length,text:todo.length?`Klaar: ${added} oude blogs staan nu als concept in de lijst${skipped?`, ${skipped} vertalingen overgeslagen`:''}. Ze hebben hun oorspronkelijke datum.`:'Alle oude blogs zijn al overgehaald.',problems});
   setFilter('oud');await load();
  }catch(e){setWix(w=>({busy:false,done:w?.done||0,total:w?.total||0,text:'Gestopt. Druk nog eens op de knop om verder te gaan; wat al binnen is, blijft staan.',problems:w?.problems||[]}));setError(e instanceof Error?e.message:'Ophalen mislukt.')}
 }
 // Foto's van de oude site (13 november 2026): per pagina in porties van 8, tot alle foto's van die pagina binnen zijn.
 const [pix,setPix]=useState<{busy:boolean;done:number;total:number;text:string;problems:string[]}|null>(null);
 // Verhalen van de oude site (15 november 2026): vaste lijst, in porties van 3, als concept.
 const [st,setSt]=useState<{busy:boolean;done:number;total:number;text:string;problems:string[]}|null>(null);
 async function oldStories(){
  setError('');setMessage('');setSt({busy:true,done:0,total:0,text:'Lijst ophalen…',problems:[]});
  const problems:string[]=[];let added=0;
  try{
   const l=await post({action:'verhalen-lijst'}) as {stories:{path:string;title:string;imported:boolean}[]};
   const todo=l.stories.filter(s=>!s.imported).map(s=>s.path);
   for(let i=0;i<todo.length;i+=3){
    const {results}=await post({action:'verhalen-ophalen',paths:todo.slice(i,i+3)}) as {results:{path:string;status:string;title?:string;note?:string}[]};
    for(const r of results){if(r.status==='nieuw')added++;if(r.note||r.status==='mislukt'||r.status==='leeg')problems.push((r.title||r.path)+': '+(r.note||r.status))}
    setSt({busy:true,done:Math.min(todo.length,i+3),total:todo.length,text:`Bezig: ${Math.min(todo.length,i+3)} van ${todo.length}…`,problems:[...problems]});
   }
   setSt({busy:false,done:todo.length,total:todo.length,text:todo.length?`Klaar: ${added} verhalen staan nu als concept in de lijst.`:'Alle verhalen zijn al overgehaald.',problems});
   setFilter('oud');await load();
  }catch(e){setSt(x=>({busy:false,done:x?.done||0,total:x?.total||0,text:'Gestopt. Druk nog eens op de knop om verder te gaan; wat al binnen is, blijft staan.',problems:x?.problems||problems}));setError(e instanceof Error?e.message:'Ophalen mislukt.')}
 }
 async function oldPhotos(){
  setError('');setMessage('');setPix({busy:true,done:0,total:0,text:'Pagina\'s van de oude site opzoeken…',problems:[]});
  let added=0,gone=0,skipped=0;const problems:string[]=[];
  try{
   const l=await post({action:'oude-fotos-paginas'}) as {pages:string[];inBeeldbank:number};
   for(let i=0;i<l.pages.length;i++){
    let after=0,title='';
    for(let round=0;round<40;round++){
     let r:{title:string;added:number;existed:number;gone:number;skipped:number;remaining:number};
     try{r=await post({action:'oude-fotos-ophalen',url:l.pages[i],after})}catch(e){problems.push(l.pages[i].replace('https://www.boerbart.nl','')+': '+(e instanceof Error?e.message:'mislukt'));break}
     title=r.title;added+=r.added;gone+=r.gone;skipped+=r.skipped;after+=r.gone+r.skipped;
     setPix({busy:true,done:i,total:l.pages.length,text:`Pagina ${i+1} van ${l.pages.length} (${title}): ${added} foto's binnen…`,problems:[...problems]});
     if(!r.remaining)break;
    }
   }
   if(gone)problems.push(`Bestaat niet meer bij Wix: ${gone} foto's (die tonen ook op de oude site niets meer).`);
   if(skipped)problems.push(`Overgeslagen: ${skipped} (geen JPG, PNG of WebP, of niet op te halen).`);
   setPix({busy:false,done:l.pages.length,total:l.pages.length,text:`Klaar: ${added} foto's nieuw in de beeldbank (${l.inBeeldbank+added} van de oude site in totaal). Nog eens drukken haalt alleen op wat er nog niet is.`,problems});
  }catch(e){setPix(p=>({busy:false,done:p?.done||0,total:p?.total||0,text:'Gestopt. Druk nog eens op de knop om verder te gaan; wat al binnen is, blijft staan.',problems:p?.problems||[]}));setError(e instanceof Error?e.message:'Ophalen mislukt.')}
 }
 async function publishPicked(){
  const ids=[...picked];if(!ids.length||!confirm(`${ids.length} ${ids.length===1?'stuk':'stukken'} publiceren? Binnen twee minuten staan ze op de aangevinkte sites (zonder aangevinkte site: de hoofdsite).`))return;
  setBusy(true);setError('');setMessage('');
  try{const b=await post({action:'publiceren',ids}) as {published:number;failed:{title:string;error:string}[]};
   setPicked(new Set());setMessage(`${b.published} gepubliceerd.`+(b.failed.length?` Niet gelukt: ${b.failed.map(f=>`${f.title||'?'} (${f.error})`).join('; ')}`:''));await load()}
  catch(e){setError(e instanceof Error?e.message:'Publiceren mislukt.')}finally{setBusy(false)}
 }
 async function load(){try{const r=await fetch('/api/inhoud',{cache:'no-store'});const b=await r.json();if(!r.ok)throw Error(b.error||'Laden mislukt.');setData(b);setError('')}catch(e){setError(e instanceof Error?e.message:'Laden mislukt.')}}
 useEffect(()=>{void load()},[]);
 const items=useMemo(()=>(data?.items||[]).filter(i=>filter==='alles'||(filter==='oud'?/^wix(:|-pagina:)/.test(i.source||''):i.status===filter)).sort((a,b)=>filter==='oud'?b.publishedAt.localeCompare(a.publishedAt):0),[data,filter]);
 const oldCount=(data?.items||[]).filter(i=>/^wix(:|-pagina:)/.test(i.source||'')).length,concepts=items.filter(i=>i.status==='concept');
 const count=(s:Status)=>(data?.items||[]).filter(i=>i.status===s).length;
 const set=<K extends keyof Draft>(k:K,v:Draft[K])=>setDraft(d=>d&&{...d,[k]:v,...(k==='title'&&!d.slugTouched&&!d.id?{slug:slugify(String(v))}:{})});

 async function save(status:Status){
  if(!draft)return;setBusy(true);setError('');setMessage('');
  try{
   const r=await fetch('/api/inhoud',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...draft,status})});
   const b=await r.json();if(!r.ok)throw Error(b.error||'Opslaan mislukt.');
   setDraft(null);setMessage(status==='gepubliceerd'?(b.item.publishedAt>today()?`Gepland: verschijnt op ${date(b.item.publishedAt)}.`:'Gepubliceerd. Binnen twee minuten staat het op de aangevinkte sites.'):status==='archief'?'In het archief gezet: niet meer op de sites.':'Opgeslagen als concept. Nog niet zichtbaar op de sites.');
   await load();
  }catch(e){setError(e instanceof Error?e.message:'Opslaan mislukt.')}finally{setBusy(false)}
 }
 async function remove(){
  if(!draft?.id||!confirm('Dit concept weghalen? Dat kan niet ongedaan worden.'))return;setBusy(true);setError('');
  try{const r=await fetch('/api/inhoud',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'weghalen',id:draft.id,version:draft.version})});
   const b=await r.json();if(!r.ok)throw Error(b.error||'Weghalen mislukt.');setDraft(null);setMessage('Concept weggehaald.');await load()}
  catch(e){setError(e instanceof Error?e.message:'Weghalen mislukt.')}finally{setBusy(false)}
 }

 return <div data-bb-view="inhoud">
  <PageHead eyebrow="WEBSITE" title="Inhoud · blogs & filmpjes" sub="Eén keer schrijven, op de sites die je aanvinkt. De sites lezen het zelf uit de backoffice."><button className="btn" type="button" onClick={()=>{setDraft(empty());setMessage('')}} disabled={busy}>＋ Nieuw stuk</button></PageHead><SubTabs current="/inhoud" items={WEBSITE_TABS}/>
  <Notice kind="info" title="Hoe het werkt">Een <b>concept</b> ziet alleen het team. <b>Publiceren</b> zet het binnen twee minuten op de aangevinkte sites; met een datum in de toekomst verschijnt het die dag vanzelf. <b>Archief</b> haalt het van de sites af, maar bewaart het. Filmpjes zet je op YouTube of Vimeo en plak je hier als link. Evenementen staan in <Link href="/planning">Planning</Link>; de agenda op de sites leest ze daar.</Notice>
  {error&&<div className="notice warn section-gap"><div><strong>Let op</strong>{error}</div></div>}
  {message&&<p className="message section-gap" role="status">{message}</p>}

  {draft&&<div className="card section-gap" aria-label="Stuk bewerken">
   <div className="card-head"><h3 className="card-title">{draft.id?'Stuk bewerken':'Nieuw stuk'}</h3>{draft.id&&<Pill color={COLOR[draft.status]}>{data?.statuses[draft.status]}</Pill>}</div>
   <div className="stack inhoud-form">
    <div className="grid two">
     <div className="field"><label htmlFor="inh-kind">Soort</label><select id="inh-kind" value={draft.kind} onChange={e=>set('kind',e.target.value as Kind)}>{Object.entries(data?.kinds||{blog:'Blog',nieuws:'Nieuws',video:'Filmpje'}).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></div>
     <div className="field"><label htmlFor="inh-date">Publicatiedatum</label><input id="inh-date" type="date" value={draft.publishedAt} onChange={e=>set('publishedAt',e.target.value)}/><span className="small">Leeg = vandaag, zodra je publiceert.</span></div>
    </div>
    <div className="field"><label htmlFor="inh-title">Titel</label><input id="inh-title" value={draft.title} maxLength={140} onChange={e=>set('title',e.target.value)} placeholder="De eerste lammetjes zijn er"/></div>
    <div className="field"><label htmlFor="inh-slug">Adres op de site</label><input id="inh-slug" value={draft.slug} maxLength={80} onChange={e=>setDraft(d=>d&&{...d,slug:slugify(e.target.value),slugTouched:true})} placeholder="de-eerste-lammetjes-zijn-er"/><span className="small">Wordt …/nieuws/#{draft.slug||'adres'}. Verander dit liever niet meer na het publiceren: oude links werken dan niet meer.</span></div>
    <div className="field"><label htmlFor="inh-summary">Korte inleiding</label><textarea id="inh-summary" rows={2} maxLength={400} value={draft.summary} onChange={e=>set('summary',e.target.value)} placeholder="Eén of twee zinnen voor het overzicht en bij het delen."/></div>
    <div className="field"><label htmlFor="inh-body">Tekst</label><textarea id="inh-body" rows={10} maxLength={20000} value={draft.body} onChange={e=>set('body',e.target.value)} placeholder={'Een witregel begint een nieuwe alinea.\n\n## Een tussenkop begin je met twee hekjes'}/></div>
    {/€|\beuro\b/i.test(draft.body+' '+draft.summary)&&<div className="notice warn"><div><b>Er staat een prijs in de tekst.</b> Prijzen horen in Gerechten &amp; prijzen en veranderen daar; een prijs in een verhaal blijft staan en raakt verouderd. Haal hem liever weg of verwijs naar de pagina met prijzen.</div></div>}
    <div className="grid two">
     <div className="field"><label>Foto</label>
      {draft.photo?<div className="row" style={{gap:12,alignItems:'center'}}><img src={draft.photo} alt="" style={{width:120,height:80,objectFit:'cover',borderRadius:8}}/><button type="button" className="btn secondary sm" onClick={()=>setPicker(true)}>Andere foto</button><button type="button" className="text-button" onClick={()=>set('photo','')}>Geen foto</button></div>
       :<button type="button" className="btn secondary sm" style={{alignSelf:'flex-start'}} onClick={()=>setPicker(true)}>Kies uit de beeldbank</button>}
      <span className="small">Deze foto wordt openbaar zodra het stuk gepubliceerd is. Let op herkenbare personen en hun toestemming.</span></div>
     <div className="field"><label htmlFor="inh-video">Filmpje (YouTube of Vimeo)</label><input id="inh-video" value={draft.video} maxLength={300} onChange={e=>set('video',e.target.value)} placeholder="https://youtu.be/…"/>
      <span className="small">{draft.video?(videoKind(draft.video)?`Herkend: ${videoKind(draft.video)}.`:'Niet herkend. Plak de link van YouTube of Vimeo.'):draft.kind==='video'?'Verplicht bij een filmpje.':'Optioneel.'}</span></div>
    </div>
    <fieldset className="stack inhoud-sites"><legend>Op welke sites?</legend>
     {Object.entries(data?.sites||{}).map(([k,l])=><label key={k} className="inhoud-check"><input type="checkbox" checked={draft.sites.includes(k)} onChange={e=>set('sites',e.target.checked?[...draft.sites,k]:draft.sites.filter(s=>s!==k))}/>{l}</label>)}
     <p className="small">Nu toont de nieuwe website (Boer Bart, hoofdsite) de stukken op /nieuws/ en de nieuwste drie op de homepage. De andere sites lezen dezelfde poort zodra ze er zijn.</p>
    </fieldset>
    <div className="row" style={{gap:8,flexWrap:'wrap'}}>
     <button type="button" className="btn" disabled={busy} onClick={()=>void save('gepubliceerd')}>{draft.status==='gepubliceerd'?'Opslaan (blijft gepubliceerd)':'Publiceren'}</button>
     <button type="button" className="btn secondary" disabled={busy} onClick={()=>void save('concept')}>{draft.status==='gepubliceerd'?'Terug naar concept':'Opslaan als concept'}</button>
     {draft.id&&draft.status!=='concept'&&draft.status!=='archief'&&<button type="button" className="btn secondary" disabled={busy} onClick={()=>void save('archief')}>Naar archief</button>}
     {draft.id&&draft.status==='concept'&&<button type="button" className="btn red sm" disabled={busy} onClick={()=>void remove()}>Weghalen</button>}
     <button type="button" className="text-button" disabled={busy} onClick={()=>setDraft(null)}>Annuleren</button>
    </div>
   </div>
  </div>}

  <div className="card section-gap">
   <div className="card-head"><h3 className="card-title">Oude site boerbart.nl</h3>{oldCount>0&&<Pill>{oldCount} {oldCount===1?'stuk':'stukken'} overgehaald</Pill>}</div>
   <h4 className="inhoud-sub">Blogs</h4>
   <p className="small">Haalt de blogs van de huidige Wix-site op: titel, oorspronkelijke datum, tekst en coverfoto (in de beeldbank). Ze komen binnen als <strong>concept</strong>; jij kiest wat je publiceert. Engelse en Duitse vertalingen worden overgeslagen. Foto's midden in de tekst en opmaak (vet, links) komen niet mee. Nog eens drukken haalt alleen op wat er nog niet is.</p>
   <div className="row" style={{gap:12,alignItems:'center',flexWrap:'wrap'}}><button type="button" className="btn secondary" disabled={busy||!!wix?.busy||!!pix?.busy||!!st?.busy} onClick={()=>void oldBlogs()}>{wix?.busy?'Bezig…':'Oude blogs ophalen'}</button>
    {wix&&<span className="small" role="status">{wix.text}</span>}</div>
   {wix&&wix.total>0&&<div className="progress" style={{marginTop:10}}><span style={{width:`${Math.round(wix.done/wix.total*100)}%`}}></span></div>}
   {wix&&wix.problems.length>0&&<details style={{marginTop:10}}><summary className="small">{wix.problems.length} met een opmerking</summary><ul className="small">{wix.problems.map((p,i)=><li key={i}>{p}</li>)}</ul></details>}
   <h4 className="inhoud-sub">Verhalen</h4>
   <p className="small">Haalt de vaste pagina's van de oude site op als concept-stuk: Jerseys, Over ons, Onze keuken, Boerderij, Gras, Kippen, Kippenboer, Mobiel melken, Boerenpaad, Schoolreisje, Kinderfeest, Coöperatie, Bepaal zelf de waarde, Strategiesessie, Speelboerderij, Ite by Boer Bart en Boerderijwinkel. Met de eerste foto van de pagina (origineel, in de beeldbank). <strong>Let op:</strong> sommige verhalen noemen oude prijzen; die staan bij de opmerkingen.</p>
   <div className="row" style={{gap:12,alignItems:'center',flexWrap:'wrap'}}><button type="button" className="btn secondary" disabled={busy||!!st?.busy||!!wix?.busy||!!pix?.busy} onClick={()=>void oldStories()}>{st?.busy?'Bezig…':'Verhalen ophalen'}</button>
    {st&&<span className="small" role="status">{st.text}</span>}</div>
   {st&&st.total>0&&<div className="progress" style={{marginTop:10}}><span style={{width:`${Math.round(st.done/st.total*100)}%`}}></span></div>}
   {st&&st.problems.length>0&&<details open style={{marginTop:10}}><summary className="small">{st.problems.length} met een opmerking</summary><ul className="small">{st.problems.map((p,i)=><li key={i}>{p}</li>)}</ul></details>}
   <h4 className="inhoud-sub">Foto's</h4>
   <p className="small">Zet alle foto's van de oude site in de beeldbank, in de <strong>oorspronkelijke kwaliteit</strong> (het bestand zoals het ooit is geüpload). Elke foto krijgt de naam van de pagina waar hij stond. Dezelfde foto komt er maar één keer in. De oude rondleiding wordt overgeslagen. Websites en schermen tonen vanzelf een lichte versie (hooguit 1920 pixels); het origineel blijft bewaard.</p>
   <div className="row" style={{gap:12,alignItems:'center',flexWrap:'wrap'}}><button type="button" className="btn secondary" disabled={busy||!!pix?.busy||!!wix?.busy||!!st?.busy} onClick={()=>void oldPhotos()}>{pix?.busy?'Bezig…':'Foto\'s van de oude site ophalen'}</button>
    {pix&&<span className="small" role="status">{pix.text}</span>}</div>
   {pix&&pix.total>0&&<div className="progress" style={{marginTop:10}}><span style={{width:`${Math.round(pix.done/pix.total*100)}%`}}></span></div>}
   {pix&&pix.problems.length>0&&<details style={{marginTop:10}}><summary className="small">{pix.problems.length} met een opmerking</summary><ul className="small">{pix.problems.map((p,i)=><li key={i}>{p}</li>)}</ul></details>}
  </div>

  <div className="card section-gap">
   <div className="card-head"><h3 className="card-title">Alle stukken</h3>
    <div className="row" style={{gap:6,flexWrap:'wrap'}}>{(['alles','concept','gepubliceerd','archief','oud'] as const).filter(f=>f!=='oud'||oldCount>0).map(f=><button key={f} type="button" className={'btn sm'+(filter===f?'':' secondary')} onClick={()=>setFilter(f)}>{f==='alles'?`Alles (${data?.items.length??0})`:f==='oud'?`Van de oude site (${oldCount})`:`${data?.statuses[f]??f} (${count(f)})`}</button>)}</div></div>
   {concepts.length>0&&<div className="row" style={{gap:10,alignItems:'center',flexWrap:'wrap',margin:'0 0 10px'}}>
    <label className="inhoud-check"><input type="checkbox" checked={concepts.every(i=>picked.has(i.id))} onChange={e=>setPicked(e.target.checked?new Set([...picked,...concepts.map(i=>i.id)]):new Set([...picked].filter(id=>!concepts.some(i=>i.id===id))))}/>Alle concepten hieronder</label>
    <button type="button" className="btn sm" disabled={busy||!picked.size} onClick={()=>void publishPicked()}>Geselecteerde publiceren ({picked.size})</button></div>}
   {!data&&!error&&<p className="small">Laden…</p>}
   {data&&!items.length&&<p className="empty">Nog niets hier. Begin met „＋ Nieuw stuk”.</p>}
   {items.length>0&&<div className="table-wrap"><table><thead><tr><th aria-label="Kiezen"></th><th>Titel</th><th>Soort</th><th>Status</th><th>Datum</th><th>Sites</th><th></th></tr></thead><tbody>
    {items.map(i=><tr key={i.id}><td>{i.status==='concept'&&<input type="checkbox" aria-label={'Kies '+i.title} checked={picked.has(i.id)} onChange={e=>setPicked(p=>{const n=new Set(p);if(e.target.checked)n.add(i.id);else n.delete(i.id);return n})}/>}</td><td><strong>{i.title}</strong>{i.source?.startsWith('wix:')&&<> <Pill>oude blog</Pill></>}{i.source?.startsWith('wix-pagina:')&&<> <Pill>oud verhaal</Pill></>}{i.summary&&<div className="small">{i.summary}</div>}</td><td>{data?.kinds[i.kind]}{i.video&&' ▶'}</td>
     <td><Pill color={COLOR[i.status]}>{i.status==='gepubliceerd'&&i.publishedAt>today()?'Gepland':data?.statuses[i.status]}</Pill></td><td className="small">{date(i.publishedAt)}</td>
     <td className="small">{i.sites.map(s=>data?.sites[s]||s).join(', ')||'—'}</td>
     <td><button type="button" className="btn secondary sm" onClick={()=>{setDraft({...i});setMessage('');window.scrollTo({top:0,behavior:'smooth'})}}>Bewerken</button></td></tr>)}
   </tbody></table></div>}
  </div>
  {picker&&<MediaPicker onClose={()=>setPicker(false)} onSelect={url=>{set('photo',url);setPicker(false)}}/>}
 </div>;
}

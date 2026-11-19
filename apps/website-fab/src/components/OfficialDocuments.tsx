import {useEffect,useState} from 'react';
import {Icon} from './Icon';
import '../styles/bloeimarkt.css';

export type OfficialDocument={id:string;title:string;category:string;version:string;fileName:string;size:number;url:string};
export function OfficialDocuments({documents,loading=false}:{documents:OfficialDocument[]|null;loading?:boolean}){
 return <section id="documenten" className="section market-documents"><div className="wrap">
  <p className="eyebrow">Lees het rustig na</p><h2 className="h2">Officiële documenten</h2>
  <p>Het reglement, de registratiegegevens en informatie over het toezicht op één plek. Persoonlijke overeenkomsten worden alleen bij het betreffende lid beschikbaar gesteld.</p>
  {documents===null?<p role="status">{loading?'De documenten worden geladen…':'De documenten zijn nu niet beschikbaar. Probeer het later opnieuw.'}</p>:<>
   <div className="market-doc-grid">{[['reglement','Reglement'],['kvk','KvK'],['afm','AFM-informatie']].map(([category,title])=>{
    const docs=documents.filter(d=>d.category===category);
    return <article key={category}><Icon name="file"/><h3 className="h3">{title}</h3>{docs.length?docs.map(d=><DocumentLink key={d.id} document={d}/>):<p className="muted">Nog geen document beschikbaar.</p>}</article>;
   })}</div>
   {documents.filter(d=>!['reglement','kvk','afm'].includes(d.category)).map(d=><DocumentLink key={d.id} document={d} extra/>)}
  </>}
 </div></section>;
}
function DocumentLink({document:d,extra=false}:{document:OfficialDocument;extra?:boolean}){
 return <a className={'market-doc'+(extra?' market-doc--extra':'')} href={d.url}><span>{d.title}<small>Versie {d.version} · PDF · {Math.ceil(d.size/1024)} kB</small></span><Icon name="arrow"/></a>;
}
export function BloeiOfficialDocuments(){
 const [documents,setDocuments]=useState<OfficialDocument[]|null>(null),[loading,setLoading]=useState(true);
 useEffect(()=>{let mounted=true;fetch('/api/public/bloeimarkt',{cache:'no-store'}).then(async r=>{if(!r.ok)throw Error();const d=await r.json();if(mounted)setDocuments(d.documents)}).catch(()=>{if(mounted)setDocuments(null)}).finally(()=>{if(mounted)setLoading(false)});return()=>{mounted=false}},[]);
 return <OfficialDocuments documents={documents} loading={loading}/>;
}

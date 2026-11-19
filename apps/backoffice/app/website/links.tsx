// Website & uitstraling → „Websites bekijken en testen” (wens eigenaar 6 november 2026). Per website een link en alle pagina's,
// in een nieuw tabblad. De websites zelf zijn openbaar: wie de link heeft, kan ze bekijken. Regels in lib/website-links.ts.
import {allowedOrigins} from '@/lib/public-orders';
import {sites} from '@/lib/website-links';
export function WebsiteLinks(){
 const list=sites(allowedOrigins());
 return <section className="card section-gap" data-bb-view="website-links" aria-label="Websites bekijken en testen">
  <div className="card-head"><h3 className="card-title">Websites bekijken en testen</h3><span className="small">Openbaar: iedereen met de link kan kijken</span></div>
  <div className="grid two">{list.map(s=><div key={s.id} className="site-links">
   <div className="site-links-head"><div><strong>{s.name}</strong><span className="small">{s.note}</span></div>
    {s.url&&<a className="btn" href={s.url} target="_blank" rel="noopener">Open ↗</a>}</div>
   {s.url?<><p className="small site-url"><a href={s.url} target="_blank" rel="noopener">{s.url.replace(/^https?:\/\//,'')}</a></p>
    <ul>{s.pages.map(p=><li key={p.path}><a href={s.url+p.path} target="_blank" rel="noopener">{p.label}</a><span className="small">{p.path}</span></li>)}</ul></>
   :<p className="small">Nog niet online. Zet WEBSITE_URL of voeg het Cloud Run-adres toe aan PUBLIC_ORDER_ORIGINS (zie docs/CLOUD-RUN.md).</p>}
  </div>)}</div>
 </section>;
}

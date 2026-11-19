import Link from 'next/link';
// Small presentational building blocks shared by all backoffice pages (prototype look & feel).
export const money=(n:number)=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(n/100);
export function PageHead({eyebrow,title,sub,children}:{eyebrow:string,title:string,sub:string,children?:React.ReactNode}){
 return <div className="page-head"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p className="sub">{sub}</p></div>{children&&<div className="head-actions">{children}</div>}</div>
}
export function Kpi({label,value,foot,icon,href,onClick,active}:{label:string,value:React.ReactNode,foot:string,icon:string,href?:string,onClick?:()=>void,active?:boolean}){
 // With href the whole tile is a shortcut to the screen behind the number (owner request, 3 November 2026).
 if(href)return <Link className="card kpi kpi-link" href={href} aria-label={label+': openen'}><div className="topline"><span className="small">{label}</span><span className="metric-icon">{icon}</span></div><div className="metric">{value}</div><div className="metric-caption">{foot} <span className="kpi-go" aria-hidden="true">→</span></div></Link>;
 // With onClick the tile filters the list on the same screen (owner request, 4 November 2026: snelkoppelingen).
 if(onClick)return <button type="button" className={'card kpi kpi-link kpi-button'+(active?' active':'')} onClick={onClick} aria-pressed={!!active} aria-label={label+': lijst tonen'}><div className="topline"><span className="small">{label}</span><span className="metric-icon">{icon}</span></div><div className="metric">{value}</div><div className="metric-caption">{foot} <span className="kpi-go" aria-hidden="true">↓</span></div></button>;
 return <div className="card kpi"><div className="topline"><span className="small">{label}</span><span className="metric-icon">{icon}</span></div><div className="metric">{value}</div><div className="metric-caption">{foot}</div></div>
}
export function Pill({children,color=''}:{children:React.ReactNode,color?:''|'green'|'orange'|'red'|'blue'|'purple'}){return <span className={'pill '+color}>{children}</span>}
export function Notice({title,children,kind=''}:{title:string,children:React.ReactNode,kind?:''|'warn'|'info'}){return <div className={'notice '+kind}><div><strong>{title}</strong>{children}</div></div>}
export function SubTabs({items,current}:{items:[string,string][],current:string}){return <nav className="tabs" aria-label="Onderdelen">{items.map(([href,label])=><Link key={href} href={href} className={'tab'+(href===current?' active':'')} aria-current={href===current?'page':undefined}>{label}</Link>)}</nav>}
export function NotBuilt({what}:{what:string}){return <Notice kind="warn" title="Module in voorbereiding">{what} Er worden hier nog geen gegevens opgeslagen of verstuurd; dit scherm toont de afgesproken indeling. Zodra de module gebouwd wordt, leest ze uit dezelfde centrale backoffice.</Notice>}

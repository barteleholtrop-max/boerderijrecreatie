// Berichten van de assistenten met eenvoudige opmaak (vet, lijstjes, alinea's); de regels staan in lib/chat-format.ts.
import {blocks,type Piece} from '@/lib/chat-format';
const Line=({p}:{p:Piece[]})=><>{p.map((x,i)=>x.bold?<strong key={i}>{x.text}</strong>:<span key={i}>{x.text}</span>)}</>;
export function ChatText({text}:{text:string}){
 return <div className="chat-text">{blocks(text).map((b,i)=>b.kind==='img'
  ?<a key={i} className="chat-photo" href={b.src} target="_blank" rel="noreferrer"><img src={b.src} alt={b.alt} loading="lazy"/><span>{b.alt}</span></a>
  :b.kind==='p'
  ?<p key={i}>{b.lines.map((l,j)=><span key={j}>{j>0&&<br/>}<Line p={l}/></span>)}</p>
  :b.kind==='ul'?<ul key={i}>{b.lines.map((l,j)=><li key={j}><Line p={l}/></li>)}</ul>
  :<ol key={i}>{b.lines.map((l,j)=><li key={j}><Line p={l}/></li>)}</ol>)}</div>;
}

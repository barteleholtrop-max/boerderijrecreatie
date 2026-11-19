// Platte tekst naar blokken, voor alles wat de sites lezen (Inhoud en Privacy). Zonder database, ook bruikbaar in een scherm.
export type Block={type:'kop'|'alinea';text:string};
/** Platte tekst naar blokken: een witregel begint een nieuwe alinea, een regel met „## ” is een tussenkop. Geen HTML: de site
 *  zet elke tekst als gewone tekst neer, zodat er nooit code van buiten op een pagina komt. */
export function blocks(body:string):Block[]{
 return body.replace(/\r\n?/g,'\n').split(/\n{2,}/).flatMap(part=>{
  const out:Block[]=[];let para:string[]=[];
  const flush=()=>{const t=para.join('\n').trim();if(t)out.push({type:'alinea',text:t});para=[]};
  for(const line of part.split('\n')){const h=/^#{1,3}\s+(.+)$/.exec(line.trim());if(h){flush();out.push({type:'kop',text:h[1].trim()})}else para.push(line)}
  flush();return out;
 });
}

// Opmaak van berichten in de assistenten (wens eigenaar 9 november 2026: „een soort WhatsApp-uitstraling, wel zakelijk”).
// Claude schrijft eenvoudige opmaak: **vet**, lijstjes met „- ” of „1. ” en lege regels tussen alinea's. Pure regels zonder React:
// app/chat-text.tsx maakt er elementen van. Er wordt nooit HTML uit een bericht ingevoegd.
export type Piece={text:string;bold:boolean};
export type Block={kind:'p'|'ul'|'ol';lines:Piece[][]}|{kind:'img';src:string;alt:string};
/** Foto's in een bericht (wens eigenaar 15 november 2026): ![naam](adres) op een eigen regel. Alleen de beeldbibliotheek van de backoffice
 *  en de oude Wix-foto's; elk ander adres wordt gewone tekst. */
export function chatImageSrc(src:string):string|null{
 if(/^\/api\/media\/[a-f0-9-]{36}$/.test(src))return src;
 const pub=/^\/api\/public\/media\/([a-f0-9-]{36})$/.exec(src);if(pub)return '/api/media/'+pub[1];
 return /^https:\/\/static\.wixstatic\.com\/[^\s()]+$/.test(src)?src:null;
}

/** **vet** binnen één regel. Een losse ** zonder tegenhanger blijft gewoon staan. */
export function pieces(line:string):Piece[]{
 const out:Piece[]=[];let rest=line;
 for(;;){
  const start=rest.indexOf('**');if(start<0)break;
  const end=rest.indexOf('**',start+2);if(end<0)break;
  if(start>0)out.push({text:rest.slice(0,start),bold:false});
  if(end>start+2)out.push({text:rest.slice(start+2,end),bold:true});
  rest=rest.slice(end+2);
 }
 if(rest)out.push({text:rest,bold:false});
 return out;
}

/** Deelt de tekst op in alinea's en lijstjes. */
export function blocks(text:string):Block[]{
 const out:({kind:'p'|'ul'|'ol';lines:string[]}|{kind:'img';src:string;alt:string})[]=[];
 for(const raw of String(text||'').replace(/\r\n?/g,'\n').split('\n')){
  const line=raw.trimEnd();
  const img=/^\s*!\[([^\]]{0,200})\]\((\S+)\)\s*$/.exec(line),src=img?chatImageSrc(img[2]):null;
  if(img&&src){out.push({kind:'img',src,alt:img[1].trim()||'Foto'});continue}
  const bullet=/^\s*[-•*]\s+(.*)$/.exec(line),number=/^\s*\d+[.)]\s+(.*)$/.exec(line);
  const kind:'p'|'ul'|'ol'|null=bullet?'ul':number?'ol':line.trim()?'p':null;
  if(!kind){out.push({kind:'p',lines:[]});continue}
  const last=out[out.length-1],content=bullet?bullet[1]:number?number[1]:line;
  if(last&&last.kind!=='img'&&last.kind===kind&&(kind!=='p'||last.lines.length))last.lines.push(content);
  else out.push({kind,lines:[content]});
 }
 return out.filter(b=>b.kind==='img'||b.lines.length).map(b=>b.kind==='img'?b:({kind:b.kind,lines:b.lines.map(pieces)}));
}

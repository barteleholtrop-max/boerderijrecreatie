// Epson Server Direct Print (akkoord eigenaar 5 november 2026): de bonprinter (TM-m30III) vraagt elke 5 seconden via
// internet of er een bon is, drukt die af en meldt het resultaat. Zo komt de bon er ook uit als de tablet uit staat.
// Alleen pure functies: berichten van en naar de printer, de bon zelf en de koppelsleutel. Zie lib/print-queue.ts.
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';

export const EPOS_NS='http://www.epson-pos.com/schemas/2011/03/epos-print';
/** Na zoveel seconden zonder resultaat van de printer wordt een verstuurde bon opnieuw aangeboden. */
export const RESEND_AFTER_SECONDS=60;
/** Oudere bonnen worden niet meer afgedrukt (bijvoorbeeld als de printer een nacht uit stond). */
export const EXPIRE_AFTER_HOURS=12;
export const POLL_SECONDS=5;

// ---- Koppelsleutel ----------------------------------------------------------------------------------------------------
export const newSecret=()=>randomBytes(32).toString('base64url');
export const hashSecret=(secret:string)=>createHash('sha256').update(secret).digest('hex');
export const SECRET=/^[A-Za-z0-9_-]{43}$/;
/** Gebruikersnaam en wachtwoord uit een Basic-authenticatiekop (zoals de printer die stuurt bij Server authentication). */
export function basicCredentials(header:string|null){
 const m=/^Basic\s+([A-Za-z0-9+/=]+)$/i.exec(header||'');if(!m)return null;
 const text=Buffer.from(m[1],'base64').toString('utf8'),i=text.indexOf(':');
 return i<0?null:{user:text.slice(0,i),password:text.slice(i+1)};
}
export function sameHash(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)}

// ---- Berichten van de printer ------------------------------------------------------------------------------------------
export type SdpForm={type:string,id:string,name:string,responseFile:string};
/** Het formulier dat de printer stuurt (application/x-www-form-urlencoded): ConnectionType, ID, Name en bij SetResponse ResponseFile. */
export function parseSdpForm(body:string):SdpForm{
 const f=new URLSearchParams(body);
 return {type:f.get('ConnectionType')||'',id:f.get('ID')||'',name:f.get('Name')||'',responseFile:f.get('ResponseFile')||''};
}
export type SdpResult={jobId:string,success:boolean,code:string,status:string};
/** Het afdrukresultaat (PrintResponseInfo). Ruim gelezen: alleen printjobid en de response-attributen zijn nodig. */
export function parseResponseFile(xml:string):SdpResult|null{
 const job=/<printjobid>\s*([^<\s]*)\s*<\/printjobid>/i.exec(xml)?.[1];
 const response=/<response\b([^>]*)>/i.exec(xml)?.[1];
 if(!job||response===undefined)return null;
 const attr=(name:string)=>new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`,'i').exec(response)?.[1]??'';
 return {jobId:job,success:attr('success').toLowerCase()==='true',code:attr('code'),status:attr('status')};
}
// Fouten waarbij de printer later vanzelf weer kan afdrukken: de bon blijft in de wachtrij tot het lukt.
const RECOVERABLE=['EPTR_REC_EMPTY','EPTR_COVER_OPEN','EPTR_AUTOMATICAL','EX_TIMEOUT','DeviceNotFound','EPTR_MECHANICAL','EPTR_CUTTER','EX_BADPORT','EX_ENPC_TIMEOUT','EPTR_BUSY',''];
export const recoverable=(code:string)=>RECOVERABLE.includes(code);
const CODES:Record<string,string>={EPTR_REC_EMPTY:'het papier is op',EPTR_COVER_OPEN:'de klep staat open',EX_TIMEOUT:'de printer reageerde niet op tijd',DeviceNotFound:'printer niet gevonden',EPTR_CUTTER:'het mesje zit vast',EPTR_MECHANICAL:'storing in de printer',EPTR_AUTOMATICAL:'storing in de printer',SchemaError:'de bon kon niet worden gelezen',ParameterError:'de bon kon niet worden gelezen'};
export const explainCode=(code:string)=>code?`${CODES[code]||'printerfout'} (${code})`:'onbekende fout';

// ---- Bon --------------------------------------------------------------------------------------------------------------
/** Bonprinters drukken betrouwbaar gewone tekens af: accenten weg, € als EUR, emoji en andere tekens weg. */
export function printable(s:string){
 return s.normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/€/g,'EUR').replace(/[‘’]/g,"'").replace(/[“”„]/g,'"').replace(/[–—]/g,'-').replace(/×/g,'x')
  .replace(/[^\x20-\x7e\n]/g,'').replace(/[ \t]+/g,' ').replace(/ *\n */g,'\n').trim();
}
const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const line=(s:string,attrs='')=>`<text${attrs}>${esc(printable(s))}&#10;</text>`;
const reset='<text align="left" dw="false" dh="false" em="false" reverse="false"/>';
export const columns=(paper:number)=>paper===58?32:48;

export type TicketLine={name:string,quantity:number,choices:string[],note:string};
export type Ticket={station:string,number:string,reference:string,mode:string,created:string,lines:TicketLine[],guest?:string,bill?:string,paper:number,reprint?:boolean};
const STATION_TITLE:Record<string,string>={kok:'KEUKEN',barista:'BAR',winkel:'WINKEL',kassa:'KASSA'};
const MODE:Record<string,string>={yte:'Yte - aan tafel',zelfservice:'Dagrestaurant - afhalen',winkel:'Winkel - afhalen',onderling:'Onderling - uit de winkel'};
const time=(iso:string)=>new Intl.DateTimeFormat('nl-NL',{hour:'2-digit',minute:'2-digit',day:'numeric',month:'short',timeZone:'Europe/Amsterdam'}).format(new Date(iso));

/** De binnenkant van een bereidingsbon (epos-print). Groot bestelnummer en tafel/afhaalnummer, daarna de regels. */
export function ticketBody(t:Ticket){
 const rule='-'.repeat(columns(t.paper));
 const out=['<text lang="en" smooth="true"/>'];
 if(t.reprint)out.push('<text align="center" reverse="true" em="true"/>',line(' OPNIEUW AFGEDRUKT '),reset);
 out.push('<text align="center" em="true"/>',line(STATION_TITLE[t.station]||t.station.toUpperCase()));
 out.push('<text dw="true" dh="true"/>',line(t.number),line(t.reference||'-'),reset);
 out.push(line(`${MODE[t.mode]||t.mode} - ${time(t.created)}`));
 if(t.guest)out.push(line('Gast: '+t.guest));
 if(t.bill)out.push(line('Rekening: '+t.bill));
 out.push(line(rule));
 for(const l of t.lines){
  out.push('<text dw="true" dh="true" em="true"/>',line(`${l.quantity}x ${l.name}`),reset);
  for(const c of l.choices)out.push(line('   '+c));
  if(l.note)out.push('<text em="true"/>',line('   ! '+l.note),reset);
 }
 out.push(line(rule),'<feed line="3"/>','<cut type="feed"/>');
 return out.join('');
}
export function testBody(printer:{name:string,station:string,paper:number},at:string){
 return ['<text lang="en" smooth="true"/>','<text align="center" em="true" dw="true" dh="true"/>',line('TESTAFDRUK'),reset,'<text align="center"/>',line(printer.name),line('Boerderijrecreatie - backoffice'),line(time(at)),reset,
  line('-'.repeat(columns(printer.paper))),line('Werkt deze bon? Dan haalt de printer zijn bonnen goed op via Server Direct Print.'),'<feed line="3"/>','<cut type="feed"/>'].join('');
}
/** Alleen letters en cijfers, maximaal 30 tekens: zo houdt de printer het opdrachtnummer vast. */
export const printJobId=(id:number)=>'bb'+id;
export const jobIdFromPrinter=(s:string)=>{const m=/^bb(\d{1,15})$/.exec(s);return m?Number(m[1]):null};
/** Het antwoord op een GetRequest met een bon (PrintRequestInfo, versie 2.00 met printjobid). */
export function printRequest(jobId:number,body:string){
 return `<?xml version="1.0" encoding="utf-8"?>\n<PrintRequestInfo Version="2.00"><ePOSPrint><Parameter><devid>local_printer</devid><timeout>10000</timeout><printjobid>${printJobId(jobId)}</printjobid></Parameter><PrintData><epos-print xmlns="${EPOS_NS}">${body}</epos-print></PrintData></ePOSPrint></PrintRequestInfo>`;
}
/** Voor opnieuw afdrukken: dezelfde bon met bovenaan OPNIEUW AFGEDRUKT. */
export const markReprint=(body:string)=>body.includes('OPNIEUW AFGEDRUKT')?body:body.replace('<text lang="en" smooth="true"/>','<text lang="en" smooth="true"/><text align="center" reverse="true" em="true"/>'+line(' OPNIEUW AFGEDRUKT ')+reset);

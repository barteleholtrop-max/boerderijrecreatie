// Bonprinters (wens eigenaar 5 november 2026): instellingen per printer, beheerd onder Systeem → Printers.
// Dit is alleen de inrichting. Afdrukken volgt later: de backoffice draait in de cloud en kan een printer op het
// netwerk van de boerderij (192.168.x.x) niet rechtstreeks bereiken; daarvoor kiezen we nog een route.
export const PRINTER_STATIONS=['kok','barista','winkel','kassa'] as const;
export type PrinterStation=typeof PRINTER_STATIONS[number];
export const STATION_LABELS:Record<PrinterStation,string>={kok:'Kok · bereidingsbon gerechten',barista:'Barista · bereidingsbon dranken',winkel:'Winkel · afhaalbon',kassa:'Kassa · betaalbewijs voor de gast'};
export type PrinterInput={name:string,station:PrinterStation,host:string,port:number,model:string,paper:58|80,active:boolean,note:string};
export type Printer=PrinterInput&{id:string,version:number,updated:string,updatedBy:string};

const IPV4=/^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const HOSTNAME=/^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
const text=(v:unknown,max:number,field:string)=>{if(typeof v!=='string'||v.length>max)throw Error(`${field} is te lang (maximaal ${max} tekens).`);return v.trim()};

/** Controleert de invoer uit het scherm; gooit een begrijpelijke melding bij een fout. */
export function parsePrinter(x:unknown):PrinterInput{
 if(!x||typeof x!=='object')throw Error('Ongeldige printergegevens.');
 const b=x as Record<string,unknown>;
 const name=text(b.name,60,'De naam');if(!name)throw Error('Geef de printer een naam, bijvoorbeeld Printer kok.');
 if(!PRINTER_STATIONS.includes(b.station as PrinterStation))throw Error('Kies waarvoor de printer is: kok, barista, winkel of kassa.');
 const host=text(b.host??'',253,'Het adres');
 if(host&&!IPV4.test(host)&&(!HOSTNAME.test(host)||/^[\d.]+$/.test(host)))throw Error('Vul een geldig IP-adres in, bijvoorbeeld 192.168.1.50, of laat het leeg als je het nog niet weet.');
 const port=Number(b.port);if(!Number.isInteger(port)||port<1||port>65535)throw Error('De poort is een getal van 1 tot en met 65535; voor Epson-bonprinters meestal 9100.');
 const paper=Number(b.paper);if(paper!==58&&paper!==80)throw Error('Kies een papierbreedte van 58 of 80 mm.');
 if(typeof b.active!=='boolean')throw Error('Geef aan of de printer in gebruik is.');
 return {name,station:b.station as PrinterStation,host,port,model:text(b.model??'',80,'Het model'),paper,active:b.active,note:text(b.note??'',500,'De opmerking')};
}

/** Aandachtspunten die het opslaan niet tegenhouden, maar wel gezien moeten worden. */
export function printerWarnings(list:Printer[]){
 const out:{id:string|null,text:string}[]=[];
 for(const p of list){
  if(!p.active)continue;
  if(!p.host)out.push({id:p.id,text:`${p.name}: het IP-adres is nog niet ingevuld.`});
  // 192.168.68.1, 192.168.1.1 enzovoort is bijna altijd de router of mesh-basis, niet de printer.
  else if(IPV4.test(p.host)&&p.host.endsWith('.1'))out.push({id:p.id,text:`${p.name}: ${p.host} eindigt op .1. Dat is meestal het adres van de router zelf, niet van een printer. Controleer het adres op de zelftestbon van de printer.`});
  const twin=list.find(q=>q.id!==p.id&&q.active&&q.host&&q.host===p.host&&q.port===p.port);
  if(twin&&p.id<twin.id)out.push({id:p.id,text:`${p.name} en ${twin.name} hebben hetzelfde adres (${p.host}:${p.port}). Is dat de bedoeling?`});
 }
 for(const s of ['kok','barista'] as const)if(!list.some(p=>p.active&&p.station===s))out.push({id:null,text:`Er is geen printer in gebruik voor ${s==='kok'?'de kok':'de barista'}. Bestellingen blijven dan alleen op het werkplekscherm staan.`});
 return out;
}

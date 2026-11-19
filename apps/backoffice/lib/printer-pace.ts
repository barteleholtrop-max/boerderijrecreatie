// Rustige stand voor de bonprinters: de drukke uren van vandaag en het geheugen per printer. Regels in lib/printer-pace-core.ts.
// PRINTER_RUSTIG=uit zet de rustige stand uit (altijd druk), bijvoorbeeld in tests.
import {amsterdamNow,busyAt,busyWindows,type Pace} from './printer-pace-core';
type Busy={day:string;at:number;windows:[number,number][]};
const shared=globalThis as typeof globalThis&{__bbPrinterPace?:Map<string,Pace>;__bbPrinterBusy?:Busy};
const BUSY_REFRESH_MS=5*60_000;

export const paces=()=>(shared.__bbPrinterPace??=new Map());
/** Is het nu druk (openingstijden, reserveringen, evenementen of de Ite-avond, met een uur marge)? Bij twijfel: druk. */
export async function busyNow(now=Date.now()){
 if(process.env.PRINTER_RUSTIG==='uit')return true;
 const {day,minute}=amsterdamNow(now);let b=shared.__bbPrinterBusy;
 if(!b||b.day!==day||now-b.at>BUSY_REFRESH_MS){
  try{
   const [{loadGuest},{opening}]=await Promise.all([import('./guest-store'),import('./guest-core')]);
   const s=(await loadGuest()).state,weekday=new Date(day+'T12:00:00Z').getUTCDay();
   const yte=s.yteService?.configured&&s.yteService.weekday===weekday&&s.services?.yte!==false?[{from:s.yteService.from,to:s.yteService.to}]:[];
   const windows=busyWindows({openings:[opening(s,day,'speelboerderij'),opening(s,day,'winkel')],
    slots:[...s.reservations.filter(r=>r.date===day&&r.status!=='geannuleerd'),...s.events.filter(e=>e.date===day&&!e.holiday),...yte]});
   b=shared.__bbPrinterBusy={day,at:now,windows};
  }catch{return true}
 }
 return busyAt(b.windows,minute);
}
/** Na een testafdruk of herdruk: meteen weer kijken (op deze server; anders hooguit een minuut later). */
export function wakePrinters(){for(const p of paces().values()){p.lastCheck=0;p.lastJob=Date.now()}}

type Known={printer:unknown;at:number};
const known=()=>((shared as {__bbPrinterKnown?:Map<string,Known>}).__bbPrinterKnown??=new Map());
/** In de rustige stand: een gekoppelde printer hooguit één minuut onthouden, zodat aankloppen geen databasewerk kost. */
export async function rememberedPrinter<T>(key:string,now:number,lookup:()=>Promise<T|null>):Promise<T|null>{
 const k=known().get(key);if(k&&now-k.at<60_000)return k.printer as T;
 const p=await lookup();if(p)known().set(key,{printer:p,at:now});else known().delete(key);return p;
}

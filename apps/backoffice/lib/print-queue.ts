// Printwachtrij voor Server Direct Print (akkoord eigenaar 5 november 2026). De printer vraagt elke 5 seconden om een bon;
// bij die vraag zet de backoffice bonnen klaar voor nieuwe bestellingen, met dezelfde regel als het werkplekscherm
// (betaald of niet online, met regels voor deze werkplek). Zo zien printer en scherm altijd hetzelfde.
// Besluit eigenaar 8 november 2026: de bon komt pas na het afrekenen. Uitzondering is Ite (tafelbediening): daar rekent
// de gast achteraf af, dus de keuken en de bar krijgen de bon meteen.
import {getDb} from '@/db';
import {orders,orderLines,printers,printJobs} from '@/db/schema';
import {and,asc,desc,eq,gte,inArray,lt,ne,or,sql,isNull} from 'drizzle-orm';
import {inTransaction} from '@/lib/portable/env';
import {GUEST_ORDER_STATUS} from '@/lib/public-orders';
import type {SaleLine} from '@/lib/orders';
import {EXPIRE_AFTER_HOURS,RESEND_AFTER_SECONDS,explainCode,hashSecret,markReprint,printRequest,recoverable,sameHash,testBody,ticketBody,jobIdFromPrinter,type SdpResult} from '@/lib/printer-sdp';

type PrinterRow=typeof printers.$inferSelect;
const BON_STATIONS=['kok','barista','winkel'];
/** Ite: tafelbediening, de gast rekent achteraf af. Alleen hier gaat de bon vóór het betalen naar de werkplek. */
export const PAY_AFTERWARDS_MODE='yte';
const ago=(ms:number)=>new Date(Date.now()-ms).toISOString();

/** De printer bij een koppelsleutel; alleen printers die in gebruik en gekoppeld zijn. */
export async function printerBySecret(secret:string,user?:string){
 const hash=hashSecret(secret);
 const rows=await getDb().select().from(printers).where(and(eq(printers.secretHash,hash),eq(printers.active,1)));
 const p=rows[0];
 if(!p||!sameHash(p.secretHash,hash))return null;
 // Met Server authentication is de gebruikersnaam het printer-ID; een ander ID wordt geweigerd.
 if(user&&user!==p.id)return null;
 return p;
}

/** Zet bonnen klaar voor bestellingen sinds het koppelen die deze printer nog niet heeft. */
export async function enqueue(p:PrinterRow){
 if(!BON_STATIONS.includes(p.station)||!p.printFrom)return 0;
 const db=getDb();
 const rows=await db.select({id:orders.id,data:orders.data,created:orders.created}).from(orders)
  .where(and(ne(orders.status,GUEST_ORDER_STATUS),gte(orders.created,p.printFrom),
   or(eq(orders.paymentStatus,'betaald'),eq(orders.mode,PAY_AFTERWARDS_MODE)),
   inArray(orders.id,db.select({id:orderLines.orderId}).from(orderLines).where(eq(orderLines.station,p.station))),
   sql`NOT EXISTS (SELECT 1 FROM print_jobs j WHERE j.printer_id=${p.id} AND j.order_id=${orders.id} AND j.kind='bon')`))
  .orderBy(asc(orders.id)).limit(50);
 const now=new Date().toISOString();let added=0;
 for(const r of rows){
  const data=JSON.parse(r.data),lines=(data.lines as SaleLine[]).filter(l=>l.station===p.station);if(!lines.length)continue;
  const number='P'+String(r.id).padStart(5,'0');
  const xml=ticketBody({station:p.station,number,reference:String(data.reference||''),mode:String(data.mode||''),created:r.created,lines:lines.map(l=>({name:l.name,quantity:l.quantity,choices:l.choices||[],note:l.note||''})),guest:data.guest?.name||'',paper:p.paper});
  const done=await db.insert(printJobs).values({printerId:p.id,orderId:r.id,kind:'bon',xml,title:`${number} · ${data.reference||''}`.trim(),created:now}).onConflictDoNothing().returning({id:printJobs.id});
  added+=done.length;
 }
 return added;
}

/** De volgende bon voor deze printer, of null. Eén tegelijk; een bon zonder resultaat wordt na 60 s opnieuw aangeboden. */
export async function nextJob(p:PrinterRow){
 const db=getDb(),now=new Date().toISOString(),expired=ago(EXPIRE_AFTER_HOURS*3600000);
 await db.update(printJobs).set({status:'verlopen',lastError:`Niet afgedrukt binnen ${EXPIRE_AFTER_HOURS} uur.`}).where(and(eq(printJobs.printerId,p.id),inArray(printJobs.status,['wachtrij','verstuurd']),lt(printJobs.created,expired)));
 return inTransaction(async()=>{
  const open=await db.select().from(printJobs).where(and(eq(printJobs.printerId,p.id),or(eq(printJobs.status,'wachtrij'),and(eq(printJobs.status,'verstuurd'),or(isNull(printJobs.sentAt),lt(printJobs.sentAt,ago(RESEND_AFTER_SECONDS*1000)))))))
   .orderBy(asc(printJobs.id)).limit(1).for('update',{skipLocked:true});
  const job=open[0];if(!job)return null;
  await db.update(printJobs).set({status:'verstuurd',sentAt:now,attempts:job.attempts+1}).where(eq(printJobs.id,job.id));
  return {id:job.id,xml:printRequest(job.id,job.xml)};
 });
}

/** Het resultaat dat de printer terugmeldt. Herstelbare fouten (papier op, klep open) blijven in de wachtrij. */
export async function recordResult(p:PrinterRow,r:SdpResult){
 const id=jobIdFromPrinter(r.jobId);if(id===null)return false;
 const db=getDb(),now=new Date().toISOString();
 const rows=await db.select().from(printJobs).where(and(eq(printJobs.id,id),eq(printJobs.printerId,p.id)));const job=rows[0];
 if(!job||job.status==='afgedrukt')return !!job;
 if(r.success)await db.update(printJobs).set({status:'afgedrukt',doneAt:now,lastError:''}).where(eq(printJobs.id,id));
 else{const again=recoverable(r.code)||job.attempts<5;await db.update(printJobs).set({status:again?'wachtrij':'fout',lastError:explainCode(r.code)}).where(eq(printJobs.id,id))}
 return true;
}

export async function touch(p:PrinterRow){await getDb().update(printers).set({lastSeen:new Date().toISOString()}).where(eq(printers.id,p.id))}

export async function testPrint(printerId:string,by:string){
 const db=getDb(),p=(await db.select().from(printers).where(eq(printers.id,printerId)))[0];if(!p)throw Error('Printer niet gevonden.');
 const now=new Date().toISOString();
 await db.insert(printJobs).values({printerId:p.id,kind:'test',xml:testBody(p,now),title:'Testafdruk',created:now,createdBy:by});
}
export async function reprint(jobId:number,by:string){
 const db=getDb(),job=(await db.select().from(printJobs).where(eq(printJobs.id,jobId)))[0];if(!job)throw Error('Deze bon bestaat niet meer.');
 await db.insert(printJobs).values({printerId:job.printerId,orderId:job.orderId,kind:'opnieuw',xml:markReprint(job.xml),title:job.title+' (opnieuw)',created:new Date().toISOString(),createdBy:by});
}

/** Overzicht per printer voor Systeem → Printers: wachtende bonnen en de laatste 15 opdrachten. */
export async function recentJobs(ids:string[]){
 if(!ids.length)return new Map<string,{waiting:number,jobs:{id:number,kind:string,title:string,status:string,attempts:number,created:string,doneAt:string|null,lastError:string}[]}>();
 const db=getDb();
 const rows=await db.select({id:printJobs.id,printerId:printJobs.printerId,kind:printJobs.kind,title:printJobs.title,status:printJobs.status,attempts:printJobs.attempts,created:printJobs.created,doneAt:printJobs.doneAt,lastError:printJobs.lastError})
  .from(printJobs).where(and(inArray(printJobs.printerId,ids),gte(printJobs.created,ago(7*86400000)))).orderBy(desc(printJobs.id)).limit(500);
 const out=new Map(ids.map(id=>[id,{waiting:0,jobs:[] as typeof rows}]));
 for(const r of rows){const x=out.get(r.printerId)!;if(['wachtrij','verstuurd'].includes(r.status))x.waiting++;if(x.jobs.length<15)x.jobs.push(r)}
 return new Map([...out].map(([k,v])=>[k,{waiting:v.waiting,jobs:v.jobs.map(({printerId,...j})=>j)}]));
}

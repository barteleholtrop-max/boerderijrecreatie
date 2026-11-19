import {getDb} from '@/db';
import {printers,printJobs} from '@/db/schema';
import {and,asc,eq} from 'drizzle-orm';
import {authorizeSheet} from '@/lib/sheet-access';
import {SheetError} from '@/lib/sheets';
import {parsePrinter,printerWarnings,type Printer} from '@/lib/printers';
import {hashSecret,newSecret,POLL_SECONDS} from '@/lib/printer-sdp';
import {recentJobs,reprint,testPrint} from '@/lib/print-queue';
import {CONNECTED_MS} from '@/lib/printer-pace-core';
import {wakePrinters} from '@/lib/printer-pace';
export const dynamic='force-dynamic';
// Systeem → Printers (wens eigenaar 5 november 2026; Server Direct Print met akkoord van 5 november 2026). Alleen de
// eigenaar; schrijfacties alleen vanaf de eigen backoffice. De koppelsleutel wordt één keer getoond en daarna alleen als hash bewaard.
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
const failure=(e:unknown)=>e instanceof SheetError?json({error:e.message},e.status):json({error:e instanceof Error?e.message:'Er ging iets mis. Ververs en probeer opnieuw.'},400);
const ID=/^[a-z0-9-]{1,60}$/;
// Verbonden: de printer heeft de afgelopen 30 seconden om een bon gevraagd (hij vraagt elke 5 seconden).
async function overview(){
 const rows=await getDb().select().from(printers).orderBy(asc(printers.name));
 const list:Printer[]=rows.map(r=>({id:r.id,name:r.name,station:r.station as Printer['station'],host:r.host,port:r.port,model:r.model,paper:r.paper as 58|80,active:r.active===1,note:r.note,version:r.version,updated:r.updated,updatedBy:r.updatedBy}));
 const jobs=await recentJobs(rows.map(r=>r.id)),now=Date.now();
 return {pollSeconds:POLL_SECONDS,warnings:printerWarnings(list),printers:list.map((p,i)=>{const r=rows[i];return {...p,linked:!!r.secretHash,printFrom:r.printFrom,lastSeen:r.lastSeen,connected:!!r.lastSeen&&now-Date.parse(r.lastSeen)<CONNECTED_MS,...(jobs.get(p.id)||{waiting:0,jobs:[]})}})};
}
const publicBase=(req:Request)=>(process.env.APP_ORIGIN||new URL(req.url).origin).replace(/\/$/,'');
export async function GET(req:Request){try{authorizeSheet(req);return json(await overview())}catch(e){return failure(e)}}
export async function POST(req:Request){try{
 authorizeSheet(req,true);
 const b=await req.json().catch(()=>null) as Record<string,unknown>|null,by=req.headers.get('x-boer-bart-account')||'eigenaar',now=new Date().toISOString(),db=getDb();
 if(!b)throw Error('Ongeldige aanvraag.');
 const stale=()=>json({error:'Deze printer is intussen door iemand anders gewijzigd of verwijderd. Ververs de pagina en probeer opnieuw.'},409);
 const known=async()=>{if(typeof b.id!=='string'||!ID.test(b.id))throw Error('Ongeldige aanvraag.');const p=(await db.select().from(printers).where(eq(printers.id,b.id)))[0];if(!p)throw Error('Printer niet gevonden.');return p};
 if(b.action==='nieuw'){
  const p=parsePrinter(b.printer);
  await db.insert(printers).values({id:crypto.randomUUID(),...p,active:p.active?1:0,version:1,updated:now,updatedBy:by});
 }else if(b.action==='opslaan'||b.action==='verwijderen'){
  if(typeof b.id!=='string'||!ID.test(b.id)||!Number.isInteger(b.version))throw Error('Ongeldige aanvraag.');
  const match=and(eq(printers.id,b.id),eq(printers.version,b.version as number));
  const done=b.action==='verwijderen'
   ?await db.delete(printers).where(match).returning({id:printers.id})
   :await (()=>{const p=parsePrinter(b.printer);return db.update(printers).set({...p,active:p.active?1:0,version:(b.version as number)+1,updated:now,updatedBy:by}).where(match).returning({id:printers.id})})();
  if(!done.length)return stale();
 }else if(b.action==='koppelen'){
  // Een nieuwe sleutel vervangt de oude direct. Bonnen komen alleen voor bestellingen vanaf het eerste koppelen.
  const p=await known(),secret=newSecret();
  await db.update(printers).set({secretHash:hashSecret(secret),printFrom:p.printFrom||now}).where(eq(printers.id,p.id));
  const base=publicBase(req);
  return json({...await overview(),link:{printerId:p.id,secret,url:base+'/api/public/printers/sdp',urlWithKey:base+'/api/public/printers/sdp/'+secret}});
 }else if(b.action==='ontkoppelen'){
  const p=await known();await db.update(printers).set({secretHash:''}).where(eq(printers.id,p.id));
 }else if(b.action==='testafdruk'){
  const p=await known();if(!p.secretHash)throw Error('Koppel de printer eerst.');await testPrint(p.id,by);wakePrinters();
 }else if(b.action==='opnieuw'){
  if(!Number.isInteger(b.jobId))throw Error('Ongeldige aanvraag.');
  const job=(await db.select({printerId:printJobs.printerId}).from(printJobs).where(eq(printJobs.id,b.jobId as number)))[0];if(!job)throw Error('Deze bon bestaat niet meer.');
  await reprint(b.jobId as number,by);wakePrinters();
 }else throw Error('Onbekende actie.');
 return json(await overview());
}catch(e){return failure(e)}}

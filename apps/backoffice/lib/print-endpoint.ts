// De ingang waar de bonprinter elke 5 seconden aanklopt (Server Direct Print, akkoord eigenaar 5 november 2026).
// Openbaar bereikbaar, maar alleen met de koppelsleutel van een printer: als wachtwoord (Server authentication, met het
// printer-ID als gebruikersnaam) of als laatste deel van het adres. Zonder geldige sleutel wordt er niets getoond of gewijzigd.
import {basicCredentials,hashSecret,parseResponseFile,parseSdpForm,SECRET} from '@/lib/printer-sdp';
import {enqueue,nextJob,printerBySecret,recordResult,touch} from '@/lib/print-queue';
import {plan} from '@/lib/printer-pace-core';
import {busyNow,paces,rememberedPrinter} from '@/lib/printer-pace';

const MAX_BODY=64*1024;
const plain=(status:number,extra:Record<string,string>={})=>new Response(null,{status,headers:{'Cache-Control':'no-store',...extra}});
export async function handlePrinterRequest(req:Request,pathToken?:string){
 const basic=basicCredentials(req.headers.get('authorization'));
 const secret=pathToken??basic?.password??'';
 // Zonder (juiste) sleutel: vraag om aanmelden, zodat een printer met Server authentication zijn gegevens meestuurt.
 if(!SECRET.test(secret))return plain(401,{'WWW-Authenticate':'Basic realm="Boer Bart printers", charset="UTF-8"'});
 const now=Date.now(),busy=await busyNow(now),user=pathToken?undefined:basic?.user;
 const printer=busy?await printerBySecret(secret,user):await rememberedPrinter(hashSecret(secret)+'|'+(user||''),now,()=>printerBySecret(secret,user));
 if(!printer)return plain(401,{'WWW-Authenticate':'Basic realm="Boer Bart printers", charset="UTF-8"'});
 const length=Number(req.headers.get('content-length')||0);if(length>MAX_BODY)return plain(413);
 const body=await req.text();if(body.length>MAX_BODY)return plain(413);
 const form=parseSdpForm(body);
 // Rustige stand (lib/printer-pace-core.ts): buiten de drukke uren hooguit één keer per minuut in de database kijken.
 const pace=paces().get(printer.id),step=plan(pace,now,busy);
 const mine=pace??{lastCheck:0,lastTouch:0,lastJob:0};if(!pace)paces().set(printer.id,mine);
 if(step.touch){await touch(printer);mine.lastTouch=now}
 if(form.type==='GetRequest'){
  if(!step.check)return plain(200);
  mine.lastCheck=now;
  await enqueue(printer);
  const job=await nextJob(printer);
  if(!job)return plain(200);
  mine.lastJob=now;
  return new Response(job.xml,{status:200,headers:{'Content-Type':'text/xml; charset=utf-8','Cache-Control':'no-store'}});
 }
 if(form.type==='SetResponse'){
  mine.lastJob=now;
  const result=parseResponseFile(form.responseFile);
  if(result)await recordResult(printer,result);
  return plain(200);
 }
 // Andere berichten (bijvoorbeeld statusmeldingen) worden genegeerd, zoals Epson in het voorbeeld doet.
 return plain(200);
}

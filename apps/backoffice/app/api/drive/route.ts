import {authorizeSheet} from '@/lib/sheet-access';
import {SheetError} from '@/lib/sheets';
import {withConnectionSettings} from '@/lib/connection-settings';
import {enqueue} from '@/lib/outbox';
import {tick} from '@/lib/assistant-jobs';
import {driveOverview,driveReady} from '@/lib/drive';
export const dynamic='force-dynamic';
// Google Drive als beeldbank (Systeem & koppelingen → Google Drive): stand en "Nu ophalen". Alleen voor de eigenaar.
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
const failure=(e:unknown)=>e instanceof SheetError?json({error:e.message},e.status):(console.error('[drive]',e instanceof Error?e.message:e),json({error:'Er ging iets mis. Ververs en probeer opnieuw.'},500));
export async function GET(req:Request){try{authorizeSheet(req);return json(await withConnectionSettings(()=>driveOverview()))}catch(e){return failure(e)}}
export async function POST(req:Request){try{
 authorizeSheet(req,true);
 const b=await req.json().catch(()=>({})) as {action?:unknown};
 if(b.action!=='sync')throw new SheetError('Onbekende actie.',400);
 return await withConnectionSettings(async()=>{
  if(!await driveReady())throw new SheetError('Koppel eerst administratie@ met Drive en vul de Drive-map in.',409);
  await enqueue('drive-sync:handmatig:'+Date.now(),'drive-sync');void tick();
  return json({ok:true,message:'Ophalen uit Drive gestart. Ververs over een halve minuut.'});
 });
}catch(e){return failure(e)}}

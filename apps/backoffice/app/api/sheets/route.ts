import {getDb} from '@/db';
import {sheetConfig,sheetLinks} from '@/db/schema';
import {eq} from 'drizzle-orm';
import {configuration,remoteList,seal,acquire,release,synchronize,preferLocal,pendingExports,SheetError} from '@/lib/sheets';
import {authorizeSheet} from '@/lib/sheet-access';
export const dynamic='force-dynamic';
function json(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}})}
function fail(e:unknown){return json({error:e instanceof SheetError?e.message:'De koppeling kon niet worden bijgewerkt. Ververs eerst om de actuele stand te bekijken.'},e instanceof SheetError?e.status:500)}
export async function GET(request:Request){try{authorizeSheet(request);const c=await configuration();const links=await getDb().select({id:sheetLinks.productId}).from(sheetLinks);return json({connected:!!c,lastSync:c?.lastSync||null,linked:links.length,pending:c?await pendingExports():0,lastError:c?.lastError||null})}catch(e){return fail(e)}}
export async function POST(request:Request){let token:string|null=null;try{
 authorizeSheet(request,true);if(Number(request.headers.get('content-length'))>10000)throw new SheetError('Ongeldige aanvraag.');
 const body=await request.json();if(!body||typeof body!=='object'||Array.isArray(body))throw new SheetError('Ongeldige aanvraag.');const b=body as {action:string;key:string;id:string;version:number;revision:string};if(b.action==='connect'){
 if(typeof b.key!=='string'||b.key.length<40||b.key.length>500)throw new SheetError('Vul de volledige BB_API_KEY uit Apps Script in.');
 const remote=await remoteList(b.key);const encrypted=await seal(b.key);const conf=await configuration();
 if(conf){token=await acquire();await getDb().update(sheetConfig).set({secret:encrypted}).where(eq(sheetConfig.id,1));}
 else{const inserted=await getDb().insert(sheetConfig).values({id:1,secret:encrypted}).onConflictDoNothing().returning();if(!inserted.length)throw new SheetError('Er is net een verbinding ingesteld. Ververs eerst.',409);}
 return json({ok:true,count:remote.length,message:'Verbinding gecontroleerd. Ververs nu uit de spreadsheet om producten te vergelijken.'});
 }
 if(!['refresh','use-sheet','use-local'].includes(b.action))throw new SheetError('Ongeldige actie.');
 if(!await configuration())throw new SheetError('Verbind eerst de spreadsheet.',409);
 if(['use-sheet','use-local'].includes(b.action)&&(typeof b.id!=='string'||!Number.isInteger(b.version)||typeof b.revision!=='string'||!/[a-f0-9]{64}/.test(b.revision)))throw new SheetError('Ongeldig product.');
 token=await acquire();if(b.action==='use-local')await preferLocal(b.id,b.version,b.revision);return json({ok:true,...await synchronize(b.action==='use-sheet'?{id:b.id,version:b.version,revision:b.revision}:undefined)});
 }catch(e){return fail(e)}finally{await release(token)}}

import {encryptSecret,decryptSecret} from './sheet-secret';
import {env} from '@/lib/portable/env';
import {getDb} from '@/db';
import {sheetConfig,sheetLinks,products} from '@/db/schema';
import {eq,and,lte} from 'drizzle-orm';
import {base,same,validRemote,mergeState,type RemoteProduct,type BaseProduct} from './sheet-core';
export const SCRIPT_URL=process.env.GOOGLE_SHEETS_WEBAPP_URL||'https://script.google.com/macros/s/AKfycbz-w6h6Wt-GTI9vffRxU1861nO5VPC9-1PU3mhhVXLljJTjlzB5L0FV2-lgb1PlgdDQ/exec';
export class SheetError extends Error{status:number;constructor(message:string,status=400){super(message);this.status=status}}
const messages:Record<string,string>={UNAUTHORIZED:'De geheime sleutel is ongeldig. Controleer BB_API_KEY in Apps Script.',CONFLICT:'De spreadsheet is intussen gewijzigd. Ververs de koppeling en vergelijk de gegevens.',BUSY:'De spreadsheet is bezig. Probeer straks opnieuw.',HEADERS_CHANGED:'De kolomkoppen in de spreadsheet zijn veranderd.',MISSING_OR_DUPLICATE_ID:'Er ontbreekt een bron-ID of een bron-ID komt dubbel voor in de spreadsheet.',RUN_SETUP_FIRST:'Voer eerst instellen uit in Apps Script en implementeer daarna een nieuwe versie.',INVALID_JSON_CELL:'Een cel met allergenen of bestelvragen bevat geen geldige JSON-lijst.',INVALID_BOOLEAN:'Gebruik TRUE of FALSE bij Beschikbaar en Allergenen gecontroleerd.',FORMULA_ROW_READ_ONLY:'Dit product bevat een formule. Pas deze rij in de spreadsheet aan.',FORMULA_TEXT_NOT_ALLOWED:'Tekst die met een formule begint kan niet worden opgeslagen.',INVALID_PRODUCT:'De productgegevens voldoen niet aan de controles van de spreadsheet.',NOT_FOUND:'Dit bron-ID staat niet meer in de spreadsheet.'};
function master(){const hex=(env as unknown as Record<string,string>).SHEETS_CONFIG_KEY;if(!/^[a-f0-9]{64}$/.test(hex||''))throw new SheetError('De beveiligde opslag is nog niet ingesteld.',503);return hex;}
export async function seal(secret:string){return encryptSecret(secret,master());}
export async function unseal(s:string){return decryptSecret(s,master());}
export async function configuration(){return (await getDb().select().from(sheetConfig).where(eq(sheetConfig.id,1)))[0];}
export async function invoke(secret:string,args:Record<string,unknown>){
 let r:Response;let data:Record<string,unknown>;
 try{r=await fetch(SCRIPT_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...args,key:secret}),signal:AbortSignal.timeout(25000),redirect:'follow'});data=await r.json() as Record<string,unknown>;}catch{throw new SheetError('Geen duidelijke reactie van Google. De wijziging kan al zijn verwerkt. Ververs en vergelijk eerst; er wordt niet automatisch opnieuw geschreven.',502)}
 if(!r.ok||data.ok!==true)throw new SheetError(messages[String(data.code)]||'Google heeft de aanvraag niet bevestigd. Controleer de implementatie en ververs eerst.',data.code==='CONFLICT'?409:502);
 return data;
}
export async function remoteList(secret?:string){const conf=await configuration();const token=secret??(conf?await unseal(conf.secret):'');if(!token)throw new SheetError('Verbind eerst de spreadsheet.',409);const data=await invoke(token,{action:'list'});if(data.schemaVersion!==2)throw new SheetError('Werk eerst Code.gs bij naar versie 2 en voer instellen uit. De nieuwe code staat op deze koppelingspagina.',409);if(!Array.isArray(data.products)||data.products.length>10000)throw new SheetError('De spreadsheet gaf geen geldige productlijst terug.',502);const seen=new Set<string>();return (data.products as RemoteProduct[]).map(p=>{if(!validRemote(p)||seen.has(p.sourceId))throw new SheetError('De spreadsheet bevat een ongeldige prijs, naam of dubbel bron-ID. Corrigeer dit eerst in Google Sheets.',422);seen.add(p.sourceId);return p});}
export async function acquire(){const db=getDb();const conf=await configuration();if(!conf)return null;const token=crypto.randomUUID();const got=await db.update(sheetConfig).set({lockToken:token,lockUntil:Date.now()+600000}).where(and(eq(sheetConfig.id,1),lte(sheetConfig.lockUntil,Date.now()))).returning();if(!got.length)throw new SheetError('Er wordt al gesynchroniseerd of opgeslagen. Wacht even en probeer opnieuw.',409);return token;}
export async function release(token:string|null){if(token)await getDb().update(sheetConfig).set({lockToken:null,lockUntil:0}).where(and(eq(sheetConfig.id,1),eq(sheetConfig.lockToken,token)));}
// Sends one product from the backoffice (leading) to its spreadsheet row. Refuses when the row was also changed in the spreadsheet.
async function pushLinked(secret:string,link:typeof sheetLinks.$inferSelect,remote:RemoteProduct,next:Record<string,unknown>){
 const db=getDb(),desired=base(next);
 if(!same(base(remote),desired)){
  if(!same(base(remote),JSON.parse(link.baseline) as BaseProduct))throw new SheetError('Dit product is ook in de spreadsheet gewijzigd. Kies bij Systeem & koppelingen welke versie blijft.',409);
  const current=base(remote);const patch=Object.fromEntries(Object.keys(desired).filter(k=>JSON.stringify(current[k as keyof BaseProduct])!==JSON.stringify(desired[k as keyof BaseProduct])).map(k=>[k,desired[k as keyof BaseProduct]]));
  const result=await invoke(secret,{action:'update',sourceId:link.sourceId,revision:remote.revision,patch});
  const saved=result.product as RemoteProduct;if(!validRemote(saved)||!same(base(saved),desired))throw new SheetError('De spreadsheet gaf afwijkende gegevens terug. Ververs en vergelijk eerst.',502);
  remote=saved;
 }
 await db.update(sheetLinks).set({revision:remote.revision,baseline:JSON.stringify(base(remote))}).where(eq(sheetLinks.sourceId,link.sourceId));
}
export type ExportResult={sheet:'bijgewerkt'|'niet-gekoppeld'|'niet-in-spreadsheet'|'wacht';message?:string};
// Called after the product is already saved in the backoffice. Never undoes that save: on any problem the change waits for the next synchronisation.
export async function exportProduct(id:string,next:Record<string,unknown>):Promise<ExportResult>{
 const conf=await configuration();if(!conf)return {sheet:'niet-gekoppeld'};
 if(!next.sourceId)return {sheet:'niet-in-spreadsheet',message:'Opgeslagen in de backoffice. Dit product heeft geen spreadsheetregel en staat alleen in de backoffice.'};
 let token:string|null=null;
 try{
  token=await acquire();const db=getDb();
  const link=(await db.select().from(sheetLinks).where(eq(sheetLinks.productId,id)))[0];
  if(!link)throw new SheetError('Dit product is nog niet gekoppeld; vergelijk het bij Systeem & koppelingen.',409);
  const secret=await unseal(conf.secret);const remote=(await remoteList(secret)).find(p=>p.sourceId===link.sourceId);
  if(!remote)throw new SheetError('Dit product staat niet meer in de spreadsheet.',409);
  await pushLinked(secret,link,remote,next);return {sheet:'bijgewerkt'};
 }catch(e){
  const reason=e instanceof SheetError?e.message:'Google reageerde niet duidelijk.';
  try{await getDb().update(sheetConfig).set({lastError:reason}).where(eq(sheetConfig.id,1))}catch{}
  return {sheet:'wacht',message:'Opgeslagen in de backoffice. De spreadsheet is nog niet bijgewerkt: '+reason+' Bij Systeem & koppelingen → Synchroniseren met spreadsheet wordt het opnieuw geprobeerd.'};
 }finally{await release(token)}
}
// Number of linked products with backoffice changes that are not yet in the spreadsheet.
export async function pendingExports(){
 const db=getDb();const [rows,links]=await Promise.all([db.select({id:products.id,draft:products.draft}).from(products),db.select().from(sheetLinks)]);
 const byId=new Map(rows.map(r=>[r.id,r.draft]));
 return links.filter(l=>{const d=byId.get(l.productId);return d!==undefined&&!same(base(JSON.parse(d)),JSON.parse(l.baseline) as BaseProduct)}).length;
}
export async function synchronize(force?:{id:string;version:number;revision:string}){
 const db=getDb();const conf=await configuration();if(!conf)throw new SheetError('Verbind eerst de spreadsheet.',409);const secret=await unseal(conf.secret);const remote=await remoteList(secret);const local=await db.select().from(products);const links=await db.select().from(sheetLinks);const conflicts:unknown[]=[];let updated=0,linked=0,added=0,exported=0;
 if(force&&!local.some(r=>r.id===force.id&&r.version===force.version))throw new SheetError('Dit product is intussen gewijzigd. Ververs eerst.',409);
 const seen=new Set<string>();for(const row of local){const p=JSON.parse(row.draft);if(p.sourceId){if(seen.has(p.sourceId))throw new SheetError('De backoffice bevat een dubbel bron-ID. Er is niets gesynchroniseerd.',409);seen.add(p.sourceId);}}
 for(const p of remote){const matches=local.filter(r=>JSON.parse(r.draft).sourceId===p.sourceId);const row=matches[0];
 if(!row){const id=crypto.randomUUID();const draft={...base(p),sourceId:p.sourceId,check:p.sourceCheck||''};await db.insert(products).values({id,draft:JSON.stringify(draft),version:1});await db.insert(sheetLinks).values({sourceId:p.sourceId,productId:id,revision:p.revision,baseline:JSON.stringify(base(p))});added++;continue;}
 const draft=JSON.parse(row.draft);const link=links.find(l=>l.productId===row.id);const state=mergeState(base(draft),base(p),link?JSON.parse(link.baseline) as BaseProduct:undefined);
 const forced=force?.id===row.id&&force.version===row.version&&force.revision===p.revision;
 if(force?.id===row.id&&!forced)throw new SheetError('Dit product is intussen gewijzigd. Ververs eerst.',409);
 if(state==='conflict'&&!forced){conflicts.push({id:row.id,version:row.version,name:draft.name,remoteRevision:p.revision,local:base(draft),remote:base(p)});continue;}
 // Backoffice change that did not reach the spreadsheet yet: send it now.
 if(state==='outgoing'&&link&&!forced){await pushLinked(secret,link,p,draft);exported++;linked++;continue;}
 if(state!=='equal'){
 const result=await db.update(products).set({draft:JSON.stringify({...draft,...base(p)}),version:row.version+1}).where(and(eq(products.id,row.id),eq(products.version,row.version))).returning();
 if(!result.length)throw new SheetError('Een product is intussen gewijzigd. Ververs opnieuw.',409);updated++;
 }
 await db.insert(sheetLinks).values({sourceId:p.sourceId,productId:row.id,revision:p.revision,baseline:JSON.stringify(base(p))}).onConflictDoUpdate({target:sheetLinks.sourceId,set:{revision:p.revision,baseline:JSON.stringify(base(p))}});linked++;
 }
 await db.update(sheetConfig).set({lastSync:new Date().toISOString(),lastError:null}).where(eq(sheetConfig.id,1));
 return {updated,linked,added,exported,conflicts,missing:local.filter(r=>{const d=JSON.parse(r.draft);const id=d.sourceId;return id&&!d.deletedAt&&!remote.some(p=>p.sourceId===id)}).map(r=>({id:r.id,name:JSON.parse(r.draft).name}))};
}

export async function preferLocal(id:string,version:number,revision:string){
 const db=getDb();const row=(await db.select().from(products).where(eq(products.id,id)))[0];
 if(!row||row.version!==version)throw new SheetError('Dit product is intussen gewijzigd. Ververs eerst.',409);
 const draft=JSON.parse(row.draft);const remote=(await remoteList()).find(p=>p.sourceId===draft.sourceId);
 if(!remote)throw new SheetError('Het bron-ID is niet gevonden in de spreadsheet.',409);
 if(remote.revision!==revision)throw new SheetError('De spreadsheet is intussen gewijzigd. Ververs en vergelijk opnieuw.',409);
 const conf=await configuration();if(!conf)throw new SheetError('Verbind eerst de spreadsheet.',409);
 const result=await invoke(await unseal(conf.secret),{action:'update',sourceId:draft.sourceId,revision:remote.revision,patch:base(draft)});
 const saved=result.product as RemoteProduct;if(!validRemote(saved)||!same(base(saved),base(draft)))throw new SheetError('Controleer de spreadsheet; opslaan is niet volledig bevestigd.',502);
 await db.insert(sheetLinks).values({sourceId:saved.sourceId,productId:id,revision:saved.revision,baseline:JSON.stringify(base(saved))}).onConflictDoUpdate({target:sheetLinks.sourceId,set:{revision:saved.revision,baseline:JSON.stringify(base(saved))}});
}

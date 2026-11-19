// Google Drive als beeldbank: nieuwe foto's uit de afgesproken Drive-map overnemen in de beeldbibliotheek.
// Regels in lib/drive-core.ts. Het Google-account is dat van de factuurmail (administratie@), met daarbij
// het leesrecht voor Drive. In Drive wordt nooit iets veranderd of verwijderd; een foto die in Drive verdwijnt, blijft
// in de beeldbibliotheek staan (de backoffice bepaalt wat wordt gepubliceerd).
import {getDb} from '@/db';
import {driveFiles,driveSync,media} from '@/db/schema';
import {and,eq,lte,inArray,desc,sql} from 'drizzle-orm';
import {env} from '@/lib/portable/env';
import {connectionSetting} from './connection-runtime';
import {driveAccess} from './invoice-mail';
import {GmailError,type Gmail} from './gmail-api';
import {parseFolderId,childrenQuery,skipReason,sniffImage,driveLink,imageName,FOLDER_MIME,MAX_FOLDERS,MAX_DEPTH,MAX_IMPORTS_PER_RUN,MAX_IMAGE_BYTES,restoreMissing,type DriveItem} from './drive-core';

const ROW='drive';
const now=()=>new Date().toISOString();
export const driveFolderId=()=>parseFolderId(connectionSetting('GUEST_DRIVE_FOLDER_ID'));
async function state(){return (await getDb().select().from(driveSync).where(eq(driveSync.id,ROW)))[0]||null}

/** What the screen shows: connected, folder set, last run and the files that could not be taken over. */
export async function driveOverview(){
 const access=await driveAccess(),s=await state(),raw=(connectionSetting('GUEST_DRIVE_FOLDER_ID')||'').trim();
 const counts=Object.fromEntries((await getDb().select({status:driveFiles.status,n:sql<number>`count(*)`}).from(driveFiles).groupBy(driveFiles.status)).map(r=>[r.status,Number(r.n)]));
 const skipped=await getDb().select({name:driveFiles.name,reason:driveFiles.reason,updated:driveFiles.updated}).from(driveFiles).where(eq(driveFiles.status,'overgeslagen')).orderBy(desc(driveFiles.updated)).limit(20);
 return {mailbox:access.mailbox,connected:access.connected,expired:access.expired,driveAllowed:access.driveAllowed,folderSet:!!raw,folderValid:!!driveFolderId(),
  lastOk:s?.lastOk||null,lastAttempt:s?.lastAttempt||null,lastError:s?.lastError||null,summary:JSON.parse(s?.summary||'{}') as Summary,totals:{imported:counts.overgenomen||0,skipped:counts.overgeslagen||0},syncing:!!s&&s.lockUntil>Date.now(),skipped};
}
export async function driveReady(){const a=await driveAccess();return a.connected&&a.driveAllowed&&!!driveFolderId()}

async function acquire(){
 const db=getDb(),token=crypto.randomUUID();
 await db.insert(driveSync).values({id:ROW}).onConflictDoNothing();
 const got=await db.update(driveSync).set({lockToken:token,lockUntil:Date.now()+15*60000,lastAttempt:now()}).where(and(eq(driveSync.id,ROW),lte(driveSync.lockUntil,Date.now()))).returning({id:driveSync.id});
 return got.length?token:null;
}
async function release(token:string,values:Partial<typeof driveSync.$inferInsert>){await getDb().update(driveSync).set({...values,lockToken:null,lockUntil:0}).where(and(eq(driveSync.id,ROW),eq(driveSync.lockToken,token)))}

type Summary={found?:number;imported?:number;skipped?:number;waiting?:number;folders?:number;restored?:number;notRestored?:number};
/** All images in the folder and its subfolders (breadth first, limited), plus how many folders were read. */
async function listImages(g:Gmail,root:string){
 const images:DriveItem[]=[],queue:[string,number][]=[[root,0]],seen=new Set([root]);let folders=0;
 while(queue.length&&folders<MAX_FOLDERS){
  const [id,depth]=queue.shift()!;folders++;let pageToken:string|undefined;
  do{
   const page=await g.driveList(childrenQuery(id),pageToken);
   for(const f of page.files||[]){
    if(f.mimeType===FOLDER_MIME){if(depth+1<=MAX_DEPTH&&!seen.has(f.id)){seen.add(f.id);queue.push([f.id,depth+1])}}
    else images.push(f);
   }
   pageToken=page.nextPageToken;
  }while(pageToken);
 }
 return {images,folders};
}

/** Saves one image in the media library (same storage as uploading in the backoffice). */
async function saveImage(file:DriveItem,bytes:ArrayBuffer){
 const mime=sniffImage(new Uint8Array(bytes.slice(0,16)));if(!mime)return {skip:'Dit is geen JPG-, PNG- of WebP-afbeelding.'};
 if(bytes.byteLength>MAX_IMAGE_BYTES)return {skip:'Groter dan 20 MB.'};
 const db=getDb(),old=(await db.select().from(media).where(eq(media.sourceId,file.id)))[0];if(old)return {mediaId:old.id};
 const id=crypto.randomUUID();await env.BUCKET!.put(id,bytes,{httpMetadata:{contentType:mime}});
 try{await db.insert(media).values({id,name:imageName(file.name),sourceId:file.id,source:driveLink(file.id),mime,size:bytes.byteLength})}
 catch{await env.BUCKET!.delete(id);const again=(await db.select().from(media).where(eq(media.sourceId,file.id)))[0];if(again)return {mediaId:again.id};throw Error('Opslaan mislukt.')}
 return {mediaId:id};
}
async function remember(file:DriveItem,status:'overgenomen'|'overgeslagen',reason:string,mediaId:string|null){
 await getDb().insert(driveFiles).values({fileId:file.id,name:file.name.slice(0,240),status,reason,mediaId,updated:now()}).onConflictDoUpdate({target:driveFiles.fileId,set:{name:file.name.slice(0,240),status,reason,mediaId,updated:now()}});
}

/** One run: new photos from Drive into the media library. Safe to repeat; never more than one at a time. */
export async function syncDrive(){
 const access=await driveAccess(),folder=driveFolderId();
 if(!access.connected||!access.driveAllowed)return {ok:false,skipped:'niet-gekoppeld'};
 if(!folder)return {ok:false,skipped:'geen-map'};
 const token=await acquire();if(!token)return {ok:false,skipped:'bezig'};
 try{
  const g=await access.client();
  const root=await g.driveFile(folder);
  if(root.mimeType!==FOLDER_MIME||root.trashed)throw new GmailError('De opgegeven Drive-link is geen (bestaande) map.',400);
  const {images,folders}=await listImages(g,root.id);
  const ids=images.map(f=>f.id),db=getDb();
  const known=new Set<string>();
  for(let i=0;i<ids.length;i+=200){const part=ids.slice(i,i+200);
   for(const r of await db.select({id:driveFiles.fileId}).from(driveFiles).where(inArray(driveFiles.fileId,part)))known.add(r.id);
   // Already in the library (for example the 24 images imported earlier): remember it, do not download again.
   for(const r of await db.select({id:media.id,sourceId:media.sourceId}).from(media).where(inArray(media.sourceId,part)))if(!known.has(r.sourceId)){known.add(r.sourceId);const f=images.find(x=>x.id===r.sourceId)!;await remember(f,'overgenomen','',r.id)}
  }
  let imported=0,skipped=0;const todo=images.filter(f=>!known.has(f.id));
  for(const f of todo.slice(0,MAX_IMPORTS_PER_RUN)){
   const reason=skipReason(f);if(reason){await remember(f,'overgeslagen',reason,null);skipped++;continue}
   const r=await saveImage(f,await g.driveDownload(f.id));
   if('skip' in r){await remember(f,'overgeslagen',r.skip as string,null);skipped++}else{await remember(f,'overgenomen','',r.mediaId);imported++}
  }
  // Beelden in de lijst zonder bestand in de opslag: opnieuw uit Drive, onder hetzelfde nummer.
  const fix=await restoreMissing(await db.select({id:media.id,sourceId:media.sourceId}).from(media),{has:id=>env.BUCKET!.has(id),download:id=>g.driveDownload(id),put:(id,bytes,mime)=>env.BUCKET!.put(id,bytes,{httpMetadata:{contentType:mime}})});
  const summary:Summary={found:images.length,imported,skipped,waiting:Math.max(0,todo.length-MAX_IMPORTS_PER_RUN),folders,restored:fix.restored,notRestored:fix.failed};
  await release(token,{lastOk:now(),lastError:null,summary:JSON.stringify(summary)});
  return {ok:true,...summary};
 }catch(e){
  await access.noteFailure(e);
  const message=e instanceof GmailError?(e.status===404?'De Drive-map is niet gevonden. Controleer de link en of administratie@ de map kan zien.':e.status===403?'Geen toegang tot deze Drive-map. Deel de map met administratie@ of zet de Drive API aan in Google Cloud.':e.message):'Ophalen uit Drive mislukte.';
  await release(token,{lastError:message});
  return {ok:false,error:message};
 }
}

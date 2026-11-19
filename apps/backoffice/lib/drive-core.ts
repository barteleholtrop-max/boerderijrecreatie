// Google Drive als beeldbank (akkoord eigenaar 3 november 2026): regels zonder netwerk of database.
// - De backoffice leest de afgesproken Drive-map (met submappen) en neemt nieuwe foto's over in de beeldbibliotheek.
// - Alleen lezen: in Drive wordt nooit iets veranderd of verwijderd. Drive is opslag, geen tweede bron van waarheid.
// - Een foto wordt één keer overgenomen (sleutel: het Drive-bestands-ID, zoals bij de eerste 24 geïmporteerde beelden).
export const MAX_IMAGE_BYTES=20*1024*1024;
export const MAX_FOLDERS=50,MAX_DEPTH=5,MAX_IMPORTS_PER_RUN=40;
export const FOLDER_MIME='application/vnd.google-apps.folder';
const ID=/^[A-Za-z0-9_-]{10,100}$/;

/** Accepts a Drive folder ID or a link to the folder (…/folders/<id>, …?id=<id>). Returns null when it is neither. */
export function parseFolderId(input:unknown):string|null{
 if(typeof input!=='string')return null;const v=input.trim();if(!v)return null;
 if(ID.test(v))return v;
 let url:URL;try{url=new URL(v)}catch{return null}
 if(url.protocol!=='https:'||!/(^|\.)drive\.google\.com$/.test(url.hostname))return null;
 const m=url.pathname.match(/\/folders\/([A-Za-z0-9_-]{10,100})/);if(m)return m[1];
 const q=url.searchParams.get('id');return q&&ID.test(q)?q:null;
}
/** Drive search query for the direct children of one folder (the ID is checked first, so it cannot break the query). */
export function childrenQuery(folderId:string){
 if(!ID.test(folderId))throw Error('Ongeldige map.');
 return `'${folderId}' in parents and trashed=false and (mimeType='${FOLDER_MIME}' or mimeType contains 'image/')`;
}
export type DriveItem={id:string;name:string;mimeType:string;size?:string};
/** Why a Drive image cannot be taken over, or null when it can be downloaded. */
export function skipReason(f:DriveItem):string|null{
 const mime=f.mimeType.toLowerCase();
 if(mime==='image/heic'||mime==='image/heif')return 'HEIC-foto (iPhone). Zet op de iPhone Instellingen → Camera → Formaten op „Meest compatibel”, of exporteer als JPG.';
 if(!['image/jpeg','image/png','image/webp'].includes(mime))return 'Dit bestandstype wordt niet overgenomen; gebruik JPG, PNG of WebP.';
 if(f.size&&Number(f.size)>MAX_IMAGE_BYTES)return 'Groter dan 20 MB.';
 return null;
}
/** The real type from the first bytes (the name or Drive's label alone is not trusted). */
export function sniffImage(a:Uint8Array):'image/jpeg'|'image/png'|'image/webp'|null{
 if(a[0]===0xff&&a[1]===0xd8)return 'image/jpeg';
 if(a[0]===0x89&&a[1]===0x50&&a[2]===0x4e&&a[3]===0x47)return 'image/png';
 if(String.fromCharCode(...a.slice(0,4))==='RIFF'&&String.fromCharCode(...a.slice(8,12))==='WEBP')return 'image/webp';
 return null;
}
export const driveLink=(id:string)=>`https://drive.google.com/file/d/${id}/view`;
export const imageName=(name:string)=>name.replace(/\.(jpe?g|png|webp)$/i,'').trim().slice(0,240)||'Foto uit Drive';

/**
 * Herstel (12 november 2026): bij de verhuizing naar online kwamen de foto's van de Chromebook-schijf niet mee; de lijst
 * wel. Een beeld met een Drive-bron waarvan het bestand ontbreekt, wordt opnieuw uit Drive gehaald onder hetzelfde nummer,
 * zodat producten en pagina's die ernaar verwijzen weer werken. Een beeld dat er al is, wordt nooit opnieuw geladen.
 */
export const DRIVE_FILE_ID=/^[A-Za-z0-9_-]{20,100}$/;
export async function restoreMissing(rows:{id:string;sourceId:string}[],io:{has(id:string):Promise<boolean>;download(fileId:string):Promise<ArrayBuffer>;put(id:string,bytes:ArrayBuffer,mime:string):Promise<void>},limit=MAX_IMPORTS_PER_RUN){
 let restored=0,failed=0;
 for(const row of rows){
  if(restored+failed>=limit)break;
  if(!DRIVE_FILE_ID.test(row.sourceId)||await io.has(row.id))continue;
  try{const bytes=await io.download(row.sourceId),mime=sniffImage(new Uint8Array(bytes.slice(0,16)));
   if(!mime||bytes.byteLength>MAX_IMAGE_BYTES){failed++;continue}
   await io.put(row.id,bytes,mime);restored++;
  }catch{failed++}
 }
 return {restored,failed};
}

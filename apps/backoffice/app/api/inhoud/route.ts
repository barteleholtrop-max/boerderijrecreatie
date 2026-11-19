import {authorizeSheet} from '@/lib/sheet-access';
import {SheetError} from '@/lib/sheets';
import {listInhoud,saveInhoud,removeInhoud,publishMany,InhoudError,SITES,KINDS,STATUSES} from '@/lib/inhoud';
import {wixList,wixImport,wixStoryList,wixImportStories} from '@/lib/wix-import';
import {wixPhotoPages,wixPhotosFromPage} from '@/lib/wix-photos';
export const dynamic='force-dynamic';
// Inhoud (wens eigenaar 13 november 2026): blogs, nieuws en filmpjes beheren. Alleen de eigenaar; de sites lezen via /api/public/v1/inhoud.
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
const fail=(e:unknown)=>e instanceof SheetError||e instanceof InhoudError?json({error:e.message},e.status):(console.error('[inhoud]',e),json({error:'Er ging iets mis. Ververs en probeer opnieuw.'},500));
export async function GET(req:Request){try{authorizeSheet(req);return json({items:await listInhoud(),sites:SITES,kinds:KINDS,statuses:STATUSES})}catch(e){return fail(e)}}
export async function POST(req:Request){try{
 authorizeSheet(req,true);const b=await req.json().catch(()=>({})) as Record<string,unknown>,by=req.headers.get('x-boer-bart-account')||'eigenaar';
 if(b.action==='weghalen'){await removeInhoud(b.id,b.version);return json({ok:true})}
 if(b.action==='publiceren')return json(await publishMany(b.ids,by));
 // Oude blogs van boerbart.nl (13 november 2026): eerst de lijst, daarna in porties van hooguit 5 overhalen, als concept.
 if(b.action==='oude-blogs-lijst')return json(await wixList());
 // Foto's van de oude site in de beeldbank, in originele kwaliteit (13 november 2026): eerst de pagina's, dan per pagina in porties.
 // Verhalen van de oude site (15 november 2026): vaste lijst, hooguit 3 per keer, als concept.
 if(b.action==='verhalen-lijst')return json(await wixStoryList());
 if(b.action==='verhalen-ophalen')return json({results:await wixImportStories(b.paths)});
 if(b.action==='oude-fotos-paginas')return json(await wixPhotoPages());
 if(b.action==='oude-fotos-ophalen')return json(await wixPhotosFromPage(b.url,b.after));
 if(b.action==='oude-blogs-ophalen')return json({results:await wixImport(b.urls)});
 return json({item:await saveInhoud(b,by)});
}catch(e){return fail(e)}}

import {isSameOrigin} from '@/lib/portable/origin';
import {env} from '@/lib/portable/env';
import {getDb} from '@/db';
import {media} from '@/db/schema';
import {eq} from 'drizzle-orm';
export const dynamic='force-dynamic';
export async function GET(){const rows=await getDb().select().from(media);return Response.json(rows.map(r=>({...r,url:'/api/media/'+r.id})),{headers:{'Cache-Control':'private, no-store'}})}
export async function POST(req:Request){
 if(!isSameOrigin(req))return new Response('Ongeldige herkomst',{status:403});
 const data=await req.formData();const file=data.get('file');if(!(file instanceof File)||file.size>20*1024*1024||!file.size)return Response.json({error:'Kies een afbeelding van maximaal 20 MB.'},{status:400});
 const bytes=await file.arrayBuffer();const a=new Uint8Array(bytes);const mime=a[0]===255&&a[1]===216?'image/jpeg':a[0]===137&&a[1]===80&&a[2]===78&&a[3]===71?'image/png':String.fromCharCode(...a.slice(0,4))==='RIFF'&&String.fromCharCode(...a.slice(8,12))==='WEBP'?'image/webp':null;
 if(!mime)return Response.json({error:'Gebruik JPG, PNG of WebP.'},{status:400});
 const name=String(data.get('name')||file.name).slice(0,240);const sourceId=String(data.get('sourceId')||crypto.randomUUID()).slice(0,150);const source=String(data.get('source')||'').slice(0,1000);const old=await getDb().select().from(media).where(eq(media.sourceId,sourceId));if(old[0])return Response.json({...old[0],url:'/api/media/'+old[0].id});
 const id=crypto.randomUUID();await env.BUCKET!.put(id,bytes,{httpMetadata:{contentType:mime}});
 try{await getDb().insert(media).values({id,name,sourceId,source,mime,size:file.size});}catch{await env.BUCKET!.delete(id);return Response.json({error:'Opslaan mislukt. Probeer opnieuw.'},{status:409})}
 return Response.json({id,name,url:'/api/media/'+id});
}

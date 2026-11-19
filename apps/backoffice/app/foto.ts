'use client';
// Foto bij een bericht aan de assistent (wens eigenaar 13 november 2026: „Er moet ook een foto kunnen uploaden om informatie uit te
// halen”). De foto wordt in de browser verkleind tot hooguit 1600 pixels en als JPG verstuurd: snel op de telefoon, en scherp genoeg
// om een pakbon, factuur of menukaart te lezen. Er wordt niets op een schijf bewaard; de foto zit alleen in het gesprek (14 dagen).
import {useCallback,useState} from 'react';

export type Foto={mediaType:'image/jpeg';data:string;preview:string;name:string};
const MAX=1600;

export async function shrink(file:File):Promise<Foto>{
 if(!file.type.startsWith('image/'))throw Error('Kies een foto (JPG, PNG of HEIC).');
 const url=URL.createObjectURL(file);
 try{
  const img=await new Promise<HTMLImageElement>((ok,fail)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>fail(Error('Deze foto kan niet worden geopend. Probeer een JPG of PNG.'));i.src=url});
  const scale=Math.min(1,MAX/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
  const c=canvas.getContext('2d');if(!c)throw Error('Deze browser kan de foto niet verkleinen.');
  c.fillStyle='#fff';c.fillRect(0,0,canvas.width,canvas.height);c.drawImage(img,0,0,canvas.width,canvas.height);
  const preview=canvas.toDataURL('image/jpeg',0.85);
  return {mediaType:'image/jpeg',data:preview.slice(preview.indexOf(',')+1),preview,name:file.name};
 }finally{URL.revokeObjectURL(url)}
}

/** Eén gekozen foto per bericht. pick() hoort bij een <input type="file">. */
export function useFoto(){
 const [foto,setFoto]=useState<Foto|null>(null),[problem,setProblem]=useState('');
 const pick=useCallback(async(e:React.ChangeEvent<HTMLInputElement>)=>{
  const f=e.target.files?.[0];e.target.value='';if(!f)return;setProblem('');
  try{setFoto(await shrink(f))}catch(err){setProblem((err as Error).message)}
 },[]);
 const clear=useCallback(()=>{setFoto(null);setProblem('')},[]);
 /** Wat er naar de server gaat (zonder voorbeeld). */
 const payload=foto?{mediaType:foto.mediaType,data:foto.data}:undefined;
 return {foto,problem,pick,clear,payload};
}

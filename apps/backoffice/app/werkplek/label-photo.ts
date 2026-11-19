// Gedeeld door Werkplek Voorraad en de kassa: een etiketfoto verkleinen en de streepjescode eruit lezen, vóór /api/werkplek/etiket.
/** Foto verkleinen op het apparaat (onder 1 MB), voor Etiket lezen. Een pakbon mag groter (kleine letters): max 2000 pixels. */
export async function shrinkPhoto(file:Blob,max=1280){
 const img=await createImageBitmap(file),scale=Math.min(1,max/Math.max(img.width,img.height)),canvas=document.createElement('canvas');
 canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d')!.drawImage(img,0,0,canvas.width,canvas.height);
 for(const q of [0.8,0.65,0.5,0.35]){const url=canvas.toDataURL('image/jpeg',q);if(url.length<950000)return url}
 return null;
}
/** Streepjescode uit de foto (BarcodeDetector, als de browser dat kan); anders leest de backoffice hem. */
export async function barcodeIn(file:Blob){
 const BD=(globalThis as unknown as {BarcodeDetector?:{new(o:{formats:string[]}):{detect(i:ImageBitmap):Promise<{rawValue?:string}[]>};getSupportedFormats?():Promise<string[]>}}).BarcodeDetector;
 if(!BD)return null;
 try{const formats=((await BD.getSupportedFormats?.())||['ean_13']).filter(f=>['ean_13','ean_8','upc_a','upc_e'].includes(f));if(!formats.length)return null;
  const found=await new BD({formats}).detect(await createImageBitmap(file));
  return found.map(f=>String(f.rawValue||'').replace(/\D/g,'')).find(c=>c.length>=8&&c.length<=14)||null}catch{return null}
}

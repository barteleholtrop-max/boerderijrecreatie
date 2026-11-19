// Een zip-bestand in de browser lezen (WhatsApp-export, 13 november 2026): alleen lezen, opgeslagen of deflate, met de
// ingebouwde DecompressionStream van de browser. Geen extra pakket. Grote bestanden worden in stukjes gelezen (file.slice).
export type Source={name:string;read:()=>Promise<Blob>};

export async function zipEntries(file:File):Promise<Source[]>{
 const tailSize=Math.min(file.size,66000),tail=new DataView(await file.slice(file.size-tailSize).arrayBuffer());
 let eocd=-1;for(let i=tailSize-22;i>=0;i--)if(tail.getUint32(i,true)===0x06054b50){eocd=i;break}
 if(eocd<0)throw Error('Dit is geen geldig zip-bestand.');
 const count=tail.getUint16(eocd+10,true),cdSize=tail.getUint32(eocd+12,true),cdOffset=tail.getUint32(eocd+16,true);
 if(cdOffset===0xffffffff)throw Error('Deze export is te groot om in de browser uit te pakken. Exporteer per gesprek.');
 const cd=new DataView(await file.slice(cdOffset,cdOffset+cdSize).arrayBuffer()),out:Source[]=[];
 let p=0;
 for(let n=0;n<count&&p+46<=cd.byteLength;n++){
  if(cd.getUint32(p,true)!==0x02014b50)break;
  const method=cd.getUint16(p+10,true),csize=cd.getUint32(p+20,true),nameLen=cd.getUint16(p+28,true),extraLen=cd.getUint16(p+30,true),commentLen=cd.getUint16(p+32,true),local=cd.getUint32(p+42,true);
  const name=new TextDecoder().decode(new Uint8Array(cd.buffer,cd.byteOffset+p+46,nameLen));p+=46+nameLen+extraLen+commentLen;
  if(name.endsWith('/')||(method!==0&&method!==8))continue;
  out.push({name:name.split('/').pop()||name,read:async()=>{
   const h=new DataView(await file.slice(local,local+30).arrayBuffer()),start=local+30+h.getUint16(26,true)+h.getUint16(28,true),data=file.slice(start,start+csize);
   return method===0?data:await new Response(data.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
  }});
 }
 return out;
}


export async function pdfText(file:File){
 if(file.size>15*1024*1024)throw Error('Kies een PDF van maximaal 15 MB.');
 const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc='/pdf.worker.min.mjs';
 const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false});const doc=await task.promise;
 try{if(doc.numPages>30)throw Error('Gebruik een factuur van maximaal 30 pagina’s.');let text='';for(let p=1;p<=doc.numPages;p++){const page=await doc.getPage(p);const content=await page.getTextContent();const items=content.items.filter((i):i is import('pdfjs-dist/types/src/display/api').TextItem=>'str'in i).sort((a,b)=>Math.abs(a.transform[5]-b.transform[5])>3?b.transform[5]-a.transform[5]:a.transform[4]-b.transform[4]);let y:number|null=null;for(const i of items){if(y!==null&&Math.abs(i.transform[5]-y)>3)text+='\n';else text+=' ';text+=i.str;y=i.transform[5];}text+='\n';}if(text.trim().length<30)throw Error('Deze PDF lijkt een scan. Tekstherkenning voor scans is nog niet aangesloten; voer de regels handmatig in.');return text;}finally{await doc.destroy()}
}

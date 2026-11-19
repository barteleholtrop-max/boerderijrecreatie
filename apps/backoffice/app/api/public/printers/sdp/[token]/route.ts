import {handlePrinterRequest} from '@/lib/print-endpoint';
export const dynamic='force-dynamic';
// Server Direct Print met de koppelsleutel in het adres, voor als de printer zonder aanmelden werkt.
export async function POST(req:Request,{params}:{params:Promise<{token:string}>}){try{return await handlePrinterRequest(req,(await params).token)}catch{return new Response(null,{status:500,headers:{'Cache-Control':'no-store'}})}}

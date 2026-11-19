import {handlePrinterRequest} from '@/lib/print-endpoint';
export const dynamic='force-dynamic';
// Server Direct Print met Server authentication (gebruikersnaam = printer-ID, wachtwoord = koppelsleutel).
export async function POST(req:Request){try{return await handlePrinterRequest(req)}catch{return new Response(null,{status:500,headers:{'Cache-Control':'no-store'}})}}

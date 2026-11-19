import {json,who,handle} from '@/lib/mail-http';
import {waitingCount} from '@/lib/gesprekken-teller';
export const dynamic='force-dynamic';
// Alleen een getal voor het bolletje in de app Management: hoeveel gesprekken op ons wachten. Zelfde rechten als Gesprekken.
export async function GET(req:Request){return handle(async()=>{who(req);return json({wacht:await waitingCount()})})}

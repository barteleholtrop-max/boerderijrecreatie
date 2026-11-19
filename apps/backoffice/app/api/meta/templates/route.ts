import {json,who,handle} from '@/lib/mail-http';
import {metaTemplates} from '@/lib/meta-store';
export const dynamic='force-dynamic';
// Goedgekeurde WhatsApp-sjablonen voor een bericht na het venster van 24 uur (rechtstreeks bij Meta opgevraagd).
export async function GET(req:Request){return handle(async()=>{who(req);return json({templates:await metaTemplates()})})}

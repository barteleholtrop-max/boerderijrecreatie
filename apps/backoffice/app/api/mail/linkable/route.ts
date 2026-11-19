import {json,who,handle} from '@/lib/mail-http';
import {linkable} from '@/lib/mail-store';
export const dynamic='force-dynamic';
export async function GET(req:Request){return handle(async()=>{who(req);return json(await linkable())})}

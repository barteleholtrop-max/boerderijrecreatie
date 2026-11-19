import {who,handle} from '@/lib/mail-http';
import {startOAuth} from '@/lib/mail-store';
export const dynamic='force-dynamic';
// Starts the server-side OAuth flow with Google for the configured mailbox. Only for a logged-in account with mail access.
export async function GET(req:Request){return handle(async()=>{const by=who(req);return Response.redirect(await startOAuth(by),302)})}

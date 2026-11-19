import {loadGuest} from '@/lib/guest-store';
import {publicPlanning,publicContact,publicPrices} from '@/lib/guest-public';
import type {GuestState} from '@/lib/guest-core';
import {signupTotals} from '@/lib/event-signups';
import {withConnectionSettings} from '@/lib/connection-settings';
import {mollieKey} from '@/lib/online-payments';
import {publicOnderdelen} from '@/lib/website-onderdelen';
// Whether a sign-up gets a confirmation mail (sending on and Gmail connected), so the website promises nothing it cannot keep.
async function confirmationPossible(){try{const {sendEnabled,isConnected}=await import('@/lib/mail-store');return sendEnabled()&&await withConnectionSettings(()=>isConnected())}catch{return false}}
export const dynamic='force-dynamic';
// Public, read-only endpoint for the website (no login; see proxy.ts): open/closed now, opening hours, Ite by Boer Bart moments,
// day parts and upcoming events — all from the central planning. The planning is read at most once per minute;
// the open/closed state is computed per request so it switches on time.
// website: welke onderdelen van de hoofdsite nog in ontwikkeling zijn (Website & uitstraling, 15 november 2026; zie
// lib/website-onderdelen.ts). Nieuw veld; bestaande velden blijven gelijk.
const TTL=60000;let cache:{at:number;state:GuestState;taken:Map<string,number>;confirmationMail:boolean;mollieOn:boolean;website:{inOntwikkeling:string[]}}|null=null;
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=60','Access-Control-Allow-Origin':'*','X-Content-Type-Options':'nosniff'};
export async function GET(){
 try{
  if(!cache||Date.now()-cache.at>TTL)cache={at:Date.now(),state:(await loadGuest()).state,taken:await signupTotals(),confirmationMail:await confirmationPossible(),mollieOn:await withConnectionSettings(async()=>!!mollieKey()).catch(()=>false),website:await publicOnderdelen()};
  return new Response(JSON.stringify({...publicPlanning(cache.state,new Date(),cache.taken,cache.mollieOn),confirmationMail:cache.confirmationMail,contact:publicContact(cache.state),prices:publicPrices(cache.state),website:cache.website,updated:new Date().toISOString()}),{headers});
 }catch{
  // No guessed opening hours or availability: the website then shows no light and no bookable moments.
  return Response.json({error:'Openingstijden en beschikbaarheid zijn tijdelijk niet beschikbaar.'},{status:503,headers:{'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}});
 }
}

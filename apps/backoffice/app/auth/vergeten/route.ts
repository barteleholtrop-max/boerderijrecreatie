import {authConfig,normalizeEmail,validEmail} from '@/lib/login-core';
import {activeAccount} from '@/lib/access-store';
import {recover} from '@/lib/supabase-auth';
import {answer,appOrigin,failText,readJson} from '@/lib/login-flow';
export const dynamic='force-dynamic';
// Wachtwoord vergeten: alleen voor een adres op de toegangslijst stuurt Supabase een herstelmail. Het antwoord is altijd
// hetzelfde. Wie met Google inlogt, herstelt zijn wachtwoord bij Google zelf.
const DONE='Als dit adres op de lijst van Boer Bart staat, krijg je nu een mail met een link om een nieuw wachtwoord te kiezen.';
export async function POST(req:Request){try{
 const b=await readJson(req),email=normalizeEmail(b.email);
 if(!validEmail(email))return answer({error:'Vul een geldig e-mailadres in.'},400);
 if(await activeAccount(email))await recover(authConfig()!,email,appOrigin(req)+'/inloggen/nieuw-wachtwoord');
 return answer({ok:true,bericht:DONE});
}catch(e){return failText(e)}}

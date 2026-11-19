import {authConfig,normalizeEmail,passwordProblem,validEmail} from '@/lib/login-core';
import {activeAccount} from '@/lib/access-store';
import {signUp,AuthFail} from '@/lib/supabase-auth';
import {answer,appOrigin,failText,readJson} from '@/lib/login-flow';
export const dynamic='force-dynamic';
// Account aanmaken met e-mail en wachtwoord (voor wie geen Google-account heeft). Alleen een adres dat de eigenaar op de
// toegangslijst heeft gezet, krijgt een bevestigingsmail; het antwoord is altijd hetzelfde, zodat niemand kan uitproberen
// wie er op de lijst staat. Een account aanmaken geeft zelf geen toegang: de lijst beslist.
const DONE='Als dit adres op de lijst van Boer Bart staat, krijg je nu een mail. Klik op de link om je adres te bevestigen en log daarna in.';
export async function POST(req:Request){try{
 const b=await readJson(req),email=normalizeEmail(b.email);
 if(!validEmail(email))return answer({error:'Vul een geldig e-mailadres in.'},400);
 const problem=passwordProblem(b.password);if(problem)return answer({error:problem},400);
 // Bestaat het account al (bijvoorbeeld via Google), dan geeft Supabase soms een fout: ook dan hetzelfde antwoord.
 if(await activeAccount(email))await signUp(authConfig()!,email,b.password as string,appOrigin(req)+'/inloggen?bevestigd=1')
  .catch(e=>{if(e instanceof AuthFail&&(e.status===400||e.status===422))return;throw e});
 return answer({ok:true,bericht:DONE});
}catch(e){return failText(e)}}

// Inlogscherm (besluiten eigenaar 4 en 6 november 2026): inloggen met Google, of met e-mail en wachtwoord voor wie geen
// Google-account heeft. Daarna altijd de code uit de Authenticator-app. Eigen vormgeving, zonder backofficemenu (shell.tsx).
// Alleen wie op de toegangslijst staat, komt binnen.
import {LoginForm} from './form';
import {Brand} from './brand';
const MESSAGES:Record<string,string>={
 'geen-toegang':'Dit account staat niet op de lijst van Boerderijrecreatie. Vraag een eigenaar om je toe te voegen.',
 'opnieuw':'Het inloggen is niet afgerond. Probeer het opnieuw.',
 'storing':'Inloggen lukt nu even niet. Probeer het over een paar minuten opnieuw.',
 'niet-ingesteld':'Inloggen is nog niet ingesteld op deze server.',
};
export default async function Inloggen({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const q=await searchParams;
 const msg=q.fout?MESSAGES[q.fout]||MESSAGES.opnieuw:q.uit?'Je bent uitgelogd.':q.bevestigd?'Je e-mailadres is bevestigd. Log nu in.':q.wachtwoord?'Je nieuwe wachtwoord is opgeslagen. Log nu in.':'';
 const terug=typeof q.terug==='string'&&q.terug.length<=500?q.terug:'/';
 return <main className="login-page">
  <section className="login-card" aria-labelledby="login-titel">
   <Brand/>
   <h1 id="login-titel">Welkom terug</h1>
   {msg&&<p className={'login-msg'+(q.fout?' fout':'')} role={q.fout?'alert':'status'}>{msg}</p>}
   <LoginForm terug={terug}/>
   <p className="login-foot">Gasten en deelnemers hoeven hier niet in te loggen.</p>
  </section>
 </main>;
}

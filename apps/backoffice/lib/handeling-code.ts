// Eén code per handeling (besluit eigenaar 8 november 2026). Wie in Bloei namens een obligatiehouder iets wijzigt (te koop
// zetten, publiceren, overdragen, documenten, import, leningen), bevestigt élke handeling met een nieuwe code uit de
// Authenticator-app. De code is hooguit 2 minuten oud en wordt na deze handeling als gebruikt gemarkeerd in de sessie
// (mfaUsed), zodat de volgende handeling opnieuw om een code vraagt. Het venster in app/code-opnieuw.tsx vraagt de code en
// voert de handeling daarna één keer opnieuw uit. Zonder login (ontwikkelen op de eigen computer) geldt dit niet.
import {readSession,sessionSecret,signSession,SESSION_COOKIE} from './login-core';
import {unusedCode,ONCE_TEXT} from './gevoelig';

/** Geeft een 401-antwoord terug als er geen nieuwe code is; anders markeert het de code als gebruikt en geeft null. */
export async function actionCode(req:Request):Promise<Response|null>{
 if(req.headers.get('x-boer-bart-mfa')===null)return null;
 // Pas hier laden: zonder login (en in de tests buiten Next) zijn cookies en sessie niet nodig.
 const {cookies}=await import('next/headers'),{setSession}=await import('./login-flow');
 const secret=sessionSecret(),session=readSession((await cookies()).get(SESSION_COOKIE)?.value,secret);
 if(!session||!unusedCode(session))return Response.json({error:ONCE_TEXT,opnieuwCode:true},{status:401,headers:{'Cache-Control':'no-store'}});
 await setSession(req,signSession({...session,mfaUsed:session.mfa},secret),Math.max(60,Math.floor((session.exp-Date.now())/1000)));
 return null;
}

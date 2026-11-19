import {isSameOrigin} from '@/lib/portable/origin';
import {appOrigin,clearSession} from '@/lib/login-flow';
export const dynamic='force-dynamic';
// Uitloggen: alleen vanaf de eigen backoffice (POST), daarna terug naar het inlogscherm. Geldt ook voor het planbord
// (gedeelde sessie).
export async function POST(req:Request){
 if(!isSameOrigin(req))return new Response('Ongeldige herkomst',{status:403});
 await clearSession();
 return Response.redirect(new URL('/inloggen?uit=1',appOrigin(req)),303);
}

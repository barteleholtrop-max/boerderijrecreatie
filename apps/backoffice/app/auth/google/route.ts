import {cookies} from 'next/headers';
import {authConfig,pkce,authorizeUrl,safeNext,cookieSecure,VERIFIER_COOKIE} from '@/lib/login-core';
import {appOrigin} from '@/lib/login-flow';
export const dynamic='force-dynamic';
// Inloggen met Google via Supabase: start. De geheime PKCE-verifier blijft in een korte, afgeschermde cookie.
export async function GET(req:Request){
 const cfg=authConfig(),origin=appOrigin(req);
 if(!cfg)return Response.redirect(new URL('/inloggen?fout=niet-ingesteld',origin),302);
 const {verifier,challenge}=pkce(),q=new URL(req.url).searchParams,next=safeNext(q.get('terug')),remember=q.get('onthouden')==='1';
 (await cookies()).set(VERIFIER_COOKIE,JSON.stringify({verifier,next,remember}),{httpOnly:true,secure:cookieSecure(process.env,origin),sameSite:'lax',path:'/auth',maxAge:600});
 return Response.redirect(authorizeUrl(cfg.url,origin+'/auth/terug',challenge),302);
}

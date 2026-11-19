import {cookies} from 'next/headers';
import {authConfig,safeNext,VERIFIER_COOKIE} from '@/lib/login-core';
import {exchangeCode} from '@/lib/supabase-auth';
import {appOrigin,beginStep,quickLogin} from '@/lib/login-flow';
export const dynamic='force-dynamic';
// Supabase stuurt hierheen terug na Google. De code wordt (met de verifier) bij Supabase ingewisseld; alleen wie actief op
// de toegangslijst staat, gaat door naar de tweede stap: de code uit de Authenticator-app (/inloggen/code).
export async function GET(req:Request){
 const cfg=authConfig(),origin=appOrigin(req),jar=await cookies();
 const fail=(code:string)=>{jar.delete({name:VERIFIER_COOKIE,path:'/auth'});return Response.redirect(new URL('/inloggen?fout='+code,origin),302)};
 if(!cfg)return fail('niet-ingesteld');
 const code=new URL(req.url).searchParams.get('code')||'';
 let saved:{verifier?:string;next?:string;remember?:boolean}={};try{saved=JSON.parse(jar.get(VERIFIER_COOKIE)?.value||'{}')}catch{}
 if(!code||code.length>500||typeof saved.verifier!=='string')return fail('opnieuw');
 try{
  const t=await exchangeCode(cfg,code,saved.verifier).catch(()=>null);
  if(!t)return fail('opnieuw');
  const step=await beginStep(req,t,safeNext(saved.next),saved.remember===true);
  if(!step)return fail('geen-toegang');
  jar.delete({name:VERIFIER_COOKIE,path:'/auth'});
  // Zonder code binnen als dit account dat mag (Toegang); anders de code (wens eigenaar 13 november 2026).
  const quick=await quickLogin(req,t,step);
  return Response.redirect(new URL(quick||'/inloggen/code',origin),302);
 }catch(e){console.error('[inloggen]',e instanceof Error?e.message:e);return fail('storing')}
}

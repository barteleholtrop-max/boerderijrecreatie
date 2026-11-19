import {authorizeSheet} from '@/lib/sheet-access';
import {SheetError} from '@/lib/sheets';
import {validDecision,DecisionError} from '@/lib/assistant-core';
import {listProposals,decide} from '@/lib/proposals-store';
export const dynamic='force-dynamic';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
const fail=(e:unknown)=>e instanceof SheetError||e instanceof DecisionError?json({error:e.message},e.status):json({error:'Er ging iets mis. Ververs en probeer opnieuw.'},500);

export async function GET(req:Request){try{authorizeSheet(req);return json(await listProposals())}catch(e){return fail(e)}}

export async function POST(req:Request){try{
 authorizeSheet(req,true);
 const raw=await req.text();if(raw.length>10000)throw new DecisionError('De aanvraag is te groot.',400);
 let body:unknown;try{body=JSON.parse(raw)}catch{throw new DecisionError('Ongeldige aanvraag.',400)}
 if(!validDecision(body))throw new DecisionError('Ongeldige aanvraag.',400);
 const by=req.headers.get('x-boer-bart-account')||'';
 const result=await decide(body.id,{action:body.action,version:body.version,requestId:body.requestId,note:body.note,by,now:new Date().toISOString()});
 return json({ok:true,duplicate:result==='duplicate'});
}catch(e){return fail(e)}}

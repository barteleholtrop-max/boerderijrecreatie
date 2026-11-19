// One request to the AI chosen for guest advice: Claude (Anthropic) or OpenAI (ChatGPT). Owner's choice, 3 November 2026:
// both must be possible because the mail assistant already runs in ChatGPT. The Weekassistent and recipe proposals stay on Claude.
// Keys come from Systeem & koppelingen (encrypted); they never reach the browser and never appear in an error message.
import Anthropic from '@anthropic-ai/sdk';
import {workspaceHeaders} from './claude-workspace';

export type Provider='claude'|'openai';
export type AiChoice={provider:Provider;label:string;key:string|null;model:string|null;missing:string|null;workspace?:string|null};
export const CLAUDE_DEFAULT_MODEL='claude-sonnet-4-6';

/** Which AI the guest advice uses, and what is still missing to use it. Reads the central connection settings. */
export function aiChoice(setting:(key:string)=>string|null|undefined):AiChoice{
 const provider:Provider=(setting('GUEST_AI_PROVIDER')||'').trim().toLowerCase()==='openai'?'openai':'claude';
 const style=setting('GUEST_WRITING_STYLE');
 if(provider==='openai'){
  const key=setting('OPENAI_API_KEY')||null,model=(setting('OPENAI_MODEL')||'').trim()||null;
  const missing=!key?'Vul de OpenAI API-sleutel in bij Systeem & koppelingen → AI voor gasten.':!model?'Vul het OpenAI-model in bij Systeem & koppelingen → AI voor gasten.':!style?'Vul de schrijfinstructies van Bartele en Rianne in bij Systeem & koppelingen → AI voor gasten.':null;
  return {provider,label:'OpenAI',key,model,missing};
 }
 const key=setting('ANTHROPIC_API_KEY')||null,model=(setting('GUEST_AI_MODEL')||'').trim()||CLAUDE_DEFAULT_MODEL;
 const missing=!key?'Vul de Claude-sleutel in bij Systeem & koppelingen → AI voor gasten, of kies daar OpenAI.':!style?'Vul de schrijfinstructies van Bartele en Rianne in bij Systeem & koppelingen → AI voor gasten.':null;
 return {provider,label:'Claude',key,model,missing,workspace:setting('ANTHROPIC_WORKSPACE_ID')||null};
}

/** Errors that only said the AI was not set up yet (also the wording from before 3 November 2026). Stale once it is set up. */
export function settingsError(message:string|undefined){return !!message&&/^(Stel Claude en de bestaande schrijfstijl in|Vul (de|het) (Claude-sleutel|OpenAI API-sleutel|OpenAI-model|schrijfinstructies))/.test(message);}

type Request={system:string;user:string;maxTokens:number;timeoutMs:number};
type Fetch=(url:string,init:RequestInit)=>Promise<Response>;

/** Sends one request and returns the text of the answer. Throws a Dutch message without any key. */
export async function generateText(choice:AiChoice,r:Request,fetcher:Fetch=fetch):Promise<string>{
 if(choice.missing||!choice.key||!choice.model)throw Error(choice.missing||'De AI is nog niet ingesteld.');
 if(choice.provider==='claude'){
  const response=await new Anthropic({apiKey:choice.key,maxRetries:0,timeout:r.timeoutMs,defaultHeaders:workspaceHeaders(choice.workspace)}).messages.create({model:choice.model,max_tokens:r.maxTokens,system:r.system,messages:[{role:'user',content:r.user}]});
  return response.content.filter(b=>b.type==='text').map(b=>b.text).join('\n').trim();
 }
 const base=(process.env.OPENAI_BASE_URL||'https://api.openai.com/v1').replace(/\/+$/,'');
 let res:Response;
 try{
  res=await fetcher(base+'/chat/completions',{method:'POST',signal:AbortSignal.timeout(r.timeoutMs),headers:{Authorization:'Bearer '+choice.key,'Content-Type':'application/json'},
   body:JSON.stringify({model:choice.model,max_completion_tokens:r.maxTokens,response_format:{type:'json_object'},messages:[{role:'system',content:r.system},{role:'user',content:r.user}]})});
 }catch{throw Error('OpenAI is niet bereikbaar. Probeer het later opnieuw; er is niets verstuurd.')}
 if(!res.ok){
  const message={401:'De OpenAI-sleutel wordt niet geaccepteerd. Controleer hem bij Systeem & koppelingen.',403:'Deze OpenAI-sleutel heeft geen toegang tot het gekozen model.',404:'Het gekozen OpenAI-model bestaat niet of is niet beschikbaar voor dit account. Controleer de modelnaam.',429:'OpenAI meldt een limiet of onvoldoende tegoed. Controleer het tegoed op platform.openai.com of probeer het later.'}[res.status];
  throw Error(message||'OpenAI gaf een fout ('+res.status+'). Probeer het later opnieuw.');
 }
 const data=await res.json().catch(()=>null) as {choices?:{finish_reason?:string;message?:{content?:string|null;refusal?:string|null}}[]}|null;
 const c=data?.choices?.[0];
 if(c?.message?.refusal)throw Error('OpenAI weigerde dit advies te maken. Handel dit gesprek handmatig af.');
 if(c?.finish_reason==='length')throw Error('Het antwoord van OpenAI was te lang en is afgebroken. Probeer opnieuw of handel dit gesprek handmatig af.');
 const text=(c?.message?.content||'').trim();
 if(!text)throw Error('OpenAI gaf een leeg antwoord. Probeer het opnieuw.');
 return text;
}

// Conversation engine of the Weekassistent. One call to runTurn answers the latest message(s) in a thread.
// The history is append-only: every API response is stored unchanged and sent back unchanged (required for
// thinking blocks), tool results are appended as their own message, and UI-only notes never go to the API.
// Progress is saved after every step, so a retry after a crash continues where it stopped.
import type Anthropic from '@anthropic-ai/sdk';
import {missingWorkspace,MISSING_WORKSPACE_TEXT} from './claude-workspace';
import {TOOL_DEFINITIONS,runTool,type ToolContext} from './assistant-tools';
import {SYSTEM_PROMPT} from './assistant-prompt';

type Block=Anthropic.Beta.BetaContentBlockParam;
export type StoredMessage={seq:number;role:'user'|'tool'|'assistant'|'notitie';content:Block[]};
export type NewMessage={role:'tool'|'assistant'|'notitie';text:string;content:Block[];sources:unknown};
export type EngineStore={messages():Promise<StoredMessage[]>;append(m:NewMessage):Promise<void>;callsToday():Promise<number>};
export type CreateMessage=(params:Anthropic.Beta.MessageCreateParamsNonStreaming)=>Promise<Anthropic.Beta.BetaMessage>;
export type EngineConfig={model:string;effort:'low'|'medium'|'high';dailyLimit:number;maxSteps:number};

/** Which assistant runs: its fixed instructions, its tools and how a tool runs. Default: the Weekassistent. */
export type Kit<C>={system:string;tools:readonly unknown[];runTool:(name:string,input:unknown,ctx:C)=>Promise<{content:string;isError:boolean;source:string}>};
const WEEK_KIT:Kit<ToolContext>={system:SYSTEM_PROMPT,tools:TOOL_DEFINITIONS,runTool};
export const DEFAULT_CONFIG:EngineConfig={model:'claude-opus-5-5',effort:'medium',dailyLimit:300,maxSteps:16}; // 16 stappen (13 november 2026): met alle rechten doet de assistent meer per bericht

export function toParams(messages:StoredMessage[]):Anthropic.Beta.BetaMessageParam[]{
 return messages.filter(m=>m.role!=='notitie').map(m=>({role:m.role==='assistant'?'assistant':'user',content:m.content}));
}
const textOf=(content:Anthropic.Beta.BetaContentBlock[])=>content.filter((b):b is Anthropic.Beta.BetaTextBlock=>b.type==='text').map(b=>b.text).join('\n\n').trim();
const pendingTools=(m:StoredMessage|undefined)=>m?.role==='assistant'?m.content.filter((b):b is Anthropic.Beta.BetaToolUseBlockParam=>b.type==='tool_use'):[];

/** Returns what happened; throws only for errors worth retrying (network, rate limit, overload). */
export async function runTurn<C=ToolContext>(store:EngineStore,ctx:C,create:CreateMessage,config:EngineConfig=DEFAULT_CONFIG,kit:Kit<C>=WEEK_KIT as unknown as Kit<C>):Promise<'beantwoord'|'niets-te-doen'|'limiet'|'geweigerd'|'te-veel-stappen'>{
 let history=await store.messages();
 const visible=history.filter(m=>m.role!=='notitie');
 const last=visible.at(-1);
 if(!last||(last.role==='assistant'&&!pendingTools(last).length))return 'niets-te-doen';
 const used=new Set<string>();
 for(let step=0;step<config.maxSteps;step++){
  // A stored assistant turn with tool calls but no results yet (interrupted run): run those tools first.
  const calls=pendingTools(history.filter(m=>m.role!=='notitie').at(-1));
  if(calls.length){
   const results:Anthropic.Beta.BetaToolResultBlockParam[]=[];
   for(const c of calls){const r=await kit.runTool(c.name,c.input,ctx);used.add(r.source);results.push({type:'tool_result',tool_use_id:c.id,content:r.content,...(r.isError?{is_error:true}:{})})}
   await store.append({role:'tool',text:'',content:results,sources:[...used]});
   history=await store.messages();
  }
  if(await store.callsToday()>=config.dailyLimit){
   await store.append({role:'notitie',text:'De dagelijkse limiet van de assistent is bereikt. Morgen kan het gesprek verder; je weekmenu en concepten blijven bewaard.',content:[],sources:[]});
   return 'limiet';
  }
  const response=await create({
   model:config.model,max_tokens:16000,system:kit.system,tools:kit.tools as unknown as Anthropic.Beta.BetaToolUnion[],
   messages:toParams(history),output_config:{effort:config.effort},cache_control:{type:'ephemeral'},
   betas:['server-side-fallback-2026-07-01'],fallbacks:'default',
  });
  const usage={input:response.usage.input_tokens,output:response.usage.output_tokens,cacheRead:response.usage.cache_read_input_tokens??0,model:response.model};
  if(response.stop_reason==='refusal'){
   await store.append({role:'assistant',text:textOf(response.content),content:response.content as Block[],sources:{tools:[...used],usage}});
   await store.append({role:'notitie',text:'De assistent kon hier niet op antwoorden. Formuleer je vraag anders of start een nieuw weekgesprek.',content:[],sources:[]});
   return 'geweigerd';
  }
  const tools=response.content.filter(b=>b.type==='tool_use');
  if(response.stop_reason==='max_tokens'&&tools.length)throw Error('Antwoord afgebroken tijdens een hulpmiddel (max_tokens).');
  await store.append({role:'assistant',text:textOf(response.content),content:response.content as Block[],sources:{tools:[...used],usage}});
  history=await store.messages();
  if(response.stop_reason==='pause_turn')continue;
  if(response.stop_reason!=='tool_use'||!tools.length)return 'beantwoord';
 }
 await store.append({role:'notitie',text:'De assistent had te veel stappen nodig voor dit antwoord. Stuur een kort vervolgbericht, dan gaat hij verder.',content:[],sources:[]});
 return 'te-veel-stappen';
}

/** Melding voor de beheerder bij een instellingsfout van de Claude-API (wens eigenaar 6 november 2026: de reden zichtbaar in het gesprek,
 * niet alleen in het serverlogboek). De tekst van de API bevat geen sleutel; hij wordt ingekort. */
export function configErrorNote(status:number|undefined,message:string,model:string){
 const detail=String(message||'').replace(/sk-ant-[\w-]+/g,'[sleutel]').replace(/\s+/g,' ').trim().slice(0,240);
 const why=missingWorkspace(message)?MISSING_WORKSPACE_TEXT
  :status===401?'De Claude-sleutel wordt geweigerd (ongeldig of ingetrokken). Vervang hem bij Systeem & koppelingen.'
  :status===403?'De Claude-sleutel heeft geen toegang tot dit verzoek of tot model '+model+'. Controleer de sleutel en het account bij Systeem & koppelingen.'
  :status===404?'Model '+model+' is niet beschikbaar voor dit Claude-account.'
  :'Claude weigerde het verzoek.';
 return `De assistent kon niet antwoorden door een instellingsfout. ${why}${detail?` Reden van Claude (${status??'?'}): ${detail}`:''}`;
}

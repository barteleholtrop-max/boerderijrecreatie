import {test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/ts-resolve.mjs';
const {aiChoice,generateText,settingsError,CLAUDE_DEFAULT_MODEL}=await import('../lib/ai-text.ts');

const settings=o=>k=>o[k];
const KEY='sk-test-'+'x'.repeat(24);

test('zonder keuze blijft het Claude; OpenAI alleen als die gekozen is',()=>{
 const claude=aiChoice(settings({ANTHROPIC_API_KEY:'a',GUEST_WRITING_STYLE:'Warm'}));
 assert.deepEqual([claude.provider,claude.label,claude.model,claude.missing],['claude','Claude',CLAUDE_DEFAULT_MODEL,null]);
 assert.equal(aiChoice(settings({ANTHROPIC_API_KEY:'a',GUEST_WRITING_STYLE:'Warm',GUEST_AI_MODEL:' eigen-model '})).model,'eigen-model');
 const openai=aiChoice(settings({GUEST_AI_PROVIDER:' OpenAI ',OPENAI_API_KEY:KEY,OPENAI_MODEL:'mail-model',GUEST_WRITING_STYLE:'Warm'}));
 assert.deepEqual([openai.provider,openai.label,openai.model,openai.missing],['openai','OpenAI','mail-model',null]);
 // A Claude key alone does not make OpenAI work, and the other way round.
 assert.match(aiChoice(settings({GUEST_AI_PROVIDER:'openai',ANTHROPIC_API_KEY:'a',GUEST_WRITING_STYLE:'Warm'})).missing,/OpenAI API-sleutel/);
 assert.match(aiChoice(settings({GUEST_AI_PROVIDER:'openai',OPENAI_API_KEY:KEY,GUEST_WRITING_STYLE:'Warm'})).missing,/OpenAI-model/);
 assert.match(aiChoice(settings({OPENAI_API_KEY:KEY,OPENAI_MODEL:'m',GUEST_WRITING_STYLE:'Warm'})).missing,/Claude-sleutel/);
 assert.match(aiChoice(settings({GUEST_AI_PROVIDER:'openai',OPENAI_API_KEY:KEY,OPENAI_MODEL:'m'})).missing,/schrijfinstructies/);
 assert.match(aiChoice(settings({ANTHROPIC_API_KEY:'a'})).missing,/schrijfinstructies/);
});

test('OpenAI: één aanvraag met systeeminstructie, JSON-antwoord en de sleutel alleen in de kop',async()=>{
 let call;
 const fetcher=async(url,init)=>{call={url,init,body:JSON.parse(init.body)};return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:' {"wishes":"x"} '}}]}),{status:200})};
 const choice=aiChoice(settings({GUEST_AI_PROVIDER:'openai',OPENAI_API_KEY:KEY,OPENAI_MODEL:'mail-model',GUEST_WRITING_STYLE:'Warm'}));
 assert.equal(await generateText(choice,{system:'Geef JSON',user:'{"bronnen":1}',maxTokens:6000,timeoutMs:5000},fetcher),'{"wishes":"x"}');
 assert.equal(call.url,'https://api.openai.com/v1/chat/completions');
 assert.equal(call.init.method,'POST');assert.equal(call.init.headers.Authorization,'Bearer '+KEY);
 assert.deepEqual(call.body,{model:'mail-model',max_completion_tokens:6000,response_format:{type:'json_object'},messages:[{role:'system',content:'Geef JSON'},{role:'user',content:'{"bronnen":1}'}]});
 assert.ok(!call.init.body.includes(KEY),'sleutel niet in de inhoud');
});

test('OpenAI-fouten geven een Nederlandse uitleg zonder sleutel; er wordt niets geraden',async()=>{
 const choice=aiChoice(settings({GUEST_AI_PROVIDER:'openai',OPENAI_API_KEY:KEY,OPENAI_MODEL:'mail-model',GUEST_WRITING_STYLE:'Warm'}));
 const run=(status,body)=>generateText(choice,{system:'s',user:'u',maxTokens:10,timeoutMs:5000},async()=>new Response(JSON.stringify(body||{error:{message:'bad key '+KEY}}),{status}));
 for(const [status,pattern] of [[401,/niet geaccepteerd/],[403,/geen toegang/],[404,/model bestaat niet/],[429,/limiet of onvoldoende tegoed/],[500,/fout \(500\)/]]){
  await assert.rejects(run(status),e=>pattern.test(e.message)&&!e.message.includes(KEY),String(status));
 }
 await assert.rejects(run(200,{choices:[{message:{content:null,refusal:'nee'}}]}),/weigerde/);
 await assert.rejects(run(200,{choices:[{finish_reason:'length',message:{content:'{"half'}}]}),/te lang/);
 await assert.rejects(run(200,{choices:[]}),/leeg antwoord/);
 await assert.rejects(generateText(choice,{system:'s',user:'u',maxTokens:10,timeoutMs:5000},async()=>{throw Error('ECONNREFUSED '+KEY)}),e=>/niet bereikbaar/.test(e.message)&&!e.message.includes(KEY));
 // Not configured: refuse before any request.
 let called=false;
 await assert.rejects(generateText(aiChoice(settings({GUEST_AI_PROVIDER:'openai'})),{system:'s',user:'u',maxTokens:10,timeoutMs:5000},async()=>{called=true;return new Response('{}')}),/OpenAI API-sleutel/);
 assert.equal(called,false);
});

test('oude "nog niet ingesteld"-meldingen worden herkend; echte fouten niet',()=>{
 for(const m of ['Stel Claude en de bestaande schrijfstijl in bij Systeem & koppelingen.',aiChoice(settings({})).missing,aiChoice(settings({ANTHROPIC_API_KEY:'a'})).missing,aiChoice(settings({GUEST_AI_PROVIDER:'openai'})).missing,aiChoice(settings({GUEST_AI_PROVIDER:'openai',OPENAI_API_KEY:'k'})).missing])
  assert.equal(settingsError(m),true,m);
 for(const m of [undefined,'','OpenAI meldt een limiet of onvoldoende tegoed.','Het gekozen OpenAI-model bestaat niet of is niet beschikbaar voor dit account.','Automatische mail: geen AI-antwoord nodig.'])
  assert.equal(settingsError(m),false,String(m));
});

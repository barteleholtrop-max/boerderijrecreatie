// Recipe proposals by Claude. Only a proposal: nothing is stored; the owner checks, edits and saves the recipe.
// Claude gets the product name, optional wishes and the ingredient list (name, unit, allergens). No prices, guests or accounts.
import type Anthropic from '@anthropic-ai/sdk';
import type {Ingredient,Unit} from './operations-core';

export type RecipeSuggestion={yield:number;lossPct:number;method:string;lines:{ingredientId:string;quantity:number}[];missing:{name:string;unit:Unit;quantity:number}[];note:string};
export type CreateMessage=(params:Anthropic.MessageCreateParamsNonStreaming)=>Promise<Anthropic.Message>;

const TOOL={name:'recept_voorstel',description:'Geef het receptvoorstel voor één verkoopproduct.',input_schema:{type:'object' as const,additionalProperties:false,required:['porties','verliesPercentage','bereiding','ingredienten','toelichting'],properties:{
 porties:{type:'number',description:'Aantal porties dat deze batch oplevert.'},
 verliesPercentage:{type:'number',description:'Snij- of bereidingsverlies in procenten (0 tot 90).'},
 bereiding:{type:'string',description:'Korte bereidingswijze in het Nederlands, met aandacht voor kruiscontact.'},
 ingredienten:{type:'array',description:'Netto bruikbare hoeveelheden voor de hele batch, in de basiseenheid van het ingrediënt.',items:{type:'object',additionalProperties:false,required:['naam','eenheid','hoeveelheid'],properties:{
  id:{type:'string',description:'ID uit de ingrediëntenlijst. Laat leeg als het ingrediënt nog niet bestaat.'},
  naam:{type:'string'},eenheid:{type:'string',enum:['kg','l','st']},hoeveelheid:{type:'number'}}}},
 toelichting:{type:'string',description:'Eén of twee zinnen: aannames en wat de keuken moet controleren.'}}}};

export function suggestionParams(product:{name:string;department:string},wishes:string,ingredients:Ingredient[],model:string):Anthropic.MessageCreateParamsNonStreaming{
 const list=ingredients.map(i=>`- id ${i.id}: ${i.name} (${i.unit})${i.allergens.length?' · allergenen: '+i.allergens.join(', '):''}`).join('\n')||'(nog geen ingrediënten vastgelegd)';
 return {model,max_tokens:4000,tools:[TOOL],tool_choice:{type:'tool',name:TOOL.name},
  system:'Je bent chef-kok en inkoper bij Boer Bart, een biologische boerderij met restaurant, koffiebar en boerderijwinkel in Friesland. Je stelt een eenvoudig, realistisch recept voor dat de keuken daarna zelf controleert en aanpast. Gebruik zoveel mogelijk ingrediënten uit de lijst, met hun id en basiseenheid (kg, l of st). Noem een ingrediënt dat ontbreekt zonder id. Hoeveelheden zijn netto bruikbare hoeveelheden voor de hele batch. Verzin geen prijzen en geen allergenenclaims.',
  messages:[{role:'user',content:`Verkoopproduct: ${product.name}${product.department?' (afdeling '+product.department+')':''}\n${wishes.trim()?'Wensen: '+wishes.trim()+'\n':''}\nIngrediëntenlijst:\n${list}`}]};
}

const clamp=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)?Math.min(max,Math.max(min,v)):null;
/** Checks Claude's answer: known IDs only with the right unit; unknown ingredients become a "missing" list to add first. */
export function readSuggestion(message:Pick<Anthropic.Message,'content'|'stop_reason'>,ingredients:Ingredient[]):RecipeSuggestion{
 const block=message.content.find(b=>b.type==='tool_use'&&b.name===TOOL.name) as Anthropic.ToolUseBlock|undefined;
 if(!block)throw Error(message.stop_reason==='refusal'?'Claude wilde voor dit product geen voorstel maken.':'Claude gaf geen bruikbaar voorstel. Probeer het opnieuw.');
 const v=block.input as Record<string,unknown>;
 const portions=typeof v.porties==='number'&&v.porties>0?clamp(v.porties,0.001,10000):null;if(portions===null)throw Error('Het voorstel heeft geen geldig aantal porties.');
 const lines:RecipeSuggestion['lines']=[],missing:RecipeSuggestion['missing']=[];
 for(const raw of Array.isArray(v.ingredienten)?v.ingredienten.slice(0,60):[]){
  const r=raw as Record<string,unknown>,quantity=clamp(r.hoeveelheid,0.000001,100000),unit=['kg','l','st'].includes(String(r.eenheid))?String(r.eenheid) as Unit:null,name=String(r.naam||'').trim().slice(0,200);
  if(quantity===null||!unit||!name)continue;
  const known=ingredients.find(i=>i.id===r.id&&i.unit===unit);
  if(known&&!lines.some(l=>l.ingredientId===known.id))lines.push({ingredientId:known.id,quantity});
  else if(!known)missing.push({name,unit,quantity});
 }
 if(!lines.length&&!missing.length)throw Error('Het voorstel bevat geen ingrediënten.');
 return {yield:portions,lossPct:clamp(v.verliesPercentage,0,90)??0,method:String(v.bereiding||'').slice(0,10000),lines,missing,note:String(v.toelichting||'').slice(0,1000)};
}

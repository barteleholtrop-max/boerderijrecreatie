// Tools of the Weekassistent (keuken). Read tools return facts from the central backoffice; weekmenu_voorstellen makes a weekmenu
// CONCEPT, and weekmenu_bevestigen confirms it when Rianne asks (wens eigenaar 13 november 2026: de assistent heeft alle rechten).
// All other backoffice tools (agenda, producten, leden, openingstijden, …) come from lib/hulp-tools.ts, see lib/assistant-full.ts.
// Data access is injected (ToolContext), so the rules here are tested without a database.
import {z} from 'zod';
import {shoppingPlan,recipeCost,type Ops} from './operations-core';

export type ProductInfo={id:string;name:string;department:string;priceCents:number;published:boolean;available:boolean};
export type MenuItem={productId:string;day:string;portions:number|null;note:string};
export type WeekMenuView={id:string;week:string;status:string;version:number;items:(MenuItem&{name:string})[]}|null;
export type ToolContext={
 planning?(week:string):Promise<unknown>;
 today:string; // YYYY-MM-DD, Europe/Amsterdam
 week:string;  // Monday of the week this conversation is about
 products():Promise<ProductInfo[]>;
 ops():Promise<Ops>;
 weekMenus(week:string):Promise<{concept:WeekMenuView;confirmed:WeekMenuView}>;
 proposeWeekMenu(week:string,items:MenuItem[],summary:string):Promise<{proposalId:string;menuId:string}>;
 /** Het lopende concept-weekmenu bevestigen, zoals de knop Bevestigen. null = er is geen concept. */
 confirmWeekMenu?(week:string):Promise<{confirmed:boolean}|null>;
 /** Boodschappenlijst (wens eigenaar 9 november 2026): iets op de lijst van deze week zetten. */
 addShopping?(week:string,name:string,amount:string):Promise<{already:boolean}>;
};
export type ToolOutcome={content:string;isError:boolean;source:string};

const DAYS=['','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag','zondag'] as const;
const euro=(c:number|null)=>c===null?'onbekend':new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(c/100);

export const TOOL_DEFINITIONS=[
 {name:'planning_bekijken',description:'Lees centrale evenementen en nationale feestdagen, gastaanvragen, opties, bevestigde reserveringen en afhaalbestellingen van de gekozen week. Alleen bevestigde boekingen tellen als bevestigde gasten; aanvragen houden geen plek vast.',input_schema:{type:'object' as const,properties:{},required:[],additionalProperties:false},strict:true},
 {name:'producten_zoeken',description:'Zoek gerechten en producten in de centrale productlijst van de backoffice. Gebruik dit om bestaande gerechten te vinden voordat je ze in een weekmenu zet. Geeft id, naam, afdeling, verkoopprijs, of het product gepubliceerd en beschikbaar is, en of er een recept met kostprijs is.',
  input_schema:{type:'object' as const,properties:{zoekterm:{type:'string',description:'Deel van de naam, bijvoorbeeld "soep" of "boerenkool". Leeg laten voor de eerste resultaten.'},afdeling:{type:'string',description:'Leeg voor alle afdelingen, of bijvoorbeeld "Restaurant".'}},required:['zoekterm','afdeling'],additionalProperties:false},strict:true},
 {name:'voorraad_bekijken',description:'Bekijk de actuele voorraad van ingrediënten: geteld of niet, onder het minimum, en wat al besteld en onderweg is. Gebruik dit voor vragen over voorraad en tekorten.',
  input_schema:{type:'object' as const,properties:{alleen_tekorten:{type:'boolean',description:'Alleen ingrediënten onder het minimum of zonder telling.'}},required:['alleen_tekorten'],additionalProperties:false},strict:true},
 {name:'recept_bekijken',description:'Bekijk het recept van een gerecht: ingrediënten, hoeveelheden, opbrengst, kostprijs per portie en wat ontbreekt. Vraag het product-id eerst op met producten_zoeken.',
  input_schema:{type:'object' as const,properties:{product_id:{type:'string'}},required:['product_id'],additionalProperties:false},strict:true},
 {name:'bestellijst_berekenen',description:'Bereken met de vaste rekenregel van de backoffice wat er besteld moet worden voor een aantal porties per gerecht: benodigde hoeveelheid, voorraad, onderweg en te bestellen, afgerond op verpakking. Dit is alleen een berekening; er wordt niets besteld.',
  input_schema:{type:'object' as const,properties:{nodig_op:{type:'string',description:'Datum YYYY-MM-DD waarop de ingrediënten binnen moeten zijn.'},porties:{type:'array',items:{type:'object',properties:{product_id:{type:'string'},aantal:{type:'number'}},required:['product_id','aantal'],additionalProperties:false}}},required:['nodig_op','porties'],additionalProperties:false},strict:true},
 {name:'weekmenu_bekijken',description:'Bekijk het weekmenu van deze week: het lopende concept en het bevestigde menu.',
  input_schema:{type:'object' as const,properties:{},required:[],additionalProperties:false},strict:true},
 {name:'weekmenu_voorstellen',description:'Leg een weekmenu vast als CONCEPT. Gebruik dit pas als Rianne aangeeft dat het menu zo goed is of dat ze het wil laten vastleggen. Alleen bestaande product-id\'s (een nieuw gerecht maak je eerst aan met product_aanmaken). Een nieuw concept vervangt een eerder concept van deze week. Bevestigen: de knop van Rianne, of weekmenu_bevestigen als zij daarom vraagt.',
  input_schema:{type:'object' as const,properties:{gerechten:{type:'array',items:{type:'object',properties:{product_id:{type:'string'},dag:{type:'string',enum:[...DAYS],description:'Leeg voor de hele week.'},porties:{type:['number','null'],description:'Verwachte porties, of null als nog onbekend.'},opmerking:{type:'string'}},required:['product_id','dag','porties','opmerking'],additionalProperties:false}},samenvatting:{type:'string',description:'Eén of twee zinnen voor Rianne, bijvoorbeeld de keuzes en bijzonderheden.'}},required:['gerechten','samenvatting'],additionalProperties:false},strict:true},
 {name:'weekmenu_bevestigen',description:'Bevestig het lopende concept-weekmenu van deze week, precies zoals de knop Bevestigen. Alleen als Rianne zegt dat het menu zo goed is en bevestigd mag worden. Daarna staat het als bevestigd menu op de website (weekmenu voor gasten).',
  input_schema:{type:'object' as const,properties:{},required:[],additionalProperties:false},strict:true},
 {name:'boodschap_toevoegen',description:'Zet iets op de boodschappenlijst van deze week, bijvoorbeeld als Rianne zegt "zet wc-papier op de lijst" of "we hebben nog twee kratten melk nodig". Dit bestelt niets; het komt alleen op de lijst onder het weekmenu, waar zij het afvinkt. Dezelfde naam twee keer wordt niet dubbel.',
  input_schema:{type:'object' as const,properties:{naam:{type:'string',description:'Wat er op de lijst moet, kort, bijvoorbeeld "wc-papier" of "volle melk".'},hoeveelheid:{type:'string',description:'Hoeveel, zoals gezegd, bijvoorbeeld "2 kratten". Leeg als niet genoemd.'}},required:['naam','hoeveelheid'],additionalProperties:false},strict:true},
];
export const TOOL_LABELS:Record<string,string>={boodschap_toevoegen:'boodschappenlijst',planning_bekijken:'centrale planning',producten_zoeken:'productlijst',voorraad_bekijken:'voorraad',recept_bekijken:'recepten',bestellijst_berekenen:'bestellijst-berekening',weekmenu_bekijken:'weekmenu',weekmenu_voorstellen:'weekmenu-concept',weekmenu_bevestigen:'weekmenu bevestigd'};

const inputs={
 planning_bekijken:z.object({}),
 producten_zoeken:z.object({zoekterm:z.string().max(100),afdeling:z.string().max(100)}),
 voorraad_bekijken:z.object({alleen_tekorten:z.boolean()}),
 recept_bekijken:z.object({product_id:z.string().min(1).max(100)}),
 bestellijst_berekenen:z.object({nodig_op:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),porties:z.array(z.object({product_id:z.string().min(1).max(100),aantal:z.number().positive().max(100000)})).min(1).max(50)}),
 weekmenu_bekijken:z.object({}),
 weekmenu_bevestigen:z.object({}),
 boodschap_toevoegen:z.object({naam:z.string().trim().min(1).max(120),hoeveelheid:z.string().trim().max(60)}),
 weekmenu_voorstellen:z.object({gerechten:z.array(z.object({product_id:z.string().min(1).max(100),dag:z.enum(DAYS),porties:z.number().positive().max(100000).nullable(),opmerking:z.string().max(300)})).min(1).max(40),samenvatting:z.string().min(1).max(600)}),
};

const view=(m:WeekMenuView)=>m?{status:m.status,versie:m.version,gerechten:m.items.map(i=>({product_id:i.productId,naam:i.name,dag:i.day||'hele week',porties:i.portions,opmerking:i.note}))}:null;

export async function runTool(name:string,raw:unknown,ctx:ToolContext):Promise<ToolOutcome>{
 const schema=inputs[name as keyof typeof inputs];
 const source=TOOL_LABELS[name]||name;
 if(!schema)return {content:'Onbekend hulpmiddel.',isError:true,source};
 const parsed=schema.safeParse(raw);
 if(!parsed.success)return {content:'Ongeldige invoer: '+parsed.error.issues.map(i=>i.path.join('.')+' '+i.message).join('; '),isError:true,source};
 const input=parsed.data as Record<string,unknown>;
 try{
  switch(name){
  case 'planning_bekijken':return ctx.planning?ok(await ctx.planning(ctx.week),'centrale planning'):{content:'Planning is niet beschikbaar.',isError:true,source};
  case 'producten_zoeken':{
   const term=String(input.zoekterm).trim().toLowerCase(),dep=String(input.afdeling||'').trim().toLowerCase();
   const [products,ops]=await Promise.all([ctx.products(),ctx.ops()]);
   const found=products.filter(p=>(!term||p.name.toLowerCase().includes(term))&&(!dep||p.department.toLowerCase().includes(dep)));
   const list=found.slice(0,25).map(p=>{const r=ops.recipes.find(r=>r.productId===p.id);const cost=r?recipeCost(ops,r,ctx.today):null;
    return {product_id:p.id,naam:p.name,afdeling:p.department,verkoopprijs:euro(p.priceCents),gepubliceerd:p.published,beschikbaar:p.available,recept:r?(r.reviewed?'gecontroleerd':'nog niet gecontroleerd'):'geen',kostprijs_per_portie:cost?euro(cost.portionCents):null}});
   return ok({aantal_gevonden:found.length,getoond:list.length,producten:list},source);}
  case 'voorraad_bekijken':{
   const ops=await ctx.ops();
   const rows=ops.ingredients.map(i=>{const onderweg=ops.incoming.filter(o=>o.ingredientId===i.id&&o.status==='confirmed').reduce((s,o)=>s+o.remaining,0);
    return {naam:i.name,eenheid:i.unit,voorraad:i.known?i.stock:null,geteld_op:i.countedAt||null,minimum:i.min,onderweg,leverancier:i.supplier||null,tekort:!i.known||i.stock<i.min}});
   const shown=input.alleen_tekorten?rows.filter(r=>r.tekort):rows;
   return ok({peildatum:ctx.today,toelichting:'voorraad null betekent: nog nooit geteld, dus onbekend.',ingredienten:shown.slice(0,80),aantal:shown.length},source);}
  case 'recept_bekijken':{
   const ops=await ctx.ops(),r=ops.recipes.find(r=>r.productId===input.product_id);
   if(!r)return ok({recept:null,toelichting:'Voor dit product is nog geen recept vastgelegd. Kostprijs en bestellijst zijn dan niet te berekenen.'},source);
   const cost=recipeCost(ops,r,ctx.today);
   return ok({naam:r.name,opbrengst_porties:r.yield,verlies_procent:r.lossPct,gecontroleerd:r.reviewed,ingredienten:r.lines.map(l=>({naam:ops.ingredients.find(i=>i.id===l.ingredientId)?.name||'onbekend ingrediënt',hoeveelheid:l.quantity,eenheid:ops.ingredients.find(i=>i.id===l.ingredientId)?.unit||''})),kostprijs_per_portie:euro(cost.portionCents),ontbrekende_prijzen:cost.missing,verouderde_prijzen:cost.stale,allergenen:cost.allergensChecked?cost.allergens:'nog niet gecontroleerd'},source);}
  case 'bestellijst_berekenen':{
   if(String(input.nodig_op)<ctx.today)return {content:'Kies een datum vanaf vandaag.',isError:true,source};
   const ops=await ctx.ops(),porties=input.porties as {product_id:string;aantal:number}[];
   const plan=shoppingPlan(ops,porties.map(p=>({productId:p.product_id,portions:p.aantal})),String(input.nodig_op),ctx.today);
   return ok({let_op:'Dit is een berekening. Er is niets besteld.',blokkades:plan.blockers,geschatte_kosten:euro(plan.totalCents),regels:plan.lines},source);}
  case 'boodschap_toevoegen':{
   if(!ctx.addShopping)return {content:'De boodschappenlijst is hier niet beschikbaar.',isError:true,source};
   const r=await ctx.addShopping(ctx.week,String(input.naam),String(input.hoeveelheid));
   return ok({toegevoegd:!r.already,al_op_de_lijst:r.already,naam:input.naam,hoeveelheid:input.hoeveelheid||null,toelichting:'Staat op de boodschappenlijst onder het weekmenu. Er is niets besteld.'},source);}
  case 'weekmenu_bekijken':{
   const m=await ctx.weekMenus(ctx.week);
   return ok({week_van:ctx.week,concept:view(m.concept),bevestigd:view(m.confirmed)},source);}
  case 'weekmenu_bevestigen':{
   if(!ctx.confirmWeekMenu)return {content:'Bevestigen is hier niet beschikbaar.',isError:true,source};
   const r=await ctx.confirmWeekMenu(ctx.week);
   if(!r)return {content:'Er is geen concept-weekmenu om te bevestigen. Leg het eerst vast met weekmenu_voorstellen.',isError:true,source};
   return ok({bevestigd:true,uitleg:'Het weekmenu is bevestigd en staat nu als bevestigd menu (ook voor gasten op de website).'},source);}
  case 'weekmenu_voorstellen':{
   const products=await ctx.products(),gerechten=input.gerechten as {product_id:string;dag:string;porties:number|null;opmerking:string}[];
   const unknown=gerechten.filter(g=>!products.some(p=>p.id===g.product_id)).map(g=>g.product_id);
   if(unknown.length)return {content:'Deze product-id\'s bestaan niet: '+unknown.join(', ')+'. Zoek ze eerst op met producten_zoeken. Een nieuw gerecht moet eerst in Producten worden aangemaakt.',isError:true,source};
   const items=gerechten.map(g=>({productId:g.product_id,day:g.dag,portions:g.porties,note:g.opmerking.trim()}));
   const r=await ctx.proposeWeekMenu(ctx.week,items,String(input.samenvatting).trim());
   return ok({vastgelegd_als:'concept',voorstel_id:r.proposalId,uitleg:'Rianne ziet het concept naast het gesprek. Ze kan het bevestigen met de knop Bevestigen, of jou vragen het te bevestigen (weekmenu_bevestigen).'},source);}
  }
  return {content:'Onbekend hulpmiddel.',isError:true,source};
 }catch(e){return {content:'Het ophalen lukte niet: '+(e instanceof Error?e.message:'onbekende fout')+'. Zeg eerlijk dat deze gegevens nu niet beschikbaar zijn.',isError:true,source}}
}
function ok(v:unknown,source:string):ToolOutcome{return {content:JSON.stringify(v),isError:false,source}}

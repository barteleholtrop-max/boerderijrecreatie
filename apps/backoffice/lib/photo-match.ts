// Beelden koppelen aan producten (wens eigenaar 3 november 2026: "de producten bewerken en zover mogelijk de foto's
// hieraan toevoegen"; beelden: foto's én tekeningen in stijl 4). Regels zonder database:
// - Een beeld uit de beeldbibliotheek past bij een product als de woorden van de productnaam in de naam van het beeld
//   staan (Drive-bestanden heten bijvoorbeeld "moj gember citrus fles"). Niets gaat automatisch: de backoffice stelt
//   voor, Rianne of Bartele keurt goed.
// - "Zeker" = bijna alle woorden kloppen én er is geen tweede kandidaat die bijna even goed is.
// - Tekening (naam bevat "tekening" of "illustratie") gaat voor bij de menukaart (restaurant); een foto bij de winkel.
export type MediaItem={id:string;name:string};
export type ProductItem={id:string;name:string;department:string};
export type Suggestion={mediaId:string;name:string;score:number;drawing:boolean};

const STOP=new Set(['de','het','een','van','met','en','in','op','voor','fles','flesje','flessen','flacon','pak','pakje','stuk','stuks','per','x','ml','cl','l','gr','g','kg','boer','bart','bb','foto','tekening','illustratie','stijl','4']);
export function tokens(name:string){
 return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/(\d)[.,](\d)/g,'$1$2').replace(/[^a-z0-9]+/g,' ').trim().split(' ').filter(t=>t&&!STOP.has(t));
}
// Gelijk, of meervoud/verbuiging (kruisbes ≈ kruisbessen, appel ≈ appels), maar niet een ander woord dat zo begint
// (appel ≠ appeltaart, wortel ≠ worteltaart).
const same=(a:string,b:string)=>{if(a===b)return true;const [s,l]=a.length<b.length?[a,b]:[b,a];return s.length>=4&&l.startsWith(s)&&l.length-s.length<=3};
/** 0..1: how well an image name fits a product name (mostly: are the product's words in the image name?). */
export function score(product:string,image:string){
 const p=tokens(product),m=tokens(image);if(!p.length||!m.length)return 0;
 const hitP=p.filter(t=>m.some(u=>same(t,u))).length/p.length,hitM=m.filter(t=>p.some(u=>same(t,u))).length/m.length;
 return Math.round((0.7*hitP+0.3*hitM)*100)/100;
}
export const isDrawing=(name:string)=>/tekening|illustratie/i.test(name);
export const SURE=0.85,MAYBE=0.5;
/** Best images per product, best first (at most 3). Drawings first for the restaurant, photos first for the shop. */
export function suggest(product:ProductItem,media:MediaItem[]):Suggestion[]{
 const wantDrawing=product.department.toLowerCase()!=='winkel';
 return media.map(m=>({mediaId:m.id,name:m.name,score:score(product.name,m.name),drawing:isDrawing(m.name)}))
  .filter(s=>s.score>=MAYBE)
  .sort((a,b)=>b.score-a.score||(Number(b.drawing===wantDrawing)-Number(a.drawing===wantDrawing))||a.name.localeCompare(b.name,'nl'))
  .slice(0,3);
}
export function sure(s:Suggestion[]){return s.length>0&&s[0].score>=SURE&&(s.length<2||s[1].score<=s[0].score-0.15)}

/** Opdracht om een tekening in stijl 4 te laten maken (besluit eigenaar 3 november 2026), per product. */
export function drawingPrompt(name:string){
 return `Getekende illustratie van „${name}” voor de menukaart van Boer Bart: inkt en waterverf, donkergroen, crème en terracotta, veel witruimte, zoals een handgetekende boerderijmenukaart. Eén onderwerp, vriendelijk en eerlijk weergegeven. Geen tekst, geen prijzen, geen logo's. Vierkant.`;
}
/** Bestandsnaam voor de Drive-map, zodat het beeld vanzelf bij het juiste product komt. */
export const driveFileName=(name:string,drawing:boolean)=>(drawing?'tekening ':'')+tokens(name).join(' ');

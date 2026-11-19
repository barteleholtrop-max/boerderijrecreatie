// Zoeken in lijsten (wens eigenaar 9 november 2026: „hier kan ik niet makkelijk een deelnemer zoeken, door bijvoorbeeld te typen”).
// Elk getypt woord moet ergens in de velden voorkomen; hoofdletters en accenten (é, ë, ö) maken niet uit.
export const plain=(v:string)=>String(v||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
export function matchesSearch(fields:(string|null|undefined)[],query:string){
 const words=plain(query).split(/\s+/).filter(Boolean);if(!words.length)return true;
 const hay=plain(fields.filter(Boolean).join(' '));return words.every(w=>hay.includes(w));
}

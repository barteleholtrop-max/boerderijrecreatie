// Product verwijderen via de prullenbak (wens eigenaar 5 november 2026: „een knop verwijderen bij de producten”).
// Een product wordt nooit echt gewist: oude bestellingen, recepten, voorraad en de coöperatieve winkel verwijzen ernaar.
// Verwijderen = uit de gastweergave (website, kassa, QR-bestellen) en uit alle lijsten in de backoffice; terugzetten kan
// via de Prullenbak bij Gerechten & prijzen. Teruggezet komt het product terug als concept, niet gepubliceerd.
export type Draft=Record<string,unknown>;
/** Staat dit product in de prullenbak? */
export const isDeleted=(draft:Draft)=>typeof draft.deletedAt==='string'&&draft.deletedAt.length>0;
/** Het concept na verwijderen: alles blijft bewaard, met het moment van verwijderen erbij. */
export function trashDraft(draft:Draft,now=new Date()):Draft{return {...draft,deletedAt:now.toISOString()}}
/** Het concept na terugzetten: het verwijdermoment gaat eraf, verder blijft alles gelijk. */
export function restoreDraft(draft:Draft):Draft{const {deletedAt:_,...rest}=draft;return rest}
/** Lijst voor de backoffice: standaard zonder prullenbak, of alleen de prullenbak. */
export function inView<T extends {draft:string}>(rows:T[],trash:boolean){return rows.filter(r=>{try{return isDeleted(JSON.parse(r.draft) as Draft)===trash}catch{return !trash}})}

// Foto's uploaden vanaf de telefoon (wens eigenaar 9 november 2026: „super makkelijk foto's uploaden”). De telefoon maakt de foto
// eerst kleiner (lange kant hooguit MAX_SIDE px, JPEG), zodat uploaden snel gaat en de bestelapp vlot laadt. Het rekenwerk staat
// hier zodat het te testen is; het verkleinen zelf gebeurt in de browser (app/producten/fotos/page.tsx).
export const MAX_SIDE=1600;
export const JPEG_QUALITY=0.85;
/** Nieuwe afmetingen binnen MAX_SIDE, verhouding gelijk; kleiner wordt nooit groter gemaakt. */
export function fitSize(width:number,height:number,max=MAX_SIDE):{width:number;height:number}{
 if(!(width>0&&height>0))throw Error('Ongeldige afmetingen.');
 const scale=Math.min(1,max/Math.max(width,height));
 return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}
/** Kies het kleinste goede bestand: het verkleinde, tenzij het origineel al klein genoeg en kleiner is. */
export function pickUpload(original:{size:number;type:string},resized:{size:number}|null,needsResize:boolean):'original'|'resized'{
 if(!resized)return 'original';
 if(needsResize)return 'resized';
 return /^image\/(jpeg|png|webp)$/.test(original.type)&&original.size<=resized.size?'original':'resized';
}

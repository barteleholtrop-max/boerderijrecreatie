// Vrolijke geluidjes voor de werkplekschermen (wens eigenaar 5 november 2026): elke werkplek een eigen geluid, zelf te
// kiezen. Gemaakt met de browser zelf (geen geluidsbestanden). De keuze geldt per tablet en per werkplek (browseropslag).
import type {Station} from './kiosk-core';
type Note=[freq:number,at:number,len:number];
export const SOUNDS={
 dingdong:{name:'Ding-dong',wave:'sine',notes:[[880,0,.3],[1175,.18,.32]]},
 belletje:{name:'Belletje',wave:'triangle',notes:[[1568,0,.25],[2093,.12,.45]]},
 deuntje:{name:'Vrolijk deuntje',wave:'triangle',notes:[[523,0,.14],[659,.12,.14],[784,.24,.14],[1047,.36,.35]]},
 koekoek:{name:'Koekoek',wave:'sine',notes:[[784,0,.25],[622,.3,.4]]},
 xylofoon:{name:'Xylofoon',wave:'square',notes:[[659,0,.12],[784,.13,.12],[988,.26,.12],[784,.39,.25]]},
} as const satisfies Record<string,{name:string;wave:OscillatorType;notes:readonly Note[]}>;
export type SoundId=keyof typeof SOUNDS;
export const DEFAULT_SOUND:Record<Station,SoundId>={kok:'dingdong',barista:'belletje',winkel:'deuntje'};
export const isSound=(v:unknown):v is SoundId=>typeof v==='string'&&Object.hasOwn(SOUNDS,v);
const key=(s:Station)=>'bb-werkplek-geluid-'+s;
export function savedSound(s:Station):SoundId{try{const v=localStorage.getItem(key(s));return isSound(v)?v:DEFAULT_SOUND[s]}catch{return DEFAULT_SOUND[s]}}
export function saveSound(s:Station,id:SoundId){try{localStorage.setItem(key(s),id)}catch{/* niet bewaard: alleen voor nu */}}
export function play(id:SoundId){
 try{const ctx=new AudioContext(),s=SOUNDS[id],peak=s.wave==='square'?.08:.25;
  for(const [f,t,len] of s.notes){const o=ctx.createOscillator(),g=ctx.createGain();o.type=s.wave;o.frequency.value=f;o.connect(g);g.connect(ctx.destination);
   g.gain.setValueAtTime(.0001,ctx.currentTime+t);g.gain.exponentialRampToValueAtTime(peak,ctx.currentTime+t+.02);g.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+t+len);
   o.start(ctx.currentTime+t);o.stop(ctx.currentTime+t+len+.02)}
  setTimeout(()=>{void ctx.close()},1500);
 }catch{/* geen geluid mogelijk */}
}

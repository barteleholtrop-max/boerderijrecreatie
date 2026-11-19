'use client';
// „Mogen we dit aan je startscherm toevoegen?” (wens eigenaar 8 november 2026). Verschijnt als de pagina in de browser wordt geopend en
// nog niet als app op het startscherm staat. Android/Chrome: één tik via de installatievraag van de browser. iPhone: korte uitleg
// (Delen → Zet op beginscherm). „Niet nu” verbergt de vraag een dag.
import {useEffect,useState} from 'react';
export const DAY_MS=24*60*60*1000;
type InstallEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed'}>};
export function standalone(){if(typeof window==='undefined')return true;return window.matchMedia?.('(display-mode: standalone)').matches||(navigator as unknown as {standalone?:boolean}).standalone===true}
/** altijd (managementapp, wens eigenaar 12 november 2026): zolang de app niet op het startscherm staat, blijft na „Niet nu”
 * een kleine knop „Op startscherm” staan, zodat je hem altijd met één tik kunt toevoegen. */
export function StartschermVraag({naam,className='startscherm-vraag',altijd=false}:{naam:string;className?:string;altijd?:boolean}){
 const [event,setEvent]=useState<InstallEvent|null>(null),[show,setShow]=useState(false),[ios,setIos]=useState(false),[done,setDone]=useState(''),[how,setHow]=useState(false),[browser,setBrowser]=useState(false);
 useEffect(()=>{
  if(standalone())return;
  setBrowser(true);
  // Met ?installeren=1 (ook via /apps): de vraag meteen tonen, ook na „Niet nu” en op een computer.
  const asked=new URLSearchParams(location.search).get('installeren')==='1';
  if(asked){try{localStorage.removeItem('startscherm-niet-nu:'+naam)}catch{}setShow(true)}
  // „Niet nu” (wens eigenaar 8 november 2026): de vraag komt pas na een dag terug.
  let hidden=false;try{hidden=Date.now()-Number(localStorage.getItem('startscherm-niet-nu:'+naam)||0)<DAY_MS}catch{}
  hidden=hidden&&!asked;
  const ua=navigator.userAgent,isIos=/iPhone|iPad|iPod/.test(ua)&&!/CriOS|FxiOS/.test(ua),mobile=/Android|iPhone|iPad|iPod/.test(ua);
  setIos(isIos);if(!hidden&&(isIos||mobile))setShow(true);
  // De installatievraag van de browser altijd bewaren, ook als de vraag verborgen is: dan werkt de knop „Op startscherm” met één tik.
  const on=(e:Event)=>{e.preventDefault();setEvent(e as InstallEvent);if(!hidden)setShow(true)};
  const installed=()=>{setShow(false);setDone('Staat op je startscherm.')};
  window.addEventListener('beforeinstallprompt',on);window.addEventListener('appinstalled',installed);
  return ()=>{window.removeEventListener('beforeinstallprompt',on);window.removeEventListener('appinstalled',installed)};
 },[naam]);
 // Twee keuzes (wens eigenaar 8 november 2026): „Ja, prima” of „Niet nu”. Kan de browser het niet zelf, dan volgt de korte uitleg.
 async function add(){if(!event){setHow(true);return}await event.prompt();const c=await event.userChoice.catch(()=>null);setEvent(null);if(c?.outcome==='accepted'){setShow(false);setDone('Staat op je startscherm.')}}
 function later(){try{localStorage.setItem('startscherm-niet-nu:'+naam,String(Date.now()))}catch{}setShow(false)}
 if(done)return <p className={className+' klaar'} role="status">{done}</p>;
 if(!show)return altijd&&browser?<button type="button" className="startscherm-knop" onClick={()=>{setHow(false);setShow(true)}}>＋ „{naam}” op je startscherm</button>:null;
 return <div className={className} role="dialog" aria-label={'„'+naam+'” op je startscherm zetten'}>
  <div><b>Mogen we „{naam}” aan je startscherm toevoegen?</b>
   <span>{how?(ios?'Tik onderin op Delen (het vierkantje met de pijl omhoog) en kies „Zet op beginscherm”.':'Open het menu van je browser (⋮) en kies „Toevoegen aan startscherm” of „App installeren”.'):'Dan open je hem voortaan met één tik, net als een app.'}</span></div>
  <div className="startscherm-knoppen">{how?<button type="button" className="startscherm-ja" onClick={later}>Klaar</button>:<><button type="button" className="startscherm-ja" onClick={()=>void add()}>Ja, prima</button><button type="button" className="startscherm-nee" onClick={later}>Niet nu</button></>}</div>
 </div>;
}

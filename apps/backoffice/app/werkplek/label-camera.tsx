'use client';
// Eigen camerascherm voor etiketten op de werkplek (wens eigenaar 11 november 2026: „bij Uit de winkel halen en bij Levering hetzelfde
// etiket fotograferen als bij de kassa, meerdere etiketten achter elkaar”). Zelfde opzet als de zelfkassa (apps/website/bestellen.js,
// openLabelCamera): groot camerabeeld, onderin „Foto maken” / „Volgend etiket” en „Klaar”, bovenin wat er al gelezen is. Elke foto gaat
// meteen naar onShot; de ouder leest hem terwijl de medewerker de volgende maakt. Geen spiegelbeeld. Lukt de camera niet (geen
// toestemming, oude browser), dan opent de knop de camera-app van het toestel.
import {useEffect,useRef,useState} from 'react';

export function LabelCamera({onShot,onClose,status,count,full=false}:{onShot:(photo:Blob)=>void;onClose:()=>void;status:string;count:number;full?:boolean}){
 const video=useRef<HTMLVideoElement>(null),file=useRef<HTMLInputElement>(null);
 const [failed,setFailed]=useState(false),[flash,setFlash]=useState(false);
 useEffect(()=>{
  let stream:MediaStream|null=null,alive=true;
  document.documentElement.classList.add('cam-open');
  if(!navigator.mediaDevices?.getUserMedia||!window.isSecureContext)setFailed(true);
  // Altijd de achtercamera (besluit eigenaar 12 november 2026); heeft het toestel die niet, dan de camera die er is.
  else navigator.mediaDevices.getUserMedia({video:{facingMode:{exact:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false})
   .catch(()=>navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false}))
   .then(s=>{if(!alive){s.getTracks().forEach(t=>t.stop());return}stream=s;if(video.current){video.current.srcObject=s;void video.current.play().catch(()=>{})}})
   .catch(()=>{if(alive)setFailed(true)});
  return()=>{alive=false;stream?.getTracks().forEach(t=>t.stop());document.documentElement.classList.remove('cam-open')};
 },[]);
 function shoot(){
  const v=video.current;if(!v||!v.videoWidth||full)return;
  const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d')!.drawImage(v,0,0,c.width,c.height);
  setFlash(true);setTimeout(()=>setFlash(false),150);
  c.toBlob(b=>{if(b)onShot(b)},'image/jpeg',0.9);
 }
 return <div className="label-cam" role="dialog" aria-modal="true" aria-label="Etiketten fotograferen">
  <video ref={video} className="cam-video" autoPlay muted playsInline/>
  {flash&&<div className="cam-flash"/>}
  <div className="cam-top"><p className="cam-status" aria-live="polite">{failed&&!count?'De camera opent hier niet (geen toestemming?). Gebruik de camera-app van het toestel.':status}</p>
   <button type="button" className="cam-close" aria-label="Stoppen met fotograferen" onClick={onClose}>×</button></div>
  <div className="cam-bottom">
   <button type="button" className={'cam-done'+(full?' cam-done-now':'')} onClick={onClose}>{count?`Klaar (${count})`:'Stoppen'}</button>
   {failed?<button type="button" className="cam-shot" disabled={full} onClick={()=>file.current?.click()}><span aria-hidden="true">📷</span><b>Camera-app openen</b></button>
    :<button type="button" className="cam-shot" disabled={full} onClick={shoot}><span aria-hidden="true">📸</span><b>{count?'Volgend etiket':'Foto maken'}</b></button>}
  </div>
  <input ref={file} type="file" accept="image/*" capture="environment" hidden onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)onShot(f)}}/>
 </div>;
}

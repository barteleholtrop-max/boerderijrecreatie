'use client';
// Spraak in de assistenten (wens eigenaar 9 november 2026: „alsof je aan het WhatsAppen bent met de Weekassistent, inclusief
// spraak”). Inspreken en voorlezen met wat de browser zelf kan (Web Speech API), in het Nederlands. Er wordt geen geluid in
// de backoffice opgeslagen. Let op: Chrome en Safari sturen het ingesproken geluid voor de omzetting naar hun eigen
// spraakdienst (Google of Apple); de tekst komt daarna gewoon in het berichtveld en gaat pas weg als je op verstuur tikt.
import {useCallback,useEffect,useRef,useState} from 'react';

type Recognition={lang:string;continuous:boolean;interimResults:boolean;start():void;stop():void;abort():void;
 onresult:((e:{resultIndex:number;results:ArrayLike<ArrayLike<{transcript:string}>&{isFinal:boolean}>})=>void)|null;onend:(()=>void)|null;onerror:((e:{error:string})=>void)|null};
const recognitionClass=()=>typeof window==='undefined'?null:((window as unknown as {SpeechRecognition?:new()=>Recognition;webkitSpeechRecognition?:new()=>Recognition}).SpeechRecognition
 ||(window as unknown as {webkitSpeechRecognition?:new()=>Recognition}).webkitSpeechRecognition||null);
const errorText:Record<string,string>={'not-allowed':'De microfoon is geblokkeerd. Sta de microfoon toe in de instellingen van je browser.','service-not-allowed':'Inspreken is in deze browser uitgeschakeld.','no-speech':'Er werd niets gehoord. Probeer het nog eens.','audio-capture':'Er is geen microfoon gevonden.','network':'Inspreken lukt nu niet: geen verbinding met de spraakdienst.'};

/** Inspreken: tik om te beginnen, tik om te stoppen. `onText` krijgt de tekst tot nu toe (ook tussentijds). */
export function useDictation(onText:(text:string)=>void){
 const [supported,setSupported]=useState(false),[listening,setListening]=useState(false),[problem,setProblem]=useState('');
 const rec=useRef<Recognition|null>(null),base=useRef(''),cb=useRef(onText);cb.current=onText;
 useEffect(()=>{setSupported(!!recognitionClass());return()=>rec.current?.abort()},[]);
 const stop=useCallback(()=>{rec.current?.stop()},[]);
 const start=useCallback((current:string)=>{
  const R=recognitionClass();if(!R){setProblem('Inspreken kan niet in deze browser. Gebruik de microfoon op het toetsenbord.');return}
  setProblem('');base.current=current.trim()?current.trim()+' ':'';
  const r=new R();r.lang='nl-NL';r.continuous=true;r.interimResults=true;
  let finalText='';
  r.onresult=e=>{let interim='';for(let i=e.resultIndex;i<e.results.length;i++){const res=e.results[i];if(res.isFinal)finalText+=res[0].transcript;else interim+=res[0].transcript}
   cb.current((base.current+finalText+interim).replace(/\s+/g,' ').trimStart())};
  r.onerror=e=>{if(e.error!=='aborted')setProblem(errorText[e.error]||'Inspreken lukte niet ('+e.error+').')};
  r.onend=()=>{setListening(false);rec.current=null};
  rec.current=r;try{r.start();setListening(true)}catch{setProblem('Inspreken lukte niet. Probeer het nog eens.')}
 },[]);
 return {supported,listening,problem,start,stop};
}

const VOICE_KEY='bb-voorlezen';
/** Voorlezen van nieuwe antwoorden, aan of uit per apparaat. */
export function useReadAloud(){
 const [supported,setSupported]=useState(false),[on,setOn]=useState(false);
 useEffect(()=>{setSupported(typeof window!=='undefined'&&'speechSynthesis' in window);try{setOn(localStorage.getItem(VOICE_KEY)==='1')}catch{}},[]);
 const toggle=useCallback(()=>{setOn(v=>{const n=!v;try{localStorage.setItem(VOICE_KEY,n?'1':'0')}catch{};if(!n)window.speechSynthesis?.cancel();return n})},[]);
 const say=useCallback((text:string)=>{
  if(!('speechSynthesis' in window))return;const s=window.speechSynthesis;s.cancel();
  const u=new SpeechSynthesisUtterance(text.replace(/\*\*/g,'').replace(/^\s*[-•]\s+/gm,'').slice(0,3000));u.lang='nl-NL';
  const nl=s.getVoices().find(v=>v.lang?.toLowerCase().startsWith('nl'));if(nl)u.voice=nl;s.speak(u);
 },[]);
 return {supported,on,toggle,say};
}

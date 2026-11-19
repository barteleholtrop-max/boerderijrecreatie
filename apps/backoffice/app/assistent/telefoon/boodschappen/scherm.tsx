'use client';
// Boodschappenlijst in de app Gesprekken (wens eigenaar 10 november 2026): met één tik je lijst in de winkel.
import {useEffect,useState} from 'react';
import {Boodschappen} from '../../boodschappen';
export default function Page(){
 const [week,setWeek]=useState(''),[title,setTitle]=useState(''),[problem,setProblem]=useState('');
 useEffect(()=>{fetch('/api/assistent',{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);setWeek(d.week);setTitle(d.weekTitle)}).catch(e=>setProblem(e.message))},[]);
 return <div className="tel" data-bb-view="boodschappen-telefoon">
  <div className="tel-head"><div><span className="eyebrow">{title||'Boerderijrecreatie'}</span><h1>Boodschappen</h1></div></div>
  {problem&&<div className="message error" role="alert">{problem}</div>}
  {week?<Boodschappen week={week} refresh={0}/>:!problem&&<p className="small">Laden…</p>}
 </div>;
}

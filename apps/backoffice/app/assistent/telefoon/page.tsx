import {redirect} from 'next/navigation';
// Oud adres van de managementapp (geen kamer slopen): stuurt door naar /management/assistent, met dezelfde vraag (bijvoorbeeld ?gesprek=…
// uit een melding). Sinds 12 november 2026 heeft de managementapp een eigen werkgebied /management/ (wens eigenaar: losse apps).
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const q=new URLSearchParams();for(const [k,v] of Object.entries(await searchParams))for(const x of [v].flat())if(typeof x==='string')q.append(k,x);
 redirect('/management/assistent'+(q.size?'?'+q:''));
}

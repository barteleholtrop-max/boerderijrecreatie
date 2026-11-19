import type { Metadata } from 'next';
import {ledenOrigin,werkstationOrigin} from '@/lib/member-origin';
import {headers} from 'next/headers';
import Script from 'next/script';
import './globals.css';
import {Shell} from './shell';
// Startscherm (wens eigenaar 9 november 2026): de backoffice als eigen app met icoon „BACKOFFICE”. Geen vaste startpagina: de
// snelkoppeling opent het scherm dat je toevoegt. Kassa, werkplek, opnemen en de ledenpagina hebben een eigen manifest.
export const metadata:Metadata={title:'Backoffice | Boerderijrecreatie',description:'Privé backoffice voor Boerderijrecreatie',manifest:'/backoffice.webmanifest',
 appleWebApp:{capable:true,title:'Backoffice',statusBarStyle:'default'},icons:{icon:'/favicon.svg',apple:'/icons/backoffice-192.png'}};
export default async function RootLayout({children}:{children:React.ReactNode}){
 const h=await headers(),owner=h.get('x-boer-bart-verified-user')==='owner',signedIn=!!h.get('x-boer-bart-role'),onderdelen=h.get('x-boer-bart-onderdelen');
 return <html lang="nl"><body>{ledenOrigin()&&<meta name="leden-origin" content={ledenOrigin()}/>}{werkstationOrigin()&&<meta name="werkstation-origin" content={werkstationOrigin()}/>}<Shell signedIn={signedIn} onderdelen={onderdelen}>{children}</Shell>{owner&&process.env.BACKOFFICE_DEV_MODE==='1'&&<Script src="/api/improvements/client.js" strategy="afterInteractive"/>}</body></html>
}

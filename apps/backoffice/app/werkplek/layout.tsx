import type {Metadata} from 'next';
import {WerkplekVernieuwen} from '../werkplek-vernieuwen';
// Startscherm (wens eigenaar 9 november 2026): de werkplekken op de tablet (koffiebar, keuken, winkel, dagplanning) als eigen app met icoon „WERKPLEK”. Geen vaste startpagina: de
// snelkoppeling opent het scherm dat je toevoegt. Het scherm zelf blijft achter de login van de backoffice,
// of een gekoppelde werkplektablet (QR-code uit Toegang).
export const metadata:Metadata={manifest:'/werkplek.webmanifest',appleWebApp:{capable:true,title:'Werkplek',statusBarStyle:'default'},icons:{icon:'/favicon.svg',apple:'/icons/werkplek-192.png'}};
// Een gekoppelde tablet vernieuwt hier zijn werkplekpas (app/werkplek-vernieuwen.tsx, docs/WERKPLEK-TABLETS.md).
export default function Layout({children}:{children:React.ReactNode}){return <>{children}<WerkplekVernieuwen/></>}

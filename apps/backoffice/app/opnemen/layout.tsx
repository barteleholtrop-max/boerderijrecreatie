import type {Metadata} from 'next';
import {WerkplekVernieuwen} from '../werkplek-vernieuwen';
// Startscherm (wens eigenaar 9 november 2026): opnemen aan tafel bij Ite als eigen app met icoon „OPNEMEN”. Geen vaste startpagina: de
// snelkoppeling opent het scherm dat je toevoegt. Het scherm zelf blijft achter de login van de backoffice,
// of een gekoppelde werkplektablet (QR-code uit Toegang).
export const metadata:Metadata={manifest:'/opnemen.webmanifest',appleWebApp:{capable:true,title:'Opnemen',statusBarStyle:'default'},icons:{icon:'/favicon.svg',apple:'/icons/opnemen-192.png'}};
// Een gekoppelde tablet vernieuwt hier zijn werkplekpas (app/werkplek-vernieuwen.tsx, docs/WERKPLEK-TABLETS.md).
export default function Layout({children}:{children:React.ReactNode}){return <>{children}<WerkplekVernieuwen/></>}

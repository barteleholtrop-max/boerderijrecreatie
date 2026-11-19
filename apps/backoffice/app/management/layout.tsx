import type {Metadata} from 'next';
import {TelefoonApp} from '@/app/telefoon-app';
// De managementapp (wens eigenaar 12 november 2026: „meerdere apps, allemaal met losse iconen op het startscherm”): eigen werkgebied
// /management/ met een eigen id in public/gesprekken.webmanifest. Zonder het menu van de backoffice; de schermen blijven achter de login.
export const metadata:Metadata={manifest:'/gesprekken.webmanifest',appleWebApp:{capable:true,title:'Management',statusBarStyle:'default'},icons:{icon:'/favicon.svg',apple:'/icons/gesprekken-192.png'}};
export default function Layout({children}:{children:React.ReactNode}){return <TelefoonApp>{children}</TelefoonApp>}

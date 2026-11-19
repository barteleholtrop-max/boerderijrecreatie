import type {Metadata} from 'next';
// Kassa als eigen app op het startscherm (wens eigenaar 8 november 2026): naam „Kassa” en een eigen icoon, zodat hij niet lijkt op
// de ledenpagina of de bestelpagina. De kassa zelf blijft achter de login van de backoffice.
export const metadata:Metadata={manifest:'/kassa.webmanifest',appleWebApp:{capable:true,title:'Kassa',statusBarStyle:'default'},icons:{icon:'/favicon.svg',apple:'/icons/kassa-192.png'}};
export default function Layout({children}:{children:React.ReactNode}){return children}

// Website & uitstraling → „Websites bekijken en testen”: per website een link en alle pagina's, om snel alles te kunnen
// testen. De website (apps/website) bevat de voorpagina, de bestelapp, de zelfscan en de zelfkassa. Het adres staat in
// WEBSITE_URL, anders het eerste websiteadres uit PUBLIC_ORDER_ORIGINS. De paginalijst wordt in een test vergeleken met de
// echte bestanden (apps/website/*.html), zodat hij niet veroudert.
export type SitePage={path:string;label:string};
export type Site={id:'website';name:string;note:string;url:string|null;pages:SitePage[]};
export const WEBSITE_PAGES:SitePage[]=[
 {path:'/',label:'Voorpagina'},{path:'/bestellen.html',label:'Bestellen (bestelapp)'},{path:'/zelfscan.html',label:'Zelfscan (eigen telefoon)'},{path:'/zelfkassa.html',label:'Zelfkassa (tablet bij de koeling of in de winkel)'},
];
const clean=(v:string|undefined)=>{try{const u=new URL((v||'').trim());return u.protocol==='https:'||u.protocol==='http:'?u.origin:null}catch{return null}};
/** De website met haar adres. origins = de toegestane websiteadressen van de backoffice (PUBLIC_ORDER_ORIGINS). */
export function sites(origins:string[],env:Record<string,string|undefined>=process.env):Site[]{
 const site=clean(env.WEBSITE_URL)||origins.find(o=>!/127\.0\.0\.1|:3003$|:3004$/.test(o))||null;
 return [{id:'website',name:'Website',note:'Voorpagina, bestelapp, zelfscan en zelfkassa.',url:site,pages:WEBSITE_PAGES}];
}

// Website & uitstraling → „Websites bekijken en testen” (wens eigenaar 6 november 2026): per website een link en alle pagina's,
// om snel alles te kunnen testen. De websites zelf zijn openbaar; iedereen met de link kan ze bekijken.
// Indeling (besluit eigenaar 15 november 2026, docs/SITES.md): de hoofdsite (boerbart.nl, apps/website-fab) en de
// gast-apps (zelfscan, zelfkassa; apps/website). Adressen: de gast-apps staan in PUBLIC_ORDER_ORIGINS, de hoofdsite op
// de Cloud Run-dienst boerbart-website-fab. WEBSITE_URL en WEBSITE_FAB_URL kunnen dat overschrijven. De paginalijsten worden in een test vergeleken
// met de echte bestanden (apps/website/*.html en apps/website-fab/src/routes.ts), zodat ze niet verouderen.
export type SitePage={path:string;label:string};
export type Site={id:'website'|'website-fab';name:string;note:string;url:string|null;pages:SitePage[]};
export const FAB_URL='https://boerbart-website-fab-206627521194.europe-west3.run.app';
export const WEBSITE_PAGES:SitePage[]=[
 {path:'/',label:'Homepage'},{path:'/bestellen.html',label:'Bestellen (bestelapp)'},{path:'/zelfscan.html',label:'Zelfscan (boodschappen, eigen telefoon)'},{path:'/zelfkassa.html',label:'Zelfkassa (tablet in de winkel)'},{path:'/abonnementen.html',label:'Oogstabonnementen'},
];
export const FAB_PAGES:SitePage[]=[
 {path:'/',label:'Homepage'},{path:'/speelboerderij/',label:'Speelboerderij'},{path:'/yte/',label:'Ite by Boer Bart'},{path:'/boerderijwinkel/',label:'Boerderijwinkel'},
 {path:'/agenda/',label:'Agenda'},{path:'/nieuws/',label:'Nieuws & blog'},{path:'/nijemoed-bloemen/',label:'Nijemoed Bloemen'},{path:'/groepen/',label:'Groepen & feesten'},{path:'/over-ons/',label:'Over ons'},
 {path:'/vragen/',label:'Vragen'},{path:'/contact/',label:'Contact'},{path:'/verstuurd/',label:'Verstuurd (na een formulier)'},{path:'/privacy/',label:'Privacy'},
 {path:'/mijn-bloei/',label:'Mijn Bloei (straks cooperatie.boerbart.nl)'},{path:'/bloeimarkt/',label:'Bloeimarkt (straks cooperatie.boerbart.nl)'},{path:'/bestellen/',label:'Bestellen (bestelapp)'},
];
const clean=(v:string|undefined)=>{try{const u=new URL((v||'').trim());return u.protocol==='https:'||u.protocol==='http:'?u.origin:null}catch{return null}};
/** De websites met hun adres. origins = de toegestane websiteadressen van de backoffice (PUBLIC_ORDER_ORIGINS). */
export function sites(origins:string[],env:Record<string,string|undefined>=process.env):Site[]{
 const fab=clean(env.WEBSITE_FAB_URL)||(origins.includes(FAB_URL)?FAB_URL:origins.find(o=>/^http:\/\/localhost:3004$/.test(o)))||FAB_URL;
 const site=clean(env.WEBSITE_URL)||origins.find(o=>o!==fab&&!/127\.0\.0\.1|:3003$|:3004$/.test(o))||null;
 return [
  {id:'website-fab',name:'Hoofdsite (boerbart.nl)',note:'Het verhaal en de bestelapp op /bestellen/. Komt op boerbart.nl.',url:fab,pages:FAB_PAGES},
  {id:'website',name:'Gast-apps (zelfscankassa.boerbart.nl)',note:'Zelfscan en zelfkassa in de winkel. De bestelapp krijgt bij de overstap boerbart.nl/bestellen/.',url:site,pages:WEBSITE_PAGES},
 ];
}

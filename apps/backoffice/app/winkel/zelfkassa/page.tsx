// Boerderijwinkel → Zelfkassa & QR-stickers (wens eigenaar 9 november 2026): de link voor de tablet in de winkel (alleen de
// bestelkassa, geen werkplekken) en QR-stickers per winkelproduct om te printen. Het adres van de website komt uit
// PUBLIC_ORDER_ORIGINS / WEBSITE_URL (lib/website-links.ts); zie docs/ZELFSERVICEKASSA.md.
import {allowedOrigins} from '@/lib/public-orders';
import {sites} from '@/lib/website-links';
import {Zelfkassa} from './zelfkassa';
export const dynamic='force-dynamic';
export default function Page(){
 const site=sites(allowedOrigins()).find(s=>s.id==='website')?.url||null;
 return <Zelfkassa site={site}/>;
}

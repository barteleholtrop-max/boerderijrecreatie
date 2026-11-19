// Website & uitstraling. Bovenaan „Websites bekijken en testen” (6 november 2026): per website een link en alle pagina's.
// Daaronder het bestaande bewerkscherm (editor.tsx). De links worden op de server samengesteld uit de instellingen.
import {WebsiteEditor} from './editor';
import {WebsiteLinks} from './links';
import {Uitstraling} from './uitstraling';
import {Onderdelen} from './onderdelen';
import {SubTabs} from '../ui';
import {WEBSITE_TABS} from './tabs';
export const dynamic='force-dynamic';
// Uitstraling bestelapp (wens eigenaar 9 november 2026): tussen het bewerkscherm en de links.
// Onderdelen van de hoofdsite (15 november 2026): bovenaan, het eerste waar de eigenaar naar kijkt.
// Website als één onderdeel met tabbladen (16 november 2026): Website & uitstraling, Inhoud en Privacy.
export default function Website(){return <><SubTabs current="/website" items={WEBSITE_TABS}/><Onderdelen/><WebsiteEditor/><Uitstraling/><WebsiteLinks/></>}

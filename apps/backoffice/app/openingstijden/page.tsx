import {PlanningWorkspace} from '../planning/workspace';
// Openingstijden & capaciteit (wens eigenaar 3 november 2026): openingstijden, afwijkende dagen, capaciteit, tijdblokken,
// het Ite-eetmoment en de tafels in een eigen menu-onderdeel, los van de agenda en aanvragen in Planning.
// Tot 3 november 2026 verwees dit adres door naar /planning (PR #31); het adres blijft dus hetzelfde.
// Daaronder de koppeling met het Google Bedrijfsprofiel (besluit eigenaar 4 november 2026, app/openingstijden/google-profiel.tsx).
export default function Openingstijden(){return <PlanningWorkspace settingsOnly/>}

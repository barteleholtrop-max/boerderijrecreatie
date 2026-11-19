// Weekassistent met alle rechten (wens eigenaar 13 november 2026): „De weekassistent moet Rianne volledig helpen en heeft alle
// rechten, zoals dingen in de agenda zetten, producten aanmaken enz. Ze moet Rianne volledig en in alles (behalve coderen) helpen.”
// De keukenhulpmiddelen (weekmenu, voorraad, recepten, boodschappen) plus alle hulpmiddelen van de Backoffice-assistent
// (agenda, klanten, producten, leden, rooster, openingstijden, overleg). Bij een gelijke naam wint de keukenversie.
import type {Kit} from './assistant-engine';
import {TOOL_DEFINITIONS as WEEK_TOOLS,runTool as runWeekTool,type ToolContext} from './assistant-tools';
import {TOOL_DEFINITIONS as HULP_TOOLS,runTool as runHulpTool,type HulpContext} from './hulp-tools';
import {SYSTEM_PROMPT} from './assistant-prompt';
import {HULP_SYSTEM_PROMPT} from './hulp-prompt';

export type FullContext={week:ToolContext;hulp:HulpContext};
const WEEK_NAMES=new Set<string>(WEEK_TOOLS.map(t=>t.name));
export const FULL_TOOLS=[...WEEK_TOOLS,...HULP_TOOLS.filter(t=>!WEEK_NAMES.has(t.name))];
// De vaste tekst van de Backoffice-assistent, zonder de eerste regel (wie hij is): de Weekassistent blijft zichzelf.
const BACKOFFICE_RULES=HULP_SYSTEM_PROMPT.slice(HULP_SYSTEM_PROMPT.indexOf('\n')+1).trim();
export const FULL_SYSTEM_PROMPT=`${SYSTEM_PROMPT}

Naast de keuken help je Rianne met ALLES in de backoffice, met dezelfde rechten en afspraken als de Backoffice-assistent hieronder: agenda en afspraken, klanten en opties, producten aanmaken en wijzigen, leden en rooster, openingstijden en overleg. Waar hieronder "de beheerder" staat, is dat Rianne.

${BACKOFFICE_RULES}`;
export const FULL_KIT:Kit<FullContext>={
 system:FULL_SYSTEM_PROMPT,
 tools:FULL_TOOLS,
 runTool:(name,input,ctx)=>WEEK_NAMES.has(name)?runWeekTool(name,input,ctx.week):runHulpTool(name,input,ctx.hulp),
};

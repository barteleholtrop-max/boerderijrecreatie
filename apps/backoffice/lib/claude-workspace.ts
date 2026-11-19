// Claude-werkruimte (8 november 2026): een persoonlijke Claude-sleutel (sk-ant-usr-…) hoort niet vast bij één werkruimte. Bij
// elk verzoek moet dan het werkruimte-ID mee in de kop anthropic-workspace-id, anders weigert Claude met „This API key is not
// scoped to a workspace”. Het ID staat in de Claude Console bij de sleutel („Werkruimte-ID”, wrkspc_…) en is niet geheim.
// Instelling: Systeem & koppelingen → AI voor gasten → Claude werkruimte-ID (of ANTHROPIC_WORKSPACE_ID op de server).
// Geen database of netwerk: ook bruikbaar in tests.
export const WORKSPACE_ID=/^wrkspc_[A-Za-z0-9]{8,64}$/;
/** De kop voor de Claude-client, of undefined als er geen (geldig) werkruimte-ID is ingesteld. */
export function workspaceHeaders(id:string|null|undefined):Record<string,string>|undefined{
 const v=(id||'').trim();return WORKSPACE_ID.test(v)?{'anthropic-workspace-id':v}:undefined;
}
/** Weigerde Claude omdat het werkruimte-ID ontbrak? */
export const missingWorkspace=(message:unknown)=>/not scoped to a workspace|anthropic-workspace-id/i.test(String(message||''));
export const MISSING_WORKSPACE_TEXT='Deze Claude-sleutel is een persoonlijke sleutel en hoort niet vast bij een werkruimte. Vul bij Systeem & koppelingen → AI voor gasten het Claude werkruimte-ID in (in de Claude Console bij de sleutel: „Werkruimte-ID”, begint met wrkspc_), of gebruik een werkruimte-sleutel.';

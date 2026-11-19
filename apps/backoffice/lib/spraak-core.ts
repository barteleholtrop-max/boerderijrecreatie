// Ingesproken boodschap terugbrengen tot wat er op de lijst moet (wens eigenaar 9 november 2026: „zet wc-papier op de lijst”).
// Pure regel, los te testen: „Zet wc-papier op de lijst” → „wc-papier”; „we hebben nog twee kratten melk nodig” → „twee kratten melk”.
export function spokenItem(raw:string){
 let t=String(raw||'').replace(/\s+/g,' ').trim().replace(/[.!?]+$/,'');
 t=t.replace(/^(wil je|kun je|kan je|graag)\s+/i,'');
 t=t.replace(/^(zet|doe|voeg|schrijf)\s+(nog\s+)?/i,'').replace(/\s+(op|aan|bij)\s+(de|het)\s+(boodschappen)?(lijst|lijstje)(\s+(toe|erbij|bij|op))?$/i,'').replace(/\s+(erbij|toe|erop)$/i,'');
 t=t.replace(/^(we|wij)\s+(hebben|moeten)\s+(nog\s+)?/i,'').replace(/\s+(nodig|halen|kopen|hebben)$/i,'');
 t=t.replace(/^(nog\s+)/i,'').trim();
 return t.charAt(0).toLowerCase()===t.charAt(0)?t:t.charAt(0).toLowerCase()+t.slice(1);
}

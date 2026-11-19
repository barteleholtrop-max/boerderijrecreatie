// Regels voor het bolletje in de app Management, zonder database (los te testen). Zie lib/gesprekken-teller.ts.
export const isWaiting=(w:string)=>w==='klant-wacht'||w==='opnieuw-open';
/** Websitechat: afgehandeld en „wacht op gast” tellen niet; de rest wacht op ons (zoals in Gesprekken). */
export const chatWaits=(status:string)=>status!=='afgehandeld'&&status!=='wacht op gast';

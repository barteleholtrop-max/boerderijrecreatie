// Werkplek- en opnameschermen (wens eigenaar 3 november 2026): vriendelijke teksten en kleine rekenregels, zonder
// database. „De uitstraling mag iets vriendelijker … Hey talent, lekker bezig.”
export const STATIONS={kok:{name:'Kok',plural:'gerechten',icon:'🍳',handoff:'Zet het klaar bij de uitgifte.'},barista:{name:'Barista',plural:'drankjes',icon:'☕',handoff:'Zet het klaar bij de koffiebar.'},winkel:{name:'Winkel',plural:'winkelbestellingen',icon:'🧺',handoff:'Zet het klaar bij de winkel.'}} as const;
export type Station=keyof typeof STATIONS;
export const isStation=(v:unknown):v is Station=>typeof v==='string'&&Object.hasOwn(STATIONS,v);

// Teksten (wens eigenaar 3 november 2026): verrassen en complimenteren, nooit suggereren dat het zwaar is of was.
// Dus geen „rustig aan” of „even ademhalen”, wel „Jij gaat lekker!” (dubbelzinnig bedoeld). Ze wisselen per kwartier.
const CHEERS:Record<Station,string[]>={
 kok:['Hey talent, lekker bezig!','Jij gaat lekker, chef!','Jij bakt er niks van… behalve alles.','Het ruikt hier naar een vijfsterrenkeuken.','Dit bord komt straks leeg terug. Beloofd.','Ei, ei, ei, wat ben jij goed bezig!','Hier staat een toptalent achter het fornuis.','Gasten likken straks hun vingers af. Dankzij jou.','Een compliment van de chef. Aan de chef.','Jij maakt van eten een feestje.'],
 barista:['Hey talent, lekker bezig!','Jij gaat lekker, barista!','Jij bent de crème de la crème.','Melkschuim met een glimlach: jouw handelsmerk.','Jij zet hier de toon. En de koffie.','Heilig boontje van de koffiebar!','Een cappuccino zonder jou is gewoon warme melk.','Jouw koffie maakt van gasten vaste gasten.','Espresso-snel en toch met liefde gezet.','Wat een schuimkunstenaar staat hier!'],
 winkel:['Hey talent, lekker bezig!','Jij gaat lekker vandaag!','Vers van het erf, met zorg van jou.','De boerderij in een tasje, met een strik van jou.','Jij bent de kers op de taart.','Eén uit duizend, net als onze eieren.','Mooi ingepakt is half verkocht.','Gasten gaan blij naar huis, dankzij jou.'],
};
const EMPTY:Record<Station,string[]>={
 kok:['Alles is de deur uit. Wat een tempo!','Lege bonnenrij: knap gedaan.','Alles geserveerd. Tijd voor een proeflepeltje!','Niets op het vuur. Klaar voor de volgende ronde?'],
 barista:['Alles geschonken. Snelste barista van het erf!','Lege bar, blije gasten. Mooi zo!','Geen bestellingen: tijd voor je mooiste latte-art.','Alles is de deur uit. Proost op jou!'],
 winkel:['Alles staat klaar. Top!','Alle tasjes ingepakt. Netjes!','Niets meer te doen: de winkel ziet er weer prachtig uit.'],
};
const quarter=(now:Date)=>Math.floor(now.getTime()/900000);
/** Wisselt rustig (per kwartier) zodat de tekst niet bij elke verversing verspringt. */
export function cheer(station:Station,now=new Date()){const list=CHEERS[station];return list[quarter(now)%list.length]}
export function greeting(now=new Date()){const h=Number(new Intl.DateTimeFormat('nl-NL',{hour:'numeric',hourCycle:'h23',timeZone:'Europe/Amsterdam'}).format(now));return h<12?'Goedemorgen':h<18?'Goedemiddag':'Goedenavond'}
export function emptyText(station:Station,now=new Date()){const list=EMPTY[station];return list[quarter(now)%list.length]}
/** Alle teksten, voor de test die bewaakt dat er niets zwaars in sluipt. */
export const ALL_TEXTS=()=>Object.values(CHEERS).flat().concat(Object.values(EMPTY).flat());
/** „net binnen”, „4 min”, „1 uur 5 min”; boven 15 minuten wordt het oranje, boven 25 rood. */
export function waiting(created:string,now=Date.now()){
 const min=Math.max(0,Math.floor((now-Date.parse(created))/60000));
 const text=min<1?'net binnen':min<60?`${min} min`:`${Math.floor(min/60)} uur ${min%60} min`;
 return {min,text,level:min>=25?'laat':min>=15?'let-op':'ok'} as const;
}
export function doneText(count:number,station:Station){return count===0?'':count===1?`Al 1 ${station==='barista'?'drankje':station==='kok'?'gerecht':'bestelling'} klaar vandaag. Goed begin!`:`Al ${count} ${STATIONS[station].plural} klaar. Lekker bezig!`}

// ---- Tafels
export const MAX_TABLES=100;
export function cleanTables(v:unknown):{id?:string;name:string;active:boolean}[]{
 if(!Array.isArray(v)||v.length>MAX_TABLES)throw Error('Maximaal '+MAX_TABLES+' tafels.');
 const out=v.map(t=>{const x=t as {id?:unknown;name?:unknown;active?:unknown};
  if(!x||typeof x.name!=='string'||!x.name.trim()||x.name.trim().length>40||typeof x.active!=='boolean'||(x.id!==undefined&&(typeof x.id!=='string'||!/^[a-f0-9-]{36}$/.test(x.id))))throw Error('Geef elke tafel een naam (maximaal 40 tekens).');
  return {...(x.id?{id:x.id as string}:{}),name:x.name.trim().replace(/\s+/g,' '),active:x.active};});
 const seen=new Set<string>();for(const t of out){const k=t.name.toLowerCase();if(seen.has(k))throw Error(`De tafel „${t.name}” staat er twee keer in.`);seen.add(k)}
 return out;
}
export const defaultTables=()=>Array.from({length:12},(_,i)=>'Tafel '+(i+1));

// ---- Wisselen tussen tabletschermen (3 november 2026)
export const KIOSK_SCREENS=[
 {id:'kok',href:'/werkplek/kok',icon:'🍳',name:'Kok'},
 {id:'barista',href:'/werkplek/barista',icon:'☕',name:'Barista'},
 {id:'winkel',href:'/werkplek/winkel',icon:'🧺',name:'Winkel'},
 {id:'opnemen',href:'/opnemen',icon:'🍽️',name:'Opnemen'},
 {id:'kassa',href:'/werkplek/kassa',icon:'🧾',name:'Kassa'},
 // Voorraad tellen en onderling inkopen (wens eigenaar 6 november 2026), naast de kassa.
 {id:'voorraad',href:'/werkplek/voorraad',icon:'📦',name:'Voorraad'},
 // Wie is er vandaag? als eigen scherm naast de kassa (wens eigenaar 5 november 2026).
] as const;
export type KioskScreen=typeof KIOSK_SCREENS[number]['id'];

/** Volgend of vorig scherm bij vegen; aan het eind stopt het (geen rondje). */
export function swipeTarget(current:KioskScreen,dx:number){
 const i=KIOSK_SCREENS.findIndex(s=>s.id===current),j=dx<0?i+1:i-1;
 return j>=0&&j<KIOSK_SCREENS.length?KIOSK_SCREENS[j].href:null;
}


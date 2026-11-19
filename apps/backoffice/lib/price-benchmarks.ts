// Regional reference prices for the price analysis (owner request, 2 November 2026): businesses within
// 30 km of Boer Bart, Schoterweg 26, Rotstergaast. Collected on 2 November 2026 through web search;
// the menus themselves could not be opened from the build environment, so each price is as quoted
// by the search result, with its source page. Prices on menu sites can be months old: the date of the
// source is noted where known. Distances are straight-line from Rotstergaast, rounded.
// Segment: 'horeca' = sit-down café, lunchroom or restaurant (the comparison for Boer Bart);
// 'afhaal' = cafetaria or snackbar (shown as a low reference, not used for proposals).
export type Benchmark={category:string;item:string;priceCents:number;business:string;place:string;km:number;segment:'horeca'|'afhaal';source:string;note?:string};
export const BENCHMARKS_COLLECTED='2026-11-02';
export const BENCHMARK_ORIGIN='Schoterweg 26, Rotstergaast';
export const BENCHMARK_RADIUS_KM=30;

const HET_MENU_FONTAINE='https://www.het-menu.nl/heerenveen/restaurant/la_fontaine_restaurant_lunchroom/menukaart';
const BISTRO='https://www.thefork.nl/restaurant/la-bistro-r812600/menu';
const LOVEN='https://lunchroomloven.nl/menu/';
const FERRON='https://ferronheerenveen.nl/menu/';
const HOEKSKE='https://www.cafetariathoekske.nl/menukaart/cafetaria';
const MUNT='https://www.cafetariademunt-heerenveen.nl/menu';
const GUSTO='https://gustoheerenveen.nl/resources/20251604-Menukaart-alac.pdf';
const ITALIA='https://en.eet.nu/heerenveen/italia/menus/menukaart';
const BUURMAN='https://www.het-menu.nl/heerenveen/restaurant/de_buurman_bar_grill/menukaart';
const ULESPRONG='https://www.de-ulesprong-sint-nicolaasga.nl/';
const WALRUS='https://www.thefork.nl/restaurant/de-walrus-r241945/menu';
const VALK='https://www.het-menu.nl/sneek/restaurant/van_der_valk_hotel_sneek/menukaart';
const TEXAS='https://www.het-menu.nl/sneek/restaurant/texas_steak_sneek/menukaart';
const POLLE='https://www.het-menu.nl/sneek/restaurant/snackbar_de_polle/menukaart';
const MUOI='https://www.thefork.nl/restaurant/marijke-muoi-wine-dine-r233779';
const POSTPLAZA='https://www.post-plaza.nl/upload/files/POST225_KRT_WEB_Dranken_Borrel_Sept-2023.pdf';

const H=(category:string,item:string,priceCents:number,business:string,place:string,km:number,source:string,note?:string):Benchmark=>({category,item,priceCents,business,place,km,segment:'horeca',source,...(note?{note}:{})});
const A=(category:string,item:string,priceCents:number,business:string,place:string,km:number,source:string):Benchmark=>({category,item,priceCents,business,place,km,segment:'afhaal',source});

export const BENCHMARKS:Benchmark[]=[
 // Koffie
 H('cappuccino','Cappuccino',300,'Lunchroom Loven','Heerenveen',6,LOVEN),
 H('cappuccino','Cappuccino',350,'Ferron','Heerenveen',6,FERRON),
 A('cappuccino','Cappuccino',200,"Cafetaria 't Hoekske",'Heerenveen',6,HOEKSKE),
 H('ijskoffie','Iced cappuccino',450,'De Buurman Bar & Grill','Heerenveen',6,BUURMAN),
 // Frisdrank (glas/flesje)
 H('frisdrank','Frisdrank (ginger ale, tonic)',325,'Ferron','Heerenveen',6,FERRON),
 H('frisdrank','Frisdrank (ginger ale, tonic)',375,'Ferron','Heerenveen',6,FERRON),
 H('frisdrank','Coca-Cola, Rivella, Fanta',325,'Post-Plaza','Leeuwarden',29,POSTPLAZA,'menukaart september 2023'),
 // Bier
 H('pils','Grolsch van de tap 25 cl',360,'Gusto','Heerenveen',6,GUSTO,'menukaart april 2025'),
 H('pils','Peroni 33 cl',460,'Italia','Heerenveen',6,ITALIA),
 H('pils','Estrella fles',450,'Gusto','Heerenveen',6,GUSTO,'menukaart april 2025'),
 H('speciaalbier','Speciaalbier',500,'Ferron','Heerenveen',6,FERRON),
 H('speciaalbier','Speciaalbier',675,'Ferron','Heerenveen',6,FERRON),
 H('speciaalbier','Grolsch van de tap 40 cl',525,'Gusto','Heerenveen',6,GUSTO,'menukaart april 2025'),
 // Wijn per glas
 H('wijn','Wijn per glas',525,'Ferron','Heerenveen',6,FERRON),
 H('wijn','Wijn per glas',725,'Ferron','Heerenveen',6,FERRON),
 // Lunch
 H('tosti','Tosti ham/kaas',450,'Lunchroom Loven','Heerenveen',6,LOVEN),
 H('tosti','Tosti ham/kaas',600,'La Fontaine','Heerenveen',6,HET_MENU_FONTAINE),
 H('tosti','Tosti ham/kaas',650,'La Bistro','Heerenveen',6,BISTRO,'menukaart april 2025'),
 A('tosti','Tosti ham/kaas',350,'Cafétaria De Munt','Heerenveen',6,MUNT),
 A('tosti','Tosti ham/kaas',265,"Cafetaria 't Hoekske",'Heerenveen',6,HOEKSKE),
 H('kindertosti','Kindertosti',400,'De Buurman Bar & Grill','Heerenveen',6,BUURMAN),
 H('kroket-brood','Broodje kroket',300,'Lunchroom Loven','Heerenveen',6,LOVEN),
 H('kroket-brood','2 kroketten op brood',1050,'La Bistro','Heerenveen',6,BISTRO,'menukaart april 2025'),
 A('kroket-brood','Broodje kroket',215,"Cafetaria 't Hoekske",'Heerenveen',6,HOEKSKE),
 H('soep','Soep',775,'De Walrus','Sneek',20,WALRUS),
 H('soep','Soep',875,'De Walrus','Sneek',20,WALRUS),
 H('soep','Soep',800,'Van der Valk Hotel Sneek','Sneek',20,VALK),
 H('lunchgerecht','Lunchspecial',1375,'De Walrus','Sneek',20,WALRUS),
 H('lunchgerecht','Lunchspecial',1675,'De Walrus','Sneek',20,WALRUS),
 H('lunchgerecht','12-uurtje',1550,'La Fontaine','Heerenveen',6,HET_MENU_FONTAINE),
 // Burgers (restaurants serveren vaak met friet)
 H('burger','Big Valk burger',2650,'Van der Valk Hotel Sneek','Sneek',20,VALK),
 H('burger','Burger',2275,'Texas Steak','Sneek',20,TEXAS,'menukaart augustus 2025'),
 A('burger','Cheeseburger plate',1200,'De Ûlesprong','Sint Nicolaasga',9,ULESPRONG),
 A('burger','Hamburger speciaal',425,'Snackbar De Polle','Sneek',20,POLLE),
 // Borrel
 A('bitterballen','Bitterballen 8 stuks',675,'De Ûlesprong','Sint Nicolaasga',9,ULESPRONG),
 // Pannenkoeken
 H('kinderpannenkoek','Kinderpannenkoek',575,'De Walrus','Sneek',20,WALRUS),
 // High tea
 H('high-tea','High tea p.p.',2750,'Marijke Muoi Wine & Dine','Oranjewoud',7,MUOI),
];

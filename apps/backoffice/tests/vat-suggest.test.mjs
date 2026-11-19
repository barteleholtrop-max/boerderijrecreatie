import {test} from 'node:test';
import assert from 'node:assert/strict';
import {suggestVat} from '../lib/vat-suggest.ts';
const v=n=>suggestVat(n).vat;
test('alles 9%, alcoholhoudende dranken 21% (besluit eigenaar 2 november 2026)',()=>{
 for(const n of ['Cappucino','10 Eieren','Pannenkoek met spek','🥞 Pannenkoekpakket Boerderijrecreatie','Thee'])assert.equal(v(n),'9',n);
 for(const n of ['Pilsbier','Hertog Jan Blondbier','Gudzekop Opgedirkt Witbier','Rode wijn','Witte Wijn','Boerenwijn','Prosecco','Aperol Spritz','Louis Vallon Wijn','Desert wijn'])assert.equal(v(n),'21',n);
});
test('alcoholvrij en lijkt-op-alcohol blijft 9%',()=>{
 for(const n of ['0.0 Bier','Hertog Jan 0.0 Blondbier','Krombacher Radler 0,0%','Aperol Spritz 0.0%','Franziskaner 0.0 Witbier','Bitterballen','Portie bitterballen vega','Bitter Lemon','Naturfrisk Bitter Lemon','Bittergarnituur','Wijn Azijn'])assert.equal(v(n),'9',n);
});
test('een pakket met alcohol krijgt 21% met de vraag om het zelf te controleren',()=>{
 const s=suggestVat('🍷 Borrel Boerderijrecreatie Pakket met Wijn en Bier (aanrader)');
 assert.equal(s.vat,'21');assert.equal(s.check,true);
});

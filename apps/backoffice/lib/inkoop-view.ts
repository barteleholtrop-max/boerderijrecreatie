// Inkoop loopt synchroon met Gerechten & prijzen (wens eigenaar 5 november 2026): „geen ingrediënten voor producten die
// zijn verwijderd”. Alleen voor de weergave: er wordt niets gewist, dus een teruggezet product brengt alles terug.
// - Recepten van verwijderde producten (niet meer in de productlijst) staan niet in de lijsten.
// - Een ingrediënt staat niet in de lijsten als het alleen in recepten van verwijderde producten zit (bijvoorbeeld het
//   doorverkoop-ingrediënt „10 Eieren” van een verwijderd winkelproduct). Ingrediënten zonder recept (bijvoorbeeld net
//   uit een factuur) blijven staan.
export function activeOnly<I extends {id:string},R extends {productId:string;lines:{ingredientId:string}[]}>(ingredients:I[],recipes:R[],activeProductIds:Set<string>){
 const shownRecipes=recipes.filter(r=>activeProductIds.has(r.productId));
 const usedByActive=new Set(shownRecipes.flatMap(r=>r.lines.map(l=>l.ingredientId)));
 const usedByAny=new Set(recipes.flatMap(r=>r.lines.map(l=>l.ingredientId)));
 const shownIngredients=ingredients.filter(i=>usedByActive.has(i.id)||!usedByAny.has(i.id));
 return {ingredients:shownIngredients,recipes:shownRecipes,hiddenIngredients:ingredients.length-shownIngredients.length,hiddenRecipes:recipes.length-shownRecipes.length};
}

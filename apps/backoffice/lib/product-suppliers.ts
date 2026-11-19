// Wie levert het product: bij Boerderijrecreatie de voornaam van het lid dat eigenaar is. Dit systeem heeft geen leden als
// producteigenaar, dus er is geen leverancier op de productkaart. De functies blijven bestaan voor de schermen en de
// openbare productlijst die ze aanroepen; ze geven een lege lijst.
export async function productSuppliers(){return new Map<string,string>()}
export async function productCompanies(){return new Map<string,string>()}

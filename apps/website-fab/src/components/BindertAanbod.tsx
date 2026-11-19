// „Deze week van Bindert” (wens eigenaar 17 november 2026: „als je prijzen noemt, dan moeten die uit het profiel van Bindert komen”).
// De producten en prijzen komen live uit de backoffice (/api/public/products): alleen winkelproducten die op naam staan van het lid met
// het bedrijf Nijemoed Bloemen (Lid als bedrijf). Heeft het lid (nog) geen bedrijfsnaam ingevuld, dan de producten van „Bindert”.
// Geen producten, of de backoffice antwoordt niet: dan verschijnt het blok niet. Hier staan nooit eigen of geraden prijzen.
import { useEffect, useState } from "react";
import { Icon } from "./Icon";

type Product = { id: string; name: string; priceCents: number; wasCents?: number | null; available: boolean; soldOut?: boolean; photo: string | null; route: string; organic?: boolean; supplier?: string | null; supplierCompany?: string | null };

const BEDRIJF = /nijemoed/i;
const VOORNAAM = "Bindert";
const money = (c: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(c / 100);
const valid = (c: unknown): c is number => typeof c === "number" && Number.isInteger(c) && c > 0 && c < 1_000_000;

/** Alleen de producten van Nijemoed Bloemen; los te testen. */
export function vanBindert(list: Product[]): Product[] {
  const winkel = list.filter((p) => p.route === "winkel" && typeof p.name === "string" && valid(p.priceCents));
  const opBedrijf = winkel.filter((p) => p.supplierCompany && BEDRIJF.test(p.supplierCompany));
  return opBedrijf.length ? opBedrijf : winkel.filter((p) => !p.supplierCompany && p.supplier === VOORNAAM);
}

export function BindertAanbod() {
  const [products, setProducts] = useState<Product[] | null>(null);
  useEffect(() => {
    fetch("/api/public/products", { headers: { Accept: "application/json" }, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { products?: Product[] }) => setProducts(vanBindert(Array.isArray(d.products) ? d.products : [])))
      .catch(() => setProducts([]));
  }, []);
  if (!products?.length) return null;
  return (
    <section className="section nm-aanbod" id="aanbod" aria-labelledby="nm-aanbod-titel">
      <div className="wrap">
        <div className="nm-head">
          <p className="eyebrow">Nu in de boerderijwinkel</p>
          <h2 className="h2" id="nm-aanbod-titel">Deze week van Bindert</h2>
          <p className="lead">Wat Bindert nu in de winkel heeft staan, met de prijs zoals hij die zelf vastlegt.</p>
        </div>
        <ul className="nm-aanbod__grid">
          {products.map((p) => {
            const out = p.soldOut || !p.available;
            return (
              <li key={p.id} className={`nm-aanbod__item${out ? " is-out" : ""}`}>
                <div className="nm-aanbod__photo">{p.photo ? <img src={p.photo} alt="" loading="lazy" /> : <Icon name="leaf" />}</div>
                <div className="nm-aanbod__body">
                  <h3>{p.name}</h3>
                  <p className="nm-aanbod__price">
                    {valid(p.wasCents) && p.wasCents > p.priceCents ? <s>{money(p.wasCents)}</s> : null}
                    <strong>{money(p.priceCents)}</strong>
                  </p>
                  {out ? <span className="nm-aanbod__out">{p.soldOut ? "Uitverkocht" : "Nu niet in de winkel"}</span> : p.organic ? <span className="nm-aanbod__bio"><Icon name="leaf" />Biologisch</span> : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

// Webshop op de winkelpagina (wens eigenaar 5 november 2026: de functies van onze website in deze vormgeving).
// Het aanbod komt live uit de backoffice (/api/public/products, alleen winkelproducten): naam, prijs, foto, uitverkocht.
// „In je mandje” bewaart alleen product en aantal, in hetzelfde mandje als de bestelapp (/bestellen/); afrekenen,
// afhalen en betalen gaan daar. De bestelapp rekent alles opnieuw uit met de actuele prijzen; hier staan geen eigen prijzen.
import { useEffect, useState } from "react";
import { Icon } from "./Icon";

type Product = { id: string; name: string; priceCents: number; available: boolean; soldOut?: boolean; photo: string | null; route: string; menuCategory?: string; optionGroups?: { required: boolean }[] };
type Line = { id: string; choices: (string | null)[]; qty: number; note: string };
const KEY = "bb-bestelling-v2"; // hetzelfde mandje als apps/website/bestellen.js
/** Eerste letter van de naam (emoji aan het begin overslaan). */
const initial = (n: string) => (n.match(/\p{L}|\p{N}/u) || ["·"])[0].toUpperCase();
const money = (c: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(c / 100);

function readCart(): { route: string; carts: { menu: Line[]; winkel: Line[] }; [k: string]: unknown } {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (s && typeof s === "object" && s.carts) return { ...s, carts: { menu: Array.isArray(s.carts.menu) ? s.carts.menu : [], winkel: Array.isArray(s.carts.winkel) ? s.carts.winkel : [] } };
  } catch { /* geen opslag */ }
  return { route: "winkel", carts: { menu: [], winkel: [] } };
}
function writeCart(c: ReturnType<typeof readCart>) { try { sessionStorage.setItem(KEY, JSON.stringify({ ...c, route: "winkel" })); } catch { /* niet erg */ } }

export function Webshop() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [cart, setCart] = useState<Line[]>([]);
  useEffect(() => {
    setCart(readCart().carts.winkel);
    fetch("/api/public/products", { headers: { Accept: "application/json" }, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { products?: Product[] }) => setProducts((d.products || []).filter((p) => p.route === "winkel")))
      .catch(() => setFailed(true));
  }, []);
  const add = (p: Product) => {
    const c = readCart(), lines = c.carts.winkel, hit = lines.find((l) => l.id === p.id && l.choices.length === 0 && !l.note);
    if (hit) hit.qty = Math.min(20, hit.qty + 1); else lines.push({ id: p.id, choices: [], qty: 1, note: "" });
    writeCart(c); setCart([...lines]);
  };
  const count = cart.reduce((s, l) => s + l.qty, 0);
  const total = cart.reduce((s, l) => s + (products?.find((p) => p.id === l.id)?.priceCents || 0) * l.qty, 0);
  if (failed) return <p className="note"><Icon name="info" />Het online aanbod is nu niet te laden. In de winkel ben je natuurlijk welkom.</p>;
  if (!products) return <p className="note">Het aanbod wordt geladen…</p>;
  if (!products.length) return <p className="note"><Icon name="info" />Er staat nu nog niets online. Kom gerust langs in de winkel.</p>;
  return (
    <div className="shop">
      <ul className="shop__grid">
        {products.map((p) => {
          const choose = (p.optionGroups || []).some((g) => g.required), out = p.soldOut || !p.available;
          return (
            <li key={p.id} className="shop__item">
              <div className="shop__photo">{p.photo ? <img src={p.photo} alt="" loading="lazy" /> : <span aria-hidden="true">{initial(p.name)}</span>}</div>
              <div className="shop__body">
                <h3 className="shop__name">{p.name}</h3>
                <p className="shop__price">{money(p.priceCents)}</p>
                {out ? <span className="shop__out">{p.soldOut ? "Uitverkocht" : "Nu niet te bestellen"}</span>
                  : choose ? <a className="btn btn--small btn--ghost" href="/bestellen/#winkel">Kies en bestel</a>
                  : <button type="button" className="btn btn--small" onClick={() => add(p)} aria-label={`${p.name} in je mandje`}>In je mandje</button>}
              </div>
            </li>
          );
        })}
      </ul>
      {count > 0 && (
        <div className="shop__bar" role="status">
          <span><b>{count}</b> {count === 1 ? "product" : "producten"} · {money(total)}</span>
          <a className="btn" href="/bestellen/#winkel">Afrekenen en afhalen<Icon name="arrow" /></a>
        </div>
      )}
    </div>
  );
}

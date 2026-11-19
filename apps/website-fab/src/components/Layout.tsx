import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { site, nav } from "../content/site";
import { openText, inOntwikkeling, type Onderdeel } from "../content/live";
import { paths, type PageKey } from "../routes";
import { Icon } from "./Icon";
import { isCoopHost, isHoofdsiteHost, bloeiHref, hoofdsiteHref } from "../content/hosts";

export function Wordmark() {
  return (
    <span className="wordmark" aria-hidden="true">
      <span className="wordmark__name">Boer Bart</span>
      <span className="wordmark__place">Rotstergaast</span>
    </span>
  );
}

// Menu per onderdeel (15 november 2026): alleen wat in de backoffice open staat (Website & uitstraling). Met de
// startpagina in ontwikkeling en verder niets open is er geen menu.
// Bloei staat op cooperatie.boerbart.nl (wens eigenaar 16 november 2026): daar alleen het kleine menu met Mijn Bloei en de
// Bloeimarkt. Op de hoofdsite staat de Bloeimarkt niet meer in het menu, alleen in de voettekst. Op Mijn Bloei en de
// Bloeimarkt houden bestaande leden ook elders altijd het kleine menu als de startpagina in ontwikkeling is.
const ledenMenu: [string, string, string][] = [["bloei", "Mijn Bloei", paths.bloei], ["markt", "Bloeimarkt", paths.markt]];
const navOnderdeel: Record<string, Onderdeel> = { speelboerderij: "speelboerderij", winkel: "winkel", yte: "yte", agenda: "agenda", groepen: "groepen", over: "over", bestellen: "bestellen" };
const menuFor = (page: PageKey | undefined, coop: boolean): [string, string, string][] => {
  if (coop) return ledenMenu;
  const open = nav.filter(([k]) => !inOntwikkeling(navOnderdeel[k] ?? "start"));
  return inOntwikkeling("start") && (page === "bloei" || page === "markt") ? ledenMenu : open;
};

const tone: Partial<Record<PageKey, string>> = { speelboerderij: "speel", yte: "yte", winkel: "winkel" };

export function Layout({ page, children }: { page?: PageKey; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  // Het adres is pas in de browser bekend; vooraf opgebouwde pagina's tonen de hoofdsite, daarna past het menu zich aan.
  // Als state, zodat React de links na het overnemen van de vooraf opgebouwde pagina echt bijwerkt.
  const [coop, setCoop] = useState(false), [hoofdsite, setHoofdsite] = useState(false);
  useEffect(() => { setCoop(isCoopHost()); setHoofdsite(isHoofdsiteHost()); }, []);
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  // Startpagina in ontwikkeling: balk bovenaan. Contact in ontwikkeling: geen „Plan je bezoek” en geen vaste knoppenbalk.
  const opbouw = !coop && inOntwikkeling("start"), contactOpen = !coop && !inOntwikkeling("contact");
  const menu = menuFor(page, coop);
  const showBar = contactOpen && page !== "contact" && page !== "verstuurd";
  return (
    <div className={`page${page && tone[page] ? ` tone-${tone[page]}` : ""}`}>
      <a className="skip" href="#inhoud">Naar de inhoud</a>
      {opbouw ? (
        <p className="opbouwbalk">
          <span>We werken aan het nieuwe Boer Bart.</span>{" "}
          <a href={site.instagram} rel="noopener">Volg ons</a>
        </p>
      ) : null}
      <header className={`header${open ? " is-open" : ""}`}>
        <div className="wrap header__row">
          {coop ? (
            <a href={hoofdsiteHref("/")} className="header__brand" aria-label="Boer Bart, naar boerbart.nl">
              <Wordmark />
            </a>
          ) : (
            <Link to="/" className="header__brand" aria-label="Boer Bart, naar de homepage">
              <Wordmark />
            </Link>
          )}
          <nav className="header__nav" aria-label="Hoofdmenu">
            {menu.map(([k, label, href]) => href.startsWith("/bestellen/")
              // De bestelapp is een eigen pagina (geen route van deze site): een gewone link.
              ? <a key={k} href={href} className="nav-order">{label}</a>
              : <Link key={k} to={href} className={page === k ? "is-active" : undefined} aria-current={page === k ? "page" : undefined}>{label}</Link>
            )}
          </nav>
          <div className="header__end">
            {contactOpen ? <Link to={`${paths.contact}#bezoek`} className="btn btn--small header__cta">Plan je bezoek</Link> : null}
            {!menu.length ? null : <button type="button" className="header__toggle" aria-expanded={open} aria-controls="mobiel-menu" onClick={() => setOpen((v) => !v)}>
              <Icon name={open ? "close" : "menu"} />
              <span className="sr">{open ? "Menu sluiten" : "Menu openen"}</span>
            </button>}
          </div>
        </div>
        <div id="mobiel-menu" className="mobile-menu" hidden={!open}>
          <nav className="wrap" aria-label="Mobiel menu">
            {menu.map(([k, label, href]) => href.startsWith("/bestellen/")
              ? <a key={k} href={href}>{label}<Icon name="chevR" /></a>
              : <Link key={k} to={href} aria-current={page === k ? "page" : undefined}>{label}<Icon name="chevR" /></Link>
            )}
            {inOntwikkeling("nieuws") ? null : <Link to={paths.nieuws}>Nieuws en blog<Icon name="chevR" /></Link>}
            {inOntwikkeling("vragen") ? null : <Link to={paths.vragen}>Veelgestelde vragen<Icon name="chevR" /></Link>}
            {contactOpen ? <>
            <Link to={paths.contact}>Contact en route<Icon name="chevR" /></Link>
            <a className="mobile-menu__call" href={`tel:${site.phoneIntl}`}><Icon name="phone" />{site.phone}</a>
            </> : null}
          </nav>
        </div>
      </header>
      <main id="inhoud">{children}</main>
      <footer className="footer">
        <div className="wrap footer__grid">
          <div className="footer__brand">
            <span className="footer__name">Boer Bart</span>
            <p>Een biologische boerderij in Rotstergaast, sinds {site.since}. Voor families, fijnproevers en iedereen die wil weten waar zijn eten vandaan komt.</p>
          </div>
          <div>
            <h2 className="footer__h">Bezoek</h2>
            <p>{site.street}<br />{site.postalCode} {site.city}</p>
            <p><a href={site.mapsUrl} rel="noopener">Route plannen</a></p>
          </div>
          <div>
            <h2 className="footer__h">Contact</h2>
            <p><a href={`tel:${site.phoneIntl}`}>{site.phone}</a><br /><a href={`mailto:${site.email}`}>{site.email}</a></p>
            <p><a href={site.instagram} rel="noopener">Instagram</a></p>
          </div>
          <div>
            {/* Winkel in ontwikkeling: nog geen openingstijden noemen (besluit eigenaar 15 november 2026). */}
            {inOntwikkeling("winkel") ? <h2 className="footer__h">Meer</h2> : <><h2 className="footer__h">Openingstijden winkel</h2>
            <p>{openText("winkel")}</p></>}
            <ul className="footer__links">
              {inOntwikkeling("nieuws") ? null : <li><Link to={paths.nieuws}>Nieuws en blog</Link></li>}
              {inOntwikkeling("vragen") ? null : <li><Link to={paths.vragen}>Veelgestelde vragen</Link></li>}
              <li><a href={bloeiHref(paths.bloei, hoofdsite)}>Mijn Bloei</a></li>
              <li><a href={bloeiHref(paths.markt, hoofdsite)}>Bloeimarkt</a></li>
              <li><Link to={paths.privacy}>Privacy</Link></li>
            </ul>
          </div>
        </div>
        <div className="wrap footer__base">
          <span>&copy; 2026 Boer Bart &middot; KvK {site.kvk}</span>
        </div>
      </footer>
      {showBar ? (
        <div className="bookbar" role="region" aria-label="Snel contact">
          <a className="bookbar__call" href={`tel:${site.phoneIntl}`} aria-label={`Bel ${site.phone}`}><Icon name="phone" /></a>
          <Link className="btn bookbar__btn" to={`${paths.contact}#bezoek`}>Plan je bezoek</Link>
        </div>
      ) : null}
    </div>
  );
}

import { Helmet } from "react-helmet-async";
import { site, hours, type Unit } from "../content/site";
import { paths, type PageKey } from "../routes";
import { srcFor } from "./Picture";
import { COOP_ORIGIN, BLOEI_PAGES } from "../content/hosts";

export const SITE_URL = __SITE_URL__;
export const INDEXABLE = __INDEXABLE__;
export const abs = (p: string) => `${SITE_URL}${p}`;
export const businessId = `${SITE_URL}/#boerbart`;

const address = { "@type": "PostalAddress", streetAddress: site.street, postalCode: site.postalCode, addressLocality: site.city, addressRegion: site.region, addressCountry: site.country };
const dayIri = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d) => `https://schema.org/${d}`);

/** Alleen wat de backoffice geeft; bij het vooraf opbouwen zonder backoffice laten we de tijden weg. */
export function openingHours(unit: Unit) {
  if (!Object.keys(hours[unit].days).length) return undefined;
  return Object.entries(hours[unit].days).map(([d, [opens, closes]]) => ({ "@type": "OpeningHoursSpecification", dayOfWeek: dayIri[Number(d)], opens, closes }));
}

export function businessNode() {
  return {
    "@type": ["LocalBusiness", "TouristAttraction"],
    "@id": businessId,
    name: site.name,
    alternateName: "Rianne & Bart",
    description: "Biologische boerderij in Rotstergaast bij Heerenveen met speelboerderij, boerderijwinkel, restaurant Ite en groepsuitjes. Een coöperatie met de droom om 1000 jaar te bestaan.",
    url: abs("/"),
    telephone: site.phoneIntl,
    email: site.email,
    image: [abs(srcFor("erf-gezin", 1600)), abs(srcFor("speelterrein", 960)), abs(srcFor("jersey-koeien", 960))],
    logo: abs("/logo-boer-bart.png"),
    address,
    hasMap: site.mapsUrl,
    sameAs: [site.instagram],
    foundingDate: String(site.since),
    founder: [{ "@type": "Person", name: "Bartele Holtrop" }, { "@type": "Person", name: "Rianne Holtrop" }],
    identifier: { "@type": "PropertyValue", propertyID: "KvK", value: site.kvk },
    isAccessibleForFree: false,
    currenciesAccepted: "EUR",
  };
}

export function Seo({ page, title, desc, image = "/og/boerbart.jpg", imageAlt, noindex = false, jsonld = [], crumbs }: {
  page: PageKey | "404"; title: string; desc: string; image?: string; imageAlt?: string; noindex?: boolean; jsonld?: object[]; crumbs?: { name: string; path: string }[];
}) {
  const path = page === "404" ? "/404/" : paths[page];
  // Mijn Bloei en de Bloeimarkt staan op cooperatie.boerbart.nl (16 november 2026): daar is ook het vaste adres voor Google.
  const url = INDEXABLE && (BLOEI_PAGES as readonly string[]).includes(page) ? COOP_ORIGIN + path : abs(path);
  const robots = !INDEXABLE || noindex || page === "404" ? "noindex, follow" : "index, follow, max-image-preview:large";
  const graph: object[] = [
    { "@type": "WebPage", "@id": `${url}#webpage`, url, name: title, description: desc, inLanguage: "nl", isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website`, name: site.name, url: abs("/") }, about: { "@id": businessId } },
    ...jsonld,
  ];
  if (crumbs?.length) {
    graph.push({ "@type": "BreadcrumbList", itemListElement: [{ name: site.name, path: "/" }, ...crumbs].map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: abs(c.path) })) });
  }
  return (
    <Helmet>
      <html lang="nl" />
      <title>{title}</title>
      <meta name="description" content={desc} />
      <meta name="robots" content={robots} />
      {page !== "404" ? <link rel="canonical" href={url} /> : null}
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={site.name} />
      <meta property="og:locale" content="nl_NL" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={desc} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={abs(image)} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={imageAlt ?? `${site.name} in ${site.city}`} />
      <meta name="twitter:card" content="summary_large_image" />
      <script type="application/ld+json">{JSON.stringify({ "@context": "https://schema.org", "@graph": graph })}</script>
    </Helmet>
  );
}

export type PageKey = "home" | "speelboerderij" | "yte" | "winkel" | "agenda" | "groepen" | "over" | "vragen" | "contact" | "verstuurd" | "privacy" | "bloei" | "markt" | "nieuws" | "nijemoed";
export type RouteDef = { path: string; page: PageKey; lastmod: string; noindex?: boolean };
const LASTMOD = "2026-10-30";

export const paths: Record<PageKey, string> = {
  home: "/",
  speelboerderij: "/speelboerderij/",
  yte: "/yte/",
  winkel: "/boerderijwinkel/",
  agenda: "/agenda/",
  groepen: "/groepen/",
  over: "/over-ons/",
  vragen: "/vragen/",
  contact: "/contact/",
  verstuurd: "/verstuurd/",
  privacy: "/privacy/",
  bloei: "/mijn-bloei/",
  markt: "/bloeimarkt/",
  nieuws: "/nieuws/",
  nijemoed: "/nijemoed-bloemen/",
};

export const routes: RouteDef[] = (Object.keys(paths) as PageKey[]).map((page) => ({ path: paths[page], page, lastmod: page === "markt" ? "2026-11-06" : page === "nieuws" ? "2026-11-13" : page === "nijemoed" ? "2026-11-17" : LASTMOD, noindex: page === "verstuurd" || page === "bloei" }));

export function routeFor(pathname: string): RouteDef | undefined {
  const p = pathname.endsWith("/") ? pathname : pathname + "/";
  return routes.find((r) => r.path === p);
}

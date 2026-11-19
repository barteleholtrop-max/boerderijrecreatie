import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { routeFor } from "./routes";
import { Layout } from "./components/Layout";
import { LiveVersion, useLiveLoader } from "./content/live-context";
import { Home } from "./pages/Home";
import { Speelboerderij } from "./pages/Speelboerderij";
import { Yte } from "./pages/Yte";
import { Winkel } from "./pages/Winkel";
import { Agenda } from "./pages/Agenda";
import { Groepen } from "./pages/Groepen";
import { Over } from "./pages/Over";
import { Vragen } from "./pages/Vragen";
import { Contact } from "./pages/Contact";
import { Verstuurd } from "./pages/Verstuurd";
import { Privacy } from "./pages/Privacy";
import { MijnBloei } from "./pages/MijnBloei";
import { Bloeimarkt } from "./pages/Bloeimarkt";
import { Nieuws } from "./pages/Nieuws";
import { Nijemoed } from "./pages/Nijemoed";
import { NotFound } from "./pages/NotFound";
import { InOntwikkeling } from "./pages/InOntwikkeling";
import { pageInOntwikkeling } from "./content/live";

const pages = { home: Home, speelboerderij: Speelboerderij, yte: Yte, winkel: Winkel, agenda: Agenda, groepen: Groepen, over: Over, vragen: Vragen, contact: Contact, verstuurd: Verstuurd, privacy: Privacy, bloei: MijnBloei, markt: Bloeimarkt, nieuws: Nieuws, nijemoed: Nijemoed };

export function App() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) { window.scrollTo(0, 0); return; }
    // Link naar een plek op een pagina (#plannen, #bezoek): React Router scrolt daar niet zelf naartoe.
    // useEffect draait na het renderen, dus het element bestaat al.
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: "start" });
  }, [pathname, hash]);
  const version = useLiveLoader();
  const route = routeFor(pathname);
  const Page = route ? pages[route.page] : NotFound;
  return (
    <LiveVersion.Provider value={version}>
      <Layout page={route?.page}>
        {/* Per onderdeel uit de backoffice; de startpagina kiest zelf tussen winterbeeld en gewone voorpagina. */}
        {route && route.page !== "home" && pageInOntwikkeling(route.page) ? <InOntwikkeling page={route.page} /> : <Page />}
      </Layout>
    </LiveVersion.Provider>
  );
}

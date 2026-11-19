import { createContext, useContext, useEffect, useState } from "react";
import { loadLive } from "./live";
// Laadt de backofficegegevens (en elke 5 minuten opnieuw). App gebruikt useLiveLoader: een nieuwe versie tekent de
// hele site opnieuw met de echte gegevens. Componenten met een eigen klok (Vandaag op het erf) lezen de versie.
export const LiveVersion = createContext(0);
export const useLiveVersion = () => useContext(LiveVersion);
export function useLiveLoader() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let stop = false;
    const bump = () => !stop && setVersion((v) => v + 1);
    // Ook bij een mislukte lading opnieuw tekenen: dan toont Vandaag op het erf geen verzonnen open/dicht.
    const load = () => loadLive().then(bump, bump);
    load();
    const id = window.setInterval(load, 5 * 60_000);
    return () => { stop = true; window.clearInterval(id); };
  }, []);
  return version;
}

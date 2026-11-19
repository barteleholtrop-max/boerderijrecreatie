import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { bestelapp } from "./bestelapp/plugin";
import { readFileSync } from "node:fs";

// Domeinbewaking: alleen als boerbart.nl deze site ook echt serveert (llms.txt bevat de naam)
// worden canonical, sitemap en schema op dat domein gezet en mag Google indexeren.
// Anders: het Cloud Run-adres (of SITE_URL) en noindex. FORCE_INDEX=true overschrijft. Netlify is weg (besluit eigenaar 8 november 2026).
const PROD = "https://www.boerbart.nl";
async function resolveSite(): Promise<{ url: string; indexable: boolean }> {
  const fallback = (process.env.SITE_URL || "https://boerbart-website-fab-206627521194.europe-west3.run.app").replace(/\/$/, "");
  if (process.env.FORCE_INDEX === "true") return { url: PROD, indexable: true };
  // De schakelaar voor de overstap van Wix (live.json, docs/OVERSTAP-WIX.md): bewust aangezet, niet afhankelijk van een
  // netwerkcontrole tijdens het bouwen.
  try { if (JSON.parse(readFileSync(new URL("./live.json", import.meta.url), "utf8")).live === true) return { url: PROD, indexable: true }; } catch { /* geen schakelaar */ }
  try {
    const res = await fetch(`${PROD}/llms.txt`, { signal: AbortSignal.timeout(8000) });
    const text = res.ok ? await res.text() : "";
    if (text.includes("Boer Bart") && text.includes("StudioFab")) return { url: PROD, indexable: true };
  } catch {
    /* domein draait nog op Wix */
  }
  return { url: fallback, indexable: false };
}

export default defineConfig(async ({ command }) => {
  // Lokaal (npm run dev) niet eerst boerbart.nl opvragen: dat maakt het starten traag en is alleen nodig bij publiceren.
  const site = command === "serve" ? { url: "http://localhost:3004", indexable: false } : await resolveSite();
  console.log(`[site] ${site.url} indexable=${site.indexable}`);
  return {
    plugins: [react(), bestelapp()],
    // Proef Boer Bart 2027: /api gaat naar de centrale backoffice (standaard op deze computer, poort 3001).
    server: { port: 3004, strictPort: true, proxy: Object.fromEntries(["/api", "/bloei-proef.js", "/bloei-proef.css", "/brand.css"].map((p) => [p, { target: process.env.BACKOFFICE_ORIGIN || "http://localhost:3001", changeOrigin: false }])) },
    // Mijn Bloei (stap 5): het ledenonderdeel en zijn opmaak komen, net als /api, van de backoffice (één gedeelde versie).
    define: { __SITE_URL__: JSON.stringify(site.url), __INDEXABLE__: JSON.stringify(site.indexable) },
    build: { sourcemap: false, cssCodeSplit: false },
    ssr: { noExternal: ["react-helmet-async"] },
  };
});

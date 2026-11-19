// De bestelapp van Boer Bart (apps/website/bestellen.*) in de vormgeving van deze website, op /bestellen/
// (wens eigenaar 5 november 2026: „het beste van twee werelden”). Er is één bestelapp: de code blijft in apps/website,
// met al zijn functies (winkelmand, eigen bedrag, groepscode, betalen via Mollie, afhalen, meldingen, zelfservicekassa).
// Deze plug-in serveert hem hier (ontwikkelen) en zet hem in dist/bestellen (bouwen), met het thema uit thema.css
// en de lettertypen van deze website.
import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

const here = path.dirname(new URL(import.meta.url).pathname);
const source = path.resolve(here, "../../website");
const harvestPage = path.resolve(here,"../../backoffice/public/abonnementen.html");
const fonts: [string, string][] = [
  ["young-serif.woff2", "node_modules/@fontsource/young-serif/files/young-serif-latin-400-normal.woff2"],
  ["figtree.woff2", "node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2"],
];
const FILES = ["bestellen.js", "bestellen.css", "bestellen-sw.js", "bestellen-app.json"];
const TYPES: Record<string, string> = { ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp", ".html": "text/html; charset=utf-8" };

/** De bestelpagina met het thema: lettertypen en kleuren van deze website, en de naam als woordmerk. */
export function themedHtml() {
  const html = fs.readFileSync(path.join(source, "bestellen.html"), "utf8");
  return html
    .replace('<link rel="stylesheet" href="bestellen.css">', '<link rel="stylesheet" href="bestellen.css">\n<link rel="stylesheet" href="thema.css">')
    .replace('<meta name="theme-color" content="#f7f5ec">', '<meta name="theme-color" content="#f5f0e6">')
    .replace(/<html lang="nl">/, '<html lang="nl" class="thema-site">')
    // De bestelapp hoort niet in zoekmachines; de winkelpagina wel.
    .replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="robots" content="noindex">');
}
/** Pad onder /bestellen/ naar een bestand op schijf, of null. Alleen bekende bestanden. */
function fileFor(rel: string) {
  if (rel === "thema.css") return path.join(here, "thema.css");
  const font = fonts.find(([n]) => rel === "fonts/" + n);
  if (font) return path.resolve(here, "..", font[1]);
  if (FILES.includes(rel)) return path.join(source, rel);
  if (rel === "beeld/boerbart-logo.webp" || rel === "beeld/bestellen-192.png" || rel === "beeld/bestellen-512.png") return path.join(source, rel);
  return null;
}

export function bestelapp(): Plugin {
  return {
    name: "boerbart-bestelapp",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || "").split("?")[0];
        // Terugkeer van Mollie naar het oude adres: door naar /bestellen/ met dezelfde gegevens (?bestelling=…).
        if (url === "/abonnementen.html") { res.setHeader("Content-Type", TYPES[".html"]); res.setHeader("Cache-Control","no-store"); return res.end(fs.readFileSync(harvestPage)); }
        if (url === "/bestellen.html") { res.statusCode = 302; res.setHeader("Location", "/bestellen/" + (req.url || "").slice(15)); return res.end(); }
        if (url === "/bestellen") { res.statusCode = 301; res.setHeader("Location", "/bestellen/" + (req.url || "").slice(10)); return res.end(); }
        if (!url.startsWith("/bestellen/")) return next();
        const rel = decodeURIComponent(url.slice("/bestellen/".length));
        if (rel === "" || rel === "index.html") { res.setHeader("Content-Type", TYPES[".html"]); res.setHeader("Cache-Control", "no-store"); return res.end(themedHtml()); }
        const file = fileFor(rel);
        if (!file || !fs.existsSync(file)) { res.statusCode = 404; return res.end("Niet gevonden"); }
        res.setHeader("Content-Type", TYPES[path.extname(file)] || "application/octet-stream");
        res.setHeader("Cache-Control", "no-store");
        return res.end(fs.readFileSync(file));
      });
    },
    // Bij bouwen: dezelfde bestanden in dist/bestellen.
    closeBundle() {
      const out = path.resolve(here, "../dist/bestellen");
      if (!fs.existsSync(path.resolve(here, "../dist"))) return;
      fs.mkdirSync(path.join(out, "fonts"), { recursive: true });
      fs.copyFileSync(harvestPage,path.resolve(here,"../dist/abonnementen.html"));
      fs.mkdirSync(path.join(out, "beeld"), { recursive: true });
      fs.writeFileSync(path.join(out, "index.html"), themedHtml());
      for (const rel of [...FILES, "thema.css", "beeld/boerbart-logo.webp", "beeld/bestellen-192.png", "beeld/bestellen-512.png", ...fonts.map(([n]) => "fonts/" + n)]) fs.copyFileSync(fileFor(rel)!, path.join(out, rel));
    },
  };
}

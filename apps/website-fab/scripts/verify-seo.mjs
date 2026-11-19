// Controleert de gebouwde site: een title/description/canonical/h1 per pagina,
// geldige JSON-LD, sitemap compleet, geen Google Fonts, geen emoji, llms-link aanwezig.
import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const DIST = "dist";
const errors = [];
async function walk(dir) {
  const out = [];
  for (const f of await readdir(dir)) {
    const p = join(dir, f);
    // /bestellen/ is de bestelapp (apps/website/bestellen.*), geen inhoudspagina: niet in de zoekmachinecontrole.
    if ((await stat(p)).isDirectory()) { if (f !== "bestellen" || dir !== DIST) out.push(...(await walk(p))); }
    // De gedeelde inschrijf-/betaalapp is, net als /bestellen/, noindex en wordt apart functioneel getest.
    else if (f.endsWith(".html") && f !== "__forms.html" && !(dir === DIST && f === "abonnementen.html")) out.push(p);
  }
  return out;
}
const pages = await walk(DIST);
const sitemap = await readFile(join(DIST, "sitemap.xml"), "utf8");
const inSitemap = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
const titles = new Map();
const emoji = /[←-⇿☀-➿⬀-⯿\u{1F000}-\u{1FAFF}]/u;
for (const p of pages) {
  const html = await readFile(p, "utf8");
  const rel = p.slice(DIST.length) || "/";
  const n = (re) => (html.match(re) || []).length;
  const noindex = /<meta[^>]*name="robots"[^>]*noindex/.test(html) && /verstuurd|404|mijn-bloei/.test(rel);
  if (n(/<title[^>]*>/g) !== 1) errors.push(`${rel}: ${n(/<title[^>]*>/g)} titles`);
  if (n(/<meta[^>]*name="description"/g) !== 1) errors.push(`${rel}: descriptions != 1`);
  if (n(/<h1[\s>]/g) !== 1) errors.push(`${rel}: ${n(/<h1[\s>]/g)} h1`);
  if (!rel.endsWith("404.html")) {
    if (n(/rel="canonical"/g) !== 1) errors.push(`${rel}: canonicals != 1`);
    const title = (html.match(/<title[^>]*>([^<]*)/) || [])[1] || "";
    const desc = ((html.match(/name="description"[^>]*content="([^"]*)"/) || [])[1] || "").replace(/&amp;/g, "&");
    if (!noindex) {
      if (title.replace(/&amp;/g, "&").length > 65) errors.push(`${rel}: title ${title.length} > 65`);
      if (desc.length < 70 || desc.length > 165) errors.push(`${rel}: description ${desc.length} tekens`);
      if (titles.has(title)) errors.push(`${rel}: dubbele title met ${titles.get(title)}`); else titles.set(title, rel);
      const route = rel.replace(/index\.html$/, "");
      // De Bloeimarkt staat op cooperatie.boerbart.nl, dus niet in de sitemap van www (16 november 2026).
      if (!inSitemap.includes(route) && route !== "/bloeimarkt/") errors.push(`${rel}: niet in sitemap`);
    }
    const og = (html.match(/property="og:image" content="https?:\/\/[^/]+(\/[^"]+)"/) || [])[1];
    if (!og || !existsSync(join(DIST, og))) errors.push(`${rel}: og:image ontbreekt (${og})`);
  }
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch (e) { errors.push(`${rel}: JSON-LD ongeldig ${e.message}`); }
  }
  for (const m of html.matchAll(/href="(\/[^"#?]*)"/g)) {
    const h = m[1];
    if (!h.endsWith("/") && !/\.[a-z0-9]+$/i.test(h)) errors.push(`${rel}: link zonder slash ${h}`);
  }
  for (const m of html.matchAll(/src(?:Set)?="(\/images\/[^" ,]+)/gi)) if (!existsSync(join(DIST, m[1]))) errors.push(`${rel}: afbeelding ontbreekt ${m[1]}`);
  if (!html.includes('rel="llms"')) errors.push(`${rel}: llms link ontbreekt`);
  if (/fonts\.(googleapis|gstatic)\.com/.test(html)) errors.push(`${rel}: Google Fonts`);
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "");
  if (emoji.test(text)) errors.push(`${rel}: emoji/pijlteken gevonden: ${text.match(emoji)[0]}`);
}
for (const f of await readdir(join(DIST, "assets"))) {
  if (!f.endsWith(".js")) continue;
  const js = await readFile(join(DIST, "assets", f), "utf8");
  if (emoji.test(js)) errors.push(`assets/${f}: emoji/pijlteken in JS: ${js.match(emoji)[0]}`);
}
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`verify-seo: ${pages.length} pagina's ok, ${inSitemap.length} URL's in sitemap`);

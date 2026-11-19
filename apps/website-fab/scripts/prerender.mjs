// Statische prerender: rendert elke route naar dist/<route>/index.html, schrijft 404.html,
// sitemap.xml, robots.txt, llms.txt en llms-full.txt, en zet noindex-headers zolang
// boerbart.nl nog op Wix draait (zie vite.config.ts).
import { readFile, writeFile, mkdir, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const DIST = "dist";
let template = await readFile(join(DIST, "index.html"), "utf8");
{
  const assets = await readdir(join(DIST, "assets"));
  const pick = (re) => assets.find((f) => re.test(f));
  const fonts = [pick(/^young-serif-latin-400-normal-.*\.woff2$/), pick(/^figtree-latin-wght-normal-.*\.woff2$/)];
  if (fonts.some((f) => !f)) throw new Error("Lettertypebestanden voor preload niet gevonden");
  template = template.replace("<!--font-preload-->", fonts.map((f) => `<link rel="preload" href="/assets/${f}" as="font" type="font/woff2" crossorigin />`).join("\n    "));
}
const mod = await import(pathToFileURL("dist-ssr/entry-server.js").href);
// Prijzen staan niet in llms.txt: die komen live uit de backoffice en zijn bij het bouwen niet bekend (geen oude prijzen).
const { render, routes, paths, siteUrl, indexable, site, hours, faq } = mod;

const inject = (html, head) => template
  .replace(/<html lang="nl">/, `<html ${head.htmlAttributes || 'lang="nl"'}>`)
  .replace("<!--app-head-->", head.tags)
  .replace("<!--app-html-->", html);

for (const r of routes) {
  const { html, head } = render(r.path);
  const out = r.path === "/" ? join(DIST, "index.html") : join(DIST, r.path.replace(/^\/|\/$/g, ""), "index.html");
  await mkdir(join(out, ".."), { recursive: true });
  await writeFile(out, inject(html, head));
}
{
  const { html, head } = render("/404/");
  await writeFile(join(DIST, "404.html"), inject(html, head));
}

// Mijn Bloei en de Bloeimarkt staan op cooperatie.boerbart.nl (16 november 2026), niet in de sitemap van www.
const urls = routes.filter((r) => !r.noindex && r.page !== "bloei" && r.page !== "markt").map((r) => `  <url>\n    <loc>${siteUrl}${r.path}</loc>\n    <lastmod>${r.lastmod}</lastmod>\n  </url>`);
await writeFile(join(DIST, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`);

await writeFile(join(DIST, "robots.txt"), indexable
  ? `User-agent: *\nAllow: /\n\n# AI-assistenten zijn welkom\nUser-agent: GPTBot\nAllow: /\nUser-agent: OAI-SearchBot\nAllow: /\nUser-agent: ChatGPT-User\nAllow: /\nUser-agent: PerplexityBot\nAllow: /\nUser-agent: ClaudeBot\nAllow: /\nUser-agent: Google-Extended\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`
  : `# Testomgeving: nog niet indexeren. Het echte domein krijgt automatisch een open robots.txt.\nUser-agent: *\nDisallow: /\n`);

const link = (p, label) => `[${label}](${siteUrl}${p})`;
const llms = `# ${site.name}

> Biologische boerderij van ${site.owners} (${site.ownersFull}) in ${site.city}, vlak bij Heerenveen in Friesland. Met speelboerderij, boerderijwinkel, restaurant Yte bij Boer Bart en groepsuitjes. Boer Bart is een CSA-coöperatie met de droom om 1000 jaar te bestaan.

## Kerngegevens
- Adres: ${site.street}, ${site.postalCode} ${site.city}
- Telefoon: ${site.phone}
- E-mail: ${site.email}
- KvK: ${site.kvk}
- Sinds: ${site.since}

## Openingstijden
- Actueel op ${link(paths.contact, "Contact")}: de tijden komen altijd uit de centrale backoffice van Boer Bart.

## Prijzen
- Speelboerderij: entree per kind van 1 tot 10 jaar, volwassenen gratis (actuele prijs op de pagina Speelboerderij)
- Kinderfeest: vanaf 8 kinderen, 3 uur (prijs op de pagina Groepen)
- Schoolreisje: begeleiders gratis (prijs op de pagina Groepen)
- Ite by Boer Bart: zes tot zeven gangen, exclusief wijn (prijs op de pagina Ite)

## Pagina's
- ${link(paths.home, "Home")}
- ${link(paths.speelboerderij, "Speelboerderij")}
- ${link(paths.yte, "Yte bij Boer Bart")}
- ${link(paths.winkel, "Boerderijwinkel")}
- ${link(paths.groepen, "Groepen, kinderfeest en schoolreisje")}
- ${link(paths.over, "Ons verhaal")}
- ${link(paths.vragen, "Veelgestelde vragen")}
- ${link(paths.contact, "Contact, route en aanvragen")}

## Meer
- ${link("/llms-full.txt", "Volledige tekst voor AI-assistenten")}

Website: StudioFab.
`;
const full = `${llms}
## Veelgestelde vragen
${faq.map(([q, a]) => `### ${q}\n${a}`).join("\n\n")}
`;
await writeFile(join(DIST, "llms.txt"), llms);
await writeFile(join(DIST, "llms-full.txt"), full);

if (!indexable) {
  const h = await readFile(join(DIST, "_headers"), "utf8").catch(() => "");
  await writeFile(join(DIST, "_headers"), `${h}\n/*\n  X-Robots-Tag: noindex\n`);
}
await rm("dist-ssr", { recursive: true, force: true });
console.log(`prerender: ${routes.length} routes + 404, site ${siteUrl}, indexable=${indexable}`);

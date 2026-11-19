// Maakt WebP-varianten van de foto's van de oude Wix-site (raw-images/) en schrijft
// src/lib/images.json met breedte/hoogte per slug, zodat <img> altijd width/height krijgt.
// Alleen echte foto's van de boerderij; AI-beelden van de oude site bewust weggelaten.
// Gebruik: npm run images. Bestaande uitvoer wordt overschreven.
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SRC = "raw-images";
const OUT = "public/images";
const WIDTHS = [480, 960, 1600, 2400];

const manifest = {
  "erf-gezin": { file: "28_88.jpg" },
  "gezin-hond": { file: "04_102.jpg" },
  "kinderen-kippen": { file: "09_109.jpg" },
  "speelterrein": { file: "10_109.jpg" },
  "kind-en-boer": { file: "15_109.jpg" },
  "sloot-avontuur": { file: "16_109.jpg" },
  "traptrekkers": { file: "21_88.jpg" },
  "boerenpaad-brug": { file: "44_118.jpg" },
  "waterpomp": { file: "32_88.jpg" },
  "winkel-groente": { file: "18_101.jpg" },
  "kaas": { file: "24_88.jpg" },
  "yte-tafel": { file: "51_128.jpg" },
  "yte-keuken": { file: "52_128.jpg" },
  "yte-chef-bart": { file: "50_128.jpg" },
  "yte-chef": { file: "53_128.png" },
  "koeien-kippen": { file: "12_109.jpg" },
  "jersey-koeien": { file: "33_88.jpg" },
  "kalfje": { file: "73_94.jpg" },
  "zonsopkomst": { file: "23_88.jpg" },
  "boerderij": { file: "29_88.jpg" },
  "hooiwagen": { file: "71_96.jpg" },
  "groep-land": { file: "47_118.jpg" },
  "cooperatie": { file: "57_128.jpg" },
  "kippen": { file: "30_88.jpg" },
  "wei": { file: "76_93.jpg" },
  "eieren": { file: "03_102.jpg" },
  "kinderen-koeien": { file: "42_105.jpg" },
  "gezin-gras": { file: "20_88.jpg" },
  "bart-groente": { file: "31_88.jpg" },
  "rianne-bart": { file: "75_93.jpg" },
};

await mkdir(OUT, { recursive: true });
await mkdir("public/og", { recursive: true });
const dims = {};
for (const [slug, cfg] of Object.entries(manifest)) {
  let img = sharp(join(SRC, cfg.file)).rotate();
  if (cfg.crop) img = img.extract(cfg.crop);
  const buf = await img.toBuffer();
  const { width: w, height: h } = await sharp(buf).metadata();
  const sizes = [];
  for (const width of WIDTHS) {
    const target = Math.min(width, w);
    if (sizes.includes(target)) break;
    await sharp(buf).resize({ width: target }).webp({ quality: 76 }).toFile(join(OUT, `${slug}-${target}.webp`));
    sizes.push(target);
    if (target === w) break;
  }
  dims[slug] = { width: w, height: h, sizes };
  console.log(slug, `${w}x${h}`, sizes.join("/"));
}
await writeFile("src/lib/images.json", JSON.stringify(dims, null, 2) + "\n");

// Open Graph (1200x630), logo's en favicon.
const og = { "boerbart": "28_88.jpg", "speelboerderij": "09_109.jpg", "yte": "51_128.jpg", "winkel": "18_101.jpg", "groepen": "71_96.jpg", "cooperatie": "33_88.jpg" };
for (const [name, file] of Object.entries(og)) {
  await sharp(join(SRC, file)).rotate().resize(1200, 630, { fit: "cover" }).jpeg({ quality: 80, progressive: true }).toFile(`public/og/${name}.jpg`);
}
await sharp(join(SRC, "22_88.png")).resize(600).png().toFile("public/logo-boer-bart.png");
await sharp(join(SRC, "46_118.png")).resize(600).png().toFile("public/logo-speelboerderij.png");
await sharp(join(SRC, "22_88.png")).resize(180).png().toFile("public/apple-touch-icon.png");
await sharp(join(SRC, "22_88.png")).resize(64).png().toFile("public/favicon.png");
console.log("klaar");

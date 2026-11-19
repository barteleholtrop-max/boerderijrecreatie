// Foto's van Nijemoed Bloemen (aangeleverd door de eigenaar, 17 november 2026) als WebP in public/images,
// en de maten in src/lib/images.json. Locatiegegevens (EXIF) gaan er bij het omzetten af.
// Gebruik: node scripts/process-bloemen.mjs <map met de originele foto's>. Originelen staan niet in Git.
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SRC = process.argv[2];
if (!SRC) throw new Error("Geef de map met de originele foto's mee.");
const WIDTHS = [480, 960, 1600];
const manifest = {
  "bloemen-ridderspoor-zon": "a1ace395-image.jpg",
  "bloemen-korenbloemen": "84a73c9a-image.jpg",
  "bloemen-ridderspoor": "2af48a1b-image.jpg",
  "bloemen-ridderspoor-rijen": "65188edb-image.jpg",
  "bloemen-zonnehoed-wit": "31a4c2bd-image.jpg",
  "bloemen-siertabak": "a9a7d2d9-image.jpg",
  "bloemen-rudbeckia": "ed63bf4a-image.jpg",
  "bloemen-zonnehoed": "00556f0a-image.jpg",
  "bloemen-duizendblad": "f920bdde-image.jpg",
  "bloemen-tuin": "e4474895-image.jpg",
  "bloemen-emmers": "5cc2486e-image.jpg",
  "bloemen-kardoen-hommel": "9f6d49f5-image.jpg",
  "bloemen-zonnebloem-koeien": "9cdae180-image.jpg",
  "bloemen-kogeldistel": "eab5e74a-image.jpg",
  "bloemen-boeket": "0d4c83a0-image.jpg",
  "bloemen-dahlia": "731e4f52-image.jpg",
  "bloemen-zinnia": "c82bf0c1-image.jpg",
  "bloemen-bindert": "412a6912-image.jpg",
};
const dims = JSON.parse(await readFile("src/lib/images.json", "utf8"));
for (const [slug, file] of Object.entries(manifest)) {
  const buf = await sharp(join(SRC, file)).rotate().toBuffer();
  const { width: w, height: h } = await sharp(buf).metadata();
  const sizes = [];
  for (const width of WIDTHS) {
    const target = Math.min(width, w);
    if (sizes.includes(target)) break;
    await sharp(buf).resize({ width: target }).webp({ quality: 74 }).toFile(`public/images/${slug}-${target}.webp`);
    sizes.push(target);
  }
  dims[slug] = { width: w, height: h, sizes };
  console.log(slug, `${w}x${h}`, sizes.join("/"));
}
await writeFile("src/lib/images.json", JSON.stringify(dims, null, 2) + "\n");
await sharp(join(SRC, manifest["bloemen-ridderspoor-zon"])).rotate().resize(1200, 630, { fit: "cover", position: "centre" }).jpeg({ quality: 80, progressive: true }).toFile("public/og/bloemen.jpg");
console.log("klaar");

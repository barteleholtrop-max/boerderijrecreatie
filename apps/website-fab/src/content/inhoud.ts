// Blogs, nieuws en filmpjes uit de backoffice (wens eigenaar 13 november 2026: het „dorp” van sites die de informatie uit de
// backoffice halen). Deze site leest alleen via de vaste poort GET /api/public/v1/inhoud; zie docs/INHOUD-EN-DORP.md.
// Elke site heeft een eigen sleutel; deze site is de hoofdsite „boerbart”. Geen eigen teksten hier: niets te laden = niets tonen.
export const SITE_KEY = "boerbart";
export type Block = { type: "kop" | "alinea"; text: string };
export type Video = { provider: "youtube" | "vimeo"; id: string; url: string; embed: string; thumbnail: string | null };
export type Piece = { slug: string; kind: "blog" | "nieuws" | "video"; title: string; summary: string; blocks: Block[]; photo: string | null; video: Video | null; publishedAt: string };
export const kindLabel: Record<Piece["kind"], string> = { blog: "Blog", nieuws: "Nieuws", video: "Filmpje" };
export const pieceDate = (d: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));

const safeEmbed = (v: Video | null) => (v && /^https:\/\/(www\.youtube-nocookie\.com\/embed|player\.vimeo\.com\/video)\/[A-Za-z0-9_-]+$/.test(v.embed) ? v : null);
const safePhoto = (p: unknown) => (typeof p === "string" && (/^\/api\/public\/media\/[a-f0-9-]{36}$/.test(p) || /^https:\/\//.test(p)) ? p : null);

/** De stukken voor deze site, nieuwste eerst. Gooit bij een storing, zodat de pagina dat eerlijk kan melden. */
export async function loadPieces(limit = 50): Promise<Piece[]> {
  const r = await fetch(`/api/public/v1/inhoud?site=${SITE_KEY}&aantal=${limit}`, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error("inhoud " + r.status);
  const b = (await r.json()) as { versie?: number; items?: Piece[] };
  if (b.versie !== 1 || !Array.isArray(b.items)) throw new Error("onbekende versie");
  return b.items.filter((p) => p && typeof p.slug === "string" && typeof p.title === "string")
    .map((p) => ({ ...p, blocks: Array.isArray(p.blocks) ? p.blocks.filter((x) => x && typeof x.text === "string") : [], photo: safePhoto(p.photo), video: safeEmbed(p.video) }));
}

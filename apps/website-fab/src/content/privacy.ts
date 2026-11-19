// Het privacybeleid komt uit de backoffice (wens eigenaar 15 november 2026: één privacybeleid voor alle sites, beheerd bij
// Marketing & website → Privacy · alle sites). Deze site leest alleen via de vaste poort GET /api/public/v1/privacy; zie
// docs/PRIVACY-ALLE-SITES.md. Geen eigen tekst hier: niets te laden = een korte melding, nooit een oude of verzonnen tekst.
export type Block = { type: "kop" | "alinea"; text: string };
export type PrivacyPolicy = { title: string; intro: Block[]; effectiveFrom: string; updated: string; controller: { name: string; email: string }; sections: { heading: string; blocks: Block[] }[] };

const cleanBlocks = (v: unknown): Block[] => (Array.isArray(v) ? v.filter((b) => b && typeof b.text === "string").map((b) => ({ type: b.type === "kop" ? "kop" : "alinea", text: b.text })) : []);

/** Gooit bij een storing, zodat de pagina dat eerlijk kan melden. */
export async function loadPrivacy(): Promise<PrivacyPolicy> {
  const r = await fetch("/api/public/v1/privacy", { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error("privacy " + r.status);
  const b = await r.json();
  if (b?.versie !== 1 || !Array.isArray(b.sections)) throw new Error("onbekende versie");
  return {
    title: String(b.title || "Privacybeleid"), intro: cleanBlocks(b.intro), effectiveFrom: String(b.effectiveFrom || ""), updated: String(b.updated || ""),
    controller: { name: String(b.controller?.name || ""), email: String(b.controller?.email || "") },
    sections: b.sections.filter((s: { heading?: unknown }) => s && typeof s.heading === "string").map((s: { heading: string; blocks: unknown }) => ({ heading: s.heading, blocks: cleanBlocks(s.blocks) })),
  };
}
export const policyDate = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z")) : "");

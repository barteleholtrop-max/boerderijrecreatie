import images from "../lib/images.json";

type Img = { width: number; height: number; sizes: number[] };
const all = images as Record<string, Img>;

export function srcFor(slug: string, w = 960): string {
  const img = all[slug];
  const pick = img.sizes.find((s) => s >= w) ?? img.sizes[img.sizes.length - 1];
  return `/images/${slug}-${pick}.webp`;
}

export function Picture({ slug, alt, sizes = "100vw", className, priority = false, focus }: { slug: string; alt: string; sizes?: string; className?: string; priority?: boolean; focus?: string }) {
  const img = all[slug];
  if (!img) throw new Error(`Onbekende foto: ${slug}`);
  const srcSet = img.sizes.map((s) => `/images/${slug}-${s}.webp ${s}w`).join(", ");
  return (
    <img
      className={className}
      src={srcFor(slug, 960)}
      srcSet={srcSet}
      sizes={sizes}
      width={img.width}
      height={img.height}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      decoding={priority ? "sync" : "async"}
      {...(priority ? ({ fetchpriority: "high" } as Record<string, string>) : {})}
      style={focus ? { objectPosition: focus } : undefined}
    />
  );
}

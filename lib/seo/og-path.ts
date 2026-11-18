/**
 * Address of a share image (app/og/[kind]/[file]/route.tsx). `v` changes with what the image
 * shows (rating, number of reviews, name): a new address, so caches never serve an old rating.
 */
export type OgKind = 'parcours' | 'mention' | 'universite' | 'ville';

export function ogVersion(parts: (string | number | null | undefined)[]): string {
  let h = 2166136261;
  for (const c of parts.map((p) => String(p ?? '')).join('|')) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function ogImagePath(
  kind: OgKind,
  slug: string,
  parts: (string | number | null | undefined)[],
) {
  return `/og/${kind}/${slug}.png?v=${ogVersion(parts)}`;
}

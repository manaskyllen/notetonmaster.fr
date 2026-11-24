import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Cache tags of the public site (unstable_cache, ISR pages). The worker runs outside Next.js: it
 * cannot call revalidateTag, so it asks the site through /api/internal/revalidate (signed with
 * SESSION_SECRET). Code running inside Next.js calls revalidateTag directly (lib/cache/next.ts).
 */
export const TAGS = {
  /** Figures of the footer (getFooterStats). */
  footer: 'footer-stats',
  /** Catalogue lists: Explorer, search, facets, mention / university pages, indexes. */
  catalog: 'catalog',
  /** Published reviews across the site (latest reviews of the home). */
  reviews: 'reviews',
  /** One program page (reviews, ratings). */
  program: (id: string) => `program:${id}`,
  /** Open cities of the launch (LaunchZone): pills, sentences, titles. */
  zones: 'launch-zones',
  /** What one student follows (« Suivi » on fiches, cards, Mon espace). */
  favorites: (studentId: string) => `favorites:${studentId}`,
  /** Guides (/guides, their pages, the section of the city pages) and their figures. */
  articles: 'articles',
  /** Counters of the admin (sidebar, overview, views of Fiches): 5 minutes, expired after a
   *  sync, an arbitration or a bulk action. */
  admin: 'admin-counts',
} as const;

function sign(body: string): string {
  return createHmac('sha256', process.env.SESSION_SECRET ?? '')
    .update(body)
    .digest('hex');
}

export function verifySignature(body: string, signature: string | null): boolean {
  if (!signature || !process.env.SESSION_SECRET) return false;
  const a = Buffer.from(sign(body));
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** From the worker: asks the site to expire these tags. Never throws (the cache expires anyway). */
export async function invalidateTagsRemote(tags: string[]): Promise<boolean> {
  const base = process.env.INTERNAL_APP_URL ?? 'http://app:3000';
  const body = JSON.stringify({ tags, at: Date.now() });
  try {
    const r = await fetch(`${base}/api/internal/revalidate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-nm-signature': sign(body) },
      body,
      signal: AbortSignal.timeout(5000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

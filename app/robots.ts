import type { MetadataRoute } from 'next';
import { PRIVATE_PREFIXES } from '@/lib/seo/meta';
import { publicIndexing, siteOrigin } from '@/lib/seo/site';

// APP_URL is read at run time: the same build answers « disallow everything » in CI.
export const dynamic = 'force-dynamic';

/**
 * Production with PUBLIC_INDEXING=true: the public site is open, the private areas are not
 * (account, forms, tokens, API), and the sitemap index is given. Anywhere else (indexing switched
 * off, local, CI, a preview host): everything is disallowed, and proxy.ts adds
 * X-Robots-Tag: noindex, nofollow to every answer.
 */
export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  if (!publicIndexing(origin)) return { rules: [{ userAgent: '*', disallow: '/' }] };
  return {
    rules: [
      {
        userAgent: '*',
        // The review form stays crawlable for the link previews (« Inviter ma promo à donner son
        // avis »: Messenger, WhatsApp…): it is noindex, nofollow by its meta tag and its
        // X-Robots-Tag header (proxy.ts), so it is never indexed.
        allow: ['/', '/avis/nouveau'],
        // Prefixes: « /avis » covers /avis/confirmer/… (and /avis/nouveau, allowed above by the
        // longer rule), « /reponse » covers /reponse-formation. No public address starts with one
        // of them.
        disallow: [...PRIVATE_PREFIXES],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}
